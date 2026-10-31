"""Constrained Decoding Logit Masking Benchmark for RoLlama Router (Etapa 3).

Enforces generation strictly adhering to valid JSON and the 7 allowed tools:
  {"name": "<allowed_tool>", "arguments": {...}}
using a specialized Hugging Face LogitsProcessor.

Target metrics:
  - Invalid JSON rate: 0.0%
  - Unknown tool rate: 0
  - PC median and P95 latency (ms)
  - Generation throughput (tokens/second)
  - Tool selection accuracy and strict exact match comparison
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
import numpy as np
import torch
from peft import PeftModel
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    LogitsProcessor,
    LogitsProcessorList,
)

# Ensure utf-8 output on Windows
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]

ALLOWED_TOOLS = [
    "get_flight_details",
    "get_gate",
    "get_time_remaining",
    "get_live_tracking",
    "search_knowledge",
    "open_airport_map",
    "none",
]


class ConstrainedToolJsonLogitsProcessor(LogitsProcessor):
    """LogitsProcessor that mathematically bounds generation strictly to valid router JSON and the 7 allowed tools."""

    def __init__(self, tokenizer: AutoTokenizer):
        self.tok = tokenizer
        self.eos_id = tokenizer.eos_token_id
        self.prompt_len = 0

        # Exact token sequences for prefix: '{"name":"'
        # [5018, 609, 3332]
        self.prefix_tokens = [5018, 609, 3332]

        # Exact token sequence for each tool name:
        self.tool_tokens = {
            "get_flight_details": [456, 91470, 13563],
            "get_gate": [456, 55898],
            "get_time_remaining": [456, 3084, 60344],
            "get_live_tracking": [456, 56303, 67205],
            "search_knowledge": [1874, 4803, 52286],
            "open_airport_map": [2569, 51927, 403, 5489],
            "none": [6836],
        }

        # Exact key token sequences for tools that accept arguments:
        self.arg_keys = {
            "get_flight_details": [39490, 2903, 3332],  # 'flight', 'Number', '":"'
            "get_gate": [39490, 2903, 3332],
            "get_time_remaining": [39490, 2903, 3332],
            "get_live_tracking": [39490, 2903, 3332],
            "search_knowledge": [1663, 3332],           # 'query', '":"'
            "open_airport_map": [18481, 3332],          # 'destination', '":"'
        }

    def set_prompt_len(self, length: int):
        self.prompt_len = length

    def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor) -> torch.FloatTensor:
        # Batch size 1
        cur_tokens = input_ids[0, self.prompt_len:].tolist()
        step = len(cur_tokens)

        mask = torch.full_like(scores[0], float("-inf"))

        # Step 0, 1, 2: force '{"name":"'
        if step < len(self.prefix_tokens):
            t = self.prefix_tokens[step]
            mask[t] = scores[0, t]
            return mask.unsqueeze(0)

        tool_step = step - len(self.prefix_tokens)

        # Check which tools still match prefix
        matching_tools = {}
        for name, toks in self.tool_tokens.items():
            if tool_step <= len(toks) and cur_tokens[len(self.prefix_tokens):] == toks[:tool_step]:
                matching_tools[name] = toks

        if matching_tools:
            allowed_next: Set[int] = set()
            for name, toks in matching_tools.items():
                if tool_step < len(toks):
                    allowed_next.add(toks[tool_step])
                elif tool_step == len(toks):
                    # Tool name complete, next must be 2247 ('","')
                    allowed_next.add(2247)
            for t in allowed_next:
                mask[t] = scores[0, t]
            return mask.unsqueeze(0)

        # Tool name is completed. Identify selected tool
        chosen_tool = None
        tool_len = 0
        for name, toks in self.tool_tokens.items():
            sub = cur_tokens[len(self.prefix_tokens) : len(self.prefix_tokens) + len(toks)]
            if sub == toks:
                chosen_tool = name
                tool_len = len(toks)
                break

        if not chosen_tool:
            # Fallback to EOS
            mask[self.eos_id] = scores[0, self.eos_id]
            return mask.unsqueeze(0)

        # Token 2247 was emitted at step len(prefix) + tool_len.
        # Next token at step len(prefix) + tool_len + 1 MUST be 16774 ('arguments')
        post_tool_step = step - (len(self.prefix_tokens) + tool_len + 1)
        if post_tool_step == 0:
            mask[16774] = scores[0, 16774]
            return mask.unsqueeze(0)

        args_step = post_tool_step - 1

        # For tool == 'none': strictly '":{}}' followed by EOS
        if chosen_tool == "none":
            seq = [794, 90, 3500]
            if args_step < len(seq):
                t = seq[args_step]
                mask[t] = scores[0, t]
            else:
                mask[self.eos_id] = scores[0, self.eos_id]
            return mask.unsqueeze(0)

        # For other tools:
        # At args_step == 0: model chooses empty args (794 '":') or non-empty (23118 ':{"')
        if args_step == 0:
            mask[794] = scores[0, 794]
            mask[23118] = scores[0, 23118]
            return mask.unsqueeze(0)

        first_arg_tok = cur_tokens[len(self.prefix_tokens) + tool_len + 2]

        if first_arg_tok == 794:
            # Empty args: 794 was chosen. Next must be 90 ('{'), then 3500 ('}}'), then EOS.
            empty_step = args_step - 1
            seq = [90, 3500]
            if empty_step < len(seq):
                t = seq[empty_step]
                mask[t] = scores[0, t]
            else:
                mask[self.eos_id] = scores[0, self.eos_id]
            return mask.unsqueeze(0)

        # Non-empty args: first_arg_tok == 23118 (':{"')
        key_seq = self.arg_keys[chosen_tool]
        key_step = args_step - 1

        if key_step < len(key_seq):
            t = key_seq[key_step]
            mask[t] = scores[0, t]
            return mask.unsqueeze(0)

        # Inside string argument value:
        val_tokens = cur_tokens[len(self.prefix_tokens) + tool_len + 2 + 1 + len(key_seq):]
        val_len = len(val_tokens)

        # Check if already terminated or if last token closed quotes/braces
        last_tok = cur_tokens[-1]
        last_str = self.tok.decode([last_tok])

        if last_tok == 32075 or last_str.endswith('"}}') or last_str.endswith('}}'):
            # JSON completely closed -> EOS
            mask[self.eos_id] = scores[0, self.eos_id]
            return mask.unsqueeze(0)
        elif last_tok == 9388 or last_str.endswith('"}'):
            # String and inner argument brace closed -> outer brace '}'
            mask[92] = scores[0, 92]
            return mask.unsqueeze(0)
        elif last_str.endswith('"') and last_tok != 3332:
            # String closed with quote -> close arguments and top-level JSON '}}'
            mask[3500] = scores[0, 3500]
            return mask.unsqueeze(0)
        elif last_tok == 92:
            # Closing brace emitted -> EOS
            mask[self.eos_id] = scores[0, self.eos_id]
            return mask.unsqueeze(0)

        max_val_len = 16 if chosen_tool != "search_knowledge" else 30
        if val_len >= max_val_len:
            # Force closing string and braces
            mask[32075] = scores[0, 32075]
            return mask.unsqueeze(0)

        # Allow normal generation, but ensure string terminator 32075 ('"}}') is reachable
        # and disallow bare EOS or newlines that break JSON
        mask = scores[0].clone()
        mask[self.eos_id] = float("-inf")
        mask[198] = float("-inf")   # '\n'
        mask[271] = float("-inf")   # '\n\n'
        return mask.unsqueeze(0)


def parse(text: str) -> Optional[Dict[str, Any]]:
    match = re.search(r"\{\s*\"name\"\s*:\s*\"([^\"]+)\"\s*,\s*\"arguments\"\s*:\s*(\{.*?\})\s*\}", text, re.S)
    if not match:
        return None
    try:
        return {"name": match.group(1), "arguments": json.loads(match.group(2))}
    except json.JSONDecodeError:
        return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", default=str(ROOT / "finetune" / "rollama" / "base"))
    p.add_argument("--adapter", default=str(ROOT / "finetune" / "out" / "rollama" / "sft_final"))
    p.add_argument("--tokenizer", default=str(ROOT / "finetune" / "rollama" / "adapter"))
    p.add_argument("--test", default=str(ROOT / "finetune" / "data" / "rollama" / "test.jsonl"))
    p.add_argument("--out", default=str(ROOT / "finetune" / "out" / "rollama" / "constrained_eval.json"))
    args = p.parse_args()

    rows = [json.loads(line) for line in Path(args.test).read_text(encoding="utf-8").splitlines() if line.strip()]
    qconf = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16)
    tok = AutoTokenizer.from_pretrained(args.tokenizer)
    base = AutoModelForCausalLM.from_pretrained(args.base, quantization_config=qconf, device_map="cuda")
    model = PeftModel.from_pretrained(base, args.adapter).eval()

    processor = ConstrainedToolJsonLogitsProcessor(tok)
    proc_list = LogitsProcessorList([processor])

    print(f"Loaded model from {args.adapter}")
    print(f"Benchmarking Unconstrained vs Constrained Decoding on {len(rows)} samples...\n")

    torch.cuda.reset_peak_memory_stats()

    results_unconstrained, timings_unconstrained, tokens_unconstrained = [], [], []
    results_constrained, timings_constrained, tokens_constrained = [], [], []

    for idx, row in enumerate(rows):
        prompt = row["prompt"]
        expected = json.loads(row["completion"])
        cat = row.get("category", "unknown")

        inputs = tok(prompt, return_tensors="pt").to("cuda")
        prompt_len = inputs["input_ids"].shape[1]

        # 1. Unconstrained generation
        torch.cuda.synchronize()
        t0 = time.perf_counter()
        with torch.inference_mode():
            out_uncons = model.generate(
                **inputs,
                max_new_tokens=48,
                do_sample=False,
                repetition_penalty=1.1,
                pad_token_id=tok.eos_token_id,
            )
        torch.cuda.synchronize()
        dur_uncons = time.perf_counter() - t0
        timings_unconstrained.append(dur_uncons * 1000)
        n_tok_uncons = out_uncons.shape[1] - prompt_len
        tokens_unconstrained.append(n_tok_uncons)

        raw_uncons = tok.decode(out_uncons[0, prompt_len:], skip_special_tokens=True).strip()
        parsed_uncons = parse(raw_uncons)

        # 2. Constrained generation
        processor.set_prompt_len(prompt_len)
        torch.cuda.synchronize()
        t1 = time.perf_counter()
        with torch.inference_mode():
            out_cons = model.generate(
                **inputs,
                max_new_tokens=48,
                do_sample=False,
                pad_token_id=tok.eos_token_id,
                logits_processor=proc_list,
            )
        torch.cuda.synchronize()
        dur_cons = time.perf_counter() - t1
        timings_constrained.append(dur_cons * 1000)
        n_tok_cons = out_cons.shape[1] - prompt_len
        tokens_constrained.append(n_tok_cons)

        raw_cons = tok.decode(out_cons[0, prompt_len:], skip_special_tokens=True).strip()
        parsed_cons = parse(raw_cons)

        # Validate unconstrained
        uncons_valid_json = parsed_uncons is not None
        uncons_unknown_tool = parsed_uncons is not None and parsed_uncons["name"] not in ALLOWED_TOOLS
        uncons_tool_match = parsed_uncons is not None and parsed_uncons["name"] == expected["name"]
        uncons_fe = expected["name"] == "none" and parsed_uncons is not None and parsed_uncons["name"] != "none"
        uncons_exact = parsed_uncons == expected

        # Validate constrained
        cons_valid_json = parsed_cons is not None
        cons_unknown_tool = parsed_cons is not None and parsed_cons["name"] not in ALLOWED_TOOLS
        cons_tool_match = parsed_cons is not None and parsed_cons["name"] == expected["name"]
        cons_fe = expected["name"] == "none" and parsed_cons is not None and parsed_cons["name"] != "none"
        cons_exact = parsed_cons == expected

        results_unconstrained.append({
            "id": row.get("id"),
            "category": cat,
            "raw": raw_uncons,
            "parsed": parsed_uncons,
            "valid_json": uncons_valid_json,
            "unknown_tool": uncons_unknown_tool,
            "tool_match": uncons_tool_match,
            "false_exec": uncons_fe,
            "exact": uncons_exact,
            "tokens": n_tok_uncons,
            "ms": round(dur_uncons * 1000, 2),
        })

        results_constrained.append({
            "id": row.get("id"),
            "category": cat,
            "raw": raw_cons,
            "parsed": parsed_cons,
            "valid_json": cons_valid_json,
            "unknown_tool": cons_unknown_tool,
            "tool_match": cons_tool_match,
            "false_exec": cons_fe,
            "exact": cons_exact,
            "tokens": n_tok_cons,
            "ms": round(dur_cons * 1000, 2),
        })

    n = len(rows)

    # Throughput calculations
    total_time_uncons_s = sum(timings_unconstrained) / 1000.0
    total_tokens_uncons = sum(tokens_unconstrained)
    throughput_uncons = round(total_tokens_uncons / total_time_uncons_s, 2) if total_time_uncons_s > 0 else 0

    total_time_cons_s = sum(timings_constrained) / 1000.0
    total_tokens_cons = sum(tokens_constrained)
    throughput_cons = round(total_tokens_cons / total_time_cons_s, 2) if total_time_cons_s > 0 else 0

    # Metrics aggregation
    uncons_invalid_count = sum(not r["valid_json"] for r in results_unconstrained)
    cons_invalid_count = sum(not r["valid_json"] for r in results_constrained)

    uncons_unknown_count = sum(r["unknown_tool"] for r in results_unconstrained)
    cons_unknown_count = sum(r["unknown_tool"] for r in results_constrained)

    uncons_tool_acc = round(sum(r["tool_match"] for r in results_unconstrained) / n * 100, 2)
    cons_tool_acc = round(sum(r["tool_match"] for r in results_constrained) / n * 100, 2)

    uncons_exact_pct = round(sum(r["exact"] for r in results_unconstrained) / n * 100, 2)
    cons_exact_pct = round(sum(r["exact"] for r in results_constrained) / n * 100, 2)

    uncons_fe = sum(r["false_exec"] for r in results_unconstrained)
    cons_fe = sum(r["false_exec"] for r in results_constrained)

    uncons_median_ms = round(float(np.median(timings_unconstrained)), 2)
    uncons_p95_ms = round(float(np.percentile(timings_unconstrained, 95)), 2)

    cons_median_ms = round(float(np.median(timings_constrained)), 2)
    cons_p95_ms = round(float(np.percentile(timings_constrained, 95)), 2)

    peak_vram = round(torch.cuda.max_memory_allocated() / 1e9, 3)

    summary = {
        "n_samples": n,
        "metrics": {
            "unconstrained": {
                "invalid_json_count": uncons_invalid_count,
                "invalid_json_rate": f"{round(uncons_invalid_count / n * 100, 2)}%",
                "unknown_tool_count": uncons_unknown_count,
                "tool_name_accuracy": f"{uncons_tool_acc}%",
                "strict_exact": f"{uncons_exact_pct}%",
                "false_executions": uncons_fe,
                "throughput_tokens_per_sec": throughput_uncons,
                "latency_median_ms": uncons_median_ms,
                "latency_p95_ms": uncons_p95_ms,
                "avg_tokens_per_sample": round(total_tokens_uncons / n, 2),
            },
            "constrained": {
                "invalid_json_count": cons_invalid_count,
                "invalid_json_rate": f"{round(cons_invalid_count / n * 100, 2)}%",
                "unknown_tool_count": cons_unknown_count,
                "tool_name_accuracy": f"{cons_tool_acc}%",
                "strict_exact": f"{cons_exact_pct}%",
                "false_executions": cons_fe,
                "throughput_tokens_per_sec": throughput_cons,
                "latency_median_ms": cons_median_ms,
                "latency_p95_ms": cons_p95_ms,
                "avg_tokens_per_sample": round(total_tokens_cons / n, 2),
            },
        },
        "target_compliance": {
            "invalid_json_target_0_pct": cons_invalid_count == 0,
            "unknown_tool_target_0": cons_unknown_count == 0,
            "latency_p95_under_1000ms": cons_p95_ms < 1000,
        },
        "peak_vram_gb": peak_vram,
    }

    print("\n" + "=" * 75)
    print("ETAPA 3 BENCHMARK RESULTS: CONSTRAINED DECODING LOGITS MASKING")
    print("=" * 75)
    print(f"{'METRIC':<28} | {'UNCONSTRAINED':<18} | {'CONSTRAINED (LOGITS)':<18}")
    print("-" * 75)
    print(f"{'Invalid JSON Count / Rate':<28} | {uncons_invalid_count} ({round(uncons_invalid_count/n*100, 2)}%) | {cons_invalid_count} ({round(cons_invalid_count/n*100, 2)}%)")
    print(f"{'Unknown Tool Count':<28} | {uncons_unknown_count:<18} | {cons_unknown_count:<18}")
    print(f"{'Tool Name Accuracy':<28} | {uncons_tool_acc}%{'':<12} | {cons_tool_acc}%")
    print(f"{'Strict Exact Match':<28} | {uncons_exact_pct}%{'':<12} | {cons_exact_pct}%")
    print(f"{'False Executions':<28} | {uncons_fe:<18} | {cons_fe:<18}")
    print(f"{'Median Latency (ms)':<28} | {uncons_median_ms} ms{'':<10} | {cons_median_ms} ms")
    print(f"{'P95 Latency (ms)':<28} | {uncons_p95_ms} ms{'':<10} | {cons_p95_ms} ms")
    print(f"{'Throughput (tokens/sec)':<28} | {throughput_uncons} tok/s{'':<7} | {throughput_cons} tok/s")
    print(f"{'Avg Tokens / Generation':<28} | {round(total_tokens_uncons/n, 2):<18} | {round(total_tokens_cons/n, 2):<18}")
    print("=" * 75)

    payload = {
        "summary": summary,
        "unconstrained_items": results_unconstrained,
        "constrained_items": results_constrained,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSaved full constrained decoding report to: {args.out}")


if __name__ == "__main__":
    main()
