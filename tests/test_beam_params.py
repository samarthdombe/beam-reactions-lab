"""Variable beam length, self-weight and movable roller B: physics, config echo and validation."""
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
        self.assertAlmostEqual(cfg['xbMin'], 0.2, places=12)
        self.assertAlmostEqual(cfg['xbMax'], 1.0, places=12)
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

    def test_partial_beam_object_with_balance_only(self):
        # length and selfWeight omitted: both must fall back to their defaults
        status, out = post({'type': 'compound', 'beam': {'balanceX': 0.2}})
        self.assertEqual(status, 200)
        self.assertEqual((out['config']['L'], out['config']['selfWeight'], out['config']['xb']), (1.0, 4.0, 0.2))
        status, out = post({'type': 'compound', 'beam': {'length': 2.0, 'balanceX': 0.5}})
        self.assertEqual(status, 200)
        self.assertEqual((out['config']['L'], out['config']['selfWeight'], out['config']['xb']), (2.0, 4.0, 0.5))
        status, out = post({'type': 'compound', 'beam': {'selfWeight': 7, 'balanceX': 0.3}})
        self.assertEqual(status, 200)
        self.assertEqual((out['config']['L'], out['config']['selfWeight'], out['config']['xb']), (1.0, 7.0, 0.3))

    def test_no_beam_object_gives_the_default_beam(self):
        for body in ({}, {'type': 'compound'}, {'loads': []}, {'beam': None}):
            with self.subTest(body=body):
                status, out = post(body)
                self.assertEqual(status, 200)
                self.assertEqual((out['config']['L'], out['config']['selfWeight'], out['config']['xb']),
                                 (1.0, 4.0, 0.4))


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

    def test_error_messages_name_the_field_and_the_range(self):
        cases = [
            ({'beam': {'length': 3}}, 'beam.length must be between 0.5 and 2 m'),
            ({'beam': {'selfWeight': 21}}, 'beam.selfWeight must be between 0 and 20 N'),
            ({'beam': {'balanceX': 0.6}}, 'beam.balanceX must be between 0.1 and 0.5 m'),
            ({'beam': {'length': 2, 'balanceX': 0.1}}, 'beam.balanceX must be between 0.2 and 1 m'),
            ({'beam': {'length': 2}, 'loads': [{'W': 10, 'x': 1.95}]}, 'loads[0].x must be between 0.1 and 1.9 m'),
            ({'beam': {'length': 'a'}}, 'beam.length must be a number'),
            ({'beam': {'bogus': 1}}, "beam has unknown field 'bogus' (allowed: length, selfWeight, balanceX)"),
            ({'beam': []}, 'beam must be an object with length and/or selfWeight'),
        ]
        for body, message in cases:
            with self.subTest(body=body):
                status, payload = post(body)
                self.assertEqual((status, payload), (400, {'error': message}))

    def test_non_finite_beam_values_return_400(self):
        for literal in (b'NaN', b'Infinity', b'-Infinity'):
            for key in (b'length', b'selfWeight', b'balanceX'):
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



class SnappedValuesAreAcceptedTest(unittest.TestCase):
    """The browser snaps dragged positions to 0.01 m, inside the limits it is given. The server
    must accept every such value, including at lengths whose limits are not exactly representable
    (for example L = 0.8: 0.05 * 0.8 is 0.04000000000000001 in floating point)."""

    @staticmethod
    def snapped(limit, upper):
        import math
        tolerance = 1e-9
        if upper:
            return math.floor(limit * 100 + tolerance) / 100
        return math.ceil(limit * 100 - tolerance) / 100

    def test_snapped_limits_are_accepted_for_every_length(self):
        for k in range(50, 201):                        # L = 0.50 .. 2.00 m in 0.01 m steps
            length = k / 100
            beam = config.Beam(length)
            load_xs = [self.snapped(beam.x_min, False), self.snapped(beam.x_max, True)]
            balances = [self.snapped(beam.balance_min, False), self.snapped(beam.balance_max, True)]
            for x in load_xs:
                with self.subTest(L=length, load_x=x):
                    self.assertEqual(post(request('simple', length, 4.0, [(10, x)]))[0], 200)
            for balance in balances:
                with self.subTest(L=length, balance=balance):
                    body = request('compound', length, 4.0)
                    body['beam']['balanceX'] = balance
                    self.assertEqual(post(body)[0], 200)

    def test_derived_limits_are_nearest_decimal_values(self):
        beam = config.Beam(0.8)
        self.assertEqual((beam.x_min, beam.x_max), (0.04, 0.76))
        self.assertEqual((beam.balance_min, beam.balance_max), (0.08, 0.4))


class MovableBalanceTest(unittest.TestCase):
    """Roller B (the balance) can be moved along the compound beam."""

    def beam_with_balance(self, balance, length=1.0):
        return config.Beam(length, 4.0, balance)

    def test_hand_computed_balance_at_0_2(self):
        # L = 1 m, B moved to 0.2 m. Self-weight 4 N -> 2.4 N at 0.3 m, 1.6 N at 0.8 m; 10 N at 0.8 m.
        # R_C = (1.6 + 10) * (0.8 - 0.6) / 0.4 = 5.8 ; hinge force = 11.6 - 5.8 = 5.8
        # R_B = (2.4*0.3 + 5.8*0.6) / 0.2 = 21.0 ; R_A = 2.4 + 5.8 - 21.0 = -12.8
        body = request('compound', 1.0, 4.0, [(10, 0.8)])
        body['beam']['balanceX'] = 0.2
        status, out = post(body)
        self.assertEqual(status, 200)
        a, b, c = out['sup']
        self.assertAlmostEqual(a['r'], -12.8, places=9)
        self.assertAlmostEqual(b['r'], 21.0, places=9)
        self.assertAlmostEqual(c['r'], 5.8, places=9)
        self.assertEqual((b['x'], out['xb']), (0.2, 0.2))
        self.assertEqual(out['config']['xb'], 0.2)

    def test_equilibrium_for_any_balance_position(self):
        for length in (0.5, 1.0, 1.3, 2.0):
            for fraction in (0.1, 0.25, 0.4, 0.5):
                beam = self.beam_with_balance(fraction * length, length)
                loads = [(w, f * length) for w, f in LOAD_FRACTIONS]
                everything = self_loads('compound', beam) + loads
                supports, _, xb = reactions('compound', everything, beam)
                with self.subTest(L=length, B=fraction * length):
                    self.assertEqual(xb, fraction * length)
                    self.assertAlmostEqual(sum(r for _, r in supports), sum(w for w, _ in everything), delta=1e-9)
                    self.assertAlmostEqual(sum(r * s for s, r in supports), sum(w * a for w, a in everything), delta=1e-9)
                    self.assertAlmostEqual(bending_moment(supports, everything, [beam.hinge_x])[0], 0.0, delta=1e-9)

    def test_deflection_is_zero_at_the_moved_support(self):
        for balance in (0.1, 0.2, 0.3, 0.5):
            body = request('compound', 1.0, 4.0, [(10, 0.3), (5, 0.8)])
            body['beam']['balanceX'] = balance
            status, out = post(body)
            self.assertEqual(status, 200)
            with self.subTest(B=balance):
                self.assertAlmostEqual(out['defl'][round(balance * 100)], 0.0, places=9)

    def test_default_balance_is_unchanged(self):
        base = request('compound', 1.0, 4.0, [(10, 0.8)])
        explicit = request('compound', 1.0, 4.0, [(10, 0.8)])
        explicit['beam']['balanceX'] = 0.4
        self.assertEqual(json.dumps(post(base)[1]), json.dumps(post(explicit)[1]))

    def test_balance_range_scales_with_length(self):
        for length, low, high in ((1.0, 0.1, 0.5), (2.0, 0.2, 1.0), (0.5, 0.05, 0.25)):
            for value, expected in ((low, 200), (high, 200), (low * 0.9, 400), (high * 1.1, 400)):
                body = request('compound', length, 4.0)
                body['beam']['balanceX'] = value
                with self.subTest(L=length, B=value):
                    self.assertEqual(post(body)[0], expected)

    def test_balance_must_stay_left_of_the_hinge(self):
        for value in (0.6, 0.7, 0.95, 1.0):
            body = request('compound', 1.0, 4.0)
            body['beam']['balanceX'] = value
            with self.subTest(B=value):
                self.assertEqual(post(body)[0], 400)

    def test_invalid_balance_values(self):
        for value in ('0.3', True, None, [0.3], 0, -0.3):
            body = request('compound', 1.0, 4.0)
            body['beam']['balanceX'] = value
            with self.subTest(value=value):
                status, payload = post(body)
                self.assertEqual(status, 400)
                self.assertIn('error', payload)
        for literal in (b'NaN', b'Infinity', b'-Infinity'):
            status, _ = service.process(b'{"beam":{"balanceX":' + literal + b'}}')
            self.assertEqual(status, 400)

    def test_loads_exactly_on_the_hinge_or_on_roller_b(self):
        # A load at x = hx counts as part of the left segment; a load directly over B is fine too.
        for length in (1.0, 1.3, 2.0):
            for fraction in (0.1, 0.3, 0.5):
                beam = self.beam_with_balance(fraction * length, length)
                for position in (beam.hinge_x, beam.balance_x):
                    everything = self_loads('compound', beam) + [(10, position), (4, 0.9 * length)]
                    supports, _, _ = reactions('compound', everything, beam)
                    with self.subTest(L=length, B=beam.balance_x, load_at=position):
                        self.assertAlmostEqual(sum(r for _, r in supports), sum(w for w, _ in everything), delta=1e-9)
                        self.assertAlmostEqual(sum(r * s for s, r in supports),
                                               sum(w * a for w, a in everything), delta=1e-9)
                        self.assertAlmostEqual(bending_moment(supports, everything, [beam.hinge_x])[0], 0.0, delta=1e-9)

    def test_moving_balance_changes_only_the_reactions_it_should(self):
        # The right segment (hinge to C) does not depend on where B is, so R_C must not change.
        base = request('compound', 1.0, 4.0, [(10, 0.8)])
        moved = request('compound', 1.0, 4.0, [(10, 0.8)])
        moved['beam']['balanceX'] = 0.2
        out_default, out_moved = post(base)[1], post(moved)[1]
        self.assertAlmostEqual(out_default['sup'][2]['r'], out_moved['sup'][2]['r'], places=12)
        self.assertNotAlmostEqual(out_default['sup'][1]['r'], out_moved['sup'][1]['r'], places=3)

    def test_simple_beam_ignores_balance(self):
        plain = request('simple', 1.0, 4.0, [(10, 0.5)])
        moved = request('simple', 1.0, 4.0, [(10, 0.5)])
        moved['beam']['balanceX'] = 0.2
        plain_out, moved_out = post(plain)[1], post(moved)[1]
        for out in (plain_out, moved_out):
            out['config'].pop('xb')
        self.assertEqual(plain_out['sup'], moved_out['sup'])
        self.assertEqual(plain_out['defl'], moved_out['defl'])

if __name__ == '__main__':
    unittest.main()
