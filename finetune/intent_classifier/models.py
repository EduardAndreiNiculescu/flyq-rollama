"""Neural Intent Classifier Architectures for FlightFlow (Level 2).
Provides:
  1. CharCNNIntentClassifier (Multi-scale 1D CNN)
  2. FastTextIntentClassifier (Bag-of-character n-grams)
  3. TinyEncoderIntentClassifier (Miniaturized 2-layer Transformer)
Includes:
  - Character Tokenizer with diacritics
  - Minimal context projection (selected_flight_present + last_intent)
  - Temperature-scaled calibration
  - Margin & Top-3 ranking
  - Per-tool threshold gating
  - Multi-intent secondary extraction
"""

import math
import re
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import List, Dict, Any, Tuple, Optional
from finetune.intent_classifier.dataset import LABELS, LABEL2ID, ID2LABEL, CONTEXT_LAST_INTENTS, LAST_INTENT2ID
from finetune.intent_classifier.safety import inspect_safety


# Per-tool confidence thresholds and minimum margins for safety gating
# Calibrated for temperature-scaled 8-class softmax distribution (random baseline is 0.125)
PER_TOOL_THRESHOLDS = {
    "get_flight_details": {"confidence": 0.45, "margin": 0.10},
    "get_gate": {"confidence": 0.45, "margin": 0.10},
    "get_time_remaining": {"confidence": 0.45, "margin": 0.10},
    "get_live_tracking": {"confidence": 0.45, "margin": 0.10},
    "search_knowledge": {"confidence": 0.55, "margin": 0.12},
    "open_airport_map": {"confidence": 0.45, "margin": 0.10},
    "clarify": {"confidence": 0.30, "margin": 0.04},
    "none": {"confidence": 0.30, "margin": 0.04},
}

MULTI_INTENT_CONJUNCTIONS = re.compile(r"\b(si|și|and|plus|iar|iar pe|dar si|cat si)\b", re.IGNORECASE)


class CharTokenizer:
    """Byte/character-level tokenizer supporting printable ASCII + Romanian diacritics."""
    def __init__(self, max_length: int = 128):
        self.max_length = max_length
        # Printable ASCII (32..126) + RO diacritics
        chars = [chr(i) for i in range(32, 127)]
        ro_chars = ['ă', 'Ă', 'â', 'Â', 'î', 'Î', 'ș', 'Ș', 'ş', 'Ş', 'ț', 'Ț', 'ţ', 'Ţ']
        self.char2id = {"<pad>": 0, "<unk>": 1}
        for c in chars + ro_chars:
            if c not in self.char2id:
                self.char2id[c] = len(self.char2id)
        self.vocab_size = len(self.char2id)

    def encode(self, text: str) -> List[int]:
        ids = [self.char2id.get(c, 1) for c in text[:self.max_length]]
        if len(ids) < self.max_length:
            ids = ids + [0] * (self.max_length - len(ids))
        return ids

    def encode_batch(self, texts: List[str]) -> torch.Tensor:
        batch = [self.encode(t) for t in texts]
        return torch.tensor(batch, dtype=torch.long)


def encode_context(selected_flight_present: bool, last_intent: str) -> torch.Tensor:
    """Encodes context into a 9-dimensional float tensor:
       [0]: selected_flight_present (0.0 or 1.0)
       [1..8]: one-hot encoding of last_intent (8 classes)
    """
    ctx = [1.0 if selected_flight_present else 0.0]
    last_id = LAST_INTENT2ID.get(last_intent, 0)
    one_hot = [0.0] * len(CONTEXT_LAST_INTENTS)
    one_hot[last_id] = 1.0
    ctx.extend(one_hot)
    return torch.tensor(ctx, dtype=torch.float32)


# ============================================================================
# ARCHITECTURE 1: Char-CNN (Multi-scale 1D Convolutional Neural Network)
# ============================================================================
class CharCNNIntentClassifier(nn.Module):
    def __init__(
        self,
        vocab_size: int = 256,
        embedding_dim: int = 64,
        num_filters: int = 96,
        filter_sizes: Tuple[int, ...] = (2, 3, 4, 5),
        num_classes: int = len(LABELS),
        context_dim: int = 1 + len(CONTEXT_LAST_INTENTS),
        dropout: float = 0.2,
    ):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embedding_dim, padding_idx=0)
        self.convs = nn.ModuleList([
            nn.Sequential(
                nn.Conv1d(embedding_dim, num_filters, kernel_size=k, padding=k // 2),
                nn.BatchNorm1d(num_filters),
                nn.GELU(),
            )
            for k in filter_sizes
        ])
        
        # Context MLP
        self.context_proj = nn.Sequential(
            nn.Linear(context_dim, 32),
            nn.GELU(),
        )

        # Classifier MLP: 4 * num_filters * 2 (max + avg pool) + 32 (context)
        pooled_dim = len(filter_sizes) * num_filters * 2
        self.classifier = nn.Sequential(
            nn.Linear(pooled_dim + 32, 128),
            nn.BatchNorm1d(128),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(128, num_classes),
        )
        self.temperature = nn.Parameter(torch.ones(1), requires_grad=False)

    def forward(self, input_ids: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        # input_ids: [B, L]
        # context: [B, 9]
        x = self.embedding(input_ids)  # [B, L, D]
        x = x.transpose(1, 2)  # [B, D, L] for Conv1d

        conv_features = []
        for conv in self.convs:
            c = conv(x)  # [B, num_filters, L]
            max_p = F.adaptive_max_pool1d(c, 1).squeeze(2)  # [B, num_filters]
            avg_p = F.adaptive_avg_pool1d(c, 1).squeeze(2)  # [B, num_filters]
            conv_features.extend([max_p, avg_p])

        text_rep = torch.cat(conv_features, dim=1)  # [B, pooled_dim]
        ctx_rep = self.context_proj(context)  # [B, 32]
        combined = torch.cat([text_rep, ctx_rep], dim=1)  # [B, pooled_dim + 32]

        logits = self.classifier(combined)
        return logits


# ============================================================================
# ARCHITECTURE 2: FastText-style Bag of N-grams
# ============================================================================
class FastTextIntentClassifier(nn.Module):
    def __init__(
        self,
        hash_size: int = 8192,
        embedding_dim: int = 64,
        num_classes: int = len(LABELS),
        context_dim: int = 1 + len(CONTEXT_LAST_INTENTS),
        dropout: float = 0.2,
    ):
        super().__init__()
        self.embedding = nn.Embedding(hash_size, embedding_dim, padding_idx=0)
        self.context_proj = nn.Sequential(
            nn.Linear(context_dim, 32),
            nn.GELU(),
        )
        self.classifier = nn.Sequential(
            nn.Linear(embedding_dim + 32, 64),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(64, num_classes),
        )
        self.temperature = nn.Parameter(torch.ones(1), requires_grad=False)

    def forward(self, input_ids: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        # Modulo hashing into hash_size
        hashed_ids = torch.remainder(input_ids, 8191) + 1
        mask = (input_ids == 0)
        hashed_ids = hashed_ids.masked_fill(mask, 0)

        emb = self.embedding(hashed_ids)  # [B, L, D]
        # Mean pooling ignoring padding
        mask_f = (~mask).unsqueeze(-1).float()
        text_rep = (emb * mask_f).sum(dim=1) / mask_f.sum(dim=1).clamp(min=1.0)

        ctx_rep = self.context_proj(context)  # [B, 32]
        combined = torch.cat([text_rep, ctx_rep], dim=1)
        logits = self.classifier(combined)
        return logits


# ============================================================================
# ARCHITECTURE 3: Tiny Transformer Encoder (2 Layers)
# ============================================================================
class TinyEncoderIntentClassifier(nn.Module):
    def __init__(
        self,
        vocab_size: int = 256,
        max_length: int = 128,
        embedding_dim: int = 64,
        num_heads: int = 4,
        num_layers: int = 2,
        dim_feedforward: int = 128,
        num_classes: int = len(LABELS),
        context_dim: int = 1 + len(CONTEXT_LAST_INTENTS),
        dropout: float = 0.1,
    ):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embedding_dim, padding_idx=0)
        self.pos_embedding = nn.Embedding(max_length, embedding_dim)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=embedding_dim,
            nhead=num_heads,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            activation="gelu",
            batch_first=True,
            norm_first=True,
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.context_proj = nn.Sequential(
            nn.Linear(context_dim, 32),
            nn.GELU(),
        )
        self.classifier = nn.Sequential(
            nn.Linear(embedding_dim + 32, 64),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(64, num_classes),
        )
        self.temperature = nn.Parameter(torch.ones(1), requires_grad=False)

    def forward(self, input_ids: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        B, L = input_ids.shape
        positions = torch.arange(L, device=input_ids.device).unsqueeze(0).expand(B, -1)
        x = self.embedding(input_ids) + self.pos_embedding(positions)
        
        # Padding mask
        src_key_padding_mask = (input_ids == 0)
        out = self.encoder(x, src_key_padding_mask=src_key_padding_mask)
        
        # Mean pooling ignoring padding
        mask_expanded = (~src_key_padding_mask).unsqueeze(-1).float()
        text_rep = (out * mask_expanded).sum(dim=1) / mask_expanded.sum(dim=1).clamp(min=1.0)

        ctx_rep = self.context_proj(context)
        combined = torch.cat([text_rep, ctx_rep], dim=1)
        logits = self.classifier(combined)
        return logits


# ============================================================================
# Inference Engine & Full Decision Policy
# ============================================================================
class IntentClassifierPipeline:
    def __init__(self, model: nn.Module, tokenizer: CharTokenizer, device: str = "cpu"):
        self.model = model.to(device)
        self.tokenizer = tokenizer
        self.device = device
        self.model.eval()

    def predict(
        self,
        text: str,
        selected_flight_present: bool = False,
        last_intent: str = "none",
    ) -> Dict[str, Any]:
        """Runs the full Level 2 inference policy:
          1. Safety / emergency pre-filter
          2. Neural inference with temperature scaling
          3. Margin calculation and top-3 candidate ranking
          4. Per-tool confidence and margin gating
          5. Multi-intent secondary extraction
        """
        # 1. Pre-filter safety
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

        # 2. Neural forward
        input_ids = self.tokenizer.encode_batch([text]).to(self.device)
        context = encode_context(selected_flight_present, last_intent).unsqueeze(0).to(self.device)

        with torch.no_grad():
            raw_logits = self.model(input_ids, context)
            temp = max(float(self.model.temperature.item()), 0.01)
            probs = F.softmax(raw_logits / temp, dim=-1).squeeze(0).cpu().tolist()

        # Ranked classes
        ranked = sorted(enumerate(probs), key=lambda x: x[1], reverse=True)
        top1_idx, top1_prob = ranked[0]
        top2_idx, top2_prob = ranked[1]
        top1_label = ID2LABEL[top1_idx]
        top2_label = ID2LABEL[top2_idx]
        margin = top1_prob - top2_prob

        top3 = [
            {"label": ID2LABEL[idx], "score": round(p, 4)}
            for idx, p in ranked[:3]
        ]

        # 3. Check multi-intent
        secondary_intent = None
        has_conjunction = bool(MULTI_INTENT_CONJUNCTIONS.search(text))
        if has_conjunction and top2_label not in ("none", "clarify") and top2_prob >= 0.20:
            secondary_intent = top2_label

        # 4. Gating based on per-tool thresholds
        cfg = PER_TOOL_THRESHOLDS.get(top1_label, {"confidence": 0.65, "margin": 0.12})
        threshold_conf = cfg["confidence"]
        threshold_margin = cfg["margin"]

        action = "execute"
        final_label = top1_label
        reason = f"Accepted: {top1_label} (conf={top1_prob:.2f}, margin={margin:.2f})"

        if top1_label in ("none", "clarify"):
            action = top1_label
            reason = f"Direct routing: {top1_label} (conf={top1_prob:.2f})"
        elif top1_prob < threshold_conf or margin < threshold_margin:
            # Low confidence or narrow margin
            # If confusion is between flight tools (e.g. details vs gate), trigger clarify
            flight_tools = {"get_flight_details", "get_gate", "get_time_remaining", "get_live_tracking"}
            if top1_label in flight_tools and top2_label in flight_tools:
                action = "clarify"
                final_label = "clarify"
                reason = f"Gated: Ambiguous between {top1_label} ({top1_prob:.2f}) and {top2_label} ({top2_prob:.2f})"
            else:
                action = "none"
                final_label = "none"
                reason = f"Gated: Below threshold (conf={top1_prob:.2f} < {threshold_conf}, margin={margin:.2f} < {threshold_margin})"
        else:
            reason = f"Accepted: {top1_label} (conf={top1_prob:.2f}, margin={margin:.2f})"

        return {
            "label": final_label,
            "action": action,
            "confidence": round(top1_prob, 4),
            "margin": round(margin, 4),
            "top3": top3,
            "secondary_intent": secondary_intent,
            "reason": reason,
            "safe": True,
        }
