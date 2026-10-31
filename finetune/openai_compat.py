"""Pure helpers for the OpenAI-compatible endpoint of chat_server.py (no torch, unit-testable).

Qwen3's chat template renders tool calls as
    <tool_call>\n{"name": "...", "arguments": {...}}\n</tool_call>
and expects assistant `tool_calls[].function.arguments` as a dict, while OpenAI clients send a JSON string.
"""
import json
import re

TOOL_CALL_RE = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.DOTALL)
THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def parse_tool_calls(text: str):
    """Return (content_without_tool_calls, [openai tool_call dicts]). Malformed blocks are ignored."""
    calls = []
    for i, m in enumerate(TOOL_CALL_RE.finditer(text)):
        try:
            obj = json.loads(m.group(1))
            name = obj["name"]
            args = obj.get("arguments", {})
            if not isinstance(name, str):
                continue
            calls.append({
                "id": f"call_{i}",
                "type": "function",
                "function": {"name": name, "arguments": args if isinstance(args, str) else json.dumps(args, ensure_ascii=False)},
            })
        except (json.JSONDecodeError, KeyError, TypeError):
            continue
    content = THINK_RE.sub("", TOOL_CALL_RE.sub("", text)).strip()
    return content, calls


def to_template_messages(messages):
    """Convert OpenAI-style messages into what Qwen3's chat template expects."""
    out = []
    for m in messages:
        m = dict(m)
        if m.get("content") is None:
            m["content"] = ""
        if m.get("tool_calls"):
            fixed = []
            for c in m["tool_calls"]:
                f = dict(c.get("function", {}))
                a = f.get("arguments")
                if isinstance(a, str):
                    try:
                        f["arguments"] = json.loads(a) if a.strip() else {}
                    except json.JSONDecodeError:
                        f["arguments"] = {}
                fixed.append({**c, "function": f})
            m["tool_calls"] = fixed
        out.append(m)
    return out


def completion_response(model: str, content: str, tool_calls, completion_tokens: int):
    message = {"role": "assistant", "content": content or None}
    if tool_calls:
        message["tool_calls"] = tool_calls
    return {
        "object": "chat.completion",
        "model": model,
        "choices": [{"index": 0, "message": message, "finish_reason": "tool_calls" if tool_calls else "stop"}],
        "usage": {"completion_tokens": completion_tokens},
    }
