"""
Comprehensive test suite for FlightFlow 0.6B Distilled Dataset.
Verifies all 7 validation gates required by the specification.
"""

import json
import re
import unittest
from pathlib import Path

from make_dataset_06b import (
    CJK_PATTERN,
    FLIGHT_RE,
    GATE_RE,
    KNOWN_TOOLS,
    NEGATION_EN,
    NEGATION_RO,
    TIME_RE,
    collect_benchmark_leak_queries,
    normalize_text,
    parse_messages,
    validate_tool_call,
)

DATA_DIR = Path(__file__).resolve().parent / "data" / "06b"


class TestDataset06b(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.train_file = DATA_DIR / "train.jsonl"
        cls.val_file = DATA_DIR / "val.jsonl"
        cls.test_file = DATA_DIR / "test.jsonl"
        cls.report_file = DATA_DIR / "report.json"

        assert cls.train_file.exists(), f"Missing {cls.train_file}"
        assert cls.val_file.exists(), f"Missing {cls.val_file}"
        assert cls.test_file.exists(), f"Missing {cls.test_file}"
        assert cls.report_file.exists(), f"Missing {cls.report_file}"

        with open(cls.train_file, "r", encoding="utf-8") as f:
            cls.train = [json.loads(line) for line in f if line.strip()]
        with open(cls.val_file, "r", encoding="utf-8") as f:
            cls.val = [json.loads(line) for line in f if line.strip()]
        with open(cls.test_file, "r", encoding="utf-8") as f:
            cls.test = [json.loads(line) for line in f if line.strip()]

    def test_1_reproducibility(self):
        """Verifies report metadata matches exact record counts."""
        with open(self.report_file, "r", encoding="utf-8") as f:
            rep = json.load(f)
        self.assertEqual(len(self.train), rep["counts"]["train_accepted"])
        self.assertEqual(len(self.val), rep["counts"]["val"])
        self.assertEqual(len(self.test), rep["counts"]["test"])
        self.assertTrue(rep["gates_status"]["deterministic_reproducible"])

    def test_2_tool_and_arg_preservation(self):
        """All tool calls must use known tools and valid arguments."""
        for ex in self.train:
            if ex.get("kind") == "tool_call":
                ok, reason, name, args = validate_tool_call(ex.get("completion", ""))
                self.assertTrue(ok, f"Failed on {ex.get('id')}: {reason}")
                self.assertIn(name, KNOWN_TOOLS)
                # Ensure arguments match allowed schema
                allowed = KNOWN_TOOLS[name]["allowed"]
                for k in args:
                    self.assertIn(k, allowed, f"Disallowed arg {k} in {name}")

    def test_3_zero_leakage(self):
        """Zero overlap between train queries and benchmarks or val/test."""
        bench_leaks = collect_benchmark_leak_queries()
        val_queries = set()
        for ex in self.val:
            msgs = parse_messages(ex.get("prompt", ""))
            users = [m["content"] for m in msgs if m["role"] == "user" and not m["content"].startswith("<tool_response>")]
            if users:
                val_queries.add(normalize_text(users[-1]))

        test_queries = set()
        for ex in self.test:
            msgs = parse_messages(ex.get("prompt", ""))
            users = [m["content"] for m in msgs if m["role"] == "user" and not m["content"].startswith("<tool_response>")]
            if users:
                test_queries.add(normalize_text(users[-1]))

        for ex in self.train:
            msgs = parse_messages(ex.get("prompt", ""))
            users = [m["content"] for m in msgs if m["role"] == "user" and not m["content"].startswith("<tool_response>")]
            if users:
                q = normalize_text(users[-1])
                self.assertNotIn(q, bench_leaks, f"Train query leaked into benchmarks: {q}")
                self.assertNotIn(q, val_queries, f"Train query leaked into val: {q}")
                self.assertNotIn(q, test_queries, f"Train query leaked into test: {q}")

    def test_4_zero_invalid_labels(self):
        """All examples must have valid split, kind, and non-empty completions."""
        valid_kinds = {"tool_call", "final", "no_tool"}
        for ex in self.train:
            self.assertIn(ex.get("kind"), valid_kinds)
            self.assertTrue(ex.get("completion", "").strip())
            self.assertEqual(ex.get("split"), "train")

    def test_5_protected_numbers_and_codes(self):
        """Variations of examples must strictly preserve flight numbers, times, gates, and negations from the base example."""
        train_map = {ex["id"]: ex for ex in self.train}
        for ex in self.train:
            ex_id = ex.get("id", "")
            if "-diac" in ex_id or "-typo" in ex_id or "-poly" in ex_id:
                # Extract base_id
                base_id = ex_id.rsplit("-", 1)[0]
                base_ex = train_map.get(base_id)
                if not base_ex:
                    continue
                
                base_msgs = parse_messages(base_ex.get("prompt", ""))
                var_msgs = parse_messages(ex.get("prompt", ""))
                base_user = base_msgs[-1]["content"] if base_msgs else ""
                var_user = var_msgs[-1]["content"] if var_msgs else ""

                # Flight number preservation
                base_flights = set(FLIGHT_RE.findall(base_user))
                var_flights = set(FLIGHT_RE.findall(var_user))
                self.assertEqual(base_flights, var_flights, f"Flight numbers corrupted in {ex_id}")

                # Time preservation
                base_times = set(TIME_RE.findall(base_user))
                var_times = set(TIME_RE.findall(var_user))
                self.assertEqual(base_times, var_times, f"Times corrupted in {ex_id}")

                # Gate preservation
                base_gates = set(GATE_RE.findall(base_user))
                var_gates = set(GATE_RE.findall(var_user))
                self.assertEqual(base_gates, var_gates, f"Gates corrupted in {ex_id}")

                # Negation preservation
                base_has_neg = bool(NEGATION_RO.search(base_user) or NEGATION_EN.search(base_user))
                if base_has_neg:
                    var_has_neg = bool(NEGATION_RO.search(var_user) or NEGATION_EN.search(var_user))
                    self.assertTrue(var_has_neg, f"Negation lost in variation: {ex_id}")

    def test_6_rejection_of_cjk_and_invalid_json(self):
        """No CJK characters allowed anywhere in the dataset."""
        for split_name, dataset in [("train", self.train), ("val", self.val), ("test", self.test)]:
            for ex in dataset:
                self.assertFalse(
                    bool(CJK_PATTERN.search(ex.get("prompt", ""))),
                    f"CJK in {split_name} prompt: {ex.get('id')}"
                )
                self.assertFalse(
                    bool(CJK_PATTERN.search(ex.get("completion", ""))),
                    f"CJK in {split_name} completion: {ex.get('id')}"
                )

    def test_7_train_val_test_separation(self):
        """Train, val, test must have completely disjoint ID sets."""
        train_ids = set(ex["id"] for ex in self.train)
        val_ids = set(ex["id"] for ex in self.val)
        test_ids = set(ex["id"] for ex in self.test)

        self.assertEqual(len(train_ids.intersection(val_ids)), 0)
        self.assertEqual(len(train_ids.intersection(test_ids)), 0)
        self.assertEqual(len(val_ids.intersection(test_ids)), 0)


if __name__ == "__main__":
    unittest.main()
