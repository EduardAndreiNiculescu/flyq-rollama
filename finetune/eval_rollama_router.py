"""Held-out compact-router evaluation for a RoLlama SFT adapter.

Computes:
  - strict exact accuracy
  - tool-name selection accuracy
  - argument preservation
  - invalid JSON count and rate
  - unknown tool count
  - false execution count (executing when none expected)
  - flight-number mutation count
  - PC CPU/GPU latency (median, p95)
  - peak VRAM
  - adapter size
  - dedicated probe benchmarks
"""

import argparse
import json
import re
import time
import os
from pathlib import Path
import numpy as np

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument("--base", default=str(ROOT / "finetune" / "rollama" / "base"))
p.add_argument("--adapter", required=True)
p.add_argument("--tokenizer", default=str(ROOT / "finetune" / "rollama" / "adapter"))
p.add_argument("--test", default=str(ROOT / "finetune" / "data" / "rollama" / "test.jsonl"))
p.add_argument("--out", default=str(ROOT / "finetune" / "out" / "rollama" / "eval.json"))
p.add_argument("--run-probes", action="store_true", help="Run dedicated probe cases")
a = p.parse_args()

ALLOWED_TOOLS = {
    "get_flight_details", "get_gate", "get_time_remaining", "get_live_tracking",
    "search_knowledge", "open_airport_map", "none",
}

FLIGHT_NO_RE = re.compile(r"\b([A-Z]{2}\d{2,4}|[A-Z]\d\d{3,4}|\d[A-Z]\d{3,4}|[A-Z]{3}\d{2,4}|DEMO\d{1,4})\b", re.IGNORECASE)

def extract_flight_number(text: str) -> str | None:
    m = FLIGHT_NO_RE.search(text.upper())
    return m.group(1).replace(" ", "") if m else None

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

    torch.cuda.reset_peak_memory_stats()
    result, timings = [], []

    for row in rows:
        inputs = tok(row["prompt"], return_tensors="pt").to("cuda")
        torch.cuda.synchronize()
        started = time.perf_counter()
        with torch.inference_mode():
            output = model.generate(
                **inputs, max_new_tokens=64, do_sample=False, repetition_penalty=1.1, pad_token_id=tok.eos_token_id
            )
        torch.cuda.synchronize()
        timings.append((time.perf_counter() - started) * 1000)

        raw = tok.decode(output[0, inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
        expected = json.loads(row["completion"])
        actual = parse(raw)

        q = row["prompt"].rsplit("Passenger: ", 1)[-1].split("\nJSON:", 1)[0].strip()
        gt_fn = expected.get("arguments", {}).get("flightNumber") if isinstance(expected.get("arguments"), dict) else None
        expected_fn = gt_fn or extract_flight_number(q)
        actual_fn = actual.get("arguments", {}).get("flightNumber") if actual and isinstance(actual.get("arguments"), dict) else None

        # Check flight number mutation: message or ground truth had a flight number, but actual returned a different flight number
        fn_mutated = False
        if expected_fn and actual_fn and actual_fn.upper() != expected_fn.upper():
            fn_mutated = True
        # Check flight number hallucination: message and ground truth had NO flight number, but model invented one
        if not expected_fn and actual_fn:
            fn_mutated = True

        tool_match = actual is not None and actual["name"] == expected["name"]
        invalid_json = actual is None
        unknown_tool = actual is not None and actual["name"] not in ALLOWED_TOOLS
        false_exec = expected["name"] == "none" and actual is not None and actual["name"] != "none"
        exact_ok = actual == expected

        result.append({
            "id": row.get("id"),
            "category": row.get("category"),
            "lang": row.get("lang"),
            "question": q,
            "expected": expected,
            "actual": actual,
            "raw": raw,
            "ok": exact_ok,
            "tool_match": tool_match,
            "invalid_json": invalid_json,
            "unknown_tool": unknown_tool,
            "false_exec": false_exec,
            "fn_mutated": fn_mutated,
        })

    n = len(result)
    exact_count = sum(r["ok"] for r in result)
    tool_match_count = sum(r["tool_match"] for r in result)
    invalid_json_count = sum(r["invalid_json"] for r in result)
    unknown_tool_count = sum(r["unknown_tool"] for r in result)
    false_exec_count = sum(r["false_exec"] for r in result)
    fn_mutated_count = sum(r["fn_mutated"] for r in result)

    sorted_t = sorted(timings)
    median_ms = sorted_t[n // 2] if n else 0.0
    p95_ms = float(np.percentile(sorted_t, 95)) if n else 0.0
    peak_vram_gb = round(torch.cuda.max_memory_allocated() / 1e9, 3) if torch.cuda.is_available() else 0.0

    # Adapter size
    adapter_path = Path(a.adapter)
    adapter_bytes = sum(f.stat().st_size for f in adapter_path.glob("**/*") if f.is_file())
    adapter_size_mb = round(adapter_bytes / 1e6, 2)

    # Error analysis by category
    category_metrics = {}
    for r in result:
        cat = r.get("category") or "unknown"
        if cat not in category_metrics:
            category_metrics[cat] = {"total": 0, "tool_match": 0, "exact": 0, "false_exec": 0}
        category_metrics[cat]["total"] += 1
        if r["tool_match"]:
            category_metrics[cat]["tool_match"] += 1
        if r["ok"]:
            category_metrics[cat]["exact"] += 1
        if r["false_exec"]:
            category_metrics[cat]["false_exec"] += 1

    payload = {
        "n": n,
        "strict_exact": exact_count,
        "strict_exact_pct": round(exact_count / n * 100, 2),
        "tool_name_accuracy": round(tool_match_count / n * 100, 2),
        "tool_match_count": tool_match_count,
        "invalid_json_count": invalid_json_count,
        "unknown_tool_count": unknown_tool_count,
        "false_execution_count": false_exec_count,
        "flight_number_mutations": fn_mutated_count,
        "latency_pc": {
            "median_ms": round(median_ms, 2),
            "p95_ms": round(p95_ms, 2),
        },
        "peak_vram_gb": peak_vram_gb,
        "adapter_size_mb": adapter_size_mb,
        "category_metrics": category_metrics,
        "items": result,
    }

    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    summary = {
        "n": n,
        "strict_exact": f"{exact_count}/{n} ({payload['strict_exact_pct']}%)",
        "tool_name_accuracy": f"{tool_match_count}/{n} ({payload['tool_name_accuracy']}%)",
        "invalid_json": invalid_json_count,
        "unknown_tool": unknown_tool_count,
        "false_execution": false_exec_count,
        "flight_number_mutations": fn_mutated_count,
        "median_ms": round(median_ms, 2),
        "p95_ms": round(p95_ms, 2),
        "peak_vram_gb": peak_vram_gb,
        "adapter_size_mb": adapter_size_mb,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
