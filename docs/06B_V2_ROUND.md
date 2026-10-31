# FlyQ Qwen3-0.6B router — round V2

Date: 2026-10-30

## Changes

- Removed all `<think>` and tool XML wrappers from prompts and completions.
- Replaced conversational completions with one compact JSON decision.
- Added the `none` decision for greetings, injections, gibberish and unsupported requests.
- Replaced the inherited assistant prompt with a compact intent-router contract.
- Balanced all seven labels to 1,600 training rows each (11,200 total).
- Added strict JSON, label, language and thinking-leak evaluation.
- Added padded multi-sample completion-only training and retained only completion logits to fit the RTX 4070 Laptop 8 GB.

## Training

- Base: `Qwen/Qwen3-0.6B`
- QLoRA rank: 16
- Batch: 4, gradient accumulation: 2 (effective batch 8)
- Context: 640 tokens
- Learning rate: 1e-4, cosine schedule
- Epochs: 1 (1,400 optimizer steps)
- Runtime: 15m55s
- Train loss: 0.06686
- Final validation loss: 0.1013
- No OOM or NaN in the accepted run

The final adapter is intentionally unversioned under `finetune/out/06b_v2/adapter_full`.

## Strict held-out result

Evaluated on all 147 rows from `finetune/data/06b_v2/test.jsonl`, with greedy generation:

- Tool accuracy: **128/147 = 87.07%**
- Exact decision accuracy: **82.31%**
- JSON validity: **99.32%**
- Thinking leaks: **0**
- English: **69/75 = 92.00%**
- Romanian: **59/72 = 81.94%**
- Errors: 18 wrong labels, 1 unknown tool

The candidate does not meet the 90% standalone acceptance threshold and must not be shipped or converted into the PocketPal release GGUF. Raw results are stored locally in `finetune/out/06b_v2/eval-full.json`.

Most remaining errors are in chain/multi-intent, Romanian flight status, Romanian tracking, absent knowledge and out-of-scope cases. The next recommended candidate is the dedicated 7-label intent classifier; Qwen V2 remains a measured baseline.
