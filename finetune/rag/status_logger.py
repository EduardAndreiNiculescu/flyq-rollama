import json
import os
from datetime import datetime, timezone

STATUS_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "out", "rag", "status.json"))
EVENTS_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "out", "rag", "events.jsonl"))

def log_event(stage: str, state: str, current: int = 0, total: int = 0, message: str = "", metrics: dict = None):
    """
    Log atomic progress to status.json and append event to events.jsonl
    Stages: source-discovery | fetch | normalize | chunk | validate | benchmark
    States: pending | running | passed | failed
    """
    if metrics is None:
        metrics = {}
    
    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "actor": "gemini",
        "stage": stage,
        "state": state,
        "current": current,
        "total": total,
        "message": message,
        "metrics": metrics,
        "updatedAt": now_iso
    }
    
    os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
    
    # Atomic write to status.json using temp file
    temp_status = STATUS_FILE + ".tmp"
    with open(temp_status, "w", encoding="utf-8") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)
    os.replace(temp_status, STATUS_FILE)
    
    # Append to events.jsonl
    with open(EVENTS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    
    print(f"[{record['updatedAt']}] [{stage.upper()}] [{state.upper()}] {message} ({current}/{total})")
