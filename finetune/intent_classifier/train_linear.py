"""Train and evaluate a compact character+word linear intent classifier."""

import json
import os
import time
from collections import Counter

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC

from finetune.intent_classifier.safety import inspect_safety


def load_jsonl(path):
    with open(path, encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def model_text(row):
    # Context is encoded as explicit tokens so it remains portable to iOS.
    flight = "flight_yes" if row.get("selected_flight_present") else "flight_no"
    last = row.get("last_intent", "none")
    return f"{row['text']} __ctx_{flight} __last_{last}"


def evaluate(model, rows):
    started = time.perf_counter()
    predicted = []
    for row in rows:
        verdict = inspect_safety(row["text"])
        if not verdict.is_safe:
            predicted.append(verdict.label)
        else:
            predicted.append(model.predict([model_text(row)])[0])
    elapsed = time.perf_counter() - started

    by_slice = {}
    errors = []
    false_executions = 0
    execution_labels = {
        "get_flight_details", "get_gate", "get_time_remaining",
        "get_live_tracking", "search_knowledge", "open_airport_map",
    }
    for row, pred in zip(rows, predicted):
        key = row.get("slice", "standard")
        bucket = by_slice.setdefault(key, {"correct": 0, "total": 0})
        bucket["total"] += 1
        bucket["correct"] += int(pred == row["label"])
        if pred != row["label"]:
            errors.append({"text": row["text"], "expected": row["label"], "predicted": pred, "slice": key})
        if row["label"] in ("none", "clarify") and pred in execution_labels:
            false_executions += 1

    for bucket in by_slice.values():
        bucket["accuracy"] = bucket["correct"] / bucket["total"]
    correct = sum(p == r["label"] for p, r in zip(predicted, rows))
    return {
        "total": len(rows),
        "accuracy": correct / len(rows),
        "false_executions": false_executions,
        "elapsed_ms": elapsed * 1000,
        "mean_latency_ms": elapsed * 1000 / len(rows),
        "by_slice": by_slice,
        "errors": errors,
    }


def evaluate_gate(features, model, rows, margin_threshold):
    """Measure only decisions safe enough to bypass the 0.6B fallback."""
    execution_labels = {
        "get_flight_details", "get_gate", "get_time_remaining",
        "get_live_tracking", "search_knowledge", "open_airport_map",
    }
    accepted = correct = false_executions = 0
    for row in rows:
        verdict = inspect_safety(row["text"])
        if not verdict.is_safe:
            # Deterministic safety decisions are always handled without the model.
            accepted += 1
            correct += int(verdict.label == row["label"])
            continue
        vector = features.transform([model_text(row)])
        scores = model.decision_function(vector)[0]
        order = scores.argsort()
        margin = float(scores[order[-1]] - scores[order[-2]])
        pred = model.classes_[order[-1]]
        if margin < margin_threshold:
            continue
        accepted += 1
        correct += int(pred == row["label"])
        if row["label"] in ("none", "clarify") and pred in execution_labels:
            false_executions += 1
    return {
        "threshold": margin_threshold,
        "accepted": accepted,
        "coverage": accepted / len(rows),
        "accepted_accuracy": correct / accepted if accepted else 0.0,
        "false_executions": false_executions,
    }


def main():
    data_dir = "finetune/intent_classifier/data"
    out_dir = "finetune/intent_classifier/out"
    train = load_jsonl(os.path.join(data_dir, "train.jsonl"))
    val = load_jsonl(os.path.join(data_dir, "val.jsonl"))
    test = load_jsonl(os.path.join(data_dir, "test.jsonl"))

    features = FeatureUnion([
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=2,
                                 max_features=75000, sublinear_tf=True, strip_accents="unicode")),
        ("word", TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=2,
                                 max_features=30000, sublinear_tf=True, strip_accents="unicode")),
    ])
    x_train = features.fit_transform([model_text(r) for r in train])
    model = LinearSVC(C=2.0, class_weight="balanced")
    model.fit(x_train, [r["label"] for r in train])

    class PortableModel:
        def predict(self, texts):
            return model.predict(features.transform(texts))

    portable = PortableModel()
    report = {
        "train_counts": Counter(r["label"] for r in train),
        "validation": evaluate(portable, val),
        "test": evaluate(portable, test),
    }
    candidates = [evaluate_gate(features, model, val, i / 20) for i in range(0, 61)]
    safe = [r for r in candidates if r["false_executions"] == 0 and r["accepted_accuracy"] >= 0.98]
    selected = max(safe, key=lambda r: r["coverage"]) if safe else candidates[-1]
    report["validation_gate"] = selected
    report["test_gate"] = evaluate_gate(features, model, test, selected["threshold"])
    os.makedirs(out_dir, exist_ok=True)
    artifact = os.path.join(out_dir, "linear_tfidf.joblib")
    joblib.dump({"features": features, "model": model}, artifact, compress=3)
    report["artifact_bytes"] = os.path.getsize(artifact)
    with open(os.path.join(out_dir, "linear_report.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps({
        "validation_accuracy": report["validation"]["accuracy"],
        "test_accuracy": report["test"]["accuracy"],
        "false_executions": report["test"]["false_executions"],
        "mean_latency_ms": report["test"]["mean_latency_ms"],
        "artifact_bytes": report["artifact_bytes"],
        "test_errors": len(report["test"]["errors"]),
        "gate": report["test_gate"],
    }, indent=2))


if __name__ == "__main__":
    main()
