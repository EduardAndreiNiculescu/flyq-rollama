"""Run: python -I finetune/test_openai_compat.py   (no GPU, no dependencies)"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from openai_compat import completion_response, parse_tool_calls, to_template_messages  # noqa: E402


def test_parse_single_call():
    text = '<tool_call>\n{"name": "get_gate", "arguments": {}}\n</tool_call>'
    content, calls = parse_tool_calls(text)
    assert content == ""
    assert calls[0]["function"]["name"] == "get_gate"
    assert json.loads(calls[0]["function"]["arguments"]) == {}


def test_parse_multiple_calls_and_text_and_think():
    text = ('<think>\n\n</think>\nChecking.\n<tool_call>\n{"name": "search_knowledge", "arguments": {"query": "bagaj pierdut"}}\n</tool_call>'
            '\n<tool_call>\n{"name": "open_airport_map", "arguments": {"destination": "toaleta"}}\n</tool_call>')
    content, calls = parse_tool_calls(text)
    assert content == "Checking."
    assert [c["function"]["name"] for c in calls] == ["search_knowledge", "open_airport_map"]
    assert json.loads(calls[0]["function"]["arguments"]) == {"query": "bagaj pierdut"}
    assert calls[0]["id"] != calls[1]["id"]


def test_malformed_calls_are_ignored_not_crashing():
    for bad in ['<tool_call>{not json}</tool_call>', '<tool_call>{"arguments": {}}</tool_call>', '<tool_call>{"name": 5}</tool_call>', "plain text"]:
        content, calls = parse_tool_calls(bad)
        assert calls == [], bad


def test_string_arguments_pass_through():
    _, calls = parse_tool_calls('<tool_call>{"name": "x", "arguments": "{\\"a\\": 1}"}</tool_call>')
    assert calls[0]["function"]["arguments"] == '{"a": 1}'


def test_template_messages_convert_string_arguments_to_dicts():
    msgs = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": None, "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "get_gate", "arguments": '{"flightNumber": "DEMO123"}'}}]},
        {"role": "tool", "tool_call_id": "c1", "content": "{}"},
    ]
    out = to_template_messages(msgs)
    assert out[1]["tool_calls"][0]["function"]["arguments"] == {"flightNumber": "DEMO123"}
    assert out[1]["content"] == ""
    assert msgs[1]["tool_calls"][0]["function"]["arguments"] == '{"flightNumber": "DEMO123"}'  # input not mutated


def test_invalid_argument_json_becomes_empty_dict():
    msgs = [{"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "x", "arguments": "{oops"}}]}]
    assert to_template_messages(msgs)[0]["tool_calls"][0]["function"]["arguments"] == {}


def test_response_shape():
    r = completion_response("base", "", [{"id": "c", "type": "function", "function": {"name": "n", "arguments": "{}"}}], 7)
    assert r["choices"][0]["message"]["content"] is None
    assert r["choices"][0]["finish_reason"] == "tool_calls"
    r2 = completion_response("base", "hello", [], 3)
    assert r2["choices"][0]["message"] == {"role": "assistant", "content": "hello"}
    assert r2["choices"][0]["finish_reason"] == "stop"


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("ok", t.__name__)
    print(f"{len(tests)} passed")
