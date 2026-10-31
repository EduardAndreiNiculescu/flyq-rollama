import json
import os
import sys
import argparse
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8")

from dataset import LABELS, normalize_text

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

def get_ngrams(text: str, n: int = 4) -> set:
    words = normalize_text(text).split()
    if len(words) < n:
        return {" ".join(words)}
    return {" ".join(words[i:i+n]) for i in range(len(words) - n + 1)}

def check_leakage(data_dir=DATA_DIR, benchmark_path=None):
    splits = {}
    for s in ["train", "val", "test"]:
        path = os.path.join(data_dir, f"{s}.jsonl")
        with open(path, "r", encoding="utf-8") as f:
            splits[s] = [json.loads(line) for line in f]

    print(f"Split sizes: Train={len(splits['train'])}, Val={len(splits['val'])}, Test={len(splits['test'])}", flush=True)

    # 1. Label validity
    for s, data in splits.items():
        for d in data:
            if d["label"] not in LABELS:
                raise ValueError(f"Invalid label {d['label']} in {s}!")
            if d.get("secondary_label") and d["secondary_label"] not in LABELS:
                raise ValueError(f"Invalid secondary label {d['secondary_label']} in {s}!")

    print("Gate 1: Zero invalid labels PASSED.", flush=True)

    # 2. Exact normalized overlap
    train_texts = {normalize_text(d["text"]): d for d in splits["train"]}
    val_texts = {normalize_text(d["text"]): d for d in splits["val"]}
    test_texts = {normalize_text(d["text"]): d for d in splits["test"]}

    train_val_overlap = set(train_texts.keys()) & set(val_texts.keys())
    train_test_overlap = set(train_texts.keys()) & set(test_texts.keys())
    val_test_overlap = set(val_texts.keys()) & set(test_texts.keys())

    print(f"Exact Overlap: Train-Val={len(train_val_overlap)}, Train-Test={len(train_test_overlap)}, Val-Test={len(val_test_overlap)}", flush=True)
    assert len(train_val_overlap) == 0, f"Train-Val overlap detected: {train_val_overlap}"
    assert len(train_test_overlap) == 0, f"Train-Test overlap detected: {train_test_overlap}"
    assert len(val_test_overlap) == 0, f"Val-Test overlap detected: {val_test_overlap}"

    print("Gate 2: Zero exact leakage PASSED.", flush=True)

    # 3. 4-gram Jaccard Similarity between test and train using inverted index
    train_ngrams = [get_ngrams(tr["text"], 4) for tr in splits["train"]]
    inverted = defaultdict(list)
    for idx, ngs in enumerate(train_ngrams):
        for ng in ngs:
            inverted[ng].append(idx)

    max_jaccard = 0.0
    worst_pair = None
    high_overlap_count = 0

    for test_idx, test_item in enumerate(splits["test"]):
        test_ng = get_ngrams(test_item["text"], 4)
        candidates = set()
        for ng in test_ng:
            candidates.update(inverted.get(ng, []))

        for cand_idx in candidates:
            tr_ng = train_ngrams[cand_idx]
            inter = len(test_ng & tr_ng)
            u = len(test_ng | tr_ng)
            if u > 0:
                j = inter / u
                if j > max_jaccard:
                    max_jaccard = j
                    worst_pair = (test_item["text"], splits["train"][cand_idx]["text"])
                if j >= 0.40:
                    high_overlap_count += 1

    print(f"Max Test-Train 4-gram Jaccard: {max_jaccard:.4f}", flush=True)
    if worst_pair:
        print(f"  Worst pair: Test='{worst_pair[0]}' | Train='{worst_pair[1]}'", flush=True)
    print(f"High overlap count (>= 0.40): {high_overlap_count}", flush=True)
    assert max_jaccard < 0.40, f"High Jaccard overlap detected: {max_jaccard}"
    print("Gate 3: Jaccard similarity threshold (< 0.40) PASSED.", flush=True)

    if benchmark_path:
        with open(benchmark_path, "r", encoding="utf-8") as f:
            benchmark = json.load(f)
        benchmark_ngrams = [get_ngrams(row["question"], 4) for row in benchmark]
        benchmark_index = defaultdict(list)
        for idx, ngs in enumerate(benchmark_ngrams):
            for ng in ngs:
                benchmark_index[ng].append(idx)
        worst = 0.0
        for item in splits["train"]:
            train_ng = get_ngrams(item["text"], 4)
            candidates = set()
            for ng in train_ng:
                candidates.update(benchmark_index.get(ng, []))
            for idx in candidates:
                score = len(train_ng & benchmark_ngrams[idx]) / len(train_ng | benchmark_ngrams[idx])
                worst = max(worst, score)
        print(f"Max Benchmark-Train 4-gram Jaccard: {worst:.4f}", flush=True)
        assert worst < 0.35, f"Frozen benchmark leakage detected: {worst}"
        print("Gate 4: Frozen benchmark isolation (< 0.35) PASSED.", flush=True)

    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default=DATA_DIR)
    parser.add_argument("--benchmark")
    args = parser.parse_args()
    check_leakage(args.data_dir, args.benchmark)
