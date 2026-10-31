"""Serve the live training dashboard on http://localhost:18080 (local only)."""
import http.server
import shutil
from functools import partial
from pathlib import Path

ROOT = Path(__file__).parent
(ROOT / "out").mkdir(exist_ok=True)


class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/status.json"):
            f = ROOT / "out" / "status.json"
            body = f.read_bytes() if f.exists() else b"{}"
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", 18080), partial(H, directory=str(ROOT / "dashboard"))).serve_forever()
