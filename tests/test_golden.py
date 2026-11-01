"""Golden parity: output must match the fixtures exactly.

The simple-beam fixtures were captured from the original prototype. The compound-beam fixtures were
regenerated when the hinge was moved on top of roller B (see docs/physics.md); the hand-computed
compound cases in test_beam_params.py check that layout independently.

The fixtures use the prototype's beam: 1 m long with a 4 N self-weight. The server's default
self-weight is now 0 N, so requests without a ``beam`` object get the prototype beam added here.
"""
import json
import unittest
from pathlib import Path

from beamlab import service

GOLDEN = sorted(Path(__file__).parent.joinpath('golden').glob('*.json'))
PROTOTYPE_BEAM = {'length': 1.0, 'selfWeight': 4.0}


def prototype_request(fixture):
    """The fixture's request, on the prototype beam unless it names its own beam."""
    request = dict(fixture['request'])
    request.setdefault('beam', PROTOTYPE_BEAM)
    return request


class GoldenParityTest(unittest.TestCase):
    def test_fixtures_present(self):
        names = {p.stem for p in GOLDEN}
        expected = {f'{t}_{c}' for t in ('simple', 'compound')
                    for c in ('no_load', 'one_load', 'three_loads', 'failure')}
        self.assertEqual(names, expected)

    def test_matches_original_exactly(self):
        for path in GOLDEN:
            with self.subTest(fixture=path.stem):
                fixture = json.loads(path.read_text(encoding='utf-8'))
                status, payload = service.process(json.dumps(prototype_request(fixture)).encode())
                self.assertEqual(status, 200)
                config = payload.pop('config')
                self.assertEqual(payload, fixture['response'])
                # also byte-for-byte on the wire (catches 0 vs 0.0 and -0.0 drift)
                self.assertEqual(json.dumps(payload), json.dumps(fixture['response']))
                self.assertEqual(list(payload), list(fixture['response']))
                self.assertIsInstance(config, dict)

    def test_failure_fixtures_trigger_failure(self):
        for path in GOLDEN:
            if path.stem.endswith('_failure'):
                with self.subTest(fixture=path.stem):
                    self.assertGreaterEqual(json.loads(path.read_text(encoding='utf-8'))['response']['s'], 1)

    def test_config_object(self):
        _, payload = service.handle({'type': 'simple', 'loads': []})
        self.assertEqual(payload['config'], {
            'L': 1.0, 'hx': 0.4, 'xb': 0.4, 'selfWeight': 0.0, 'wMax': 100.0, 'nPoints': 100,
            'section': {'b': 0.02, 'h': 0.01}, 'E': 10e9, 'ultimateStress': 40e6,
            'wMin': 0.0, 'wDecimals': 4, 'xMin': 0.0, 'xMax': 1.0, 'xbMin': 0.1, 'xbMax': 0.9,
            'lMin': 0.5, 'lMax': 2.0, 'selfWeightMin': 0.0, 'selfWeightMax': 20.0})

    def test_explicit_default_beam_matches_original_exactly(self):
        """Passing the default length and self-weight explicitly must change nothing."""
        for path in GOLDEN:
            with self.subTest(fixture=path.stem):
                fixture = json.loads(path.read_text(encoding='utf-8'))
                request = dict(fixture['request'], beam={'length': 1.0, 'selfWeight': 4.0})
                status, payload = service.process(json.dumps(request).encode())
                self.assertEqual(status, 200)
                payload.pop('config')
                self.assertEqual(json.dumps(payload), json.dumps(fixture['response']))


if __name__ == '__main__':
    unittest.main()
