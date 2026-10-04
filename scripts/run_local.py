"""Local dev server for Mac/Linux/Windows: serves public/ and POST /api/analyze.

Run:  python3 scripts/run_local.py   then open http://localhost:8000
"""
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, 'public')
PORT = 8040

sys.path.insert(0, ROOT)
from beamlab import service  # noqa: E402


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC, **kwargs)

    def do_POST(self):
        if self.path != '/api/analyze':
            return self.send_error(404)
        length = service.body_length(self.headers.get('content-length'))
        raw = self.rfile.read(length) if length is not None else None
        status, payload = service.process(raw)
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    print(f'Beam Reactions Lab running at http://localhost:{PORT}  (press Control+C to stop)')
    ThreadingHTTPServer(('', PORT), Handler).serve_forever()
