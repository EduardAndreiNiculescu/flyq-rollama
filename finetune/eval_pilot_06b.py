import json
import sys
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def main():
    base_name = "Qwen/Qwen3-0.6B"
    adapter_path = "finetune/out/06b/adapter_pilot"
    
    print("Loading base and pilot adapter...")
    tok = AutoTokenizer.from_pretrained(base_name)
    model = AutoModelForCausalLM.from_pretrained(
        base_name,
        torch_dtype=torch.bfloat16,
        device_map="cuda:0"
    )
    model = PeftModel.from_pretrained(model, adapter_path)
    model.eval()
    
    # Load test cases
    test_file = "finetune/data/06b/test.jsonl"
    samples = []
    with open(test_file, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                samples.append(json.loads(line))
                if len(samples) >= 15:
                    break

    print(f"Testing {len(samples)} held-out samples...")
    correct_tools = 0
    total = len(samples)
    
    for i, s in enumerate(samples):
        prompt = s["prompt"]
        expected = s["completion"].strip()
        
        inputs = tok(prompt, return_tensors="pt").to("cuda:0")
        with torch.no_grad():
            out = model.generate(
                **inputs,
                max_new_tokens=100,
                do_sample=False,
                pad_token_id=tok.eos_token_id,
                eos_token_id=tok.encode("<|im_end|>")[0]
            )
        gen = tok.decode(out[0][inputs.input_ids.shape[1]:], skip_special_tokens=False)
        gen_clean = gen.replace("<|im_end|>", "").strip()
        
        # Check tool call
        is_tool = "<tool_call>" in gen_clean or "<tool_call>" in expected
        print(f"\n--- CASE {i+1} ---")
        user_line = [line for line in prompt.split("\n") if "user" in line]
        print(f"USER: {user_line[-1] if user_line else prompt[-100:]}")
        print(f"EXPECTED: {expected[:120]}")
        print(f"GENERATED: {gen_clean[:120]}")
        
        if expected.split("(")[0] in gen_clean:
            correct_tools += 1
            print("STATUS: MATCH")
        else:
            print("STATUS: MISMATCH / PARTIAL")
            
    print(f"\nPILOT ACCURACY ON SAMPLE: {correct_tools}/{total} ({correct_tools/total*100:.1f}%)")

if __name__ == "__main__":
    main()
