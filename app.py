import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from formatter import format_sql


def _runtime_base_dir() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).parent


BASE = _runtime_base_dir()


def read_text(name: str) -> str:
    return (BASE / name).read_text(encoding="utf-8")


INDEX_HTML = read_text("index.html")
APP_JS = read_text("app.js")
STYLE_CSS = read_text("style.css")


class Handler(BaseHTTPRequestHandler):
    def _send(self, body: bytes, content_type: str, status: int = 200, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        if headers:
            for key, value in headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/":
            return self._send(INDEX_HTML.encode("utf-8"), "text/html; charset=utf-8")
        if self.path == "/app.js":
            return self._send(APP_JS.encode("utf-8"), "application/javascript; charset=utf-8")
        if self.path == "/style.css":
            return self._send(STYLE_CSS.encode("utf-8"), "text/css; charset=utf-8")
        return self._send(b"Not found", "text/plain; charset=utf-8", 404)

    def do_POST(self):
        if self.path not in ("/api/format", "/api/download"):
            return self._send(b"Not found", "text/plain; charset=utf-8", 404)

        length = int(self.headers.get("Content-Length", "0"))
        payload = self.rfile.read(length)
        try:
            data = json.loads(payload.decode("utf-8") or "{}")
            sql = data.get("sql", "")
        except Exception:
            return self._send(b'{"error":"invalid_json"}', "application/json; charset=utf-8", 400)

        formatted = format_sql(sql)

        if self.path == "/api/format":
            body = json.dumps({"formatted": formatted}, ensure_ascii=False).encode("utf-8")
            return self._send(body, "application/json; charset=utf-8")

        filename = data.get("filename", "formatted.sql")
        if not filename.lower().endswith(".sql"):
            filename += ".sql"
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return self._send(formatted.encode("utf-8"), "application/sql; charset=utf-8", headers=headers)


def run(port: int = 8080):
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"SQL formatter running at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
