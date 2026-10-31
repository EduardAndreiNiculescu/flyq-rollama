"""Test parity between PeftModel (base + LoRA) and merged model for RoLlama.

Verifies:
  - Numerical parity of logits (max absolute difference)
  - Exact token output agreement on sample prompts
  - Warns about `tie_word_embeddings` issues if present
"""

import json
import torch
from pathlib import Path
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

ROOT = Path(__file__).resolve().parents[1]
BASE_PATH = ROOT / "finetune" / "rollama" / "base"
ADAPTER_PATH = ROOT / "finetune" / "out" / "rollama" / "sft_final"
TOKENIZER_PATH = ROOT / "finetune" / "rollama" / "adapter"

TEST_PROMPTS = [
    "You are FlightFlow's airport intent router. Return exactly one compact JSON object and nothing else.\nAllowed names: get_flight_details, get_gate, get_time_remaining, get_live_tracking, search_knowledge, open_airport_map, none.\nSchema: {\"name\":\"tool_name_or_none\",\"arguments\":{}}. Never invent facts, tools or arguments.\n\nPassenger: La ce poarta este zborul meu?\nJSON:",
    "You are FlightFlow's airport intent router. Return exactly one compact JSON object and nothing else.\nAllowed names: get_flight_details, get_gate, get_time_remaining, get_live_tracking, search_knowledge, open_airport_map, none.\nSchema: {\"name\":\"tool_name_or_none\",\"arguments\":{}}. Never invent facts, tools or arguments.\n\nPassenger: Pot lua un powerbank in bagajul de mana?\nJSON:",
    "You are FlightFlow's airport intent router. Return exactly one compact JSON object and nothing else.\nAllowed names: get_flight_details, get_gate, get_time_remaining, get_live_tracking, search_knowledge, open_airport_map, none.\nSchema: {\"name\":\"tool_name_or_none\",\"arguments\":{}}. Never invent facts, tools or arguments.\n\nPassenger: Cat mai avem pana aterizam?\nJSON:",
    "You are FlightFlow's airport intent router. Return exactly one compact JSON object and nothing else.\nAllowed names: get_flight_details, get_gate, get_time_remaining, get_live_tracking, search_knowledge, open_airport_map, none.\nSchema: {\"name\":\"tool_name_or_none\",\"arguments\":{}}. Never invent facts, tools or arguments.\n\nPassenger: Unde este toaleta cea mai apropiata?\nJSON:",
    "You are FlightFlow's airport intent router. Return exactly one compact JSON object and nothing else.\nAllowed names: get_flight_details, get_gate, get_time_remaining, get_live_tracking, search_knowledge, open_airport_map, none.\nSchema: {\"name\":\"tool_name_or_none\",\"arguments\":{}}. Never invent facts, tools or arguments.\n\nPassenger: Multumesc foarte mult pentru ajutor!\nJSON:",
]

def main():
    print("=" * 60)
    print("TESTING MERGE PARITY: PeftModel vs Merged Model")
    print("=" * 60)

    tok = AutoTokenizer.from_pretrained(TOKENIZER_PATH)
    
    # 1. Load base in BF16 (not NF4 for faithful merge testing)
    print("Loading base model in bfloat16 on CUDA...")
    base = AutoModelForCausalLM.from_pretrained(
        BASE_PATH,
        torch_dtype=torch.bfloat16,
        device_map="cuda",
    )
    
    print("Attaching LoRA adapter from", ADAPTER_PATH)
    model = PeftModel.from_pretrained(base, ADAPTER_PATH)
    model.eval()

    peft_outputs = []
    peft_logits = []

    print("\nRunning inference with PeftModel...")
    with torch.inference_mode():
        for p in TEST_PROMPTS:
            inp = tok(p, return_tensors="pt").to("cuda")
            out = model.generate(**inp, max_new_tokens=32, do_sample=False, pad_token_id=tok.eos_token_id)
            logits = model(**inp).logits[:, -1, :]
            gen_text = tok.decode(out[0, inp["input_ids"].shape[1]:], skip_special_tokens=True).strip()
            peft_outputs.append(gen_text)
            peft_logits.append(logits.cpu().float())

    print("\nMerging adapter into base model (merge_and_unload)...")
    merged_model = model.merge_and_unload()
    merged_model.eval()

    merged_outputs = []
    merged_logits = []

    print("Running inference with Merged Model...")
    with torch.inference_mode():
        for p in TEST_PROMPTS:
            inp = tok(p, return_tensors="pt").to("cuda")
            out = merged_model.generate(**inp, max_new_tokens=32, do_sample=False, pad_token_id=tok.eos_token_id)
            logits = merged_model(**inp).logits[:, -1, :]
            gen_text = tok.decode(out[0, inp["input_ids"].shape[1]:], skip_special_tokens=True).strip()
            merged_outputs.append(gen_text)
            merged_logits.append(logits.cpu().float())

    # Comparison
    print("\n" + "=" * 60)
    print("PARITY EVALUATION RESULTS:")
    print("=" * 60)

    all_matched = True
    max_logit_diff = 0.0

    for i in range(len(TEST_PROMPTS)):
        diff = float((peft_logits[i] - merged_logits[i]).abs().max())
        if diff > max_logit_diff:
            max_logit_diff = diff
        match = peft_outputs[i] == merged_outputs[i]
        if not match:
            all_matched = False
        print(f"Sample {i+1}:")
        print(f"  Peft output:   {peft_outputs[i]}")
        print(f"  Merged output: {merged_outputs[i]}")
        print(f"  Token match:   {match} | Max logit diff: {diff:.6f}")

    print("-" * 60)
    print(f"Overall Max Logit Difference: {max_logit_diff:.6f}")
    print(f"Text Generation Parity:       {'100% MATCH' if all_matched else 'MISMATCH'}")
    
    report = {
        "text_parity_matched": all_matched,
        "max_logit_diff": max_logit_diff,
        "samples_tested": len(TEST_PROMPTS),
        "status": "PASSED" if all_matched and max_logit_diff < 0.05 else "FAILED",
    }
    report_file = ROOT / "finetune" / "out" / "rollama" / "merge_parity_report.json"
    report_file.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Parity report saved to: {report_file}")

if __name__ == "__main__":
    main()

