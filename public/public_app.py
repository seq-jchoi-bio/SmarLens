#!/usr/bin/env python3
"""Minimal public SmarLens stub server.

This server is for public repository review only. It serves the static frontend
when available and returns explicit stub responses for production analysis APIs.
It does not include the production database, indexes, build pipelines, or
unpublished evidence/scoring logic.
"""

from __future__ import annotations

import json
import os
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from public_workflows import workflow_payload


REPO_ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = Path(os.environ.get("SMARLENS_STATIC_DIR", REPO_ROOT / "app" / "static"))
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8765"))


def unavailable_payload(endpoint: str) -> dict:
    return {
        "found": False,
        "endpoint": endpoint,
        "public_beta_url": "https://smarlensdb.org",
        "error": (
            "This public repository does not include the production database, "
            "runtime indexes, or unpublished analysis modules. Please use the "
            "public SmarLens beta web service for live analyses."
        ),
    }


class PublicHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def send_json(self, payload: dict, status: int = 200):
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/status":
            self.send_json(
                {
                    "service": "SmarLens public stub",
                    "production_service": "https://smarlensdb.org",
                    "database_included": False,
                    "genes": None,
                    "transcripts": None,
                    "proteins": None,
                }
            )
            return
        if parsed.path == "/api/public-workflows":
            self.send_json(workflow_payload())
            return
        if parsed.path.startswith("/api/"):
            self.send_json(unavailable_payload(parsed.path), 501)
            return
        if parsed.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.send_json(unavailable_payload(parsed.path), 501)
            return
        self.send_error(404)


def main():
    if not STATIC_DIR.exists():
        print(f"Warning: static directory not found: {STATIC_DIR}")
    server = ThreadingHTTPServer((HOST, PORT), PublicHandler)
    print(f"SmarLens public stub running at http://{HOST}:{PORT}")
    print("Live service: https://smarlensdb.org")
    server.serve_forever()


if __name__ == "__main__":
    main()
