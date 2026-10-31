import json
import os
from datetime import datetime, timezone

STATUS_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "out", "06b", "status.json")
)
EVENTS_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "out", "06b", "events.jsonl")
)

def log_06b_event(stage: str, state: str, current: int, total: int, message: str, metrics: dict = None):
    now_iso = datetime.now(timezone.utc).isoformat()
    os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
    
    event = {
        "actor": "gemini",
        "stage": stage,
        "state": state,
        "current": current,
        "total": total,
        "message": message,
        "metrics": metrics or {},
        "updatedAt": now_iso
    }
    
    # Append to events.jsonl
    with open(EVENTS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")
        
    # Write atomically to status.json
    tmp_status = STATUS_FILE + ".tmp"
    with open(tmp_status, "w", encoding="utf-8") as f:
        json.dump(event, f, indent=2, ensure_ascii=False)
    os.replace(tmp_status, STATUS_FILE)
