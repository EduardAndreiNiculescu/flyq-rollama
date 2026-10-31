"""Evaluate RoBaseLM-S as a frozen Romanian intent encoder, not a chat model.

Requires a local llama-server started with --embedding.  The small linear head is
trained solely from the existing v3 train split; ro-human-stress-500 stays frozen.
"""
import argparse
import json
import time
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression

LABELS = ("get_flight_details", "get_gate", "get_time_remaining", "get_live_tracking", "search_knowledge", "open_airport_map", "clarify", "none")


def embed(text, url):
    payload = json.dumps({"content": text}).encode("utf-8")
    request = urllib.request.Request(url + "/embedding", data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        value = json.load(response)[0]["embedding"]
    array = np.asarray(value, dtype=np.float32)
    return array.mean(axis=0) if array.ndim == 2 else array


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8091")
    parser.add_argument("--per-label", type=int, default=300)
    parser.add_argument("--output", default="eval/robaselm_s_embedding_results.json")
    parser.add_argument("--model-name", default="RoBaseLM-S 125M Q5_K_M frozen encoder + logistic head")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    train_rows = [json.loads(line) for line in (root / "finetune/intent_classifier/data_v3/train.jsonl").read_text(encoding="utf-8").splitlines()]
    test_rows = json.loads((root / "eval/ro-human-stress-500.json").read_text(encoding="utf-8"))
    buckets = defaultdict(list)
    for row in train_rows:
        if row["label"] in LABELS and len(buckets[row["label"]]) < args.per_label:
            buckets[row["label"]].append(row)
    selected = [row for label in LABELS for row in buckets[label]]
    if any(not buckets[label] for label in LABELS):
        raise RuntimeError("training split is missing a required label")
    print(f"Embedding {len(selected)} train rows + {len(test_rows)} frozen benchmark rows", flush=True)
    started = time.perf_counter()
    vectors, labels = [], []
    for index, row in enumerate(selected):
        vectors.append(embed(row["text"], args.url)); labels.append(row["label"])
        if (index + 1) % 100 == 0: print(f"train embeddings {index + 1}/{len(selected)}", flush=True)
    model = LogisticRegression(max_iter=2000, C=2.0, class_weight="balanced", n_jobs=1)
    model.fit(np.stack(vectors), labels)
    predictions, latencies = [], []
    for index, row in enumerate(test_rows):
        tick = time.perf_counter(); vector = embed(row["question"], args.url); latencies.append((time.perf_counter() - tick) * 1000)
        predictions.append(model.predict(vector.reshape(1, -1))[0])
        if (index + 1) % 100 == 0: print(f"benchmark embeddings {index + 1}/{len(test_rows)}", flush=True)
    rows, confusion = [], {label: Counter() for label in LABELS}
    for row, predicted in zip(test_rows, predictions):
        expected = row["label"]; passed = predicted in row.get("expectedAny", [expected])
        false_execution = expected in ("none", "clarify") and predicted not in ("none", "clarify")
        rows.append({"id": row["id"], "expected": expected, "predicted": predicted, "pass": passed, "falseExecution": false_execution})
        confusion[expected][predicted] += 1
    by_label = {}
    for label in LABELS:
        group = [row for row in rows if row["expected"] == label]
        by_label[label] = {"total": len(group), "accuracy": round(sum(row["pass"] for row in group) / len(group), 4), "falseExecutions": sum(row["falseExecution"] for row in group)}
    result = {"model": args.model_name, "trainRows": len(selected), "benchmark": "ro-human-stress-500 (frozen)", "total": len(rows), "accuracy": round(sum(row["pass"] for row in rows) / len(rows), 4), "falseExecutions": sum(row["falseExecution"] for row in rows), "medianEmbeddingMs": round(float(np.median(latencies)), 2), "p95EmbeddingMs": round(float(np.percentile(latencies, 95)), 2), "elapsedSeconds": round(time.perf_counter() - started, 1), "byLabel": by_label, "confusion": {key: dict(value) for key, value in confusion.items()}, "cases": rows}
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: result[key] for key in ("model", "trainRows", "total", "accuracy", "falseExecutions", "medianEmbeddingMs", "p95EmbeddingMs", "elapsedSeconds")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
