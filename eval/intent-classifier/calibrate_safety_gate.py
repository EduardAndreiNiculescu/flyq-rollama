"""Select a conservative Tier-2 execution gate using only calibration data.

The objective is lexicographic: zero execution on `none`/`clarify`, then maximize
correct execution coverage.  No frozen stress or held-out web case participates.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "eval" / "intent-classifier"))

from calibrate_web_control import EXEC_TOOLS, evaluate, raw_prediction
from compare_tiers import ONNXClassifier
from finetune.intent_classifier.models import CharTokenizer, PER_TOOL_THRESHOLDS


def load_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def thresholds(confidence, margin):
    output = {label: dict(value) for label, value in PER_TOOL_THRESHOLDS.items()}
    for label in EXEC_TOOLS:
        output[label] = {"confidence": confidence, "margin": margin}
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx", required=True)
    parser.add_argument("--temperature", type=float, required=True)
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--output", default="eval/intent-classifier/v4_safety_gate.json")
    args = parser.parse_args()
    model = ONNXClassifier(args.onnx, CharTokenizer(max_length=128), temperature=args.temperature)
    data_dir = ROOT / args.data_dir
    web = json.loads((ROOT / "eval/web-routing-supplement.json").read_text(encoding="utf-8"))
    inputs = load_jsonl(data_dir / "val.jsonl") + [row for row in web if row["split"] == "calibration"]
    heldout = [row for row in web if row["split"] == "heldout"]

    def prepare(row):
        text = row.get("text", row.get("question", ""))
        label = row.get("label") or (row.get("expectedAny") or ["none"])[0]
        return {"text": text, "label": label, "raw": raw_prediction(model, text, bool(row.get("selected_flight_present", True)), row.get("last_intent", "none"))}

    calibration = [prepare(row) for row in inputs]
    hold = [prepare(row) for row in heldout]
    candidates = []
    for confidence_i in range(35, 100, 5):
        for margin_i in range(2, 61, 2):
            candidate = thresholds(confidence_i / 100, margin_i / 100)
            metrics = evaluate(calibration, candidate)
            candidates.append((metrics["falseExecutions"], -metrics["coverage"], -metrics["accuracy"], confidence_i, margin_i, candidate, metrics))
    best = min(candidates)
    selected = best[5]
    result = {"method": "global execution gate; selection objective: minimize false executions on val+web calibration, then maximize coverage and accuracy", "calibrationRows": len(calibration), "selectedThresholds": selected, "selected": best[6], "webHeldout": evaluate(hold, selected), "default": {"validationAndWebCalibration": evaluate(calibration, {k: dict(v) for k, v in PER_TOOL_THRESHOLDS.items()}), "webHeldout": evaluate(hold, {k: dict(v) for k, v in PER_TOOL_THRESHOLDS.items()})}}
    output = ROOT / args.output
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
