"""Calibrate Tier-2 confidence gates on web calibration cases, then score held-out data.

This never trains or mutates the model. It emits recommended thresholds and a report.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "eval" / "intent-classifier"))

from compare_tiers import ONNXClassifier
from finetune.intent_classifier.models import CharTokenizer, PER_TOOL_THRESHOLDS

FLIGHT_TOOLS = {"get_flight_details", "get_gate", "get_time_remaining", "get_live_tracking"}
EXEC_TOOLS = FLIGHT_TOOLS | {"search_knowledge", "open_airport_map"}


def load_jsonl(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def raw_prediction(classifier: ONNXClassifier, text: str, selected: bool, last_intent: str) -> dict:
    pred = classifier.predict(text, selected_flight_present=selected, last_intent=last_intent)
    top = pred["top3"]
    return {
        "top1": top[0]["label"],
        "top2": top[1]["label"] if len(top) > 1 else "none",
        "confidence": float(pred["confidence"]),
        "margin": float(pred["margin"]),
        "safe": bool(pred["safe"]),
        "safety_label": pred["label"] if not pred["safe"] else None,
    }


def apply_gate(raw: dict, thresholds: dict[str, dict[str, float]]) -> tuple[str, str]:
    if not raw["safe"]:
        label = raw["safety_label"]
        return label, label if label in ("none", "clarify") else "execute"
    label = raw["top1"]
    if label in ("none", "clarify"):
        return label, label
    cfg = thresholds[label]
    if raw["confidence"] < cfg["confidence"] or raw["margin"] < cfg["margin"]:
        if label in FLIGHT_TOOLS and raw["top2"] in FLIGHT_TOOLS:
            return "clarify", "clarify"
        return "none", "none"
    return label, "execute"


def evaluate(rows: list[dict], thresholds: dict[str, dict[str, float]]) -> dict:
    correct = false_exec = execute = 0
    by_label: dict[str, dict[str, int]] = {}
    for row in rows:
        predicted, action = apply_gate(row["raw"], thresholds)
        expected = row["label"]
        ok = predicted == expected
        correct += int(ok)
        execute += int(action == "execute")
        # Ambiguous requests are also unsafe to execute without an explicit
        # intent, so they count in the rejector's false-execution budget.
        false_exec += int(expected in ("none", "clarify") and action == "execute")
        bucket = by_label.setdefault(expected, {"total": 0, "correct": 0})
        bucket["total"] += 1
        bucket["correct"] += int(ok)
    return {
        "total": len(rows),
        "accuracy": round(correct / len(rows), 6) if rows else 0.0,
        "coverage": round(execute / len(rows), 6) if rows else 0.0,
        "falseExecutions": false_exec,
        "byLabel": {k: {**v, "accuracy": round(v["correct"] / v["total"], 6)} for k, v in sorted(by_label.items())},
    }


def calibrate_label(label: str, rows: list[dict], baseline: dict[str, dict[str, float]]) -> dict[str, float]:
    relevant = [row for row in rows if row["raw"]["top1"] == label]
    if not relevant:
        return dict(baseline[label])
    best = None
    for confidence_i in range(30, 86, 5):
        for margin_i in range(2, 41, 2):
            candidate = {k: dict(v) for k, v in baseline.items()}
            candidate[label] = {"confidence": confidence_i / 100, "margin": margin_i / 100}
            metrics = evaluate(relevant, candidate)
            safe_false_exec = sum(
                1 for row in relevant
                if row["label"] in ("none", "clarify") and apply_gate(row["raw"], candidate)[1] == "execute"
            )
            score = (safe_false_exec == 0, metrics["accuracy"], metrics["coverage"], -confidence_i, -margin_i)
            if best is None or score > best[0]:
                best = (score, candidate[label])
    return best[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx", required=True)
    parser.add_argument("--temperature", type=float, default=1.038)
    parser.add_argument("--data-dir", default="finetune/intent_classifier/data")
    parser.add_argument("--output", default="eval/intent-classifier/web_calibration.json")
    args = parser.parse_args()

    classifier = ONNXClassifier(args.onnx, CharTokenizer(max_length=128), temperature=args.temperature)
    web = json.loads((ROOT / "eval" / "web-routing-supplement.json").read_text(encoding="utf-8"))
    data_dir = ROOT / args.data_dir
    val = load_jsonl(data_dir / "val.jsonl")
    test = load_jsonl(data_dir / "test.jsonl")

    def prepare(row: dict, *, web_calibration: bool = False) -> dict:
        text = row.get("text", row.get("question", ""))
        label = row.get("label") or (row.get("expectedAny") or ["none"])[0]
        selected = bool(row.get("selected_flight_present", True))
        last = row.get("last_intent", "none")
        return {"text": text, "label": label, "webCalibration": web_calibration,
                "raw": raw_prediction(classifier, text, selected, last)}

    web_cal = [prepare(row, web_calibration=True) for row in web if row["split"] == "calibration"]
    web_hold = [prepare(row) for row in web if row["split"] == "heldout"]
    val_rows = [prepare(row) for row in val]
    test_rows = [prepare(row) for row in test]
    calibration_rows = val_rows + web_cal

    baseline = {k: dict(v) for k, v in PER_TOOL_THRESHOLDS.items()}
    calibrated = {k: dict(v) for k, v in baseline.items()}
    for label in sorted(EXEC_TOOLS):
        calibrated[label] = calibrate_label(label, calibration_rows, calibrated)

    report = {
        "model": os.path.abspath(args.onnx),
        "method": "per-tool grid search on val + web calibration; web held-out never used for selection",
        "baselineThresholds": baseline,
        "recommendedThresholds": calibrated,
        "baseline": {
            "validation": evaluate(val_rows, baseline),
            "webCalibration": evaluate(web_cal, baseline),
            "webHeldout": evaluate(web_hold, baseline),
            "test925": evaluate(test_rows, baseline),
        },
        "calibrated": {
            "validation": evaluate(val_rows, calibrated),
            "webCalibration": evaluate(web_cal, calibrated),
            "webHeldout": evaluate(web_hold, calibrated),
            "test925": evaluate(test_rows, calibrated),
        },
    }
    out = ROOT / args.output
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
