"""Confidence calibration and margin gating benchmark for RoLlama router."""

import argparse
import json
import re
import time
import sys
from pathlib import Path
import numpy as np

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

# Ensure utf-8 output on Windows
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument("--base", default=str(ROOT / "finetune" / "rollama" / "base"))
p.add_argument("--adapter", default=str(ROOT / "finetune" / "out" / "rollama" / "sft_final"))
p.add_argument("--tokenizer", default=str(ROOT / "finetune" / "rollama" / "adapter"))
p.add_argument("--test", default=str(ROOT / "finetune" / "data" / "rollama" / "test.jsonl"))
p.add_argument("--out", default=str(ROOT / "finetune" / "out" / "rollama" / "confidence_eval.json"))
a = p.parse_args()

ALLOWED_TOOLS = [
    "get_flight_details", "get_gate", "get_time_remaining", "get_live_tracking",
    "search_knowledge", "open_airport_map", "none",
]

def parse(text: str):
    match = re.search(r"\{\s*\"name\"\s*:\s*\"([^\"]+)\"\s*,\s*\"arguments\"\s*:\s*(\{.*?\})\s*\}", text, re.S)
    if not match:
        return None
    try:
        return {"name": match.group(1), "arguments": json.loads(match.group(2))}
    except json.JSONDecodeError:
        return None

def main():
    rows = [json.loads(line) for line in Path(a.test).read_text(encoding="utf-8").splitlines() if line.strip()]
    qconf = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16)
    tok = AutoTokenizer.from_pretrained(a.tokenizer)
    base = AutoModelForCausalLM.from_pretrained(a.base, quantization_config=qconf, device_map="cuda")
    model = PeftModel.from_pretrained(base, a.adapter).eval()

    print(f"Loaded model and tokenizer from {a.adapter}")
    print(f"Evaluating {len(rows)} held-out test samples with logit scores...")

    results = []
    
    for idx, row in enumerate(rows):
        inputs = tok(row["prompt"], return_tensors="pt").to("cuda")
        
        with torch.inference_mode():
            gen_out = model.generate(
                **inputs,
                max_new_tokens=64,
                do_sample=False,
                repetition_penalty=1.1,
                pad_token_id=tok.eos_token_id,
                output_scores=True,
                return_dict_in_generate=True,
            )

        output_ids = gen_out.sequences[0, inputs["input_ids"].shape[1]:]
        raw = tok.decode(output_ids, skip_special_tokens=True).strip()
        expected = json.loads(row["completion"])
        actual = parse(raw)

        # Calculate confidence from the generated token probabilities
        # We examine the transition probabilities for the generated tokens
        token_probs = []
        for step_idx, scores in enumerate(gen_out.scores):
            probs = torch.softmax(scores[0], dim=-1)
            token_id = output_ids[step_idx].item()
            prob = probs[token_id].item()
            top2 = torch.topk(probs, 2)
            top1_p = top2.values[0].item()
            top2_p = top2.values[1].item()
            token_probs.append({
                "token": tok.decode([token_id]),
                "prob": prob,
                "top1_p": top1_p,
                "top2_p": top2_p,
                "margin": top1_p - top2_p,
            })

        # Min token confidence and average token confidence across the tool name tokens
        # Tool name appears usually in the first 4-8 tokens: {"name": "TOOL_NAME"
        tool_tokens = token_probs[3:8] if len(token_probs) >= 8 else token_probs
        min_margin = min(t["margin"] for t in tool_tokens) if tool_tokens else 1.0
        avg_prob = np.mean([t["prob"] for t in tool_tokens]) if tool_tokens else 1.0
        min_prob = min(t["prob"] for t in tool_tokens) if tool_tokens else 1.0

        tool_match = actual is not None and actual["name"] == expected["name"]
        false_exec = expected["name"] == "none" and actual is not None and actual["name"] != "none"

        results.append({
            "id": row.get("id"),
            "category": row.get("category"),
            "expected_tool": expected["name"],
            "actual_tool": actual["name"] if actual else None,
            "tool_match": tool_match,
            "false_exec": false_exec,
            "min_margin": round(min_margin, 4),
            "avg_prob": round(float(avg_prob), 4),
            "min_prob": round(float(min_prob), 4),
            "raw": raw,
        })

    # Benchmark various gating thresholds
    print("\n" + "="*70)
    print("MARGIN GATING & CONFIDENCE BENCHMARK (ON 147 HELD-OUT CASES)")
    print("="*70)
    print(f"{'THRESHOLD':<12} | {'COVERAGE':<10} | {'TOOL ACC':<10} | {'FALSE EXEC':<10} | {'REVERTED TO SAFE'}")
    print("-" * 70)

    # Base without gating
    base_correct = sum(r["tool_match"] for r in results)
    base_fe = sum(r["false_exec"] for r in results)
    print(f"{'BASE (None)':<12} | 100.0%     | {base_correct/len(results)*100:.2f}%     | {base_fe:<10} | 0")

    margin_thresholds = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60]
    gating_summary = {}

    for th in margin_thresholds:
        covered = 0
        correct_covered = 0
        false_exec_gated = 0
        reverted_to_safe = 0

        for r in results:
            if r["min_margin"] >= th:
                covered += 1
                if r["tool_match"]:
                    correct_covered += 1
                if r["false_exec"]:
                    false_exec_gated += 1
            else:
                # Gated query -> routed to 'none' / 'clarify' / Tier 1 fallback
                if r["false_exec"]:
                    reverted_to_safe += 1

        coverage_pct = round(covered / len(results) * 100, 2)
        acc_pct = round(correct_covered / covered * 100, 2) if covered > 0 else 0.0

        print(f"{th:<12.2f} | {coverage_pct:<9}% | {acc_pct:<9}% | {false_exec_gated:<10} | +{reverted_to_safe}")
        gating_summary[str(th)] = {
            "coverage_pct": coverage_pct,
            "accuracy_on_covered": acc_pct,
            "false_executions": false_exec_gated,
            "reverted_false_executions": reverted_to_safe,
        }

    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps({
        "total": len(results),
        "base_accuracy": round(base_correct / len(results) * 100, 2),
        "base_false_exec": base_fe,
        "gating_benchmarks": gating_summary,
        "details": results,
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSaved detailed analysis to {a.out}")

if __name__ == "__main__":
    main()

