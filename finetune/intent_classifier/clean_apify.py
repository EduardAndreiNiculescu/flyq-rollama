"""Apify Data Cleaner, Deduplicator and Labeler for FlightFlow Intent Classifier.
Ingests:
  - Serp raw files: serp-raw-en-gb.json, serp-raw-n5Q1sU3qSSrh7mzC1.json, serp-raw-ZIXpQjIjQgSu3wBTA.json
  - Existing apify discovery: eval/apify-flight-discovery.json
Cleans:
  - Filters out ads, SEO spam, commercial aggregators, broken snippets
  - Deduplicates on normalized text
  - Labels tool intent, no-tool (none), clarify, unsafe, multi-intent, jurisdiction
"""

import json
import os
import re
import sys
from typing import Dict, List, Any, Tuple, Optional

sys.stdout.reconfigure(encoding="utf-8")

APIFY_DIR = r"<cale-locala>"
DISCOVERY_FILE = r"<cale-locala>"

AD_BRANDS = [
    "esky", "vola", "claimcompass", "airhelp", "tripadvisor", "skyscanner", "bravofly",
    "kiwi.com", "wego", "momondo", "booking.com", "opodo", "kayak", "expedia", "zbor.md",
    "paravion", "flyh24", "airadvisor", "compensair"
]

AD_PHRASES = [
    "bilete ieftine", "rezerva acum", "oferta speciala", "preturi mici", "top 10",
    "voucher reducere", "cumpara bilet", "cheap flights", "book now", "discount",
    "promo code", "airline tickets deal", "best flight deals", "compare flights",
    "zboruri ieftine", "cumpara acum", "promotie", "cele mai ieftine bilete"
]

NON_AVIATION_WORDS = [
    "reteta", "sarmale", "horoscop", "curs valutar", "pantofi", "fotbal", "liga 1",
    "pariuri", "bitcoin", "crypto", "imobiliare", "apartament", "masini second"
]

def normalize_text(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[\u0300-\u036f]", "", s)  # diacritics
    s = re.sub(r"[^a-z0-9\s-]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def is_ad_or_spam(text: str, source_title: Optional[str], source_url: Optional[str]) -> Tuple[bool, str]:
    lower_t = (text or "").lower()
    lower_st = (source_title or "").lower()
    lower_url = (source_url or "").lower()

    for b in AD_BRANDS:
        if b in lower_t or b in lower_st or b in lower_url:
            return True, f"brand_spam:{b}"

    for p in AD_PHRASES:
        if p in lower_t:
            return True, f"ad_phrase:{p}"

    for w in NON_AVIATION_WORDS:
        if re.search(rf"\b{w}\b", lower_t):
            return True, f"non_aviation:{w}"

    if "...read more" in lower_t or "... vezi" in lower_t or "read more" in lower_t:
        return True, "truncated_snippet"

    if len(text.strip()) < 12:
        return True, "too_short"
    if len(text.strip()) > 350:
        return True, "too_long"

    return False, "ok"

def infer_intent_and_metadata(text: str, lang: str) -> Dict[str, Any]:
    norm = normalize_text(text)
    
    # 1. Check Unsafe / Prompt injection
    if re.search(r"\b(ignore all|override|dan mode|system prompt|api key|cheia api|injec|exploit|script)\b", norm):
        return {
            "label": "none",
            "secondary_label": None,
            "category": "unsafe",
            "jurisdiction": "irrelevant"
        }

    # 2. Check Emergency / Medical
    if re.search(r"\b(infarct|ambulanta|ambulance|urgenta|emergency|ajutor medical|chest pain|nu pot respira|foc|incendiu)\b", norm):
        return {
            "label": "clarify",
            "secondary_label": None,
            "category": "emergency",
            "jurisdiction": "EU"
        }

    # 3. Check Explicit Negations
    if re.search(r"\b(nu vreau|nu cauta|nu arata|nu afisa|fara detalii|fara harta|don't show|do not want|no tracking)\b", norm):
        return {
            "label": "none",
            "secondary_label": None,
            "category": "negations",
            "jurisdiction": "irrelevant"
        }

    # 4. Jurisdiction detection
    jurisdiction = "EU"
    if re.search(r"\b(craiova|otopeni|romania|romanesc|politia de frontiera|legea 248)\b", norm):
        jurisdiction = "RO"
    elif re.search(r"\b(tsa|united states|us domestic|faa|australia|canada|london domestic|uk domestic|doha|qatar|japan)\b", norm):
        jurisdiction = "non-EU"

    # 5. Multi-intent detection
    has_gate = bool(re.search(r"\b(gate|poarta|imbarcare|boarding gate)\b", norm))
    has_time = bool(re.search(r"\b(cat timp|timp ramas|time left|remaining time|how long|decolare|takeoff)\b", norm))
    has_map = bool(re.search(r"\b(harta|map|toaleta|toilet|restroom|lounge|unde se afla|unde e|where is)\b", norm))
    has_flight = bool(re.search(r"\b(status|intarziere|delay|anulat|cancelled|orar|schedule|flight details)\b", norm))
    has_knowledge = bool(re.search(r"\b(bagaj|baggage|lichide|liquids|powerbank|baterie|pasaport|passport|drepturi|compensation|despagubire|pets|animale|reguli|rules)\b", norm))
    has_tracking = bool(re.search(r"\b(radar|live tracking|urmarire zbor|unde e avionul|altitude|speed)\b", norm))

    if has_gate and has_time:
        return {"label": "get_gate", "secondary_label": "get_time_remaining", "category": "multi_intent", "jurisdiction": jurisdiction}
    if has_gate and has_map:
        return {"label": "get_gate", "secondary_label": "open_airport_map", "category": "multi_intent", "jurisdiction": jurisdiction}
    if has_flight and has_tracking:
        return {"label": "get_flight_details", "secondary_label": "get_live_tracking", "category": "multi_intent", "jurisdiction": jurisdiction}
    if has_map and has_time:
        return {"label": "open_airport_map", "secondary_label": "get_time_remaining", "category": "multi_intent", "jurisdiction": jurisdiction}

    # 6. Single tool intents
    if has_tracking:
        return {"label": "get_live_tracking", "secondary_label": None, "category": "tool", "jurisdiction": jurisdiction}
    if has_gate:
        return {"label": "get_gate", "secondary_label": None, "category": "tool", "jurisdiction": jurisdiction}
    if has_time and not has_knowledge:
        return {"label": "get_time_remaining", "secondary_label": None, "category": "tool", "jurisdiction": jurisdiction}
    if has_map and not has_knowledge:
        return {"label": "open_airport_map", "secondary_label": None, "category": "tool", "jurisdiction": jurisdiction}
    if has_knowledge:
        return {"label": "search_knowledge", "secondary_label": None, "category": "tool", "jurisdiction": jurisdiction}
    if has_flight:
        return {"label": "get_flight_details", "secondary_label": None, "category": "tool", "jurisdiction": jurisdiction}

    # Clarification for ultra short or ambiguous flight queries
    if re.search(r"^(zborul|status|detalii|ce zbor|arata-mi|flight|my flight|check flight)$", norm):
        return {"label": "clarify", "secondary_label": None, "category": "clarification", "jurisdiction": jurisdiction}

    # Default to search_knowledge or none if unclear
    if re.search(r"\b(avion|aeroport|zbor|pasager|airport|flight|plane|airline)\b", norm):
        return {"label": "search_knowledge", "secondary_label": None, "category": "tool", "jurisdiction": jurisdiction}

    return {"label": "none", "secondary_label": None, "category": "no_tool", "jurisdiction": "irrelevant"}


def process_all_apify() -> Dict[str, Any]:
    raw_candidates: List[Dict[str, Any]] = []

    # 1. Read serp raw files
    serp_files = [
        os.path.join(APIFY_DIR, f) for f in os.listdir(APIFY_DIR)
        if f.startswith("serp-raw-") and f.endswith(".json")
    ]
    
    for sf in serp_files:
        try:
            with open(sf, "r", encoding="utf-8") as f:
                rows = json.load(f)
            for row in rows:
                term = row.get("searchQuery", {}).get("term", "")
                lang = "en" if re.search(r"\b(how|what|can|where|flight|baggage|airport|delay|gate)\b", term.lower()) else "ro"
                
                # People also ask
                for paa in row.get("peopleAlsoAsk", []):
                    q = paa.get("question")
                    if q:
                        raw_candidates.append({
                            "text": q,
                            "source_title": "",
                            "source_url": paa.get("url", ""),
                            "origin": "people_also_ask",
                            "lang": lang
                        })
                # Related queries
                for rq in row.get("relatedQueries", []):
                    q = rq.get("query")
                    if q:
                        raw_candidates.append({
                            "text": q,
                            "source_title": "",
                            "source_url": "",
                            "origin": "related_query",
                            "lang": lang
                        })
                # Organic results
                for org in row.get("organicResults", []):
                    title = org.get("title", "")
                    desc = org.get("description", "")
                    url = org.get("url", "")
                    if title:
                        raw_candidates.append({
                            "text": title,
                            "source_title": title,
                            "source_url": url,
                            "origin": "organic_title",
                            "lang": lang
                        })
                    if desc and any(k in desc.lower() for k in ["?", "what", "how", "can", "pot", "cum", "care", "unde"]):
                        raw_candidates.append({
                            "text": desc,
                            "source_title": title,
                            "source_url": url,
                            "origin": "organic_snippet",
                            "lang": lang
                        })
        except Exception as e:
            print(f"Error reading {sf}: {e}")

    # 2. Read discovery file if exists
    if os.path.exists(DISCOVERY_FILE):
        try:
            with open(DISCOVERY_FILE, "r", encoding="utf-8") as f:
                disc_rows = json.load(f)
            for r in disc_rows:
                raw_candidates.append({
                    "text": r.get("question", ""),
                    "source_title": r.get("sourceTitle", ""),
                    "source_url": r.get("sourceUrl", ""),
                    "origin": r.get("origin", "discovery"),
                    "lang": r.get("lang", "ro")
                })
        except Exception as e:
            print(f"Error reading discovery file: {e}")

    # 3. Clean and filter
    accepted = []
    rejected = []
    seen = set()

    for cand in raw_candidates:
        raw_text = cand["text"].replace("\n", " ").strip()
        # Clean trailing artifacts
        raw_text = re.sub(r"\s*-\s*[A-Za-z0-9.]+$", "", raw_text)
        raw_text = re.sub(r"\s*\|\s*[A-Za-z0-9.]+$", "", raw_text)
        raw_text = re.sub(r"\s*\.\.\.\s*read more.*$", "", raw_text, flags=re.IGNORECASE)
        raw_text = re.sub(r"\s*\.\.\.\s*vezi.*$", "", raw_text, flags=re.IGNORECASE)
        raw_text = re.sub(r"\s+", " ", raw_text).strip()

        key = normalize_text(raw_text)
        if key in seen:
            rejected.append({"text": raw_text, "reason": "duplicate"})
            continue

        is_spam, reason = is_ad_or_spam(raw_text, cand["source_title"], cand["source_url"])
        if is_spam:
            rejected.append({"text": raw_text, "reason": reason})
            continue

        seen.add(key)
        meta = infer_intent_and_metadata(raw_text, cand["lang"])
        
        accepted.append({
            "text": raw_text,
            "label": meta["label"],
            "secondary_label": meta["secondary_label"],
            "category": meta["category"],
            "jurisdiction": meta["jurisdiction"],
            "lang": cand["lang"],
            "origin": cand["origin"]
        })

    return {
        "total_scanned": len(raw_candidates),
        "total_accepted": len(accepted),
        "total_rejected": len(rejected),
        "accepted": accepted,
        "rejected": rejected
    }

if __name__ == "__main__":
    res = process_all_apify()
    print(f"Total scanned: {res['total_scanned']}")
    print(f"Total accepted: {res['total_accepted']}")
    print(f"Total rejected: {res['total_rejected']}")
    
    # Save clean dataset
    out_path = os.path.join(os.path.dirname(__file__), "apify_cleaned.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    print(f"Cleaned Apify data written to: {out_path}")
