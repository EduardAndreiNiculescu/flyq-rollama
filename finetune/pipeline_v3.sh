#!/usr/bin/env bash
# Round-2 pipeline: train (optional) -> LoRA to GGUF -> ollama create -> evals -> report. Every step logs to finetune/out/pipeline_v3.log.
#   bash finetune/pipeline_v3.sh [--skip-train]
# Needs: GPU free (no Ollama model loaded), tools/llama.cpp, tools/gguf/Modelfile.base (ff-base already created).
set -u
cd "$(dirname "$0")/.."
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256
LOG=finetune/out/pipeline_v3.log
ADAPTER=finetune/out/adapter_v3
TAG=ff-adapter-v3
mkdir -p finetune/out
exec > >(tee -a "$LOG") 2>&1
step() { echo; echo "=== $(date +%H:%M:%S) $* ==="; }

if [ "${1:-}" != "--skip-train" ]; then
  step "1/6 train (QLoRA on tool-mode data v3)"
  python finetune/train_qlora.py --out "$ADAPTER" --train finetune/data/v3/train.jsonl --val finetune/data/v3/val.jsonl \
    --max-length 2400 --bs 1 --accum 8 --ckpt --epochs 1 --lr 1e-4 --val-n 30 --eval-steps 25 || { echo "TRAIN FAILED"; exit 1; }
fi

step "2/6 LoRA -> GGUF"
BASE=$(ls -d ~/.cache/huggingface/hub/models--Qwen--Qwen3-4B/snapshots/* | head -1)
python tools/llama.cpp/convert_lora_to_gguf.py --base "$BASE" --outfile tools/gguf/$TAG-f16.gguf --outtype f16 "$ADAPTER" || { echo "CONVERT FAILED"; exit 1; }

step "3/6 ollama create $TAG"
sed "s#ff-adapter-v2-f16.gguf#$TAG-f16.gguf#; s#QLoRA v2#QLoRA v3 (tool-mode)#" tools/gguf/Modelfile.adapter > tools/gguf/Modelfile.adapter_v3
(cd tools/gguf && OLLAMA_HOST=127.0.0.1:11435 ollama create $TAG -f Modelfile.adapter_v3) || { echo "OLLAMA CREATE FAILED"; exit 1; }

export FF_BACKEND=ollama-raw
B=http://127.0.0.1:11435
M=ff-base,$TAG

step "4/6 tool-calling eval (50 cases): $M"
npx tsx eval/run-tools.ts --models $M --base $B || echo "tools eval failed"

step "5/6 qs51 regression (answer quality without tools): $M"
npx tsx eval/run-compare.ts --models $M --sets qs51 --base $B || echo "qs51 failed"

step "6/6 report"
python eval/make_report.py || echo "report failed"
echo; echo "PIPELINE DONE $(date +%H:%M:%S)"
