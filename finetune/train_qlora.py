"""QLoRA fine-tune of Qwen3-4B / Qwen3-0.6B with live status contract for Codex 06b:lab.

Hardware: RTX 4070 Laptop 8 GB. Keep max_length<=2048, batch 1. Close Ollama first (it holds VRAM).

    python finetune/train_qlora.py --base Qwen/Qwen3-0.6B --train finetune/data/06b/train.jsonl --val finetune/data/06b/val.jsonl --out finetune/out/06b/adapter_smoke --smoke
"""
import argparse
import json
import random
import time
from pathlib import Path

from datasets import load_dataset  # must be imported BEFORE torch: the reverse order segfaults on this Windows setup

import torch

# 8 GB card on Windows: past the VRAM limit the driver silently pages to system RAM and steps become ~10x slower.
# Cap the allocator below the card size so it frees cached blocks instead.
if torch.cuda.is_available():
    torch.cuda.set_per_process_memory_fraction(0.93)
    torch.backends.cuda.matmul.allow_tf32 = True
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainerCallback
from trl import SFTConfig, SFTTrainer

try:
    from status_06b import update_status
except ImportError:
    try:
        from finetune.status_06b import update_status
    except ImportError:
        update_status = None

p = argparse.ArgumentParser()
p.add_argument("--base", default="Qwen/Qwen3-4B")
p.add_argument("--train", default="finetune/data/v2/train.jsonl")
p.add_argument("--val", default="finetune/data/v2/val.jsonl")
p.add_argument("--out", required=True)
p.add_argument("--stage", default=None, help="LabStage for status contract: smoke|train")
p.add_argument("--epochs", type=float, default=2)
p.add_argument("--lr", type=float, default=5e-5)
p.add_argument("--r", type=int, default=8)
p.add_argument("--bs", type=int, default=4)
p.add_argument("--accum", type=int, default=2)
p.add_argument("--max-length", type=int, default=1536)
p.add_argument("--ckpt", action="store_true", help="enable gradient checkpointing (less VRAM, slower)")
p.add_argument("--val-n", type=int, default=120, help="validation subset size (keeps periodic eval fast)")
p.add_argument("--eval-steps", type=int, default=10, help="evaluate/save every N optimizer steps")
p.add_argument("--smoke", action="store_true", help="5 steps only, to verify the pipeline fits in VRAM")
p.add_argument("--pilot", action="store_true", help="50 steps pilot run to verify loss convergence and gates")
p.add_argument("--max-steps", type=int, default=-1, help="custom max steps")
a = p.parse_args()

STAGE = a.stage or ("smoke" if a.smoke else "train")
OUT = Path(a.out)
OUT.mkdir(parents=True, exist_ok=True)
STATUS = OUT.parent / "status.json"


class Live(TrainerCallback):
    def __init__(self):
        self.t0 = time.time()
        self.s = {"state": "pornire", "step": 0, "max_steps": 0, "train_curve": [], "eval_curve": [], "log": []}

    def dump(self):
        self.s["elapsed"] = time.time() - self.t0
        vram_gb = 0.0
        if torch.cuda.is_available():
            vram_gb = torch.cuda.max_memory_allocated() / 1e9
            self.s["vram_gb"] = vram_gb
        STATUS.write_text(json.dumps(self.s), encoding="utf-8")

        if update_status is not None:
            state_val = "running"
            if self.s.get("state") == "finalizat":
                state_val = "passed"
            elif self.s.get("state") == "eroare":
                state_val = "failed"
            metrics = {
                "loss": round(float(self.s.get("loss", 0.0)), 4) if "loss" in self.s else None,
                "vram_gb": round(vram_gb, 2),
                "step": self.s.get("step", 0),
            }
            if "lr" in self.s and self.s["lr"] is not None:
                metrics["lr"] = round(float(self.s["lr"]), 7)
            if "eval_loss" in self.s and self.s["eval_loss"] is not None:
                metrics["eval_loss"] = round(float(self.s["eval_loss"]), 4)
            msg = f"{STAGE.upper()} step {self.s.get('step', 0)}/{self.s.get('max_steps', 0)}"
            if "loss" in self.s:
                msg += f" loss={metrics['loss']}"
            if vram_gb:
                msg += f" vram={metrics['vram_gb']}GB"

            update_status(
                stage=STAGE,
                state=state_val,
                current=self.s.get("step", 0),
                total=self.s.get("max_steps", 0),
                message=msg,
                metrics=metrics,
            )

    def on_step_end(self, args, state, control, **kw):
        torch.cuda.empty_cache()

    def on_train_begin(self, args, state, control, **kw):
        self.s.update(state="antrenare", max_steps=state.max_steps)
        self.dump()

    def on_log(self, args, state, control, logs=None, **kw):
        logs = logs or {}
        s = self.s
        s.update(step=state.global_step, epoch=state.epoch, max_steps=state.max_steps)
        if "loss" in logs:
            s["loss"], s["lr"] = logs["loss"], logs.get("learning_rate")
            s["train_curve"].append([state.global_step, logs["loss"]])
        if "eval_loss" in logs:
            s["eval_loss"] = logs["eval_loss"]
            s["eval_curve"].append([state.global_step, logs["eval_loss"]])
        if state.global_step:
            s["eta"] = s["elapsed"] / state.global_step * (state.max_steps - state.global_step) if "elapsed" in s else None
        s["log"].append(f"step {state.global_step}: " + json.dumps({k: round(v, 5) if isinstance(v, float) else v for k, v in logs.items()}))
        self.dump()

    def on_train_end(self, args, state, control, **kw):
        self.s["state"] = "finalizat"
        self.s["eta"] = 0
        self.dump()


live = Live()
tok = AutoTokenizer.from_pretrained(a.base)
model = AutoModelForCausalLM.from_pretrained(
    a.base,
    quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                                           bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.bfloat16),
    device_map="auto",
)

with open(a.train, encoding="utf-8") as first_handle:
    first_row = json.loads(next(line for line in first_handle if line.strip()))
messages_format = "messages" in first_row
if messages_format:
    data = load_dataset("json", data_files={"train": a.train, "val": a.val})
else:
    # PyArrow's Windows JSON loader can terminate the process on large prompt
    # strings. The completion-only path needs no Arrow features, so use plain
    # JSONL rows and a lazy torch Dataset instead.
    def read_jsonl(path):
        with open(path, encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]

    data = {"train": read_jsonl(a.train), "val": read_jsonl(a.val)}
LORA = LoraConfig(r=a.r, lora_alpha=2 * a.r, lora_dropout=0.05, task_type="CAUSAL_LM",
                  target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"])
steps_to_run = 5 if a.smoke else (50 if a.pilot else (a.max_steps if a.max_steps > 0 else -1))
COMMON = dict(
    output_dir=str(OUT), num_train_epochs=a.epochs, max_steps=steps_to_run,
    per_device_train_batch_size=a.bs, per_device_eval_batch_size=a.bs, gradient_accumulation_steps=a.accum,
    learning_rate=a.lr, lr_scheduler_type="cosine", warmup_steps=0.05,
    gradient_checkpointing=a.ckpt, bf16=True, dataloader_num_workers=0, logging_steps=1 if a.smoke else 5,
    eval_strategy="steps", eval_steps=a.eval_steps, save_strategy="steps", save_steps=a.eval_steps, save_total_limit=2,
    load_best_model_at_end=False if (a.smoke or a.pilot) else True, metric_for_best_model="eval_loss", greater_is_better=False, report_to="none",
)

if messages_format:
    data = data.map(lambda e: {"prompt": e["messages"][:-1], "completion": e["messages"][-1:]},
                    remove_columns=data["train"].column_names)
    trainer = SFTTrainer(
        model=model, processing_class=tok, train_dataset=data["train"], eval_dataset=data["val"].shuffle(seed=1).select(range(min(a.val_n, len(data["val"])))),
        peft_config=LORA, args=SFTConfig(max_length=a.max_length, **COMMON), callbacks=[live],
    )
else:
    import torch.nn.functional as F
    from peft import get_peft_model
    from transformers import Trainer, TrainingArguments
    def enc(e):
        pi = tok(e["prompt"], add_special_tokens=False)["input_ids"]
        ci = tok(e["completion"] + "<|im_end|>", add_special_tokens=False)["input_ids"]
        ids = pi + ci
        if len(ids) > a.max_length:
            raise ValueError(f"row longer than --max-length ({len(ids)} > {a.max_length}); would cut the completion")
        return {"input_ids": ids, "attention_mask": [1] * len(ids), "labels": [-100] * len(pi) + ci}

    class EncodedDataset(torch.utils.data.Dataset):
        def __init__(self, rows):
            self.rows = rows

        def __len__(self):
            return len(self.rows)

        def __getitem__(self, index):
            return enc(self.rows[index])

    val_rows = list(data["val"])
    random.Random(1).shuffle(val_rows)
    train_dataset = EncodedDataset(data["train"])
    eval_dataset = EncodedDataset(val_rows[: min(a.val_n, len(val_rows))])
    if a.ckpt:
        model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.enable_input_require_grads()
    model = get_peft_model(model, LORA)

    class CompletionLossTrainer(Trainer):
        def compute_loss(self, model, inputs, return_outputs=False, num_items_in_batch=None):
            ids, labels = inputs["input_ids"], inputs["labels"]
            completion_tokens = int((labels != -100).sum(dim=1).max().item())
            keep = completion_tokens + 1
            out = model(
                input_ids=ids,
                attention_mask=inputs["attention_mask"],
                logits_to_keep=keep,
            )
            logits = out.logits[:, :-1].float()
            shifted_labels = labels[:, -completion_tokens:]
            loss = F.cross_entropy(logits.reshape(-1, logits.size(-1)), shifted_labels.reshape(-1), ignore_index=-100)
            return (loss, out) if return_outputs else loss

    def collate(batch):
        max_len = max(len(item["input_ids"]) for item in batch)
        pad_id = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id
        ids, masks, labels = [], [], []
        for item in batch:
            padding = max_len - len(item["input_ids"])
            # Left padding keeps every completion aligned at the end, allowing
            # Qwen's logits_to_keep optimization to avoid materializing logits
            # for the ~800-token prompt.
            ids.append([pad_id] * padding + item["input_ids"])
            masks.append([0] * padding + item["attention_mask"])
            labels.append([-100] * padding + item["labels"])
        return {
            "input_ids": torch.tensor(ids),
            "attention_mask": torch.tensor(masks),
            "labels": torch.tensor(labels),
        }

    trainer = CompletionLossTrainer(
        model=model, args=TrainingArguments(remove_unused_columns=False, prediction_loss_only=True, **COMMON),
        train_dataset=train_dataset, eval_dataset=eval_dataset,
        data_collator=collate, callbacks=[live],
    )
    trainer.model_accepts_loss_kwargs = False

try:
    trainer.train()
    trainer.save_model(str(OUT))
except Exception as e:
    live.s["state"] = "eroare"
    live.s["log"].append(f"ERROR: {e!r}")
    live.dump()
    raise
