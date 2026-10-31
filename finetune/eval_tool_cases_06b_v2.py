"""Evaluate the 0.6B adapter on the independent app tool benchmark."""
import argparse, json, time
from pathlib import Path
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer
from finetune.eval_router_06b_v2 import parse_decision


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="Qwen/Qwen3-0.6B")
    p.add_argument("--adapter", required=True)
    p.add_argument("--cases", default="../flightflow-codex/eval/tool-cases-v4.json")
    p.add_argument("--out", default="finetune/out/06b_v2/eval-tool-cases-hard.json")
    p.add_argument("--batch-size", type=int, default=8)
    a = p.parse_args()
    cases = json.loads(Path(a.cases).read_text(encoding="utf-8"))
    sample = json.loads(Path("finetune/data/06b_v2/test.jsonl").read_text(encoding="utf-8").splitlines()[0])
    system = sample["prompt"].split("<|im_end|>\n<|im_start|>user", 1)[0] + "<|im_end|>"
    prompts = [system + f"\n<|im_start|>user\n{c['question']}<|im_end|>\n<|im_start|>assistant\n" for c in cases]
    tok = AutoTokenizer.from_pretrained(a.base); tok.padding_side = "left"
    if tok.pad_token_id is None: tok.pad_token = tok.eos_token
    model = AutoModelForCausalLM.from_pretrained(a.base, torch_dtype=torch.bfloat16, device_map="cuda:0")
    model = PeftModel.from_pretrained(model, a.adapter); model.eval()
    details=[]; started=time.perf_counter()
    for offset in range(0, len(cases), a.batch_size):
        batch=prompts[offset:offset+a.batch_size]
        enc=tok(batch, return_tensors="pt", padding=True, add_special_tokens=False).to("cuda:0")
        with torch.inference_mode():
            gen=model.generate(**enc,max_new_tokens=64,do_sample=False,pad_token_id=tok.pad_token_id,
                               eos_token_id=tok.encode("<|im_end|>",add_special_tokens=False)[0])
        raw=tok.batch_decode(gen[:,enc.input_ids.shape[1]:],skip_special_tokens=True)
        for c, text in zip(cases[offset:offset+a.batch_size],raw):
            parsed,error=parse_decision(text); name=parsed["name"] if parsed else "invalid"
            passed=(name == "none" if not c["expectedAny"] else name in c["expectedAny"]) and name not in c["forbidden"]
            false_exec=bool(not c["expectedAny"] and name != "none") or name in c["forbidden"]
            details.append({**c,"generated":text,"parsed":parsed,"error":error,"pass":passed,"falseExecution":false_exec})
    summary={"total":len(details),"passed":sum(d["pass"] for d in details),
             "accuracy":sum(d["pass"] for d in details)/len(details),
             "false_executions":sum(d["falseExecution"] for d in details),
             "json_valid":sum(d["parsed"] is not None for d in details)/len(details),
             "elapsed_seconds":round(time.perf_counter()-started,3)}
    out=Path(a.out);out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps({"summary":summary,"details":details},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(summary,indent=2))

if __name__ == "__main__": main()
