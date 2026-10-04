"""Statics of the two beam types: self-loads, support reactions, bending moment.

Loads are ``(W, x)`` tuples: a point force W (N) at distance x (m) from the left end.
Supports are ``(x, R)`` tuples. Reactions are positive upward; a negative value is
uplift, which is statically correct (for example pin A of the compound beam when a
load sits to the right of the hinge).

Every function takes the ``Beam`` for the request (length, self-weight, hinge and
balance positions) so nothing here depends on module-level globals.
"""
from .config import Beam


def self_loads(beam_type, beam=Beam()):
    """Self-weight as point loads at the centroid of each segment."""
    if beam_type == 'simple':
        return [(beam.self_weight, beam.length / 2)]
    left_share = beam.hinge_x / beam.length                    # left segment: 0 .. hinge
    right_share = (beam.length - beam.hinge_x) / beam.length   # right segment: hinge .. L
    return [(beam.self_weight * left_share, beam.hinge_x / 2),
            (beam.self_weight * right_share, (beam.hinge_x + beam.length) / 2)]


def reactions(beam_type, loads, beam=Beam()):
    """Return (supports [(x, R)], reading of the balance support, balance position)."""
    length = beam.length
    if beam_type == 'simple':
        b = sum(w * x for w, x in loads) / length
        return [(0, sum(w for w, _ in loads) - b), (length, b)], b, length
    hinge_x, balance_x = beam.hinge_x, beam.balance_x
    left = [load for load in loads if load[1] <= hinge_x]
    right = [load for load in loads if load[1] > hinge_x]
    c = sum(w * (x - hinge_x) for w, x in right) / (length - hinge_x)   # roller C (right end)
    hinge_force = sum(w for w, _ in right) - c            # force passed through the hinge
    b = (sum(w * x for w, x in left) + hinge_force * hinge_x) / balance_x   # roller B (balance)
    a = sum(w for w, _ in left) + hinge_force - b                           # pin A
    return [(0, a), (balance_x, b), (length, c)], b, balance_x


def bending_moment(supports, loads, xs):
    """Bending moment (N*m) at each station in ``xs``, from the left-hand forces."""
    return [sum(r * (x - s) for s, r in supports if x > s)
            - sum(w * (x - a) for w, a in loads if x > a)
            for x in xs]
