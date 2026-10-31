"""Small local-only RoST 1B quality probe for the FlightFlow hackathon.

This is deliberately not a tool-selection score: RoST has not been trained on
the FlightFlow contract.  It records Romanian surface quality, instruction
following and repetition behaviour before we decide whether an SFT is worth it.
"""

import json
import sys
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "finetune" / "rost" / "hf"
OUT = ROOT / "finetune" / "out" / "rost-1b-smoke.json"

CASES = [
    ("romanian", "Răspunde natural, într-o singură propoziție: Ce pot face dacă mi-am pierdut bagajul?"),
    ("diacritics", "Scrie corect cu diacritice: Am ajuns la aeroport si caut poarta de imbarcare."),
    ("airport-rule", "Pot lua un powerbank în bagajul de mână? Răspunde concis și prudent."),
    ("structured", "Răspunde DOAR cu JSON valid, fără explicații: {\"tool\": \"get_gate\", \"args\": {}}"),
    ("anti-hallucination", "Nu știi date despre zborul meu. Spune sincer, într-o propoziție, ce informație îți lipsește ca să găsești poarta."),
]


def repeats(text: str) -> int:
    words = text.lower().split()
    grams = [" ".join(words[i:i + 6]) for i in range(max(0, len(words) - 5))]
    return max((grams.count(g) for g in set(grams)), default=0)


def main() -> None:
    # Windows PowerShell may still default to cp1252; the probe contains Romanian.
    sys.stdout.reconfigure(encoding="utf-8")
    tokenizer = AutoTokenizer.from_pretrained(MODEL, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL, trust_remote_code=True, torch_dtype=torch.bfloat16,
    ).to("cuda").eval()
    rows = []
    for name, prompt in CASES:
        messages = [{"role": "user", "content": prompt}]
        inputs = tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, return_tensors="pt", return_dict=True,
        ).to("cuda")
        torch.cuda.synchronize()
        started = time.perf_counter()
        with torch.inference_mode():
            output = model.generate(
                **inputs, max_new_tokens=128, do_sample=True, temperature=0.6,
                repetition_penalty=1.1, pad_token_id=tokenizer.eos_token_id,
            )
        torch.cuda.synchronize()
        elapsed = time.perf_counter() - started
        generated = output[0, inputs["input_ids"].shape[1]:]
        text = tokenizer.decode(generated, skip_special_tokens=True).strip()
        rows.append({
            "case": name, "prompt": prompt, "answer": text,
            "tokens": int(generated.shape[0]),
            "seconds": round(elapsed, 3),
            "tokensPerSecond": round(generated.shape[0] / elapsed, 2),
            "maxRepeated6Gram": repeats(text),
        })
        print(f"[{name}] {rows[-1]['tokensPerSecond']} tok/s\n{text}\n")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"model": str(MODEL), "device": torch.cuda.get_device_name(), "rows": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved: {OUT}")


if __name__ == "__main__":
    main()
