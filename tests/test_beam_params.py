"""Variable beam length and self-weight: physics, config echo and validation."""
import json
import unittest

from beamlab import config, service
from beamlab.statics import bending_moment, reactions, self_loads

LENGTHS = [0.5, 0.75, 1.0, 1.3, 2.0]
SELF_WEIGHTS = [0.0, 2.5, 4.0, 20.0]
# Load positions as fractions of L (none sits exactly on the hinge at 0.6 L).
LOAD_FRACTIONS = [(5, 0.1), (12.5, 0.3), (8, 0.55), (3, 0.62), (7, 0.9)]


def request(beam_type, length, self_weight, loads=()):
    return {'type': beam_type, 'loads': [{'W': w, 'x': x} for w, x in loads],
            'beam': {'length': length, 'selfWeight': self_weight}}


def post(body):
    return service.process(json.dumps(body).encode())


class EquilibriumTest(unittest.TestCase):
    def cases(self):
        for beam_type in ('simple', 'compound'):
            for length in LENGTHS:
                for self_weight in SELF_WEIGHTS:
                    loads = [(w, f * length) for w, f in LOAD_FRACTIONS]
                    yield beam_type, config.Beam(length, self_weight), loads

    def test_forces_balance(self):
        for beam_type, beam, loads in self.cases():
            with self.subTest(beam=beam_type, L=beam.length, sw=beam.self_weight):
                everything = self_loads(beam_type, beam) + loads
                supports, _, _ = reactions(beam_type, everything, beam)
                self.assertAlmostEqual(sum(r for _, r in supports),
                                       sum(w for w, _ in everything), delta=1e-9)

    def test_moments_about_left_end_balance(self):
        """An independent second equilibrium equation: sum of R*x equals sum of W*x."""
        for beam_type, beam, loads in self.cases():
            with self.subTest(beam=beam_type, L=beam.length, sw=beam.self_weight):
                everything = self_loads(beam_type, beam) + loads
                supports, _, _ = reactions(beam_type, everything, beam)
                self.assertAlmostEqual(sum(r * s for s, r in supports),
                                       sum(w * a for w, a in everything), delta=1e-9)

    def test_compound_hinge_carries_no_moment(self):
        for _, beam, loads in self.cases():
            everything = self_loads('compound', beam) + loads
            supports, _, _ = reactions('compound', everything, beam)
            with self.subTest(L=beam.length, sw=beam.self_weight):
                m = bending_moment(supports, everything, [beam.hinge_x])[0]
                self.assertAlmostEqual(m, 0.0, delta=1e-9)

    def test_deflection_is_zero_at_every_support(self):
        for beam_type in ('simple', 'compound'):
            for length in LENGTHS:
                status, out = post(request(beam_type, length, 4.0, [(10, 0.3 * length), (5, 0.8 * length)]))
                self.assertEqual(status, 200)
                for s in out['sup']:
                    with self.subTest(beam=beam_type, L=length, support=s['x']):
                        self.assertAlmostEqual(out['defl'][round(s['x'] * 100 / length)], 0.0, places=9)


class HandComputedTest(unittest.TestCase):
    """Reference values worked out on paper, independent of the code."""

    def test_simple_beam_two_metres(self):
        # L = 2 m, self-weight 4 N at 1 m, 10 N at 0.5 m.
        # R_B = (10*0.5 + 4*1) / 2 = 4.5 ; R_A = 14 - 4.5 = 9.5
        status, out = post(request('simple', 2.0, 4.0, [(10, 0.5)]))
        self.assertEqual(status, 200)
        self.assertAlmostEqual(out['sup'][0]['r'], 9.5, places=9)
        self.assertAlmostEqual(out['sup'][1]['r'], 4.5, places=9)
        self.assertEqual(out['sup'][1]['x'], 2.0)

    def test_compound_beam_two_metres(self):
        # L = 2 m: hinge 1.2 m, B 0.8 m. Self-weight 6 N -> 3.6 N at 0.6 m, 2.4 N at 1.6 m.
        # 10 N at 1.8 m: R_C = (10*0.6 + 2.4*0.4) / 0.8 = 8.7 ; hinge force = 12.4 - 8.7 = 3.7
        # R_B = (3.6*0.6 + 3.7*1.2) / 0.8 = 8.25 ; R_A = 3.6 + 3.7 - 8.25 = -0.95 (uplift)
        status, out = post(request('compound', 2.0, 6.0, [(10, 1.8)]))
        self.assertEqual(status, 200)
        a, b, c = out['sup']
        self.assertAlmostEqual(a['r'], -0.95, places=9)
        self.assertAlmostEqual(b['r'], 8.25, places=9)
        self.assertAlmostEqual(c['r'], 8.7, places=9)
        self.assertAlmostEqual(b['x'], 0.8, places=12)
        self.assertEqual(c['x'], 2.0)
        self.assertAlmostEqual(out['xb'], 0.8, places=12)

    def test_zero_self_weight(self):
        status, out = post(request('simple', 1.0, 0.0, [(10, 0.5)]))
        self.assertEqual(status, 200)
        self.assertAlmostEqual(out['sup'][0]['r'], 5.0, places=9)
        self.assertEqual(out['self_w'], 0.0)
        self.assertEqual(out['init_bal'], 0.0)


class ConfigEchoTest(unittest.TestCase):
    def test_config_reports_effective_beam(self):
        status, out = post(request('compound', 2.0, 6.0))
        cfg = out['config']
        self.assertEqual(status, 200)
        self.assertEqual((cfg['L'], cfg['selfWeight']), (2.0, 6.0))
        self.assertAlmostEqual(cfg['hx'], 1.2, places=12)
        self.assertAlmostEqual(cfg['xb'], 0.8, places=12)
        self.assertAlmostEqual(cfg['xMin'], 0.1, places=12)
        self.assertAlmostEqual(cfg['xMax'], 1.9, places=12)
        self.assertEqual((cfg['lMin'], cfg['lMax']), (0.5, 2.0))
        self.assertEqual((cfg['selfWeightMin'], cfg['selfWeightMax']), (0.0, 20.0))
        self.assertEqual(out['self_w'], 6.0)

    def test_partial_beam_object_uses_defaults_for_the_rest(self):
        _, out = post({'beam': {'length': 1.5}})
        self.assertEqual((out['config']['L'], out['config']['selfWeight']), (1.5, 4.0))
        _, out = post({'beam': {'selfWeight': 7}})
        self.assertEqual((out['config']['L'], out['config']['selfWeight']), (1.0, 7.0))
        _, out = post({'beam': {}})
        self.assertEqual((out['config']['L'], out['config']['selfWeight']), (1.0, 4.0))


class BeamValidationTest(unittest.TestCase):
    BAD = {
        'length below minimum': {'beam': {'length': 0.49}},
        'length above maximum': {'beam': {'length': 2.01}},
        'length zero': {'beam': {'length': 0}},
        'length negative': {'beam': {'length': -1}},
        'length huge': {'beam': {'length': 1e9}},
        'length string': {'beam': {'length': '1'}},
        'length boolean': {'beam': {'length': True}},
        'length null': {'beam': {'length': None}},
        'length list': {'beam': {'length': [1]}},
        'selfWeight negative': {'beam': {'selfWeight': -0.1}},
        'selfWeight above maximum': {'beam': {'selfWeight': 20.01}},
        'selfWeight string': {'beam': {'selfWeight': '4'}},
        'selfWeight boolean': {'beam': {'selfWeight': False}},
        'selfWeight null': {'beam': {'selfWeight': None}},
        'beam is a list': {'beam': []},
        'beam is a number': {'beam': 5},
        'beam is a string': {'beam': 'big'},
        'unknown beam field': {'beam': {'lenght': 1.0}},
        'x above scaled maximum (L=2)': {'beam': {'length': 2.0}, 'loads': [{'W': 10, 'x': 1.95}]},
        'x below scaled minimum (L=2)': {'beam': {'length': 2.0}, 'loads': [{'W': 10, 'x': 0.06}]},
        'x above scaled maximum (L=0.5)': {'beam': {'length': 0.5}, 'loads': [{'W': 10, 'x': 0.48}]},
    }

    def test_invalid_beam_returns_400_with_json_error(self):
        for name, body in self.BAD.items():
            with self.subTest(case=name):
                status, payload = post(body)
                self.assertEqual(status, 400)
                self.assertEqual(list(payload), ['error'])
                self.assertTrue(payload['error'])

    def test_non_finite_beam_values_return_400(self):
        for literal in (b'NaN', b'Infinity', b'-Infinity'):
            for key in (b'length', b'selfWeight'):
                with self.subTest(key=key, literal=literal):
                    status, payload = service.process(b'{"beam":{"' + key + b'":' + literal + b'}}')
                    self.assertEqual(status, 400)
                    self.assertIn('error', payload)

    def test_boundaries_are_accepted(self):
        for length in (0.5, 2.0):
            for self_weight in (0.0, 20.0):
                for beam_type in ('simple', 'compound'):
                    with self.subTest(L=length, sw=self_weight, beam=beam_type):
                        self.assertEqual(post(request(beam_type, length, self_weight))[0], 200)

    def test_x_limits_scale_with_length(self):
        self.assertEqual(post({'beam': {'length': 2.0}, 'loads': [{'W': 10, 'x': 1.5}]})[0], 200)
        self.assertEqual(post({'beam': {'length': 1.0}, 'loads': [{'W': 10, 'x': 1.5}]})[0], 400)
        self.assertEqual(post({'beam': {'length': 0.5}, 'loads': [{'W': 10, 'x': 0.025}]})[0], 200)
        self.assertEqual(post({'beam': {'length': 1.0}, 'loads': [{'W': 10, 'x': 0.025}]})[0], 400)

    def test_scaled_x_boundaries_are_accepted_exactly(self):
        for length in (0.5, 1.3, 2.0):
            beam = config.Beam(length)
            for x in (beam.x_min, beam.x_max):
                with self.subTest(L=length, x=x):
                    self.assertEqual(post(request('simple', length, 4.0, [(10, x)]))[0], 200)


if __name__ == '__main__':
    unittest.main()
