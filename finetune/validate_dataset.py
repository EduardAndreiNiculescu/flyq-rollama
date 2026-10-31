"""Validate chat-format JSONL or prompt/completion JSONL.

Checks schema, role order, split values, duplicate ids, and flags content that
fine-tuning must NOT memorise (time-sensitive operational facts).
Usage: python -I finetune/validate_dataset.py finetune/data/06b/*.jsonl
"""
import glob
import json
import re
import sys

ROLES = {"system", "user", "assistant"}
SPLITS = {"train", "val", "test"}
# Operational facts must come from retrieval/tools at runtime, never from weights.
FORBIDDEN = [r"\bgate\s*[A-Z]?\d{1,2}\b", r"\b(poarta|poartă|poarta)\s*[A-Z]?\d{1,2}\b", r"\bdelayed by \d+", r"\bîntârziere de \d+"]


def main(paths):
    expanded_paths = []
    for p in paths:
        matched = glob.glob(p)
        if matched:
            expanded_paths.extend(matched)
        else:
            expanded_paths.append(p)

    seen, errors, counts = set(), [], {}
    for p in expanded_paths:
        for n, line in enumerate(open(p, encoding="utf-8"), 1):
            if not line.strip():
                continue
            where = f"{p}:{n}"
            try:
                ex = json.loads(line)
            except json.JSONDecodeError as e:
                errors.append(f"{where}: bad JSON ({e})")
                continue
            if ex.get("id") in seen:
                errors.append(f"{where}: duplicate id {ex.get('id')}")
            seen.add(ex.get("id"))
            if ex.get("split") not in SPLITS:
                errors.append(f"{where}: split must be one of {sorted(SPLITS)}")
            counts[ex.get("split")] = counts.get(ex.get("split"), 0) + 1

            if "messages" in ex:
                msgs = ex.get("messages", [])
                if not msgs or msgs[-1].get("role") != "assistant":
                    errors.append(f"{where}: last message must be assistant")
                if any(m.get("role") not in ROLES or not str(m.get("content", "")).strip() for m in msgs):
                    errors.append(f"{where}: invalid role or empty content")
                answer = msgs[-1].get("content", "") if msgs else ""
                for pat in FORBIDDEN:
                    if re.search(pat, answer, re.I):
                        errors.append(f"{where}: assistant answer states a time-sensitive fact ({pat})")
            elif "prompt" in ex and "completion" in ex:
                prompt = ex.get("prompt", "")
                completion = ex.get("completion", "")
                if not prompt.strip() or "<|im_start|>assistant" not in prompt:
                    errors.append(f"{where}: prompt must end with assistant turn")
                if not completion.strip():
                    errors.append(f"{where}: completion must not be empty")
            else:
                errors.append(f"{where}: record must contain 'messages' or 'prompt'/'completion'")

    print("counts:", counts)
    for e in errors:
        print("ERROR", e)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
