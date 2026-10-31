import json
import os
import tempfile
from datetime import datetime, timezone

STATUS_DIR = os.path.join(os.path.dirname(__file__), "out", "06b")
STATUS_FILE = os.path.join(STATUS_DIR, "status.json")
EVENTS_FILE = os.path.join(STATUS_DIR, "events.jsonl")


def update_status(stage: str, state: str, current: int = 0, total: int = 4083, message: str = "", metrics: dict = None):
    os.makedirs(STATUS_DIR, exist_ok=True)
    if metrics is None:
        metrics = {}
    now = datetime.now(timezone.utc).isoformat()
    status_data = {
        "actor": "gemini",
        "stage": stage,
        "state": state,
        "current": current,
        "total": total,
        "message": message,
        "metrics": metrics,
        "updatedAt": now
    }
    # Atomic write to status.json using tempfile in same dir
    temp_fd, temp_path = tempfile.mkstemp(dir=STATUS_DIR, prefix="status_", suffix=".tmp")
    with os.fdopen(temp_fd, "w", encoding="utf-8") as f:
        json.dump(status_data, f, indent=2, ensure_ascii=False)
    os.replace(temp_path, STATUS_FILE)

    # Append to events.jsonl
    with open(EVENTS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(status_data, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    update_status("distill", "running", 0, 4083, "analiză structurală V4", {})
    print("Status initialized.")

