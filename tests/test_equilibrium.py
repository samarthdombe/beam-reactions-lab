"""Static equilibrium: the support reactions must carry the whole load."""
import unittest

from beamlab import service

LOAD_SETS = [
    [],
    [(10, 0.5)],
    [(5, 0.2), (12.5, 0.5), (8, 0.85)],
    [(10, 0.8)],
    [(0.5, 0.05), (50, 0.95)],
    [(7.5, 0.6), (7.5, 0.61), (3, 0.4)],
]


class EquilibriumTest(unittest.TestCase):
    def analyse(self, beam_type, loads):
        body = {'type': beam_type, 'loads': [{'W': w, 'x': x} for w, x in loads]}
        status, payload = service.handle(body)
        self.assertEqual(status, 200)
        return payload

    def test_sum_of_reactions_equals_total_load(self):
        for beam_type in ('simple', 'compound'):
            for loads in LOAD_SETS:
                with self.subTest(beam=beam_type, loads=loads):
                    out = self.analyse(beam_type, loads)
                    total = out['self_w'] + sum(w for w, _ in loads)
                    self.assertAlmostEqual(sum(s['r'] for s in out['sup']), total, delta=1e-9)

    def test_compound_load_right_of_hinge_uplifts_pin_a(self):
        """Statically correct: a load on the right makes pin A pull down (negative reaction)."""
        out = self.analyse('compound', [(10, 0.8)])
        self.assertLess(out['sup'][0]['r'], 0)

    def test_deflection_is_zero_at_every_support(self):
        for beam_type in ('simple', 'compound'):
            out = self.analyse(beam_type, [(10, 0.3), (5, 0.8)])
            for s in out['sup']:
                with self.subTest(beam=beam_type, support=s['x']):
                    self.assertAlmostEqual(out['defl'][round(s['x'] * 100)], 0.0, places=9)


if __name__ == '__main__':
    unittest.main()
