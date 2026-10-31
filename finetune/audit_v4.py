import json
import re
import os
from collections import Counter, defaultdict

V4_DIR = "finetune/data/v4"
EVAL_DIR = "eval"

def parse_messages(prompt):
    # Splits <|im_start|>role\ncontent<|im_end|>
    pattern = r"<\|im_start\|>(\w+)\n(.*?)<\|im_end\|>"
    matches = re.findall(pattern, prompt, re.DOTALL)
    messages = []
    for role, content in matches:
        messages.append({"role": role, "content": content.strip()})
    return messages

def normalize_text(text):
    text = text.lower()
    text = re.sub(r"[ăâ]", "a", text)
    text = re.sub(r"[î]", "i", text)
    text = re.sub(r"[șş]", "s", text)
    text = re.sub(r"[țţ]", "t", text)
    text = re.sub(r"[^\w\s]", "", text)
    return " ".join(text.split())

def run_audit():
    splits = ["train", "val", "test"]
    data = {}
    for s in splits:
        p = os.path.join(V4_DIR, f"{s}.jsonl")
        lines = []
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        lines.append(json.loads(line))
        data[s] = lines

    # Load eval
    eval_queries = set()
    p_tc = os.path.join(EVAL_DIR, "tool-cases-v4.json")
    if os.path.exists(p_tc):
        with open(p_tc, "r", encoding="utf-8") as f:
            for tc in json.load(f):
                q = tc.get("question", "")
                if q:
                    eval_queries.add(normalize_text(q))

    p_mc = os.path.join(EVAL_DIR, "multi-cases.json")
    if os.path.exists(p_mc):
        with open(p_mc, "r", encoding="utf-8") as f:
            for mc in json.load(f):
                for t in mc.get("turns", []):
                    u = t.get("user", "")
                    if u:
                        eval_queries.add(normalize_text(u))

    train = data["train"]
    val = data["val"]
    test = data["test"]

    # Basic kinds
    kind_counts = Counter(ex.get("kind") for ex in train)
    lang_counts = Counter(ex.get("lang") for ex in train)
    
    # Conversational analysis: number of user turns
    conversational_count = 0
    multi_tool_count = 0
    tool_calls_extracted = Counter()
    
    # Tool call queries mapping for true conflict analysis
    query_to_tools = defaultdict(set)
    first_user_queries = Counter()

    for ex in train:
        prompt = ex.get("prompt", "")
        msgs = parse_messages(prompt)
        user_msgs = [m["content"] for m in msgs if m["role"] == "user"]
        
        real_user_turns = [u for u in user_msgs if not u.startswith("<tool_response>")]
        if len(real_user_turns) > 1:
            conversational_count += 1
            
        first_q = real_user_turns[0] if real_user_turns else ""
        norm_first_q = normalize_text(first_q)
        first_user_queries[norm_first_q] += 1
        
        compl = ex.get("completion", "")
        # Count tool calls in non-system parts
        calls_in_compl = re.findall(r'<tool_call>\s*\{\s*"name":\s*"([^"]+)"', compl)
        history_prompts = "".join([m["content"] for m in msgs if m["role"] != "system"])
        calls_in_history = re.findall(r'<tool_call>\s*\{\s*"name":\s*"([^"]+)"', history_prompts)
        total_calls = len(calls_in_compl) + len(calls_in_history)
        if total_calls > 1:
            multi_tool_count += 1
            
        if ex.get("kind") == "tool_call":
            m = re.search(r'"name":\s*"([^"]+)"', compl)
            if m:
                tool_name = m.group(1)
                tool_calls_extracted[tool_name] += 1
                query_to_tools[norm_first_q].add(tool_name)
        elif ex.get("kind") == "no_tool":
            query_to_tools[norm_first_q].add("NO_TOOL")

    # True conflicts: same first question mapped to different tools
    true_conflicts = {q: list(tools) for q, tools in query_to_tools.items() if len(tools) > 1 and q}

    # Leakage
    val_first_q = set()
    for ex in val:
        msgs = parse_messages(ex.get("prompt", ""))
        users = [m["content"] for m in msgs if m["role"] == "user" and not m["content"].startswith("<tool_response>")]
        if users:
            val_first_q.add(normalize_text(users[0]))

    test_first_q = set()
    for ex in test:
        msgs = parse_messages(ex.get("prompt", ""))
        users = [m["content"] for m in msgs if m["role"] == "user" and not m["content"].startswith("<tool_response>")]
        if users:
            test_first_q.add(normalize_text(users[0]))

    leak_val = set()
    leak_test = set()
    leak_eval = set()

    for q in first_user_queries:
        if not q:
            continue
        if q in val_first_q:
            leak_val.add(q)
        if q in test_first_q:
            leak_test.add(q)
        if q in eval_queries:
            leak_eval.add(q)

    audit_summary = {
        "counts": {
            "train": len(train),
            "val": len(val),
            "test": len(test)
        },
        "kinds": dict(kind_counts),
        "languages": dict(lang_counts),
        "conversational_examples": conversational_count,
        "multi_tool_examples": multi_tool_count,
        "tools_in_tool_calls": dict(tool_calls_extracted),
        "true_conflicts_count": len(true_conflicts),
        "sample_true_conflicts": list(true_conflicts.items())[:5],
        "leakage": {
            "train_val_overlap": len(leak_val),
            "train_test_overlap": len(leak_test),
            "train_eval_overlap": len(leak_eval)
        },
        "sample_eval_overlap": list(leak_eval)[:5]
    }
    
    print(json.dumps(audit_summary, indent=2, ensure_ascii=False))
    return audit_summary

if __name__ == "__main__":
    run_audit()
