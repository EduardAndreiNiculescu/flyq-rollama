"""Local smoke probe for the official RoLlama 3.2 1B base + Romanian adapter.

RoLlama is a continual-pretraining adapter, not an instruction model.  These
prompts therefore measure Romanian continuation quality only; they must not be
reported as FlightFlow tool-calling accuracy.
"""

import json
import sys
import time
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "finetune" / "rollama" / "base"
ADAPTER = ROOT / "finetune" / "rollama" / "adapter"
OUT = ROOT / "finetune" / "out" / "rollama-1b-smoke.json"

CASES = [
    ("airport", "Pasagerul a ajuns la aeroport și caută poarta de îmbarcare. Răspuns:"),
    ("powerbank", "Un powerbank trebuie păstrat în bagajul de mână, deoarece"),
    ("lost-bag", "Dacă bagajul nu apare pe bandă, pasagerul ar trebui să"),
    ("diacritics", "Înainte de plecare, verifică poarta, ora de îmbarcare și"),
    ("english", "A passenger whose flight is delayed should first"),
]


def repeats(text: str) -> int:
    words = text.lower().split()
    grams = [" ".join(words[i:i + 6]) for i in range(max(0, len(words) - 5))]
    return max((grams.count(g) for g in set(grams)), default=0)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    qconf = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16)
    tok = AutoTokenizer.from_pretrained(ADAPTER)
    base = AutoModelForCausalLM.from_pretrained(BASE, quantization_config=qconf, device_map="cuda")
    model = PeftModel.from_pretrained(base, ADAPTER).eval()
    rows = []
    for name, prompt in CASES:
        inputs = tok(prompt, return_tensors="pt").to("cuda")
        torch.cuda.synchronize()
        started = time.perf_counter()
        with torch.inference_mode():
            output = model.generate(**inputs, max_new_tokens=96, do_sample=True, temperature=0.6, repetition_penalty=1.1, pad_token_id=tok.eos_token_id)
        torch.cuda.synchronize()
        seconds = time.perf_counter() - started
        generated = output[0, inputs["input_ids"].shape[1]:]
        answer = tok.decode(generated, skip_special_tokens=True).strip()
        row = {"case": name, "prompt": prompt, "answer": answer, "tokens": int(generated.shape[0]), "seconds": round(seconds, 3), "tokensPerSecond": round(generated.shape[0] / seconds, 2), "maxRepeated6Gram": repeats(answer)}
        rows.append(row)
        print(f"[{name}] {row['tokensPerSecond']} tok/s\\n{answer}\\n")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"base": str(BASE), "adapter": str(ADAPTER), "device": torch.cuda.get_device_name(), "rows": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved: {OUT}")


if __name__ == "__main__":
    main()
