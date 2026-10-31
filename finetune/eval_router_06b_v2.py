"""Strict held-out evaluation for the no-thinking 0.6B router."""

from __future__ import annotations

import argparse
import json
import re
import time
from collections import Counter
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


KNOWN = {
    "get_flight_details",
    "get_gate",
    "get_time_remaining",
    "get_live_tracking",
    "search_knowledge",
    "open_airport_map",
    "none",
}


def parse_decision(text: str) -> tuple[dict | None, str | None]:
    stripped = text.strip()
    try:
        value, end = json.JSONDecoder().raw_decode(stripped)
    except json.JSONDecodeError as exc:
        return None, f"invalid_json:{exc.msg}"
    if stripped[end:].strip():
        return None, "trailing_text"
    if not isinstance(value, dict) or set(value) != {"name", "arguments"}:
        return None, "invalid_shape"
    if value["name"] not in KNOWN:
        return None, "unknown_tool"
    if not isinstance(value["arguments"], dict):
        return None, "invalid_arguments"
    return value, None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="Qwen/Qwen3-0.6B")
    parser.add_argument("--adapter")
    parser.add_argument("--data", default="finetune/data/06b_v2/test.jsonl")
    parser.add_argument("--out", default="finetune/out/06b_v2/eval.json")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--batch-size", type=int, default=8)
    args = parser.parse_args()

    rows = [json.loads(line) for line in Path(args.data).read_text(encoding="utf-8").splitlines() if line]
    if args.limit:
        rows = rows[: args.limit]

    tokenizer = AutoTokenizer.from_pretrained(args.base)
    tokenizer.padding_side = "left"
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        args.base, torch_dtype=torch.bfloat16, device_map="cuda:0"
    )
    if args.adapter:
        model = PeftModel.from_pretrained(model, args.adapter)
    model.eval()

    details = []
    started = time.perf_counter()
    for offset in range(0, len(rows), args.batch_size):
        batch = rows[offset : offset + args.batch_size]
        prompts = [row["prompt"] for row in batch]
        encoded = tokenizer(prompts, return_tensors="pt", padding=True, add_special_tokens=False).to("cuda:0")
        with torch.inference_mode():
            generated = model.generate(
                **encoded,
                max_new_tokens=64,
                do_sample=False,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.encode("<|im_end|>", add_special_tokens=False)[0],
            )
        completions = tokenizer.batch_decode(
            generated[:, encoded.input_ids.shape[1] :], skip_special_tokens=True
        )
        for row, raw in zip(batch, completions):
            expected = json.loads(row["completion"])
            parsed, error = parse_decision(raw)
            name_ok = parsed is not None and parsed["name"] == expected["name"]
            exact_ok = parsed == expected
            details.append(
                {
                    "id": row["id"],
                    "lang": row["lang"],
                    "category": row["category"],
                    "expected": expected,
                    "generated": raw,
                    "parsed": parsed,
                    "error": error,
                    "name_ok": name_ok,
                    "exact_ok": exact_ok,
                    "thinking_leak": bool(re.search(r"<think>|</think>|\bthink\b", raw, re.I)),
                }
            )

    total = len(details)
    summary = {
        "total": total,
        "tool_accuracy": sum(d["name_ok"] for d in details) / total,
        "exact_decision_accuracy": sum(d["exact_ok"] for d in details) / total,
        "json_valid_rate": sum(d["parsed"] is not None for d in details) / total,
        "thinking_leaks": sum(d["thinking_leak"] for d in details),
        "elapsed_seconds": round(time.perf_counter() - started, 3),
        "by_language": {},
        "errors": dict(Counter(d["error"] or "wrong_label" for d in details if not d["name_ok"])),
    }
    for lang in sorted({d["lang"] for d in details}):
        subset = [d for d in details if d["lang"] == lang]
        summary["by_language"][lang] = {
            "correct": sum(d["name_ok"] for d in subset),
            "total": len(subset),
            "accuracy": sum(d["name_ok"] for d in subset) / len(subset),
        }
    output = {"summary": summary, "details": details}
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
