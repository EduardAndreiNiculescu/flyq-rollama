import json
import os
import re
from sources import OFFICIAL_SOURCES, get_sources_dict, get_rejected_sources_list
from dataset_definitions import CONCEPTS
from dataset_definitions_part2 import CONCEPTS_PART2
from dataset_definitions_children_docs_border import CONCEPTS_CHILDREN_DOCS_BORDER
from dataset_definitions_part3 import CONCEPTS_PART3
from status_logger import log_event

ALL_CONCEPTS = CONCEPTS + CONCEPTS_PART2 + CONCEPTS_CHILDREN_DOCS_BORDER + CONCEPTS_PART3

CORPUS_JSONL = os.path.abspath(os.path.join(os.path.dirname(__file__), "corpus.jsonl"))
SOURCES_JSON = os.path.abspath(os.path.join(os.path.dirname(__file__), "sources.json"))

def word_count(text: str) -> int:
    return len(re.findall(r'\b\w+\b', text))

def build_corpus():
    log_event("source-discovery", "running", 0, len(OFFICIAL_SOURCES), "Scanning and cataloging official primary sources...")
    sources_dict = get_sources_dict()
    rejected_list = get_rejected_sources_list()
    
    with open(SOURCES_JSON, "w", encoding="utf-8") as f:
        json.dump({
            "officialSources": sources_dict,
            "rejectedSources": rejected_list
        }, f, indent=2, ensure_ascii=False)
    
    log_event("source-discovery", "passed", len(sources_dict), len(sources_dict), 
              f"Verified {len(sources_dict)} official sources, documented {len(rejected_list)} rejected sources.",
              {"officialCount": len(sources_dict), "rejectedCount": len(rejected_list)})

    log_event("chunk", "running", 0, len(ALL_CONCEPTS) * 2, "Building bilingual chunks and validating length constraints...")

    corpus = []
    word_stats = []

    for c in ALL_CONCEPTS:
        cid = c["concept_id"]
        topic = c["topic"]
        source_meta = sources_dict[c["source_id"]]
        citations = c["citations"]
        
        # Romanian chunk
        ro_text = c["ro"]["text"]
        ro_wc = word_count(ro_text)
        if ro_wc < 80 or ro_wc > 220:
            raise ValueError(f"Chunk {cid}_ro has {ro_wc} words! Must be between 80 and 220 words.")
        word_stats.append(ro_wc)
        
        ro_doc = {
            "id": f"{cid}_ro",
            "concept_id": cid,
            "topic": topic,
            "lang": "ro",
            "title": c["ro"]["title"],
            "text": ro_text,
            "jurisdiction": c["jurisdiction"],
            "airportCodes": c["airportCodes"],
            "airlines": c["airlines"],
            "validFrom": c["validFrom"],
            "validUntil": c["validUntil"],
            "mayChange": c["mayChange"],
            "verification": c["verification"],
            "source": source_meta,
            "citations": citations,
            "keywords": c["keywords_ro"],
            "questions": {
                "ro": c["ro"]["questions"],
                "en": []
            }
        }
        corpus.append(ro_doc)

        # English chunk
        en_text = c["en"]["text"]
        en_wc = word_count(en_text)
        if en_wc < 80 or en_wc > 220:
            raise ValueError(f"Chunk {cid}_en has {en_wc} words! Must be between 80 and 220 words.")
        word_stats.append(en_wc)

        en_doc = {
            "id": f"{cid}_en",
            "concept_id": cid,
            "topic": topic,
            "lang": "en",
            "title": c["en"]["title"],
            "text": en_text,
            "jurisdiction": c["jurisdiction"],
            "airportCodes": c["airportCodes"],
            "airlines": c["airlines"],
            "validFrom": c["validFrom"],
            "validUntil": c["validUntil"],
            "mayChange": c["mayChange"],
            "verification": c["verification"],
            "source": source_meta,
            "citations": citations,
            "keywords": c["keywords_en"],
            "questions": {
                "ro": [],
                "en": c["en"]["questions"]
            }
        }
        corpus.append(en_doc)

    with open(CORPUS_JSONL, "w", encoding="utf-8") as f:
        for doc in corpus:
            f.write(json.dumps(doc, ensure_ascii=False) + "\n")

    corpus_size_bytes = os.path.getsize(CORPUS_JSONL)
    avg_wc = sum(word_stats) / len(word_stats)
    min_wc = min(word_stats)
    max_wc = max(word_stats)

    log_event("chunk", "passed", len(corpus), len(corpus),
              f"Successfully built {len(corpus)} verified chunks across {len(ALL_CONCEPTS)} concepts.",
              {
                  "totalChunks": len(corpus),
                  "totalConcepts": len(ALL_CONCEPTS),
                  "corpusSizeBytes": corpus_size_bytes,
                  "avgWordCount": round(avg_wc, 1),
                  "minWordCount": min_wc,
                  "maxWordCount": max_wc
              })

    print(f"Corpus built: {len(corpus)} chunks ({len(corpus)//2} concepts). Word count min={min_wc}, max={max_wc}, avg={avg_wc:.1f}. Size={corpus_size_bytes} bytes.")
    return corpus

if __name__ == "__main__":
    build_corpus()
