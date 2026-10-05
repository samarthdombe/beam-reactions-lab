"""Vercel serverless entrypoint: POST /api/analyze. All logic lives in beamlab.service."""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from beamlab import service  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = service.body_length(self.headers.get('content-length'))
        raw = self.rfile.read(length) if length is not None else None
        status, payload = service.process(raw)
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)

