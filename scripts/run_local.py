"""Local dev server for Mac/Linux/Windows: serves public/ and POST /api/analyze.

Run:  python3 scripts/run_local.py   then open http://localhost:8040

Binds to a dual-stack IPv6+IPv4 socket when possible (so ``localhost`` resolves
on macOS, which prefers ``::1``, as well as on Windows and Linux). Falls back to
IPv4-only when IPv6 is not available. If the requested port is reserved or in use,
tries the next few ports automatically.
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
MAX_PORT_ATTEMPTS = 5

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


def _try_bind(port, handler_cls):
    """Try to create a server on *port*. Returns (server, actual_port) or raises."""
    if socket.has_ipv6:
        try:
            DualStackServer.address_family = socket.AF_INET6
            server = DualStackServer(('::', port), handler_cls)
            # Verify that IPv4 connections will also be accepted (dual-stack).
            # On macOS/BSD, IPV6_V6ONLY may have stayed 1 despite our attempt
            # to clear it. In that case 127.0.0.1 would be refused.
            v6only = server.socket.getsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY)
            if v6only:
                # IPv6-only; close and fall through to IPv4.
                server.server_close()
            else:
                return server, port
        except Exception:
            pass
    # Fallback: IPv4 only (0.0.0.0).
    return ThreadingHTTPServer(('', port), handler_cls), port


def create_server(port, handler_cls=Handler):
    """Create a server, retrying on the next port if *port* is reserved or busy."""
    last_error = None
    for offset in range(MAX_PORT_ATTEMPTS):
        try:
            return _try_bind(port + offset, handler_cls)
        except OSError as exc:
            last_error = exc
            # errno 10013 = WinError (access denied / reserved port),
            # errno 98 / 48 = EADDRINUSE on Linux / macOS.
            if exc.errno not in (10013, 98, 48):
                raise
    raise last_error


if __name__ == '__main__':
    try:
        server, actual_port = create_server(PORT, Handler)
    except OSError as exc:
        print(f'ERROR: Cannot bind to port {PORT}–{PORT + MAX_PORT_ATTEMPTS - 1}: {exc}')
        sys.exit(1)
    family = 'IPv6+IPv4' if server.address_family == socket.AF_INET6 else 'IPv4'
    print(f'Beam Reactions Lab ({family}) running at:')
    print(f'  > Local:   http://localhost:{actual_port}/simulation.html')
    print(f'  > Network: http://127.0.0.1:{actual_port}/simulation.html')
    print('  (press Control+C to stop)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
