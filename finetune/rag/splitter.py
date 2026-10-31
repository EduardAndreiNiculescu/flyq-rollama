import json
import os
from status_logger import log_event

CORPUS_JSONL = os.path.abspath(os.path.join(os.path.dirname(__file__), "corpus.jsonl"))
SPLITS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "splits"))

VAL_CONCEPT_IDS = {
    "sec_prohibited_sharp_items",
    "bag_delay_21day_deadline",
    "rig_delay_5hours_refund",
    "acc_prm_assistance_dogs",
    "pet_minimum_age_15weeks",
    "apt_cra_parking_kiss_fly"
}

TEST_CONCEPT_IDS = {
    "sec_liquids_duty_free_steb",
    "bag_damage_7day_deadline",
    "rig_denied_boarding_overbooking",
    "chi_unaccompanied_minor_umnr_rules",
    "doc_emergency_travel_document",
    "emg_aed_defibrillators_terminals"
}

def ngrams(text: str, n: int = 4):
    text = "".join(text.lower().split())
    return {text[i:i+n] for i in range(len(text) - n + 1)}

def jaccard(s1, s2):
    if not s1 or not s2:
        return 0.0
    return len(s1.intersection(s2)) / len(s1.union(s2))

def create_splits():
    log_event("validate", "running", 0, 3, "Splitting corpus by source + topic and verifying zero leakage...")
    
    os.makedirs(SPLITS_DIR, exist_ok=True)
    
    with open(CORPUS_JSONL, "r", encoding="utf-8") as f:
        docs = [json.loads(line) for line in f]

    train_docs = []
    val_docs = []
    test_docs = []

    for d in docs:
        cid = d["concept_id"]
        if cid in VAL_CONCEPT_IDS:
            val_docs.append(d)
        elif cid in TEST_CONCEPT_IDS:
            test_docs.append(d)
        else:
            train_docs.append(d)

    # 1. Exact ID and Concept leakage check
    train_cids = {d["concept_id"] for d in train_docs}
    val_cids = {d["concept_id"] for d in val_docs}
    test_cids = {d["concept_id"] for d in test_docs}

    leak_train_val = train_cids.intersection(val_cids)
    leak_train_test = train_cids.intersection(test_cids)
    leak_val_test = val_cids.intersection(test_cids)

    if leak_train_val or leak_train_test or leak_val_test:
        raise ValueError(f"LEAKAGE DETECTED! Train-Val: {leak_train_val}, Train-Test: {leak_train_test}, Val-Test: {leak_val_test}")

    # 2. Text n-gram overlap check (near duplicate detection)
    max_overlap = 0.0
    leak_pair = None
    
    train_grams = [(d["id"], ngrams(d["text"])) for d in train_docs]
    val_grams = [(d["id"], ngrams(d["text"])) for d in val_docs]
    test_grams = [(d["id"], ngrams(d["text"])) for d in test_docs]

    for tid, tg in train_grams:
        for vid, vg in val_grams:
            sim = jaccard(tg, vg)
            if sim > max_overlap:
                max_overlap = sim
                leak_pair = (tid, vid, sim)
        for xid, xg in test_grams:
            sim = jaccard(tg, xg)
            if sim > max_overlap:
                max_overlap = sim
                leak_pair = (tid, xid, sim)

    for vid, vg in val_grams:
        for xid, xg in test_grams:
            sim = jaccard(vg, xg)
            if sim > max_overlap:
                max_overlap = sim
                leak_pair = (vid, xid, sim)

    if max_overlap > 0.40:
        raise ValueError(f"High text similarity ({max_overlap:.3f}) between {leak_pair[0]} and {leak_pair[1]}")

    # Write split files
    train_path = os.path.join(SPLITS_DIR, "train.jsonl")
    val_path = os.path.join(SPLITS_DIR, "val.jsonl")
    test_path = os.path.join(SPLITS_DIR, "test.jsonl")

    with open(train_path, "w", encoding="utf-8") as f:
        for d in train_docs:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")

    with open(val_path, "w", encoding="utf-8") as f:
        for d in val_docs:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")

    with open(test_path, "w", encoding="utf-8") as f:
        for d in test_docs:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")

    total = len(docs)
    metrics = {
        "trainChunks": len(train_docs),
        "trainPct": round(len(train_docs) / total * 100, 1),
        "valChunks": len(val_docs),
        "valPct": round(len(val_docs) / total * 100, 1),
        "testChunks": len(test_docs),
        "testPct": round(len(test_docs) / total * 100, 1),
        "maxCrossSplitJaccard": round(max_overlap, 3),
        "leakageDetected": False
    }

    log_event("validate", "passed", total, total, 
              f"Splits verified clean: Train {len(train_docs)} ({metrics['trainPct']}%), Val {len(val_docs)} ({metrics['valPct']}%), Test {len(test_docs)} ({metrics['testPct']}%). Max cross-split similarity {max_overlap:.3f}.",
              metrics)

    print(f"Splits created successfully: Train={len(train_docs)}, Val={len(val_docs)}, Test={len(test_docs)}. Max similarity={max_overlap:.3f}")
    return train_docs, val_docs, test_docs

if __name__ == "__main__":
    create_splits()
