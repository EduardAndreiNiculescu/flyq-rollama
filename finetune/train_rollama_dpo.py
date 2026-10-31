"""Direct Preference Optimization (DPO) Fine-Tuning for RoLlama router (Etapa 4).

Trains on hard preference pairs (chosen vs rejected) to eliminate false executions,
enforce strict tool schema, resolve ambiguous contexts, and prevent flight-number hallucination.

Mathematical formulation:
    L_DPO = -E_{(x, y_w, y_l)} [ log sigma( beta * (log pi(y_w|x)/pi_ref(y_w|x) - log pi(y_l|x)/pi_ref(y_l|x)) ) ]

Optimizations:
    - Precomputes reference log probabilities in inference mode (0 ref forward passes during training).
    - 4-bit NF4 quantized base + trainable LoRA adapter loaded from sft_final.
    - Fits easily in <5 GB VRAM on RTX 4070 (8 GB).
"""

import argparse
import json
import math
import random
import time
from pathlib import Path

# On this Windows setup, datasets must be imported BEFORE torch to avoid runtime aborts
from datasets import Dataset as _Dataset  # noqa: F401
import torch
import torch.nn.functional as F
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, get_cosine_schedule_with_warmup

ROOT = Path(__file__).resolve().parents[1]

parser = argparse.ArgumentParser()
parser.add_argument("--base", default=str(ROOT / "finetune" / "rollama" / "base"))
parser.add_argument("--adapter", default=str(ROOT / "finetune" / "out" / "rollama" / "sft_final"))
parser.add_argument("--tokenizer", default=str(ROOT / "finetune" / "rollama" / "adapter"))
parser.add_argument("--data", default=str(ROOT / "finetune" / "data" / "rollama" / "dpo_train.jsonl"))
parser.add_argument("--out", default=str(ROOT / "finetune" / "out" / "rollama" / "dpo_final"))
parser.add_argument("--steps", type=int, default=80)
parser.add_argument("--lr", type=float, default=1e-6)
parser.add_argument("--beta", type=float, default=0.1)
parser.add_argument("--sft-weight", type=float, default=0.5, help="Auxiliary SFT loss weight on chosen sequence to preserve JSON grammar")
parser.add_argument("--batch-size", type=int, default=1)
parser.add_argument("--accum", type=int, default=8)
parser.add_argument("--max-grad-norm", type=float, default=1.0)
parser.add_argument("--smoke", action="store_true", help="Run 5 steps smoke test")
parser.add_argument("--pilot", action="store_true", help="Run 50 steps pilot test")
args = parser.parse_args()

OUT = Path(args.out)
OUT.mkdir(parents=True, exist_ok=True)
STATUS = OUT / "status.json"

max_steps = 5 if args.smoke else (50 if args.pilot else args.steps)
stage = "smoke" if args.smoke else ("pilot" if args.pilot else "train")

# Set memory limits for Windows CUDA stability
if torch.cuda.is_available():
    torch.cuda.set_per_process_memory_fraction(0.93)
    torch.backends.cuda.matmul.allow_tf32 = True


def compute_sequence_log_probs(model, input_ids: torch.Tensor, attention_mask: torch.Tensor, labels: torch.Tensor) -> torch.Tensor:
    """Computes sum of log probabilities for labeled tokens in sequence."""
    outputs = model(input_ids=input_ids, attention_mask=attention_mask)
    logits = outputs.logits[:, :-1, :].float()  # [B, L-1, V]
    shift_labels = labels[:, 1:]  # [B, L-1]

    loss_mask = shift_labels != -100
    safe_labels = shift_labels.clone()
    safe_labels[~loss_mask] = 0

    log_probs = torch.log_softmax(logits, dim=-1)
    per_token_log_probs = log_probs.gather(dim=-1, index=safe_labels.unsqueeze(-1)).squeeze(-1)

    return (per_token_log_probs * loss_mask).sum(dim=-1)


def build_item(tokenizer, prompt: str, completion: str, max_length: int = 512):
    p_ids = tokenizer(prompt, add_special_tokens=True)["input_ids"]
    c_ids = tokenizer(completion + tokenizer.eos_token, add_special_tokens=False)["input_ids"]
    full_ids = p_ids + c_ids
    if len(full_ids) > max_length:
        full_ids = full_ids[:max_length]
        p_len = min(len(p_ids), max_length)
        labels = [-100] * p_len + full_ids[p_len:]
    else:
        labels = [-100] * len(p_ids) + c_ids
    return full_ids, labels


def main():
    print("=" * 60)
    print(f"STARTING RO-LLAMA DPO TRAINING: {stage} mode ({max_steps} steps)")
    print(f"Adapter source: {args.adapter}")
    print(f"Destination:    {args.out}")
    print(f"LR: {args.lr} | Beta: {args.beta} | Accum: {args.accum}")
    print("=" * 60)

    # 1. Load tokenizer and dataset
    tok = AutoTokenizer.from_pretrained(args.tokenizer)
    if tok.pad_token_id is None:
        tok.pad_token = tok.eos_token

    data_path = Path(args.data)
    with data_path.open(encoding="utf-8") as f:
        pairs = [json.loads(line) for line in f if line.strip()]

    print(f"Loaded {len(pairs)} preference pairs from {data_path.name}")

    # 2. Load model in 4-bit NF4
    qconf = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
    )
    print("Loading base model in 4-bit NF4...")
    base = AutoModelForCausalLM.from_pretrained(args.base, quantization_config=qconf, device_map="cuda")
    base.config.use_cache = False

    print("Attaching LoRA adapter...")
    model = PeftModel.from_pretrained(base, args.adapter, is_trainable=True)
    model.eval()

    # 3. Precompute reference log probabilities on starting adapter (exact reference)
    print("\nPrecomputing reference log probabilities on reference policy (sft_final)...")
    start_precompute = time.time()
    ref_chosen_list = []
    ref_rejected_list = []

    with torch.inference_mode():
        for i, pair in enumerate(pairs):
            c_ids, c_labels = build_item(tok, pair["prompt"], pair["chosen"])
            r_ids, r_labels = build_item(tok, pair["prompt"], pair["rejected"])

            c_inp = torch.tensor([c_ids], device="cuda")
            c_mask = torch.ones_like(c_inp)
            c_lab = torch.tensor([c_labels], device="cuda")

            r_inp = torch.tensor([r_ids], device="cuda")
            r_mask = torch.ones_like(r_inp)
            r_lab = torch.tensor([r_labels], device="cuda")

            c_logp = compute_sequence_log_probs(model, c_inp, c_mask, c_lab).item()
            r_logp = compute_sequence_log_probs(model, r_inp, r_mask, r_lab).item()

            ref_chosen_list.append(c_logp)
            ref_rejected_list.append(r_logp)

            if (i + 1) % 100 == 0 or (i + 1) == len(pairs):
                print(f"  Processed {i+1}/{len(pairs)} reference samples ({time.time() - start_precompute:.1f}s)")

    ref_chosen_tensor = torch.tensor(ref_chosen_list, dtype=torch.float32)
    ref_rejected_tensor = torch.tensor(ref_rejected_list, dtype=torch.float32)
    print(f"Precomputation complete in {time.time() - start_precompute:.1f}s.\n")

    # 4. Prepare for training
    # Crucial stability fix: Freeze modules_to_save (embed_tokens and lm_head)
    # This prevents unlikelihood DPO gradients from corrupting token vocabulary representations
    frozen_count = 0
    for name, param in model.named_parameters():
        if "modules_to_save" in name:
            param.requires_grad = False
            frozen_count += 1
    print(f"Frozen {frozen_count} modules_to_save tensors to protect vocabulary tokens.")

    model.train()
    model.enable_input_require_grads()
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})

    trainable_params = [p for p in model.parameters() if p.requires_grad]
    print(f"Trainable parameters: {sum(p.numel() for p in trainable_params):,}")

    try:
        from bitsandbytes.optim import PagedAdamW8bit
        optimizer = PagedAdamW8bit(trainable_params, lr=args.lr, weight_decay=0.01)
        print("Using bitsandbytes PagedAdamW8bit optimizer.")
    except Exception:
        optimizer = torch.optim.AdamW(trainable_params, lr=args.lr, weight_decay=0.01)
        print("Using standard PyTorch AdamW optimizer.")

    warmup_steps = min(15, max(2, int(max_steps * 0.1)))
    scheduler = get_cosine_schedule_with_warmup(optimizer, num_warmup_steps=warmup_steps, num_training_steps=max_steps)

    # 5. Training loop
    started_time = time.time()
    indices = list(range(len(pairs)))
    rng = random.Random(20261031)

    print(f"Beginning DPO training for {max_steps} steps...")
    global_step = 0
    micro_idx = 0
    rng.shuffle(indices)

    STATUS.write_text(json.dumps({
        "stage": stage,
        "state": "running",
        "step": 0,
        "maxSteps": max_steps,
        "loss": None,
        "reward_margin": None,
        "accuracy": None,
        "vramGb": round(torch.cuda.max_memory_allocated() / 1e9, 3) if torch.cuda.is_available() else 0,
        "elapsedSec": 0.0,
    }, indent=2), encoding="utf-8")

    running_loss = 0.0
    running_margin = 0.0
    running_acc = 0.0

    while global_step < max_steps:
        optimizer.zero_grad()
        step_loss = 0.0
        step_margin = 0.0
        step_acc = 0.0

        for _ in range(args.accum):
            idx = indices[micro_idx]
            micro_idx += 1
            if micro_idx >= len(indices):
                micro_idx = 0
                rng.shuffle(indices)

            pair = pairs[idx]
            c_ids, c_labels = build_item(tok, pair["prompt"], pair["chosen"])
            r_ids, r_labels = build_item(tok, pair["prompt"], pair["rejected"])

            c_inp = torch.tensor([c_ids], device="cuda")
            c_mask = torch.ones_like(c_inp)
            c_lab = torch.tensor([c_labels], device="cuda")

            r_inp = torch.tensor([r_ids], device="cuda")
            r_mask = torch.ones_like(r_inp)
            r_lab = torch.tensor([r_labels], device="cuda")

            pi_c_logp = compute_sequence_log_probs(model, c_inp, c_mask, c_lab)
            pi_r_logp = compute_sequence_log_probs(model, r_inp, r_mask, r_lab)

            ref_c_logp = ref_chosen_tensor[idx].to("cuda")
            ref_r_logp = ref_rejected_tensor[idx].to("cuda")

            pi_ratio = pi_c_logp - pi_r_logp
            ref_ratio = ref_c_logp - ref_r_logp

            dpo_logits = args.beta * (pi_ratio - ref_ratio)
            dpo_loss = -F.logsigmoid(dpo_logits).mean()

            # Auxiliary SFT loss anchor on chosen sequence to preserve JSON schema and prevent token collapse
            num_chosen_tokens = (c_lab[:, 1:] != -100).sum().clamp(min=1)
            sft_loss = -pi_c_logp / num_chosen_tokens
            total_loss = dpo_loss + args.sft_weight * sft_loss.mean()

            # Scaled for accumulation
            loss_scaled = total_loss / args.accum
            loss_scaled.backward()

            step_loss += total_loss.item() / args.accum
            step_margin += dpo_logits.item() / args.accum
            step_acc += (1.0 if dpo_logits.item() > 0 else 0.0) / args.accum

        torch.nn.utils.clip_grad_norm_(trainable_params, args.max_grad_norm)
        optimizer.step()
        scheduler.step()

        global_step += 1
        running_loss = step_loss
        running_margin = step_margin
        running_acc = step_acc

        vram = round(torch.cuda.max_memory_allocated() / 1e9, 3) if torch.cuda.is_available() else 0
        elapsed = round(time.time() - started_time, 1)

        if global_step % 5 == 0 or global_step == max_steps:
            print(f"Step {global_step:3d}/{max_steps} | Loss: {running_loss:.4f} | Margin: {running_margin:+.4f} | Acc: {running_acc * 100:.1f}% | VRAM: {vram:.2f}GB | Elapsed: {elapsed}s")

            STATUS.write_text(json.dumps({
                "stage": stage,
                "state": "running",
                "step": global_step,
                "maxSteps": max_steps,
                "loss": round(running_loss, 4),
                "reward_margin": round(running_margin, 4),
                "accuracy": round(running_acc, 3),
                "vramGb": vram,
                "elapsedSec": elapsed,
            }, indent=2), encoding="utf-8")

    # 6. Save final checkpoint
    print("\nSaving DPO fine-tuned adapter...")
    model.save_pretrained(str(OUT))
    tok.save_pretrained(str(OUT))

    STATUS.write_text(json.dumps({
        "stage": stage,
        "state": "passed",
        "step": max_steps,
        "maxSteps": max_steps,
        "loss": round(running_loss, 4),
        "reward_margin": round(running_margin, 4),
        "accuracy": round(running_acc, 3),
        "vramGb": round(torch.cuda.max_memory_allocated() / 1e9, 3) if torch.cuda.is_available() else 0,
        "elapsedSec": round(time.time() - started_time, 1),
    }, indent=2), encoding="utf-8")

    print(f"RoLlama DPO training complete! Checkpoint saved to: {OUT}")


if __name__ == "__main__":
    main()
