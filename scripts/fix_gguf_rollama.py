"""Repairs the RoLlama GGUF so that llama.cpp (llama.rn on iPhone) can run it.

What was wrong with finetune/merge_and_quantize.py's output, found from the iPhone's console and Ollama's load log:
  1. The 33 normalisation weights (attn_norm, ffn_norm, output_norm) are stored as F16. llama.cpp multiplies them with F32 activations and
     aborts: "binary_op: unsupported types: dst: f32, src0: f32, src1: f16" -> SIGABRT when the model loads.
  3. The Q and K projection matrices are not permuted the way llama.cpp expects (the standard converter does it; this exporter writes its own
     GGUF). Without it attention is wrong and the model answers with noise (0 valid JSON of 70 questions in a llama.cpp run).
  2. The Llama 3.2 RoPE settings are missing: llama.rope.freq_base (500000), llama.rope.dimension_count, and the rope_freqs.weight tensor
     (llama3 scaling). Without them llama.cpp falls back to freq_base 10000 and the model answers badly.

Usage:
  python scripts/fix_gguf_rollama.py <in.gguf> <out.gguf>
It copies every key and tensor, converts the 1-D F16 norm tensors to F32, and adds what is missing. Quantised tensors are copied byte for byte.
"""
import math
import sys

import numpy as np
from gguf import GGUFReader, GGUFWriter, GGMLQuantizationType, GGUFValueType

# Llama 3.2 1B: rope_theta 500000, rope_scaling = llama3 (factor 32, low 1, high 4, original 8192), head_dim 64.
ROPE_BASE, FACTOR, LOW, HIGH, ORIG = 500000.0, 32.0, 1.0, 4.0, 8192
HEAD_DIM = 64
N_HEAD, N_HEAD_KV = 32, 8  # Llama 3.2 1B


def rope_factors() -> np.ndarray:
    """The values convert_hf_to_gguf.py stores in rope_freqs.weight for llama3 scaling."""
    freqs = 1.0 / (ROPE_BASE ** (np.arange(0, HEAD_DIM, 2, dtype=np.float64) / HEAD_DIM))
    low_wavelen, high_wavelen = ORIG / LOW, ORIG / HIGH
    out = []
    for f in freqs:
        wavelen = 2 * math.pi / f
        if wavelen < high_wavelen:
            out.append(1.0)
        elif wavelen > low_wavelen:
            out.append(FACTOR)
        else:
            smooth = (ORIG / wavelen - LOW) / (HIGH - LOW)
            out.append(1.0 / ((1 - smooth) / FACTOR + smooth))
    return np.array(out, dtype=np.float32)


def field_value(field):
    return field.contents() if hasattr(field, "contents") else None


def main(src: str, dst: str) -> None:
    r = GGUFReader(src)
    arch = field_value(r.fields["general.architecture"])
    w = GGUFWriter(dst, arch)

    have = set(r.fields.keys())
    for name, field in r.fields.items():
        if name.startswith("GGUF.") or name in ("general.architecture", "general.alignment"):
            continue
        t = field.types[0]
        sub = field.types[-1] if t == GGUFValueType.ARRAY else None
        w.add_key_value(name, field_value(field), t, sub_type=sub)

    added = []
    if f"{arch}.rope.freq_base" not in have:
        w.add_float32(f"{arch}.rope.freq_base", ROPE_BASE)
        added.append("rope.freq_base")
    if f"{arch}.rope.dimension_count" not in have:
        w.add_uint32(f"{arch}.rope.dimension_count", HEAD_DIM)
        added.append("rope.dimension_count")
    if f"{arch}.vocab_size" not in have:
        w.add_uint32(f"{arch}.vocab_size", 128256)
        added.append("vocab_size")
    for k in ("attention.key_length", "attention.value_length"):
        if f"{arch}.{k}" not in have:
            w.add_uint32(f"{arch}.{k}", HEAD_DIM)
            added.append(k)

    converted = 0
    permuted = 0
    names = set()
    for t in r.tensors:
        names.add(t.name)
        if len(t.shape) == 1 and t.tensor_type == GGMLQuantizationType.F16:
            w.add_tensor(t.name, np.asarray(t.data, dtype=np.float32))  # norm weights must be F32
            converted += 1
        elif t.tensor_type in (GGMLQuantizationType.F32, GGMLQuantizationType.F16):
            w.add_tensor(t.name, np.asarray(t.data))
        else:
            data = t.data
            nh = N_HEAD if t.name.endswith("attn_q.weight") else N_HEAD_KV if t.name.endswith("attn_k.weight") else 0
            if nh:
                # llama.cpp stores Q and K with the rotary pairs interleaved; Hugging Face weights use rotate_half. convert_hf_to_gguf.py permutes them.
                # Rows of a quantised matrix are independent blocks, so permuting the rows of the Q4_0 bytes is the same as permuting the weights.
                d = np.asarray(data)
                data = d.reshape(nh, 2, d.shape[0] // nh // 2, d.shape[1]).swapaxes(1, 2).reshape(d.shape)
                permuted += 1
            w.add_tensor(t.name, data, raw_dtype=t.tensor_type)  # the writer turns the byte shape of the reader's data into the element shape
    if "rope_freqs.weight" not in names:
        w.add_tensor("rope_freqs.weight", rope_factors())
        added.append("rope_freqs.weight")

    w.write_header_to_file()
    w.write_kv_data_to_file()
    w.write_tensors_to_file(progress=False)
    w.close()
    print(f"norm tensors converted F16->F32: {converted}; Q/K matrices permuted: {permuted}; added: {', '.join(added) or 'nothing'}")

    # Check what was written.
    r2 = GGUFReader(dst)
    kinds = {}
    for t in r2.tensors:
        kinds[t.tensor_type.name] = kinds.get(t.tensor_type.name, 0) + 1
    print("tensors in the new file:", dict(sorted(kinds.items())), "| total", len(r2.tensors))
    assert not any(len(t.shape) == 1 and t.tensor_type == GGMLQuantizationType.F16 for t in r2.tensors), "an F16 1-D tensor is left"
    assert any(t.name == "rope_freqs.weight" for t in r2.tensors), "rope_freqs.weight missing"


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
