# Tier 2 Romanian robustness training — 2026-10-31

## Frozen evaluation

`eval/ro-human-stress-500.json` is held out. It was never added to either training corpus. The v2/v3 builder rejects samples with a normalized 4-gram Jaccard similarity of 0.35 or greater against this benchmark.

Both training corpora passed:

- train/validation/test exact overlap: 0;
- maximum train/test 4-gram Jaccard: 0.3333;
- maximum train/frozen-benchmark 4-gram Jaccard: 0.2727.

## Corpus

The generated robustness corpus adds 6,000 training and 1,200 validation utterances to the legacy clean training data. It focuses on Romanian slang, missing diacritics, typos, profanity, terse prompts, CAPS, filler words and airport-specific intent boundaries.

| Label | Train additions | Validation additions |
|---|---:|---:|
| `none` | 1,200 | 240 |
| `clarify` | 800 | 160 |
| `get_time_remaining` | 800 | 160 |
| `get_live_tracking` | 800 | 160 |
| `get_gate` | 700 | 140 |
| `get_flight_details` | 700 | 140 |
| `search_knowledge` | 600 | 120 |
| `open_airport_map` | 400 | 80 |

The builder supports balanced selected-flight and last-intent contexts. It produces `data_v3/`; corpora and model artifacts are intentionally local-only.

## Candidates

| Candidate | Frozen Romanian stress | False executions | Legacy test 925 | Legacy false executions | Decision |
|---|---:|---:|---:|---:|---|
| Existing Char-CNN | 34.8% | 18 | 90.27% | 15 | Current baseline |
| Robust v2 Char-CNN | 55.8% | 16 | 89.84% | 31 | Rejected |
| Robust v2 Tiny Encoder | validation 55.76% | n/a | n/a | n/a | Rejected |
| Robust v3 Char-CNN | 65.8% | 9 | 88.32% | 28 | Rejected |
| Robust v4 Char-CNN + rejection boost | 62.6% | 6 | not promoted | not promoted | Rejected |
| Robust v3 + deterministic capability gate | 69.8% | 0 | not re-scored | not re-scored | Tier-2 evaluation candidate |

All Char-CNN ONNX INT8 exports were 0.477 MB with numerical parity within `4e-06` of PyTorch. The v3 CPU median was 0.428 ms; iPhone performance remains unmeasured.

## Finding

The robust data improves the held-out Romanian benchmark, especially gate, time-remaining, tracking, slang and typo prompts. It still reduces performance on the legacy test and does not meet the zero-false-execution acceptance gate. The next candidate should use a Romanian-pretrained encoder or distillation target, then repeat the same frozen evaluation.

## V4 rejection experiment

V4 added airport-adjacent out-of-domain requests (check-in, taxi, Wi-Fi, booking,
seat changes and upgrades) and ambiguity families, with a larger `none`/`clarify`
split. It passed the same leakage checks: zero exact split overlap and maximum frozen
benchmark/train 4-gram Jaccard 0.3333.

The raw candidate reduced Romanian-stress false executions from 9 to 6, but its
accuracy fell from 65.8% to 62.6%. A global confidence gate was selected only from
the 2,365-row validation split plus 45 web-calibration cases. Its most conservative
setting (0.95 confidence) reached zero false executions on the frozen stress set,
but resolved only 7.6% of requests; it is not useful as a production Tier 2.

Decision: do not replace the existing Tier-2 candidate and do not integrate V4 into
the mobile execution path. FastPath and the existing guarded model path remain the
only runtime paths until a candidate meets both safety and coverage gates.

### Deterministic capability boundary

The classifier safety prefilter now refuses requests FlyQ cannot perform:
performing check-in, purchases, bookings, cancellations, seat changes, payments,
Wi-Fi passwords and upgrades. It does not reject factual questions about
check-in or documents. It also rejects general chitchat (jokes, poems, weather)
even where the sentence includes airport context. This is an explicit
product-capability boundary, not a learned response or an invented fact.

On the frozen Romanian stress suite, applying this boundary before the existing
v3 classifier produced 69.8% accuracy and zero false executions (PC median
0.347 ms). It is a Tier-2 evaluation candidate only: it still needs a mobile
ONNX runtime integration and a full hybrid evaluation before release.

## RoBaseLM encoder comparison

Both official Romanian models were tested as frozen GGUF encoders with the same
small logistic head, trained on the existing v3 training split and evaluated on the
frozen 500-case Romanian stress benchmark. They were not tested as chat/tool models.

| Encoder | Quantized size | Accuracy | False executions | PC embedding median |
|---|---:|---:|---:|---:|
| RoBaseLM-S 125M Q5_K_M | 89.1 MiB | 65.8% | 17 | 29.14 ms |
| RoBaseLM-M 260M Q5_K_M | 208.1 MiB | 62.8% | 17 | 38.56 ms |

Neither meets the safety gate; M is also larger and slower than S. Neither is a
mobile Tier-2 candidate for FlyQ in its current form.
