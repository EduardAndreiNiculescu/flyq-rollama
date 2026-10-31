# Post-training pipeline: Merge LoRA -> Convert GGUF -> Create Ollama model -> Run Evaluation
$ErrorActionPreference = "Stop"
Set-Location '<cale-locala>'

Write-Host "=== STEP 1: MERGING LORA ADAPTER ==="
python finetune/merge_adapter.py --base Qwen/Qwen3-0.6B --adapter finetune/out/06b/adapter_250 --out finetune/out/06b/merged_250

Write-Host "=== STEP 2: CONVERTING MERGED MODEL TO GGUF ==="
python tools/llama.cpp/convert_hf_to_gguf.py finetune/out/06b/merged_250 --outfile finetune/out/06b/flightflow-0.6b-f16.gguf --outtype f16

Write-Host "=== STEP 3: CREATING OLLAMA MODEL ==="
@"
FROM <cale-locala>
TEMPLATE "{{ .Prompt }}"
PARAMETER num_ctx 2048
PARAMETER stop "<|im_end|>"
"@ | Out-File -FilePath "finetune/out/06b/Modelfile.06b_final" -Encoding utf8

ollama create flightflow-0.6b -f finetune/out/06b/Modelfile.06b_final

Write-Host "=== STEP 4: RUNNING HELD-OUT TEST EVALUATION ==="
python -c @"
import json, sys, torch
from transformers import AutoModelForCausalLM, AutoTokenizer
sys.stdout.reconfigure(encoding='utf-8')

tok = AutoTokenizer.from_pretrained('finetune/out/06b/merged_250')
model = AutoModelForCausalLM.from_pretrained('finetune/out/06b/merged_250', torch_dtype=torch.float16, device_map='cuda:0')
model.eval()

with open('finetune/data/06b/test.jsonl', 'r', encoding='utf-8') as f:
    samples = [json.loads(line) for line in f if line.strip()][:25]

correct = 0
for i, s in enumerate(samples):
    prompt, exp = s['prompt'], s['completion'].strip()
    inputs = tok(prompt, return_tensors='pt').to('cuda:0')
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=80, do_sample=False, eos_token_id=tok.encode('<|im_end|>')[0])
    gen = tok.decode(out[0][inputs.input_ids.shape[1]:], skip_special_tokens=False).replace('<|im_end|>', '').strip()
    match = exp.split('(')[0] in gen or gen.split('(')[0] in exp
    if match: correct += 1
    print(f'Test {i+1:02d}: {\"PASS\" if match else \"FAIL\"} | Exp: {exp[:60]} | Gen: {gen[:60]}')

print(f'\nACCURACY ON 25 TEST SAMPLES: {correct}/25 ({correct/25*100:.1f}%)')
"@

Write-Host "=== PIPELINE COMPLETE ==="
