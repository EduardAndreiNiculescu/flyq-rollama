"""Run the frozen FlightFlow Romanian stress benchmark against a local llama-server."""
from __future__ import annotations

import argparse
import json
import statistics
import time
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LABELS = ("get_flight_details", "get_gate", "get_time_remaining", "get_live_tracking", "search_knowledge", "open_airport_map", "clarify", "none")
GRAMMAR = 'root ::= "get_flight_details" | "get_gate" | "get_time_remaining" | "get_live_tracking" | "search_knowledge" | "open_airport_map" | "clarify" | "none"'
PROMPT_PREFIX = """Clasifică întrebarea de aeroport într-o singură etichetă. Răspunde numai cu eticheta.
Etichete: get_flight_details, get_gate, get_time_remaining, get_live_tracking, search_knowledge, open_airport_map, clarify, none.

Întrebare: care este poarta zborului meu?
Etichetă: get_gate
Întrebare: cât mai e până pleacă avionul?
Etichetă: get_time_remaining
Întrebare: unde se află avionul acum?
Etichetă: get_live_tracking
Întrebare: avem întârziere la cursă?
Etichetă: get_flight_details
Întrebare: pot lua powerbank în bagajul de mână?
Etichetă: search_knowledge
Întrebare: unde este toaleta?
Etichetă: open_airport_map
Întrebare: nu mă descurc, ajută-mă
Etichetă: clarify
Întrebare: spune-mi o glumă
Etichetă: none

"""


def ask(url: str, question: str) -> tuple[str, float]:
    body = json.dumps({"prompt": PROMPT_PREFIX + f"Întrebare: {question}\nEtichetă:", "n_predict": 4, "temperature": 0, "grammar": GRAMMAR, "cache_prompt": True}).encode("utf-8")
    request = urllib.request.Request(url + "/completion", data=body, headers={"Content-Type": "application/json"})
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=60) as response:
        result = json.loads(response.read())
    elapsed = (time.perf_counter() - started) * 1000
    text = result.get("content", "").strip()
    return text if text in LABELS else "invalid", elapsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8091")
    parser.add_argument("--input", default="eval/ro-human-stress-500.json")
    parser.add_argument("--output", default="eval/robaselm_s_stress_results.json")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    cases = json.loads((ROOT / args.input).read_text(encoding="utf-8"))
    if args.limit:
        cases = cases[:args.limit]
    rows, latencies = [], []
    for index, case in enumerate(cases, 1):
        predicted, elapsed = ask(args.url, case["question"])
        latencies.append(elapsed)
        passed = predicted == case["label"]
        false_execution = case["label"] == "none" and predicted not in ("none", "clarify", "invalid")
        rows.append({**case, "predicted": predicted, "pass": passed, "falseExecution": false_execution, "ms": elapsed})
        if index % 25 == 0:
            print(f"{index}/{len(cases)} accuracy={sum(r['pass'] for r in rows)/len(rows):.3f}", flush=True)
    per_label = {}
    for label in LABELS:
        group = [row for row in rows if row["label"] == label]
        per_label[label] = {"total": len(group), "accuracy": round(sum(row["pass"] for row in group) / len(group), 4) if group else None, "falseExecutions": sum(row["falseExecution"] for row in group)}
    report = {"model": "RoBaseLM-S Q5_K_M", "total": len(rows), "accuracy": round(sum(row["pass"] for row in rows) / len(rows), 4),
              "falseExecutions": sum(row["falseExecution"] for row in rows), "medianMs": round(statistics.median(latencies), 2),
              "p95Ms": round(sorted(latencies)[int((len(latencies)-1)*.95)], 2), "byLabel": per_label,
              "confusion": {label: dict(Counter(row["predicted"] for row in rows if row["label"] == label)) for label in LABELS}, "rows": rows}
    (ROOT / args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "rows"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
