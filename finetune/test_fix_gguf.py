"""Tests the GGUF repair on a tiny synthetic file: F16 norms become F32, Q/K rows are permuted once, RoPE factors and the repair marker appear,
and a second repair is refused (it would permute Q/K again). Run: python -m unittest finetune.test_fix_gguf  (needs numpy and gguf)."""
import gc
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import gguf
import gguf.quants as gquants
from gguf import GGUFReader, GGUFWriter, GGMLQuantizationType

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fix_gguf_rollama import REPAIRED_KEY, repair  # noqa: E402


def tiny_raw(path: Path) -> np.ndarray:
    w = GGUFWriter(str(path), "llama")
    w.add_block_count(1)
    q = gquants.quantize(np.random.default_rng(1).random((64, 64), dtype=np.float32), GGMLQuantizationType.Q4_0)
    w.add_tensor("blk.0.attn_q.weight", q, raw_dtype=GGMLQuantizationType.Q4_0)
    w.add_tensor("blk.0.attn_norm.weight", np.ones(64, dtype=np.float16))  # the exporter's mistake: F16 norm
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()
    return q


class RepairGguf(unittest.TestCase):
    def test_repair(self):
        # ignore_cleanup_errors: on Windows GGUFReader keeps the file memory-mapped until it is collected
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as d:
            raw, fixed, again = Path(d) / "raw.gguf", Path(d) / "fixed.gguf", Path(d) / "again.gguf"
            tiny_raw(raw)
            before = {t.name: np.asarray(t.data).copy() for t in GGUFReader(str(raw)).tensors}
            repair(str(raw), str(fixed))
            r = GGUFReader(str(fixed))
            after = {t.name: t for t in r.tensors}
            self.assertEqual(after["blk.0.attn_norm.weight"].tensor_type, GGMLQuantizationType.F32)
            self.assertIn("rope_freqs.weight", after)
            self.assertIn(REPAIRED_KEY, r.fields)
            d0 = before["blk.0.attn_q.weight"]
            expected = d0.reshape(32, 2, d0.shape[0] // 32 // 2, d0.shape[1]).swapaxes(1, 2).reshape(d0.shape)
            np.testing.assert_array_equal(np.asarray(after["blk.0.attn_q.weight"].data), expected)
            with self.assertRaises(ValueError):
                repair(str(fixed), str(again))
            del r, after, before
            gc.collect()


if __name__ == "__main__":
    unittest.main()
