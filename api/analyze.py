"""Vercel entrypoint: POST /api/analyze. All logic lives in beamlab.service.

Two interfaces, same behaviour:
- ``handler``: BaseHTTPRequestHandler class (Vercel's classic Python function runtime).
- ``app``: WSGI callable, needed by newer Vercel runtimes and ``vercel dev``, which only
  accept ASGI/WSGI apps (see ``[tool.vercel] entrypoint`` in pyproject.toml).
"""
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
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def app(environ, start_response):
    """WSGI version of ``handler``: answers POST with service.process, anything else with 405."""
    if environ.get('REQUEST_METHOD') != 'POST':
        status, payload = 405, {'error': 'Method not allowed; use POST'}
    else:
        length = service.body_length(environ.get('CONTENT_LENGTH') or None)
        raw = environ['wsgi.input'].read(length) if length is not None else None
        status, payload = service.process(raw)
    body = json.dumps(payload).encode()
    reason = {200: 'OK', 400: 'Bad Request', 405: 'Method Not Allowed'}.get(status, 'Error')
    start_response(f'{status} {reason}', [('Content-Type', 'application/json'),
                                          ('Content-Length', str(len(body)))])
    return [body]
