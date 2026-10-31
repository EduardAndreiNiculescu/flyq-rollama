#!/usr/bin/env bash
# V4 pipeline after training: LoRA -> GGUF -> Ollama -> ALL benchmarks, V4 against v3 on the same questions. Logs to finetune/out/pipeline_v4.log.
#   bash finetune/pipeline_v4.sh            (needs the GPU free: training finished, no other model loaded)
# Benchmarks run: fresh-seed laptop benches (seeds 31-35, 100 questions, phone sampling T0.7 / penalty 1.5, ctx 2048), held-out tool cases (eval/tool-cases-v4.json),
# multi-turn cases, rotation over real flights, qs51 regression. The phone benchmark (scripts/device.ts bench) is run afterwards on the device.
set -u
cd "$(dirname "$0")/.."
LOG=finetune/out/pipeline_v4.log
ADAPTER=finetune/out/adapter_v4
TAG=ff-adapter-v4
B=http://127.0.0.1:11435
export OLLAMA_HOST=127.0.0.1:11435
mkdir -p finetune/out eval/results
exec > >(tee -a "$LOG") 2>&1
step() { echo; echo "=== $(date +%H:%M:%S) $* ==="; }

step "1/7 LoRA -> GGUF"
BASE=$(ls -d ~/.cache/huggingface/hub/models--Qwen--Qwen3-4B/snapshots/* | head -1)
python tools/llama.cpp/convert_lora_to_gguf.py --base "$BASE" --outfile tools/gguf/$TAG-f16.gguf --outtype f16 "$ADAPTER" || { echo "CONVERT FAILED"; exit 1; }

step "2/7 ollama create $TAG (context 2048, the phone's)"
sed "s#ff-adapter-v3-f16.gguf#$TAG-f16.gguf#; s#QLoRA v3 (tool-mode)#QLoRA v4 (static contract)#; s#num_ctx 4096#num_ctx 2048#" tools/gguf/Modelfile.adapter_v3 > tools/gguf/Modelfile.adapter_v4
(cd tools/gguf && ollama create $TAG -f Modelfile.adapter_v4) || { echo "OLLAMA CREATE FAILED"; exit 1; }

KEY=$(grep -oE '[A-Za-z0-9-]{32,}' docs/BACKEND_HANDOFF_PRIVATE.md | head -1)
TOKEN=pipeline-token
start_gateway() { # port model contract
  AIRLABS_API_KEY=$KEY AIRLABS_MAX_CALLS=80 GATEWAY_HOST=127.0.0.1 GATEWAY_PORT=$1 GATEWAY_TOKEN=$TOKEN GATEWAY_GUARD=0 OLLAMA_MODEL=$2 FF_CONTRACT=$3 \
    OLLAMA_NUM_CTX=2048 OLLAMA_TEMP=0.7 OLLAMA_PRESENCE=1.5 npx tsx server/gateway/main.ts >/dev/null 2>&1 &
  echo $! > finetune/out/gw_$1.pid
  for i in $(seq 1 30); do curl -s http://127.0.0.1:$1/health >/dev/null 2>&1 && return 0; sleep 1; done
  echo "gateway $1 did not start"; return 1
}
stop_gateway() { kill "$(cat finetune/out/gw_$1.pid)" 2>/dev/null; }

step "3/7 laptop benches, seeds 31-35: v3 (old prompt) and V4 (static prompt), the same questions"
start_gateway 18101 ff-adapter-v3 v3 || exit 1
start_gateway 18102 $TAG v4 || exit 1
for S in 31 32 33 34 35; do
  GATEWAY_TOKEN=$TOKEN GATEWAY_URL=http://127.0.0.1:18101 npx tsx scripts/laptop-bench.ts --n 100 --seed $S --label v3-fresh$S
  GATEWAY_TOKEN=$TOKEN GATEWAY_URL=http://127.0.0.1:18102 npx tsx scripts/laptop-bench.ts --n 100 --seed $S --label v4-fresh$S
done

step "4/7 paired comparison v3 vs V4 (500 questions)"
A=$(ls eval/results/v3-fresh3*-bench-*.json | tr '\n' ' '); Bf=$(ls eval/results/v4-fresh3*-bench-*.json | tr '\n' ' ')
npx tsx scripts/compare-bench.ts --a $A --b $Bf
echo "--- V4 alone:"; npx tsx scripts/analyze-bench.ts $Bf
echo "--- v3 alone:"; npx tsx scripts/analyze-bench.ts $A

step "5/7 rotation over real flights, V4"
GATEWAY_TOKEN=$TOKEN GATEWAY_URL=http://127.0.0.1:18102 npx tsx scripts/flight-rotation.ts ABB864 CPA253 QTR037 KL1960 CX253 QR37 --aliases CPA253=CX253,QTR037=QR37 || echo "rotation failed"
stop_gateway 18101; stop_gateway 18102

step "6/7 held-out tool cases (64) and multi-turn (12): v3 under its prompt, V4 under the static prompt"
FF_CONTRACT=v3 npx tsx eval/run-tools.ts --models ff-adapter-v3 --base $B || echo "tools v3 failed"
FF_CONTRACT=v4 npx tsx eval/run-tools.ts --models $TAG --base $B || echo "tools v4 failed"
FF_CONTRACT=v3 FF_BACKEND=ollama-raw npx tsx eval/run-multi.ts --models ff-adapter-v3 --base $B || echo "multi v3 failed"
FF_CONTRACT=v4 FF_BACKEND=ollama-raw npx tsx eval/run-multi.ts --models $TAG --base $B || echo "multi v4 failed"

step "7/7 qs51 regression (answers without tools; informational: V4 does not train this mode)"
FF_BACKEND=ollama-raw npx tsx eval/run-compare.ts --models ff-base,$TAG --sets qs51 --base $B || echo "qs51 failed"

echo; echo "PIPELINE V4 DONE $(date +%H:%M:%S)"
