"""Both entrypoints (Vercel handler, local dev server) must answer through beamlab.service."""
import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from api.analyze import handler as vercel_handler
from scripts.run_local import Handler as local_handler


class EntrypointTest(unittest.TestCase):
    def post(self, handler_cls, data, path='/api/analyze'):
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler_cls)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            req = urllib.request.Request(f'http://127.0.0.1:{server.server_port}{path}',
                                         data=data, method='POST',
                                         headers={'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    return resp.status, json.loads(resp.read())
            except urllib.error.HTTPError as err:
                return err.code, json.loads(err.read() or b'null')
        finally:
            server.shutdown()
            server.server_close()

    def test_both_entrypoints_agree(self):
        valid = b'{"type":"compound","loads":[{"W":10,"x":0.8}]}'
        bad = b'{"type":"compound","loads":[{"W":1e9,"x":0.8}]}'
        for name, cls in (('vercel', vercel_handler), ('local', local_handler)):
            with self.subTest(entry=name):
                status, payload = self.post(cls, valid)
                self.assertEqual(status, 200)
                self.assertIn('config', payload)
                self.assertLess(payload['sup'][0]['r'], 0)
                status, payload = self.post(cls, bad)
                self.assertEqual(status, 400)
                self.assertIn('error', payload)
                status, payload = self.post(cls, b'{')
                self.assertEqual(status, 400)

    def test_local_server_rejects_other_post_paths(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), local_handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            r = urllib.request.Request(f'http://127.0.0.1:{server.server_port}/nope', data=b'{}', method='POST')
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                urllib.request.urlopen(r, timeout=10)
            self.assertEqual(ctx.exception.code, 404)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    unittest.main()
