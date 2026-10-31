# V4 training run (QLoRA r=16 on the V4 data). Uses the whole GPU: nothing else may hold VRAM (Ollama has no model loaded, test gateways are stopped).
#   powershell -File finetune\train_v4.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:PYTORCH_CUDA_ALLOC_CONF = 'max_split_size_mb:256'
New-Item -ItemType Directory -Force finetune\out | Out-Null
"START $(Get-Date -Format s)" | Out-File finetune\out\train_v4.log -Encoding utf8
python finetune/train_qlora.py --out finetune/out/adapter_v4 --train finetune/data/v4/train.jsonl --val finetune/data/v4/val.jsonl `
  --max-length 2048 --bs 1 --accum 8 --ckpt --epochs 1 --lr 1e-4 --r 16 --val-n 30 --eval-steps 25 2>&1 | Out-File finetune\out\train_v4.log -Append -Encoding utf8
"END $(Get-Date -Format s) exit=$LASTEXITCODE" | Out-File finetune\out\train_v4.log -Append -Encoding utf8
