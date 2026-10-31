import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from make_dataset_06b_v2 import compact_decision, rewrite_prompt


class DatasetV2Tests(unittest.TestCase):
    def test_rewrites_tool_call_to_compact_json(self):
        row = {
            "id": "x",
            "kind": "tool_call",
            "completion": '<tool_call>\n{"name":"get_gate","arguments":{}}\n</tool_call>',
        }
        self.assertEqual(compact_decision(row), '{"name":"get_gate","arguments":{}}')

    def test_rewrites_no_tool_to_none(self):
        self.assertEqual(
            compact_decision({"id": "x", "kind": "no_tool", "completion": "Salut!"}),
            '{"name":"none","arguments":{}}',
        )

    def test_removes_thinking_and_xml_instruction(self):
        prompt = (
            "<|im_start|>system\nFor each function call, return a json object within "
            "<tool_call></tool_call> XML tags:\n<tool_call>\n{}\n</tool_call><|im_end|>\n"
            "<|im_start|>user\nPoarta?<|im_end|>\n"
            "<|im_start|>assistant\n<think>\n\n</think>\n\n"
        )
        rewritten = rewrite_prompt(prompt)
        self.assertNotIn("<think>", rewritten)
        self.assertNotIn("<tool_call>", rewritten)
        self.assertTrue(rewritten.endswith("<|im_start|>assistant\n"))
        self.assertIn("compact JSON", rewritten)


if __name__ == "__main__":
    unittest.main()
