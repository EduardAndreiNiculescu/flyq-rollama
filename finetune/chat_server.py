"""Local test chat: base Qwen3-4B vs the fine-tuned LoRA adapter, side by side.

    python finetune/chat_server.py [--adapter finetune/out/adapter] [--port 18081]

Opens a page on http://127.0.0.1:18081 (local only). Desktop CUDA inference for TESTING the
adapter; it is NOT the on-device iPhone inference.
"""
import argparse
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows consoles are cp1252; Romanian diacritics would crash print()
for _s in (sys.stdout, sys.stderr):  # Windows console is cp1252: Romanian diacritics would crash print()
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
sys.path.insert(0, os.path.dirname(__file__))
import torch
from openai_compat import completion_response, parse_tool_calls, to_template_messages
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

p = argparse.ArgumentParser()
p.add_argument("--base", default="Qwen/Qwen3-4B")
p.add_argument("--adapter", default="finetune/out/adapter")
p.add_argument("--port", type=int, default=18081)
a = p.parse_args()

SYS = ("You are FlightFlow, an offline travel assistant for airport passengers. Be concise and calm. "
       "Reply in the user's language. Use ONLY the provided facts; if a fact is missing say you do not have it offline. "
       "Never invent gates, flight status, baggage allowances, compensation eligibility or legal requirements. "
       "You are not an airline employee, lawyer or border official. /no_think")
DEMO = ("FLIGHT FACTS:\nflight: DEMO123 CRA->BGY\nscheduled departure: 2026-10-31T12:45:00+02:00\n"
        "scheduled arrival: 2026-10-31T14:10:00+01:00\ngate: UNKNOWN (unconfirmed)\n"
        "data source: demo (FICTIONAL demo data)\nscheduled duration: 2h 25min\nstatus: NOT AVAILABLE offline")

tok = AutoTokenizer.from_pretrained(a.base)
base = AutoModelForCausalLM.from_pretrained(
    a.base, device_map={"": 0}, dtype=torch.bfloat16,
    quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                                           bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.bfloat16))
model = PeftModel.from_pretrained(base, a.adapter).eval()
print("model ready", flush=True)


def generate(question, use_adapter, facts):
    system = SYS + ("\n" + DEMO if facts else "")
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": question}]
    ids = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt",
                                  return_dict=True, enable_thinking=False).to(model.device)
    t0 = time.time()
    kw = dict(max_new_tokens=300, do_sample=True, temperature=0.7, top_p=0.8, top_k=20)
    with torch.no_grad():
        if use_adapter:
            out = model.generate(**ids, **kw)
        else:
            with model.disable_adapter():
                out = model.generate(**ids, **kw)
    new = out[0][ids["input_ids"].shape[1]:]
    return tok.decode(new, skip_special_tokens=True).strip(), time.time() - t0, len(new)


GEN_LOCK = threading.Lock()


def complete(messages, tools, use_adapter, max_new_tokens=300, temperature=0.7, top_p=0.8):
    """OpenAI-style completion. use_adapter=False runs the untouched base weights (adapter disabled)."""
    kw = {"tools": tools} if tools else {}
    ids = tok.apply_chat_template(to_template_messages(messages), add_generation_prompt=True, return_tensors="pt",
                                  return_dict=True, enable_thinking=False, **kw).to(model.device)
    gen = dict(max_new_tokens=max_new_tokens, do_sample=temperature > 0, top_k=20)
    if temperature > 0:
        gen.update(temperature=temperature, top_p=top_p)
    with GEN_LOCK, torch.no_grad():
        if use_adapter:
            out = model.generate(**ids, **gen)
        else:
            with model.disable_adapter():
                out = model.generate(**ids, **gen)
    new = out[0][ids["input_ids"].shape[1]:]
    return tok.decode(new, skip_special_tokens=False).replace("<|im_end|>", "").strip(), len(new)


PAGE = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>FlightFlow test</title><style>
:root{--bg:#f4f5f8;--c:#fff;--fg:#14161c;--m:#667}@media(prefers-color-scheme:dark){:root{--bg:#0f1115;--c:#181b22;--fg:#e8eaf0;--m:#8b91a1}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px system-ui;padding:16px;max-width:1000px;margin:auto}
.row{display:flex;gap:8px;margin:10px 0}input[type=text]{flex:1;padding:10px;border-radius:8px;border:1px solid #8884;background:var(--c);color:var(--fg);font-size:15px}
button{padding:10px 16px;border:0;border-radius:8px;background:#4f8cff;color:#fff;font-weight:600;cursor:pointer}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:700px){.cols{grid-template-columns:1fr}}
.box{background:var(--c);border-radius:10px;padding:12px;min-height:120px;white-space:pre-wrap}.m{color:var(--m);font-size:12px;margin-top:8px}h3{margin:0 0 6px;font-size:14px}
</style><h2>FlightFlow · bază vs. fine-tuned</h2>
<label><input type=checkbox id=f checked> Include date zbor DEMO123 (fictive)</label>
<div class=row><input type=text id=q placeholder="Întreabă / Ask… (Enter)" autofocus><button onclick=go()>Trimite</button></div>
<div class=cols><div><h3>Model de bază</h3><div class=box id=b></div></div><div><h3>Fine-tuned (adaptor)</h3><div class=box id=a></div></div></div>
<script>
q.addEventListener('keydown',e=>{if(e.key==='Enter')go()});
async function one(use,box){box.textContent='…';const r=await fetch('/chat',{method:'POST',body:JSON.stringify({q:q.value,adapter:use,facts:f.checked})});
const j=await r.json();box.innerHTML='';box.append(j.text);const m=document.createElement('div');m.className='m';m.textContent=j.seconds.toFixed(1)+' s · '+j.tokens+' tokeni';box.append(m)}
async function go(){if(!q.value.trim())return;await one(false,b);await one(true,a)}
</script>"""


class H(BaseHTTPRequestHandler):
    def log_message(self, *x):
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/") == "/v1/models":
            return self._json(200, {"object": "list", "data": [{"id": "base", "object": "model"}, {"id": "adapter", "object": "model"}]})
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(PAGE.encode())

    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path.rstrip("/") == "/v1/chat/completions":
            try:
                name = req.get("model", "adapter")
                text, n = complete(req["messages"], req.get("tools"), name != "base",
                                   int(req.get("max_tokens", 300)), float(req.get("temperature", 0.7)), float(req.get("top_p", 0.8)))
                content, calls = parse_tool_calls(text)
                last = str(req["messages"][-1].get("content") or "")[:120]
                print(f"[{name.upper()}] {last!r} -> {content[:200]!r} {[c['function']['name'] for c in calls]}", flush=True)
                return self._json(200, completion_response(name, content, calls, n))
            except Exception as e:  # keep the server alive; report to the client
                return self._json(500, {"error": {"message": str(e)[:300]}})
        text, sec, n = generate(req["q"], req["adapter"], req["facts"])
        print(f"[{'ADAPTER' if req['adapter'] else 'BASE'}] Q: {req['q']}\n   A: {text}\n", flush=True)
        body = json.dumps({"text": text, "seconds": sec, "tokens": n}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)


ThreadingHTTPServer(("127.0.0.1", a.port), H).serve_forever()
