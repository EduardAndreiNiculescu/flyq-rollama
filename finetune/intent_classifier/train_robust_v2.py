"""Train the isolated Romanian-robust Char-CNN candidate in out_v2/."""
from __future__ import annotations

import json
import os
import sys
import time
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import torch
from torch.utils.data import DataLoader, WeightedRandomSampler

from finetune.intent_classifier.dataset import LABEL2ID, LABELS
from finetune.intent_classifier.export import run_export_pipeline
from finetune.intent_classifier.models import CharCNNIntentClassifier, CharTokenizer, TinyEncoderIntentClassifier
from finetune.intent_classifier.train import IntentDataset, run_pilot, run_smoke_test, train_single_model

DATA = ROOT / "finetune" / "intent_classifier" / "data_v2"
OUT = ROOT / "finetune" / "intent_classifier" / "out_v2"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--export-only", action="store_true")
    parser.add_argument("--architecture", choices=("char_cnn", "tiny_encoder"), default="char_cnn")
    parser.add_argument("--out-dir")
    parser.add_argument("--data-dir", default=str(DATA))
    parser.add_argument("--epochs", type=int, default=24)
    args = parser.parse_args()
    torch.manual_seed(20261031)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(20261031)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    out_dir = Path(args.out_dir) if args.out_dir else OUT
    data_dir = Path(args.data_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    tokenizer = CharTokenizer(max_length=128)
    (out_dir / "tokenizer.json").write_text(json.dumps({"char2id": tokenizer.char2id, "max_length": tokenizer.max_length}, indent=2), encoding="utf-8")
    if args.export_only:
        checkpoint = out_dir / ("char_cnn.pt" if args.architecture == "char_cnn" else "tiny_encoder.pt")
        if not checkpoint.exists():
            raise FileNotFoundError("missing v2 checkpoint")
        print(f"Exporting saved robust v2 checkpoint from {out_dir}")
        print(json.dumps(run_export_pipeline(weights_dir=str(out_dir)), indent=2))
        return
    print(f"Training robust v2 candidate on {device.upper()} with data at {data_dir}")

    run_smoke_test(device, tokenizer)
    run_pilot(device, tokenizer, str(data_dir))

    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()
    train_ds = IntentDataset(str(data_dir / "train.jsonl"), tokenizer)
    val_ds = IntentDataset(str(data_dir / "val.jsonl"), tokenizer)
    ids = [LABEL2ID.get(sample["label"], LABEL2ID["none"]) for sample in train_ds.samples]
    counts = torch.bincount(torch.tensor(ids), minlength=len(LABELS)).float()
    weights = torch.sqrt(counts.max().clamp(min=1) / counts.clamp(min=1)).clamp(max=4.0)
    sampler = WeightedRandomSampler([float(weights[item]) for item in ids], num_samples=len(ids), replacement=True)
    train_loader = DataLoader(train_ds, batch_size=64, sampler=sampler)
    val_loader = DataLoader(val_ds, batch_size=64, shuffle=False)

    started = time.time()
    if args.architecture == "char_cnn":
        model = CharCNNIntentClassifier(vocab_size=tokenizer.vocab_size)
        checkpoint_name, model_name, lr = "char_cnn.pt", "Char-CNN robust v2", 0.001
    else:
        model = TinyEncoderIntentClassifier(vocab_size=tokenizer.vocab_size)
        checkpoint_name, model_name, lr = "tiny_encoder.pt", "Tiny Encoder robust v2", 0.0008
    result = train_single_model(model_name, model, train_loader, val_loader, device, epochs=args.epochs, lr=lr)
    torch.save(model.state_dict(), out_dir / checkpoint_name)
    export = run_export_pipeline(weights_dir=str(out_dir))
    peak_mb = torch.cuda.max_memory_allocated() / (1024 * 1024) if torch.cuda.is_available() else 0.0
    report = {"seed": 20261031, "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu", "data": str(data_dir),
              "architecture": args.architecture, "trainSamples": len(train_ds), "validationSamples": len(val_ds), "result": result, "export": export,
              "peakVramMb": round(peak_mb, 2), "elapsedSec": round(time.time() - started, 2)}
    (out_dir / "train_summary.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
