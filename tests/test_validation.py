"""Every validation rule must answer HTTP 400 with a JSON {"error": ...} body."""
import json
import unittest

from beamlab import service


def body(*loads, **extra):
    return json.dumps({'type': 'simple', 'loads': list(loads), **extra}).encode()


def load(W=10, x=0.5):
    return {'W': W, 'x': x}


BAD_REQUESTS = {
    'W below minimum': body(load(W=0.49)),
    'W zero': body(load(W=0)),
    'W negative': body(load(W=-1)),
    'W above maximum': body(load(W=50.01)),
    'W huge (1e9)': body(load(W=1e9)),
    'W huge integer': b'{"loads":[{"W":1' + b'0' * 400 + b',"x":0.5}]}',
    'x below minimum': body(load(x=0.04)),
    'x above maximum': body(load(x=0.96)),
    'x far out (5)': body(load(x=5)),
    'x negative': body(load(x=-0.5)),
    'W NaN literal': b'{"loads":[{"W":NaN,"x":0.5}]}',
    'x NaN literal': b'{"loads":[{"W":10,"x":NaN}]}',
    'W Infinity': b'{"loads":[{"W":Infinity,"x":0.5}]}',
    'W -Infinity': b'{"loads":[{"W":-Infinity,"x":0.5}]}',
    'x Infinity': b'{"loads":[{"W":10,"x":Infinity}]}',
    'W string "NaN"': body(load(W='NaN')),
    'W numeric string': body(load(W='10')),
    'x numeric string': body(load(x='0.5')),
    'W boolean': body(load(W=True)),
    'x boolean': body(load(x=False)),
    'W null': body(load(W=None)),
    'W list': body(load(W=[10])),
    'W missing': body({'x': 0.5}),
    'x missing': body({'W': 10}),
    'load is a number': body(5),
    'load is a list': body([10, 0.5]),
    'loads is an object': json.dumps({'loads': {'W': 10, 'x': 0.5}}).encode(),
    'loads is a string': json.dumps({'loads': 'abc'}).encode(),
    'loads is null': json.dumps({'loads': None}).encode(),
    'more than 50 loads': body(*[load() for _ in range(51)]),
    'type is a number': json.dumps({'type': 5, 'loads': []}).encode(),
    'type is unknown': json.dumps({'type': 'banana', 'loads': []}).encode(),
    'type is null': json.dumps({'type': None, 'loads': []}).encode(),
    'body is a list': b'[]',
    'body is a number': b'42',
    'body is a string': b'"simple"',
    'body is null': b'null',
    'malformed JSON': b'{',
    'not JSON at all': b'hello',
    'trailing garbage': b'{"loads":[]} x',
    'truncated list': b'{"loads": [}',
    'invalid UTF-8': b'\xff\xfe\x00{',
    'deeply nested': b'[' * 100000,
}


class ValidationTest(unittest.TestCase):
    def test_invalid_requests_return_400_with_json_error(self):
        for name, raw in BAD_REQUESTS.items():
            with self.subTest(case=name):
                status, payload = service.process(raw)
                self.assertEqual(status, 400)
                self.assertEqual(list(payload), ['error'])
                self.assertIsInstance(payload['error'], str)
                self.assertTrue(payload['error'])
                json.dumps(payload)  # must be serialisable

    def test_unreadable_content_length_returns_400(self):
        status, payload = service.process(None)
        self.assertEqual(status, 400)
        self.assertIn('error', payload)

    def test_body_length_parsing(self):
        self.assertEqual(service.body_length(None), 0)
        self.assertEqual(service.body_length('12'), 12)
        self.assertIsNone(service.body_length('abc'))
        self.assertIsNone(service.body_length('-5'))

    def test_boundary_values_are_accepted(self):
        edge = [load(W=0.5, x=0.05), load(W=50, x=0.95), load(W=50.0, x=0.05)]
        for beam_type in ('simple', 'compound'):
            with self.subTest(beam=beam_type):
                raw = json.dumps({'type': beam_type, 'loads': edge}).encode()
                self.assertEqual(service.process(raw)[0], 200)

    def test_exactly_fifty_loads_are_accepted(self):
        self.assertEqual(service.process(body(*[load(W=0.5) for _ in range(50)]))[0], 200)

    def test_integer_loads_are_accepted(self):
        self.assertEqual(service.process(body(load(W=10, x=1 / 2)))[0], 200)
        self.assertEqual(service.process(b'{"loads":[{"W":10,"x":0.5}]}')[0], 200)

    def test_missing_type_and_empty_body_default_to_simple_no_load(self):
        for raw in (b'', b'{}', b'{"loads":[]}'):
            with self.subTest(raw=raw):
                status, payload = service.process(raw)
                self.assertEqual(status, 200)
                self.assertEqual(len(payload['sup']), 2)   # simple beam: A and B
                self.assertEqual(payload['total'], 0)


if __name__ == '__main__':
    unittest.main()
