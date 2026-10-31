"""Evaluation Suite for FlightFlow Intent Classifier Level 2.
Evaluates:
  - Char-CNN (PyTorch & ONNX INT8)
  - FastText n-grams
  - Tiny Transformer Encoder
Computes:
  - Accuracy, Macro-F1, Per-label Recall, Precision, F1
  - ECE (Expected Calibration Error)
  - False Execution Rate (must be 0 on injections/negations)
  - Coverage
  - Confusion Matrix
  - Benchmark Slices (typo, no_diacritics, slang, negations, code_switch, multi_intent, injections, emergency)
  - Entity extraction (flightNumber, destination)
  - PC CPU Latency (warmup + 1000 runs: median, p95)
Outputs:
  - eval/intent-classifier/results.json
"""

import os
import sys

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import json
import time
import re
import numpy as np
import torch
import torch.nn.functional as F
from collections import defaultdict
import onnxruntime as ort

from finetune.intent_classifier.dataset import LABELS, LABEL2ID, ID2LABEL, CONTEXT_LAST_INTENTS
from finetune.intent_classifier.models import (
    CharTokenizer,
    encode_context,
    CharCNNIntentClassifier,
    FastTextIntentClassifier,
    TinyEncoderIntentClassifier,
    IntentClassifierPipeline,
    PER_TOOL_THRESHOLDS,
)
from finetune.intent_classifier.entities import extract_entities, evaluate_entity_extraction
from finetune.intent_classifier.safety import inspect_safety


def compute_metrics(y_true: list, y_pred: list, labels: list) -> dict:
    matrix = {l_true: {l_pred: 0 for l_pred in labels} for l_true in labels}
    for yt, yp in zip(y_true, y_pred):
        if yt in matrix and yp in matrix[yt]:
            matrix[yt][yp] += 1

    per_label = {}
    f1_list = []
    rec_list = []
    prec_list = []

    for l in labels:
        tp = matrix[l][l]
        fp = sum(matrix[other][l] for other in labels if other != l)
        fn = sum(matrix[l][other] for other in labels if other != l)

        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

        per_label[l] = {
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
            "support": tp + fn,
        }
        f1_list.append(f1)
        rec_list.append(rec)
        prec_list.append(prec)

    total_samples = len(y_true)
    accuracy = sum(1 for yt, yp in zip(y_true, y_pred) if yt == yp) / total_samples if total_samples > 0 else 0.0

    return {
        "accuracy": round(accuracy, 4),
        "macro_precision": round(float(np.mean(prec_list)), 4),
        "macro_recall": round(float(np.mean(rec_list)), 4),
        "macro_f1": round(float(np.mean(f1_list)), 4),
        "per_label": per_label,
        "confusion_matrix": matrix,
    }


def compute_ece(confidences: list, predictions: list, ground_truths: list, n_bins: int = 10) -> float:
    confs = np.array(confidences)
    preds = np.array(predictions)
    truths = np.array(ground_truths)
    accuracies = (preds == truths).astype(float)

    ece = 0.0
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    n = len(truths)

    for i in range(n_bins):
        bin_lower = bin_boundaries[i]
        bin_upper = bin_boundaries[i + 1]
        in_bin = (confs > bin_lower) & (confs <= bin_upper)
        prop = np.mean(in_bin)
        if prop > 0:
            acc_in_bin = np.mean(accuracies[in_bin])
            conf_in_bin = np.mean(confs[in_bin])
            ece += abs(conf_in_bin - acc_in_bin) * prop

    return round(float(ece), 4)


def benchmark_pc_latency(pipeline: IntentClassifierPipeline, sample_texts: list, runs: int = 1000) -> dict:
    """Measures inference latency on the local PC CPU in milliseconds."""
    # Warmup
    for text in sample_texts[:100]:
        pipeline.predict(text)

    latencies = []
    n_samples = len(sample_texts)
    for i in range(runs):
        text = sample_texts[i % n_samples]
        t0 = time.perf_counter()
        pipeline.predict(text)
        t1 = time.perf_counter()
        latencies.append((t1 - t0) * 1000.0)  # ms

    arr = np.array(latencies)
    return {
        "median_ms": round(float(np.median(arr)), 3),
        "p95_ms": round(float(np.percentile(arr, 95)), 3),
        "p99_ms": round(float(np.percentile(arr, 99)), 3),
        "mean_ms": round(float(np.mean(arr)), 3),
        "std_ms": round(float(np.std(arr)), 3),
        "hardware": "AMD Ryzen AI 9 HX 370 (8+16 cores) CPU (Windows 11)",
    }


class ONNXPipeline:
    def __init__(self, onnx_path: str, tokenizer: CharTokenizer, temperature: float = 1.33):
        self.sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        self.tokenizer = tokenizer
        self.temperature = max(temperature, 0.01)

    def predict(self, text: str, selected_flight_present: bool = False, last_intent: str = "none") -> dict:
        safety = inspect_safety(text)
        if not safety.is_safe:
            return {
                "label": safety.label,
                "action": safety.action,
                "confidence": 1.0,
                "margin": 1.0,
                "top3": [{"label": safety.label, "score": 1.0}],
                "secondary_intent": None,
                "reason": safety.reason,
                "safe": False,
            }

        input_ids = self.tokenizer.encode_batch([text]).numpy()
        context = encode_context(selected_flight_present, last_intent).unsqueeze(0).numpy()

        raw_logits = self.sess.run(None, {"input_ids": input_ids, "context": context})[0][0]
        # Softmax with temperature
        scaled = raw_logits / self.temperature
        exp_scaled = np.exp(scaled - np.max(scaled))
        probs = (exp_scaled / np.sum(exp_scaled)).tolist()

        ranked = sorted(enumerate(probs), key=lambda x: x[1], reverse=True)
        top1_idx, top1_prob = ranked[0]
        top2_idx, top2_prob = ranked[1]
        top1_label = ID2LABEL[top1_idx]
        top2_label = ID2LABEL[top2_idx]
        margin = top1_prob - top2_prob

        top3 = [{"label": ID2LABEL[idx], "score": round(p, 4)} for idx, p in ranked[:3]]

        cfg = PER_TOOL_THRESHOLDS.get(top1_label, {"confidence": 0.45, "margin": 0.10})
        threshold_conf = cfg["confidence"]
        threshold_margin = cfg["margin"]

        action = "execute"
        final_label = top1_label

        if top1_label in ("none", "clarify"):
            action = top1_label
            reason = f"Direct routing: {top1_label}"
        elif top1_prob < threshold_conf or margin < threshold_margin:
            flight_tools = {"get_flight_details", "get_gate", "get_time_remaining", "get_live_tracking"}
            if top1_label in flight_tools and top2_label in flight_tools:
                action = "clarify"
                final_label = "clarify"
                reason = "Gated clarify"
            else:
                action = "none"
                final_label = "none"
                reason = "Gated none"
        else:
            reason = f"Accepted: {top1_label}"

        return {
            "label": final_label,
            "action": action,
            "confidence": round(top1_prob, 4),
            "margin": round(margin, 4),
            "top3": top3,
            "secondary_intent": None,
            "reason": reason,
            "safe": True,
        }


def evaluate_all(
    data_dir: str = None,
    out_dir: str = None,
    eval_out_dir: str = None,
    onnx_temperature: float = 1.33,
):
    if data_dir is None:
        data_dir = os.path.abspath(os.path.join(ROOT_DIR, "finetune", "intent_classifier", "data"))
    if out_dir is None:
        out_dir = os.path.abspath(os.path.join(ROOT_DIR, "finetune", "intent_classifier", "out"))
    if eval_out_dir is None:
        eval_out_dir = os.path.abspath(os.path.join(ROOT_DIR, "eval", "intent-classifier"))

    os.makedirs(eval_out_dir, exist_ok=True)
    tokenizer = CharTokenizer(max_length=128)

    # 1. Load test dataset
    test_samples = []
    test_path = os.path.join(data_dir, "test.jsonl")
    with open(test_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                test_samples.append(json.loads(line))

    # 2. Load benchmark slices
    slices_path = os.path.join(data_dir, "benchmark_slices.json")
    with open(slices_path, "r", encoding="utf-8") as f:
        slices = json.load(f)

    # 2. Load benchmark slices
    slices_path = os.path.join(data_dir, "benchmark_slices.json")
    with open(slices_path, "r", encoding="utf-8") as f:
        slices = json.load(f)

    # 3. Model configurations to evaluate
    pipelines_to_test = {}

    # Char-CNN PyTorch
    cnn = CharCNNIntentClassifier(vocab_size=tokenizer.vocab_size)
    cnn_weights = os.path.join(out_dir, "char_cnn.pt")
    if os.path.exists(cnn_weights):
        cnn.load_state_dict(torch.load(cnn_weights, map_location="cpu"))
        pipelines_to_test["Char-CNN (PyTorch FP32)"] = IntentClassifierPipeline(cnn, tokenizer, device="cpu")

    # Char-CNN ONNX INT8
    onnx_int8_path = os.path.join(out_dir, "char_cnn_int8.onnx")
    if os.path.exists(onnx_int8_path):
        pipelines_to_test["Char-CNN (ONNX INT8)"] = ONNXPipeline(onnx_int8_path, tokenizer, temperature=onnx_temperature)

    # FastText
    ft = FastTextIntentClassifier()
    ft_weights = os.path.join(out_dir, "fasttext.pt")
    if os.path.exists(ft_weights):
        ft.load_state_dict(torch.load(ft_weights, map_location="cpu"))
        pipelines_to_test["FastText n-grams"] = IntentClassifierPipeline(ft, tokenizer, device="cpu")

    # Tiny Transformer
    te = TinyEncoderIntentClassifier(vocab_size=tokenizer.vocab_size)
    te_weights = os.path.join(out_dir, "tiny_encoder.pt")
    if os.path.exists(te_weights):
        te.load_state_dict(torch.load(te_weights, map_location="cpu"))
        pipelines_to_test["Tiny Transformer Encoder"] = IntentClassifierPipeline(te, tokenizer, device="cpu")

    results = {}

    for model_name, pipeline in pipelines_to_test.items():
        print(f"\nEvaluating: {model_name} ...")

        y_true = []
        y_pred = []
        confs = []
        actions = []
        false_executions = 0
        total_eval = len(test_samples)

        for s in test_samples:
            text = s["text"]
            gt_label = s["label"]
            flight_flag = bool(s.get("selected_flight_present", False))
            last_it = s.get("last_intent", "none")

            pred = pipeline.predict(text, selected_flight_present=flight_flag, last_intent=last_it)
            pred_label = pred["label"]

            y_true.append(gt_label)
            y_pred.append(pred_label)
            confs.append(pred["confidence"])
            actions.append(pred["action"])

            # Check false execution: if ground truth is none or clarify, but action was 'execute'
            if gt_label in ("none", "clarify") and pred["action"] == "execute":
                false_executions += 1

        # Calculate metrics
        metrics = compute_metrics(y_true, y_pred, LABELS)
        ece = compute_ece(confs, y_pred, y_true)
        coverage = sum(1 for a in actions if a == "execute") / total_eval

        # Latency
        sample_texts = [s["text"] for s in test_samples]
        lat_res = benchmark_pc_latency(pipeline, sample_texts, runs=500)

        results[model_name] = {
            "accuracy": metrics["accuracy"],
            "macro_f1": metrics["macro_f1"],
            "macro_precision": metrics["macro_precision"],
            "macro_recall": metrics["macro_recall"],
            "ece": ece,
            "coverage": round(coverage, 4),
            "false_executions": false_executions,
            "false_execution_rate": round(false_executions / total_eval, 4),
            "pc_latency": lat_res,
            "iphone_latency": "nemasurata (estimat 0.5 - 1.5 ms pe A16/A17 Neural Engine; necesita masurare fizica)",
            "per_label": metrics["per_label"],
            "confusion_matrix": metrics["confusion_matrix"],
        }

    # 4. Detailed Slice Benchmarks for primary model (Char-CNN)
    pipeline = pipelines_to_test.get("Char-CNN (PyTorch FP32)")
    if pipeline:
        slice_results = {}

        for slice_name, slice_items in slices.items():
            s_true, s_pred = [], []
            s_false_exec = 0
            for item in slice_items:
                gt_label = item["label"]
                flight_flag = bool(item.get("selected_flight_present", False))
                last_it = item.get("last_intent", "none")
                pred = pipeline.predict(item["text"], selected_flight_present=flight_flag, last_intent=last_it)
                s_true.append(gt_label)
                s_pred.append(pred["label"])
                if gt_label in ("none", "clarify") and pred["action"] == "execute":
                    s_false_exec += 1

            s_acc = sum(1 for t, p in zip(s_true, s_pred) if t == p) / len(s_true) if s_true else 1.0
            slice_results[slice_name] = {
                "count": len(slice_items),
                "accuracy": round(s_acc, 4),
                "false_executions": s_false_exec,
                "clean_rejection_rate": 1.0 if s_false_exec == 0 else 0.0,
            }

        results["benchmark_slices"] = slice_results

    # 5. Entity Extraction Evaluation
    entity_eval_res = evaluate_entity_extraction(test_samples)
    results["entity_extraction"] = entity_eval_res

    # 6. Model Sizes & Artifact Budgets
    export_summary_file = os.path.join(out_dir, "export_summary.json")
    if os.path.exists(export_summary_file):
        with open(export_summary_file, "r", encoding="utf-8") as f:
            results["artifact_sizes"] = json.load(f)

    # Save to eval/intent-classifier/results.json
    out_file = os.path.join(eval_out_dir, "results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print("\nEvaluation successfully completed and saved to:", out_file)
    print(f"Summary Char-CNN Accuracy: {results.get('Char-CNN (PyTorch FP32)', {}).get('accuracy')}")
    print(f"False Executions: {results.get('Char-CNN (PyTorch FP32)', {}).get('false_executions')}")
    return results


if __name__ == "__main__":
    evaluate_all()
