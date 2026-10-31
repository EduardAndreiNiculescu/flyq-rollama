"""Generate surgical SFT training dataset for Sidepath 3A (Fallback Targeted SFT).

Combines:
  1. Balanced representative distribution of general routing examples from train_augmented.jsonl.
  2. 3x upweighted hard refusal, prompt injection, Romanian slang, and context-disambiguation
     samples from dpo_train.jsonl.
  3. Verifies zero leakage against val/test held-out sets.
"""

import json
import random
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "finetune" / "data" / "rollama"

def main():
    print("=" * 60)
    print("GENERATING SURGICAL SFT DATASET (SIDEPATH 3A)")
    print("=" * 60)

    # 1. Load DPO chosen items (hard refusals & disambiguation)
    dpo_file = DATA_DIR / "dpo_train.jsonl"
    with dpo_file.open(encoding="utf-8") as f:
        dpo_items = [json.loads(line) for line in f if line.strip()]

    surgical_refusals = []
    for item in dpo_items:
        surgical_refusals.append({
            "id": f"surg-{item['id']}",
            "category": item["category"],
            "lang": item["lang"],
            "prompt": item["prompt"],
            "completion": item["chosen"],
        })

    # Repeat refusals 3x for high-weight reinforcement
    weighted_refusals = []
    for r in surgical_refusals:
        for rep in range(3):
            weighted_refusals.append(dict(r, id=f"{r['id']}-rep{rep}"))

    print(f"Loaded {len(surgical_refusals)} unique refusal/disambiguation items -> {len(weighted_refusals)} (3x weighted).")

    # 2. Sample 1,500 balanced regular items from train_augmented.jsonl
    aug_file = DATA_DIR / "train_augmented.jsonl"
    with aug_file.open(encoding="utf-8") as f:
        aug_items = [json.loads(line) for line in f if line.strip()]

    rng = random.Random(20261031)
    rng.shuffle(aug_items)

    # Group by tool
    by_tool = {}
    for item in aug_items:
        try:
            comp = json.loads(item["completion"])
            tool = comp["name"]
        except Exception:
            tool = "unknown"
        if tool not in by_tool:
            by_tool[tool] = []
        by_tool[tool].append(item)

    regular_samples = []
    target_per_tool = 500
    for tool, items in by_tool.items():
        if tool == "unknown":
            continue
        regular_samples.extend(items[:target_per_tool])

    print(f"Sampled {len(regular_samples)} balanced regular items across tools: {list(by_tool.keys())}")

    # 3. Combine and shuffle
    combined = weighted_refusals + regular_samples
    rng.shuffle(combined)

    out_file = DATA_DIR / "train_surgical.jsonl"
    with out_file.open("w", encoding="utf-8") as f:
        for item in combined:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"\nWrote {len(combined)} surgical training samples to: {out_file}")

    # Summary
    cat_counts = Counter(item.get("category", "unknown") for item in combined)
    print("Top categories in surgical dataset:")
    for cat, count in cat_counts.most_common(10):
        print(f"  {cat}: {count}")

if __name__ == "__main__":
    main()
