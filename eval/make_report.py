"""Build one browsable HTML + CSV report from the latest comparison results.

    python -I eval/make_report.py           ->  eval/results/report.html, report-*.csv

Reads the newest eval/results/compare-*.json for each set (qs51, v2) and the newest tools-*.json,
and joins them with the question files so every case shows: question, expectation, both models'
answers (full text), pass/fail and the reasons. Re-run it whenever a new result file appears.
"""
import csv
import glob
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
RES = os.path.join(ROOT, "eval", "results")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def newest(pattern, must_have=None):
    for p in sorted(glob.glob(os.path.join(RES, pattern)), reverse=True):
        d = load(p)
        if must_have is None or must_have(d):
            return p, d
    return None, None


def status(b_pass, a_pass):
    if b_pass and a_pass:
        return "both pass"
    if not b_pass and not a_pass:
        return "both fail"
    return "only base" if b_pass else "only adapter"


sections = {}


def pair(models):
    return models[0], models[1]


def label(models):
    return f"{models[0]} vs {models[1]}"


def add(key, section):
    if key not in sections:  # files are visited newest first: keep the newest per (set, models)
        sections[key] = section


v2_cases = {}
fp = os.path.join(ROOT, "finetune", "data", "v2", "test.jsonl")
if os.path.exists(fp):
    for line in open(fp, encoding="utf-8"):
        if line.strip():
            c = json.loads(line)
            v2_cases[c["id"]] = c
qs = {q["id"]: q for q in load(os.path.join(ROOT, "eval", "questions.json"))}
tool_cases = {c["id"]: c for c in load(os.path.join(ROOT, "eval", "tool-cases.json"))}

for path in sorted(glob.glob(os.path.join(RES, "compare-*.json")), reverse=True):
    d = load(path)
    models = list(d["out"].keys())
    if len(models) < 2:
        continue
    ma, mb = pair(models)
    for setname, rows_a in d["out"][ma].items():
        rows = []
        for ra, rb in zip(rows_a, d["out"][mb][setname]):
            if setname == "qs51":
                q = qs[ra["id"]]
                question, lang = q["question"], q["lang"]
                expected = "must match one of: " + " | ".join(q["mustAny"]) + ("   must NOT match: " + " | ".join(q["mustNot"]) if q["mustNot"] else "")
            else:
                c = v2_cases.get(ra["id"], {"messages": [{}, {"content": "?"}, {"content": "?"}], "lang": ""})
                question, lang, expected = c["messages"][-2]["content"], c.get("lang", ""), "reference: " + c["messages"][-1]["content"]
            rows.append({
                "id": ra["id"], "category": ra["category"], "lang": lang, "question": question, "expected": expected,
                "a": ra["answer"], "a_pass": ra["pass"], "a_why": "; ".join(ra["reasons"]), "a_ms": ra["ms"],
                "b": rb["answer"], "b_pass": rb["pass"], "b_why": "; ".join(rb["reasons"]), "b_ms": rb["ms"],
                "status": status(ra["pass"], rb["pass"]),
            })
        title = {"qs51": "51 questions (real pipeline prompt, raw model)", "v2": "v2 held-out set (synthetic, template-generated)"}.get(setname, setname)
        add((setname, tuple(models)), {"title": title, "file": os.path.basename(path), "models": [ma, mb], "rows": rows})

for path in sorted(glob.glob(os.path.join(RES, "tools-*.json")), reverse=True):
    d = load(path)
    models = list(d["out"].keys())
    if len(models) < 2:
        continue
    ma, mb = pair(models)
    rows = []
    for ra, rb in zip(d["out"][ma], d["out"][mb]):
        c = tool_cases[ra["id"]]
        exp = ("one of: " + ", ".join(c["expectedAny"])) if c["expectedAny"] else "NO tool call"
        if c["forbidden"]:
            exp += "   forbidden: " + ", ".join(c["forbidden"])
        rows.append({
            "id": ra["id"], "category": ra["category"], "lang": c["lang"], "question": c["question"], "expected": exp,
            "a": "called: " + (", ".join(ra["called"]) or "(nothing)"), "a_pass": ra["pass"], "a_why": "; ".join(ra["reasons"]), "a_ms": ra["ms"],
            "b": "called: " + (", ".join(rb["called"]) or "(nothing)"), "b_pass": rb["pass"], "b_why": "; ".join(rb["reasons"]), "b_ms": rb["ms"],
            "status": status(ra["pass"], rb["pass"]),
        })
    add(("tools", tuple(models)), {"title": "50 tool-calling cases (first model turn only)", "file": os.path.basename(path), "models": [ma, mb], "rows": rows})

# stable, readable section names: "qs51 | qwen3:4b vs ff-adapter"
sections = {f"{k[0]} | {label(list(k[1]))}": v for k, v in sorted(sections.items(), key=lambda kv: (kv[0][0], kv[1]["file"]), reverse=False)}

if not sections:
    sys.exit("no result files found in eval/results")

# ---- CSV ---------------------------------------------------------------------------------------
for name, s in sections.items():
    with open(os.path.join(RES, "report-" + "".join(ch if ch.isalnum() else "_" for ch in name) + ".csv"), "w", encoding="utf-8-sig", newline="") as f:  # utf-8-sig: Excel shows diacritics
        w = csv.writer(f)
        w.writerow(["id", "category", "lang", "question", "expected", "model_a", "a_answer", "a_pass", "a_reasons", "model_b", "b_answer", "b_pass", "b_reasons", "status"])
        for r in s["rows"]:
            w.writerow([r["id"], r["category"], r["lang"], r["question"], r["expected"], s["models"][0], r["a"], r["a_pass"], r["a_why"], s["models"][1], r["b"], r["b_pass"], r["b_why"], r["status"]])

# ---- HTML --------------------------------------------------------------------------------------
data = json.dumps(sections, ensure_ascii=False).replace("</", "<\\/")
html = """<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FlightFlow - rezultate</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#14161c;--mut:#667;--line:#0001;--ok:#1a8f4d;--bad:#c62828;--acc:#2b62d9;--okbg:#1a8f4d1a;--badbg:#c628281a}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#181b22;--fg:#e8eaf0;--mut:#8b91a1;--line:#fff2;--ok:#3ecf8e;--bad:#ff6b6b;--acc:#6ea0ff;--okbg:#3ecf8e22;--badbg:#ff6b6b22}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
header{position:sticky;top:0;background:var(--bg);padding:10px 14px;border-bottom:1px solid var(--line);z-index:5}
h1{font-size:16px;margin:0 0 8px}.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
button,input,select{font:inherit;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:5px 10px}
button.on{background:var(--acc);color:#fff;border-color:var(--acc)}input{min-width:200px}
.sum{color:var(--mut);margin-top:6px;font-size:13px}
main{padding:10px 14px 60px;overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:1000px}
th,td{vertical-align:top;text-align:left;padding:8px;border-bottom:1px solid var(--line)}
th{position:sticky;top:96px;background:var(--bg);font-size:12px;color:var(--mut);text-transform:uppercase;z-index:3}
td.id{white-space:nowrap;color:var(--mut)}td.q{max-width:260px}td.ans{max-width:380px;white-space:pre-wrap;word-break:break-word}
.badge{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:600}
.ok{background:var(--okbg);color:var(--ok)}.bad{background:var(--badbg);color:var(--bad)}
.why{color:var(--bad);font-size:12px;margin-top:4px}.exp{color:var(--mut);font-size:12px;margin-top:4px;white-space:pre-wrap;word-break:break-word}
tr.differ td:first-child{box-shadow:inset 3px 0 var(--acc)}
.meta{color:var(--mut);font-size:12px}
</style></head><body>
<header><h1>FlightFlow - comparatie modele (fiecare caz)</h1>
<div class="row" id="tabs"></div>
<div class="row" style="margin-top:6px" id="filters"></div>
<div class="row" style="margin-top:6px"><input id="q" placeholder="cauta in intrebari si raspunsuri..."><select id="cat"></select></div>
<div class="sum" id="sum"></div></header>
<main><table><thead><tr><th>caz</th><th>intrebare</th><th id="ha">model A</th><th id="hb">model B</th></tr></thead><tbody id="body"></tbody></table>
<p class="meta">Scorurile sunt automate (regex, suprapunere, verificare de numere): sunt un proxy, nu judecata ta. Citeste raspunsurile. O singura rulare, temperatura 0.7; rularea e pe GPU-ul laptopului, nu pe iPhone.</p></main>
<script>
const DATA = __DATA__;
const FILTERS = [["all","toate"],["differ","difera"],["both fail","pica ambele"],["only base","trece doar A"],["only adapter","trece doar B"],["both pass","trec ambele"]];
let set = Object.keys(DATA)[0], flt = "all";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
function rows(){ return DATA[set].rows; }
function visible(){
  const q = $("q").value.toLowerCase(), cat = $("cat").value;
  return rows().filter((r) =>
    (flt==="all" || (flt==="differ" ? r.status.startsWith("only") : r.status===flt)) &&
    (!cat || r.category===cat) &&
    (!q || (r.question+" "+r.a+" "+r.b+" "+r.id).toLowerCase().includes(q)));
}
function badge(p){ return `<span class="badge ${p?"ok":"bad"}">${p?"PASS":"FAIL"}</span>`; }
function render(){
  const v = visible(), all = rows();
  const bp = all.filter((r)=>r.a_pass).length, ap = all.filter((r)=>r.b_pass).length;
  $("ha").textContent = DATA[set].models[0]; $("hb").textContent = DATA[set].models[1];
  $("sum").textContent = `${DATA[set].title} - fisier ${DATA[set].file} - ${DATA[set].models[0]} ${bp}/${all.length}, ${DATA[set].models[1]} ${ap}/${all.length} - se afiseaza ${v.length}`;
  $("body").innerHTML = v.map((r) => `<tr class="${r.status.startsWith("only")?"differ":""}">
    <td class="id">${esc(r.id)}<br><span class="meta">${esc(r.category)}<br>${esc(r.lang)}</span></td>
    <td class="q">${esc(r.question)}<div class="exp">${esc(r.expected)}</div></td>
    <td class="ans">${badge(r.a_pass)} <span class="meta">${(r.a_ms/1000).toFixed(1)}s</span><br>${esc(r.a)}${r.a_why?`<div class="why">${esc(r.a_why)}</div>`:""}</td>
    <td class="ans">${badge(r.b_pass)} <span class="meta">${(r.b_ms/1000).toFixed(1)}s</span><br>${esc(r.b)}${r.b_why?`<div class="why">${esc(r.b_why)}</div>`:""}</td></tr>`).join("");
}
function build(){
  $("tabs").innerHTML = Object.entries(DATA).map(([k,s]) => `<button data-s="${k}" class="${k===set?"on":""}">${esc(k)} (${s.rows.length})</button>`).join("");
  $("filters").innerHTML = FILTERS.map(([k,l]) => `<button data-f="${k}" class="${k===flt?"on":""}">${l}</button>`).join("");
  const cats = [...new Set(rows().map((r)=>r.category))].sort();
  $("cat").innerHTML = `<option value="">toate categoriile</option>` + cats.map((c)=>`<option>${esc(c)}</option>`).join("");
  render();
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("button"); if(!t) return;
  if(t.dataset.s){ set=t.dataset.s; flt="all"; build(); }
  if(t.dataset.f){ flt=t.dataset.f; build(); }
});
$("q").addEventListener("input", render); $("cat").addEventListener("change", render);
build();
</script></body></html>""".replace("__DATA__", data)
out = os.path.join(RES, "report.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("report:", os.path.normpath(out))
for name, s in sections.items():
    r = s["rows"]
    print(f"  {name}: {len(r)} cases, {s['models'][0]} {sum(x['a_pass'] for x in r)} pass, {s['models'][1]} {sum(x['b_pass'] for x in r)} pass, from {s['file']}")
