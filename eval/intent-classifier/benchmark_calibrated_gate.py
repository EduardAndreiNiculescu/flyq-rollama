"""Score an ONNX Tier-2 candidate through independently selected thresholds."""
import argparse
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "eval" / "intent-classifier"))

from calibrate_web_control import apply_gate, raw_prediction
from compare_tiers import ONNXClassifier
from finetune.intent_classifier.models import CharTokenizer


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int((len(ordered) - 1) * fraction))]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx", required=True)
    parser.add_argument("--threshold-report", required=True)
    parser.add_argument("--temperature", type=float, required=True)
    parser.add_argument("--input", default="eval/ro-human-stress-500.json")
    parser.add_argument("--output", default="eval/intent-classifier/ro_stress_500_v4_calibrated.json")
    args = parser.parse_args()
    threshold_document = json.loads((ROOT / args.threshold_report).read_text(encoding="utf-8"))
    thresholds = threshold_document["selectedThresholds"] if "selectedThresholds" in threshold_document else threshold_document["recommendedThresholds"]
    classifier = ONNXClassifier(args.onnx, CharTokenizer(max_length=128), temperature=args.temperature)
    cases = json.loads((ROOT / args.input).read_text(encoding="utf-8"))
    rows, latencies, confusion = [], [], defaultdict(Counter)
    for case in cases:
        started = time.perf_counter()
        raw = raw_prediction(classifier, case["question"], True, "none")
        label, action = apply_gate(raw, thresholds)
        elapsed = (time.perf_counter() - started) * 1000
        expected = case["label"]
        expected_any = case.get("expectedAny", [expected])
        # Control cases encode `none` as an empty allowed-tool list.  Treat
        # abstention and an explicit clarification as decisions, not tools.
        if action == "none":
            passed = expected == "none"
        elif action == "clarify":
            passed = expected == "clarify" or "clarify" in expected_any
        else:
            passed = label in expected_any
        false_execution = expected in ("none", "clarify") and action == "execute"
        rows.append({"id": case["id"], "expected": expected, "predicted": label, "action": action, "confidence": raw["confidence"], "margin": raw["margin"], "pass": passed, "falseExecution": false_execution, "ms": elapsed})
        latencies.append(elapsed); confusion[expected][label] += 1
    by_label = {}
    for label in sorted({row["expected"] for row in rows}):
        group = [row for row in rows if row["expected"] == label]
        by_label[label] = {"total": len(group), "accuracy": round(sum(row["pass"] for row in group) / len(group), 4), "falseExecutions": sum(row["falseExecution"] for row in group)}
    report = {"benchmark": "Romanian human-style robustness stress v1 (not used for training or threshold selection)", "thresholdSource": args.threshold_report, "total": len(rows), "accuracy": round(sum(row["pass"] for row in rows) / len(rows), 4), "falseExecutions": sum(row["falseExecution"] for row in rows), "coverage": round(sum(row["action"] == "execute" for row in rows) / len(rows), 4), "medianMs": round(float(sorted(latencies)[len(latencies)//2]), 4), "p95Ms": round(percentile(latencies, .95), 4), "byLabel": by_label, "confusion": {label: dict(counts) for label, counts in confusion.items()}, "rows": rows}
    output = ROOT / args.output
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key not in ("rows", "confusion")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
