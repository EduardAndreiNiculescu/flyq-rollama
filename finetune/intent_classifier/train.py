"""Training, Smoke Test, Pilot and Temperature Calibration Pipeline for FlightFlow Intent Classifier.
Trains:
  1. Char-CNN
  2. FastText n-grams
  3. Tiny Transformer Encoder
Computes post-hoc temperature scaling calibration and ECE.
Tracks peak VRAM.
Saves model weights and tokenizer to finetune/intent_classifier/out/.
Logs status atomically to finetune/out/06b/status.json and events.jsonl.
"""

import json
import os
import sys

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import math
import time
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler, Subset
from typing import Dict, List, Any, Tuple

from finetune.intent_classifier.dataset import LABELS, LABEL2ID, CONTEXT_LAST_INTENTS, LAST_INTENT2ID
from finetune.intent_classifier.models import (
    CharTokenizer,
    encode_context,
    CharCNNIntentClassifier,
    FastTextIntentClassifier,
    TinyEncoderIntentClassifier,
)
from finetune.intent_classifier.export import run_export_pipeline
from finetune.intent_classifier.status_tracker import log_06b_event


class IntentDataset(Dataset):
    def __init__(self, jsonl_path: str, tokenizer: CharTokenizer):
        self.tokenizer = tokenizer
        self.samples = []
        with open(jsonl_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    self.samples.append(json.loads(line))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor, int]:
        s = self.samples[idx]
        text = s["text"]
        input_ids = torch.tensor(self.tokenizer.encode(text), dtype=torch.long)
        flight_flag = bool(s.get("selected_flight_present", False))
        last_intent = s.get("last_intent", "none")
        ctx = encode_context(flight_flag, last_intent)
        label_id = LABEL2ID.get(s["label"], LABEL2ID["none"])
        return input_ids, ctx, label_id


def compute_ece(probs: torch.Tensor, labels: torch.Tensor, n_bins: int = 10) -> float:
    """Computes Expected Calibration Error across n_bins."""
    confidences, predictions = torch.max(probs, dim=1)
    accuracies = predictions.eq(labels)
    ece = 0.0
    bin_boundaries = torch.linspace(0, 1, n_bins + 1)

    for i in range(n_bins):
        bin_lower = bin_boundaries[i]
        bin_upper = bin_boundaries[i + 1]
        in_bin = confidences.gt(bin_lower) * confidences.le(bin_upper)
        prop_in_bin = in_bin.float().mean().item()
        if prop_in_bin > 0:
            accuracy_in_bin = accuracies[in_bin].float().mean().item()
            avg_confidence_in_bin = confidences[in_bin].mean().item()
            ece += abs(avg_confidence_in_bin - accuracy_in_bin) * prop_in_bin

    return ece


def calibrate_temperature(model: nn.Module, val_loader: DataLoader, device: str) -> float:
    """Learns a scalar temperature T on the validation set using NLL loss."""
    model.eval()
    logits_list = []
    labels_list = []

    with torch.no_grad():
        for input_ids, ctx, labels in val_loader:
            input_ids, ctx = input_ids.to(device), ctx.to(device)
            l = model(input_ids, ctx)
            logits_list.append(l.cpu())
            labels_list.append(labels)

    logits = torch.cat(logits_list, dim=0)
    labels = torch.cat(labels_list, dim=0)

    # Calculate initial ECE
    initial_probs = torch.softmax(logits, dim=1)
    initial_ece = compute_ece(initial_probs, labels)

    # Temperature parameter
    temperature = nn.Parameter(torch.ones(1) * 1.5)
    optimizer = optim.LBFGS([temperature], lr=0.01, max_iter=50)
    criterion = nn.CrossEntropyLoss()

    def eval_loss():
        optimizer.zero_grad()
        loss = criterion(logits / temperature, labels)
        loss.backward()
        return loss

    optimizer.step(eval_loss)
    opt_temp = float(temperature.item())
    model.temperature.data.fill_(opt_temp)

    # Calculate calibrated ECE
    calibrated_probs = torch.softmax(logits / opt_temp, dim=1)
    calibrated_ece = compute_ece(calibrated_probs, labels)

    print(f"  [Calibration] Initial ECE: {initial_ece:.4f} -> Calibrated ECE: {calibrated_ece:.4f} (T={opt_temp:.3f})")
    return calibrated_ece


def run_smoke_test(device: str, tokenizer: CharTokenizer) -> bool:
    print("\n[SMOKE TEST] Running forward/backward step on small batch...")
    dummy_input = torch.randint(0, tokenizer.vocab_size, (8, 128), device=device)
    dummy_ctx = torch.randn(8, 9, device=device)
    dummy_labels = torch.randint(0, len(LABELS), (8,), device=device)

    model = CharCNNIntentClassifier(vocab_size=tokenizer.vocab_size).to(device)
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    criterion = nn.CrossEntropyLoss()

    optimizer.zero_grad()
    logits = model(dummy_input, dummy_ctx)
    assert logits.shape == (8, len(LABELS)), f"Unexpected logits shape: {logits.shape}"
    loss = criterion(logits, dummy_labels)
    assert not torch.isnan(loss), "Smoke test loss is NaN!"
    loss.backward()
    optimizer.step()

    print(f"[SMOKE TEST] Passed. Loss={loss.item():.4f}")
    log_06b_event("smoke_test", "passed", 8, 8, f"Smoke test passed: loss={loss.item():.4f}, logits shape OK.")
    return True


def run_pilot(device: str, tokenizer: CharTokenizer, data_dir: str) -> bool:
    print("\n[PILOT] Running 3-epoch pilot training on subset...")
    train_ds = IntentDataset(os.path.join(data_dir, "train.jsonl"), tokenizer)
    val_ds = IntentDataset(os.path.join(data_dir, "val.jsonl"), tokenizer)

    # Subset 500 train, 150 val
    subset_train = Subset(train_ds, list(range(min(500, len(train_ds)))))
    subset_val = Subset(val_ds, list(range(min(150, len(val_ds)))))

    train_loader = DataLoader(subset_train, batch_size=32, shuffle=True)
    val_loader = DataLoader(subset_val, batch_size=32, shuffle=False)

    model = CharCNNIntentClassifier(vocab_size=tokenizer.vocab_size).to(device)
    optimizer = optim.AdamW(model.parameters(), lr=0.002)
    criterion = nn.CrossEntropyLoss()

    initial_loss = None
    final_loss = None
    for epoch in range(1, 4):
        model.train()
        total_loss = 0.0
        for input_ids, ctx, labels in train_loader:
            input_ids, ctx, labels = input_ids.to(device), ctx.to(device), labels.to(device)
            optimizer.zero_grad()
            logits = model(input_ids, ctx)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * len(labels)
        avg_loss = total_loss / len(subset_train)
        if initial_loss is None:
            initial_loss = avg_loss
        final_loss = avg_loss

    model.eval()
    val_correct = 0
    with torch.no_grad():
        for input_ids, ctx, labels in val_loader:
            input_ids, ctx, labels = input_ids.to(device), ctx.to(device), labels.to(device)
            logits = model(input_ids, ctx)
            val_correct += (logits.argmax(dim=-1) == labels).sum().item()
    val_acc = val_correct / len(subset_val)

    print(f"[PILOT] Passed. Initial Loss={initial_loss:.4f} -> Final Loss={final_loss:.4f}, Pilot Val Acc={val_acc*100:.2f}%")
    assert final_loss < initial_loss, "Pilot loss did not decrease!"
    log_06b_event("pilot", "passed", 3, 3, f"Pilot passed: loss {initial_loss:.4f} -> {final_loss:.4f}, val_acc {val_acc*100:.2f}%.", {"initial_loss": initial_loss, "final_loss": final_loss, "val_acc": val_acc})
    return True


def train_single_model(
    name: str,
    model: nn.Module,
    train_loader: DataLoader,
    val_loader: DataLoader,
    device: str,
    epochs: int = 15,
    lr: float = 0.001,
) -> Dict[str, Any]:
    print(f"\n==================== Training {name} ====================")
    model = model.to(device)
    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.05)

    best_val_acc = 0.0
    best_state = None
    start_time = time.time()

    for epoch in range(1, epochs + 1):
        model.train()
        total_loss, correct, total = 0.0, 0, 0
        for input_ids, ctx, labels in train_loader:
            input_ids, ctx, labels = input_ids.to(device), ctx.to(device), labels.to(device)
            optimizer.zero_grad()
            logits = model(input_ids, ctx)
            loss = criterion(logits, labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=2.0)
            optimizer.step()

            total_loss += loss.item() * len(labels)
            preds = logits.argmax(dim=-1)
            correct += (preds == labels).sum().item()
            total += len(labels)

        scheduler.step()
        train_acc = correct / total

        # Validation
        model.eval()
        val_correct, val_total = 0, 0
        with torch.no_grad():
            for input_ids, ctx, labels in val_loader:
                input_ids, ctx, labels = input_ids.to(device), ctx.to(device), labels.to(device)
                logits = model(input_ids, ctx)
                preds = logits.argmax(dim=-1)
                val_correct += (preds == labels).sum().item()
                val_total += len(labels)

        val_acc = val_correct / val_total
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}

        if epoch % 5 == 0 or epoch == epochs:
            print(f"  Epoch {epoch:02d}/{epochs:02d} | Train Acc: {train_acc*100:.2f}% | Val Acc: {val_acc*100:.2f}% (Best: {best_val_acc*100:.2f}%)")

    elapsed = time.time() - start_time
    print(f"  Training finished in {elapsed:.2f}s | Best Val Acc: {best_val_acc*100:.2f}%")

    if best_state is not None:
        model.load_state_dict(best_state)

    calib_ece = calibrate_temperature(model, val_loader, device)

    return {
        "best_val_acc": best_val_acc,
        "calibrated_ece": calib_ece,
        "training_time_sec": elapsed,
        "temperature": float(model.temperature.item()),
    }


def run_training_pipeline():
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "data"))
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "out"))
    os.makedirs(out_dir, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Running Intent Classifier Training on: {device.upper()}")

    tokenizer = CharTokenizer(max_length=128)
    # Save tokenizer vocabulary
    with open(os.path.join(out_dir, "tokenizer.json"), "w", encoding="utf-8") as f:
        json.dump({"char2id": tokenizer.char2id, "max_length": tokenizer.max_length}, f, indent=2)

    # 1. Smoke test
    run_smoke_test(device, tokenizer)

    # 2. Pilot
    run_pilot(device, tokenizer, data_dir)

    # 3. Full Training Setup
    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()

    train_ds = IntentDataset(os.path.join(data_dir, "train.jsonl"), tokenizer)
    val_ds = IntentDataset(os.path.join(data_dir, "val.jsonl"), tokenizer)

    label_ids = [LABEL2ID.get(s["label"], LABEL2ID["none"]) for s in train_ds.samples]
    counts = torch.bincount(torch.tensor(label_ids), minlength=len(LABELS)).float()
    max_count = counts.max().clamp(min=1)
    class_sampling_weights = torch.sqrt(max_count / counts.clamp(min=1)).clamp(max=6.0)
    sample_weights = [float(class_sampling_weights[i]) for i in label_ids]
    sampler = WeightedRandomSampler(sample_weights, num_samples=len(sample_weights), replacement=True)
    train_loader = DataLoader(train_ds, batch_size=64, sampler=sampler)
    val_loader = DataLoader(val_ds, batch_size=64, shuffle=False)

    results = {}

    # Train Char-CNN (18 epochs)
    char_cnn = CharCNNIntentClassifier(vocab_size=tokenizer.vocab_size)
    r_cnn = train_single_model("Char-CNN", char_cnn, train_loader, val_loader, device, epochs=18, lr=0.001)
    torch.save(char_cnn.state_dict(), os.path.join(out_dir, "char_cnn.pt"))
    results["char_cnn"] = r_cnn

    # Train FastText n-grams (15 epochs)
    fasttext = FastTextIntentClassifier()
    r_ft = train_single_model("FastText n-grams", fasttext, train_loader, val_loader, device, epochs=15, lr=0.003)
    torch.save(fasttext.state_dict(), os.path.join(out_dir, "fasttext.pt"))
    results["fasttext"] = r_ft

    # Train Tiny Transformer Encoder (15 epochs)
    tiny_enc = TinyEncoderIntentClassifier(vocab_size=tokenizer.vocab_size)
    r_te = train_single_model("Tiny Transformer Encoder", tiny_enc, train_loader, val_loader, device, epochs=15, lr=0.0008)
    torch.save(tiny_enc.state_dict(), os.path.join(out_dir, "tiny_encoder.pt"))
    results["tiny_encoder"] = r_te

    # Measure Peak VRAM
    peak_vram_mb = 0.0
    if torch.cuda.is_available():
        peak_vram_mb = torch.cuda.max_memory_allocated() / (1024 * 1024)
        print(f"\n[VRAM] Peak VRAM allocated: {peak_vram_mb:.2f} MB ({peak_vram_mb/1024:.3f} GB)")

    results["peak_vram_mb"] = round(peak_vram_mb, 2)
    results["peak_vram_gb"] = round(peak_vram_mb / 1024, 3)

    # Save summary
    with open(os.path.join(out_dir, "train_summary.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    # 4. Export Models to ONNX & INT8
    print("\n==================== Exporting Models to ONNX ====================")
    export_summary = run_export_pipeline(weights_dir=out_dir)
    results["export"] = export_summary

    # Log completion event
    log_06b_event(
        stage="train_complete",
        state="passed",
        current=len(train_ds),
        total=len(train_ds),
        message=f"Trained Char-CNN (Val Acc {r_cnn['best_val_acc']*100:.2f}%), FastText, TinyEncoder. Peak VRAM: {peak_vram_mb:.2f} MB.",
        metrics={
            "char_cnn_val_acc": r_cnn["best_val_acc"],
            "peak_vram_mb": peak_vram_mb,
            "fasttext_val_acc": r_ft["best_val_acc"],
            "tiny_encoder_val_acc": r_te["best_val_acc"]
        }
    )

    print("\nAll models trained, calibrated, and exported successfully!")
    print(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    run_training_pipeline()
