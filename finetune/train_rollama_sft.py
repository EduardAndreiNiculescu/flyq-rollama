"""Completion-only SFT for the official RoLlama Romanian adapter.

The adapter is a Romanian continual-pretraining adapter, so this script teaches
only FlightFlow's compact router JSON. It never trains factual prose.
"""

import argparse
import json
import random
import time
from pathlib import Path

# On this Windows CUDA installation, importing torch before datasets can abort
# the interpreter without a traceback (same ordering constraint as train_qlora).
from datasets import Dataset as _Dataset  # noqa: F401
import torch
import torch.nn.functional as F
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, Trainer, TrainerCallback, TrainingArguments


ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--base", default=str(ROOT / "finetune" / "rollama" / "base"))
parser.add_argument("--adapter", default=str(ROOT / "finetune" / "rollama" / "adapter"))
parser.add_argument("--tokenizer", default=None, help="Original tokenizer path when --adapter is a checkpoint directory")
parser.add_argument("--data", default=str(ROOT / "finetune" / "data" / "rollama"))
parser.add_argument("--train-name", default="train", help="Name of the training split file (e.g. train or train_augmented)")
parser.add_argument("--out", required=True)
parser.add_argument("--smoke", action="store_true")
parser.add_argument("--pilot", action="store_true")
parser.add_argument("--max-steps", type=int, default=-1)
parser.add_argument("--epochs", type=float, default=1.0)
parser.add_argument("--lr", type=float, default=2e-5)
parser.add_argument("--max-length", type=int, default=768)
parser.add_argument("--accum", type=int, default=8)
parser.add_argument("--save-final", action="store_true", help="Save the adapter once after a passed run; no intermediate optimizer checkpoints")
args = parser.parse_args()

OUT = Path(args.out)
OUT.mkdir(parents=True, exist_ok=True)
STATUS = OUT / "status.json"
steps = 5 if args.smoke else (50 if args.pilot else args.max_steps)
stage = "smoke" if args.smoke else ("pilot" if args.pilot else "train")


def rows(name: str) -> list[dict]:
    with (Path(args.data) / f"{name}.jsonl").open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


train_rows, val_rows = rows(args.train_name), rows("val")
random.Random(20261031).shuffle(val_rows)


class Dataset(torch.utils.data.Dataset):
    def __init__(self, source: list[dict], tokenizer):
        self.source, self.tokenizer = source, tokenizer

    def __len__(self):
        return len(self.source)

    def __getitem__(self, index):
        row = self.source[index]
        prompt = self.tokenizer(row["prompt"], add_special_tokens=True)["input_ids"]
        completion = self.tokenizer(row["completion"] + self.tokenizer.eos_token, add_special_tokens=False)["input_ids"]
        ids = prompt + completion
        if len(ids) > args.max_length:
            raise ValueError(f"{row['id']} exceeds max length: {len(ids)}")
        return {"input_ids": ids, "attention_mask": [1] * len(ids), "labels": [-100] * len(prompt) + completion}


def collate(batch):
    length = max(len(item["input_ids"]) for item in batch)
    pad = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else tokenizer.eos_token_id
    out = {"input_ids": [], "attention_mask": [], "labels": []}
    for item in batch:
        extra = length - len(item["input_ids"])
        out["input_ids"].append(item["input_ids"] + [pad] * extra)
        out["attention_mask"].append(item["attention_mask"] + [0] * extra)
        out["labels"].append(item["labels"] + [-100] * extra)
    return {key: torch.tensor(value) for key, value in out.items()}


class CompletionTrainer(Trainer):
    def compute_loss(self, model, inputs, return_outputs=False, num_items_in_batch=None):
        outputs = model(input_ids=inputs["input_ids"], attention_mask=inputs["attention_mask"])
        logits = outputs.logits[:, :-1, :].float()
        labels = inputs["labels"][:, 1:]
        loss = F.cross_entropy(logits.reshape(-1, logits.size(-1)), labels.reshape(-1), ignore_index=-100)
        return (loss, outputs) if return_outputs else loss


class Status(TrainerCallback):
    def __init__(self):
        self.started = time.time()
        self.last_loss = None
        self.last_eval = None

    def write(self, state, label):
        allocated = round(torch.cuda.max_memory_allocated() / 1e9, 3) if torch.cuda.is_available() else 0
        payload = {"stage": stage, "state": label, "step": state.global_step, "maxSteps": state.max_steps,
                   "loss": self.last_loss, "evalLoss": self.last_eval, "vramGb": allocated,
                   "elapsedSec": round(time.time() - self.started, 1)}
        STATUS.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def on_log(self, arguments, state, control, logs=None, **kwargs):
        for key, value in (logs or {}).items():
            if key == "loss": self.last_loss = value
            if key == "eval_loss": self.last_eval = value
        self.write(state, "running")

    def on_train_end(self, arguments, state, control, **kwargs):
        self.write(state, "passed")


torch.cuda.set_per_process_memory_fraction(0.93)
torch.backends.cuda.matmul.allow_tf32 = True
qconf = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.bfloat16)
tokenizer = AutoTokenizer.from_pretrained(args.tokenizer or args.adapter)
if tokenizer.pad_token_id is None:
    tokenizer.pad_token = tokenizer.eos_token
base = AutoModelForCausalLM.from_pretrained(args.base, quantization_config=qconf, device_map="cuda")
base.config.use_cache = False
model = PeftModel.from_pretrained(base, args.adapter, is_trainable=True)
model.enable_input_require_grads()
model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})

trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(json.dumps({"stage": stage, "trainRows": len(train_rows), "valRows": len(val_rows), "trainable": trainable, "gpu": torch.cuda.get_device_name()}, ensure_ascii=False))

training_args = TrainingArguments(
    output_dir=str(OUT), max_steps=steps, num_train_epochs=args.epochs,
    per_device_train_batch_size=1, per_device_eval_batch_size=1, gradient_accumulation_steps=args.accum,
    learning_rate=args.lr, optim="paged_adamw_8bit", bf16=True, tf32=True,
    logging_steps=1, eval_strategy="steps", eval_steps=5, save_strategy="no",
    report_to="none", remove_unused_columns=False, dataloader_num_workers=0,
)
trainer = CompletionTrainer(model=model, args=training_args, train_dataset=Dataset(train_rows, tokenizer),
                            eval_dataset=Dataset(val_rows[:64], tokenizer), data_collator=collate, callbacks=[Status()])
trainer.model_accepts_loss_kwargs = False
try:
    trainer.train()
    if args.save_final:
        model.save_pretrained(str(OUT))
        tokenizer.save_pretrained(str(OUT))
except Exception:
    state = {"stage": stage, "state": "failed", "error": "see console", "vramGb": round(torch.cuda.max_memory_allocated() / 1e9, 3)}
    STATUS.write_text(json.dumps(state, indent=2), encoding="utf-8")
    raise
