"""Golden parity: output must match fixtures captured from the original prototype exactly."""
import json
import unittest
from pathlib import Path

from beamlab import service

GOLDEN = sorted(Path(__file__).parent.joinpath('golden').glob('*.json'))


class GoldenParityTest(unittest.TestCase):
    def test_fixtures_present(self):
        names = {p.stem for p in GOLDEN}
        expected = {f'{t}_{c}' for t in ('simple', 'compound')
                    for c in ('no_load', 'one_load', 'three_loads', 'failure')}
        self.assertEqual(names, expected)

    def test_matches_original_exactly(self):
        for path in GOLDEN:
            with self.subTest(fixture=path.stem):
                fixture = json.loads(path.read_text())
                status, payload = service.process(json.dumps(fixture['request']).encode())
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
                    self.assertGreaterEqual(json.loads(path.read_text())['response']['s'], 1)

    def test_config_object(self):
        _, payload = service.handle({'type': 'simple', 'loads': []})
        self.assertEqual(payload['config'], {
            'L': 1.0, 'hx': 0.6, 'xb': 0.4, 'selfWeight': 4.0, 'wMax': 50.0, 'nPoints': 100,
            'section': {'b': 0.02, 'h': 0.01}, 'E': 10e9, 'ultimateStress': 40e6,
            'wMin': 0.5, 'xMin': 0.05, 'xMax': 0.95})


if __name__ == '__main__':
    unittest.main()
