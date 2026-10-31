import argparse
import sys
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def main():
    p = argparse.ArgumentParser(description="Merge LoRA adapter into base model")
    p.add_argument("--base", default="Qwen/Qwen3-0.6B", help="Base model identifier")
    p.add_argument("--adapter", required=True, help="Path to LoRA adapter directory")
    p.add_argument("--out", required=True, help="Destination directory for merged model")
    args = p.parse_args()

    print(f"Loading base model: {args.base} (float16)...")
    tok = AutoTokenizer.from_pretrained(args.base)
    base_model = AutoModelForCausalLM.from_pretrained(
        args.base,
        torch_dtype=torch.float16,
        device_map="auto"
    )

    print(f"Loading adapter: {args.adapter}...")
    peft_model = PeftModel.from_pretrained(base_model, args.adapter)

    print("Merging weights...")
    merged_model = peft_model.merge_and_unload()

    print(f"Saving merged model and tokenizer to: {args.out}...")
    merged_model.save_pretrained(args.out, safe_serialization=True)
    tok.save_pretrained(args.out)
    print("Merge complete!")

if __name__ == "__main__":
    main()

