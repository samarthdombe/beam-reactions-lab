"""Local dev server for Mac/Linux/Windows: serves public/ and POST /api/analyze.

Run:  python3 scripts/run_local.py   then open http://localhost:8040
"""
import contextlib
import json
import os
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, 'public')
PORT = int(os.environ.get('PORT', 8040))

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
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class DualStackServer(ThreadingHTTPServer):
    """ThreadingHTTPServer that accepts both IPv4 and IPv6 connections on dual-stack hosts."""
    def server_bind(self):
        with contextlib.suppress(Exception):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


def create_server(port, handler_cls=Handler):
    if socket.has_ipv6:
        try:
            DualStackServer.address_family = socket.AF_INET6
            return DualStackServer(('::', port), handler_cls)
        except Exception:
            pass
    DualStackServer.address_family = socket.AF_INET
    return ThreadingHTTPServer(('', port), handler_cls)


if __name__ == '__main__':
    print(f'Beam Reactions Lab running at http://localhost:{PORT}  (press Control+C to stop)')
    try:
        create_server(PORT, Handler).serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
