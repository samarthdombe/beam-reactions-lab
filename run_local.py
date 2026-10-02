"""Local server for Mac/Linux/Windows: serves the pages and the Python API.
Run:  python3 run_local.py   then open http://localhost:8000"""
import json, os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'api'))
os.chdir(ROOT)
from analyze import analyze


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/api/analyze':
            return self.send_error(404)
        try:
            data = json.loads(self.rfile.read(int(self.headers.get('content-length', 0))) or b'{}')
            body, code = json.dumps(analyze(data)).encode(), 200
        except Exception as e:
            body, code = json.dumps({'error': str(e)}).encode(), 400
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)


print('Beam Reactions Lab running at http://localhost:8000  (press Control+C to stop)')
ThreadingHTTPServer(('', 8000), Handler).serve_forever()
