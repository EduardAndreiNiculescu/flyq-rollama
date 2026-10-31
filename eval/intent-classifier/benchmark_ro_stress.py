"""Evaluate the frozen Tier-2 ONNX classifier on the 500-case Romanian stress set."""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "eval" / "intent-classifier"))

from compare_tiers import ONNXClassifier
from finetune.intent_classifier.models import CharTokenizer


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int((len(ordered) - 1) * fraction))]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx", required=True)
    parser.add_argument("--temperature", type=float, default=1.038)
    parser.add_argument("--input", default="eval/ro-human-stress-500.json")
    parser.add_argument("--output", default="eval/intent-classifier/ro_stress_500_results.json")
    parser.add_argument("--router-report")
    args = parser.parse_args()

    rows = json.loads((ROOT / args.input).read_text(encoding="utf-8"))
    classifier = ONNXClassifier(args.onnx, CharTokenizer(max_length=128), temperature=args.temperature)
    results = []
    latencies = []
    for row in rows:
        started = time.perf_counter()
        pred = classifier.predict(row["question"], selected_flight_present=True)
        elapsed = (time.perf_counter() - started) * 1000
        latencies.append(elapsed)
        expected = row["label"]
        passed = pred["label"] == expected
        false_exec = expected == "none" and pred["action"] == "execute"
        results.append({**row, "predicted": pred["label"], "action": pred["action"], "confidence": pred["confidence"], "margin": pred["margin"], "pass": passed, "falseExecution": false_exec, "ms": elapsed})

    by_label = {}
    for label in sorted({row["label"] for row in rows}):
        subset = [row for row in results if row["label"] == label]
        by_label[label] = {"total": len(subset), "passed": sum(row["pass"] for row in subset), "accuracy": round(sum(row["pass"] for row in subset) / len(subset), 4), "falseExecutions": sum(row["falseExecution"] for row in subset)}
    by_style = {}
    for style in sorted({row["style"] for row in rows}):
        subset = [row for row in results if row["style"] == style]
        by_style[style] = {"total": len(subset), "passed": sum(row["pass"] for row in subset), "accuracy": round(sum(row["pass"] for row in subset) / len(subset), 4)}
    confusion = defaultdict(Counter)
    for row in results:
        confusion[row["label"]][row["predicted"]] += 1
    report = {
        "benchmark": "Romanian human-style robustness stress v1",
        "temperature": args.temperature,
        "total": len(results),
        "accuracy": round(sum(row["pass"] for row in results) / len(results), 4),
        "falseExecutions": sum(row["falseExecution"] for row in results),
        "medianMs": round(statistics.median(latencies), 4),
        "p95Ms": round(percentile(latencies, 0.95), 4),
        "byLabel": by_label,
        "byStyle": by_style,
        "confusion": {label: dict(counts) for label, counts in confusion.items()},
        "rows": results,
    }
    if args.router_report:
        router_report = json.loads((ROOT / args.router_report).read_text(encoding="utf-8"))
        tier1 = {row["id"]: row for row in router_report["rows"]}
        hybrid_rows = []
        for row in results:
            first = tier1[row["id"]]
            if first["action"] in ("execute", "clarify"):
                passed = bool(first["labelAgreement"])
                false_exec = bool(first["forbidden"])
                tier = "tier1"
            else:
                passed = bool(row["pass"])
                false_exec = bool(row["falseExecution"])
                tier = "tier2"
            hybrid_rows.append({"id": row["id"], "tier": tier, "pass": passed, "falseExecution": false_exec})
        report["hybrid"] = {
            "accuracy": round(sum(row["pass"] for row in hybrid_rows) / len(hybrid_rows), 4),
            "falseExecutions": sum(row["falseExecution"] for row in hybrid_rows),
            "tier1Resolved": sum(row["tier"] == "tier1" for row in hybrid_rows),
            "tier2Resolved": sum(row["tier"] == "tier2" for row in hybrid_rows),
        }
    out = ROOT / args.output
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "rows"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
