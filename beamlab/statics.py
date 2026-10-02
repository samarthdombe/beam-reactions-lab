"""Statics of the two beam types: self-loads, support reactions, bending moment.

Loads are ``(W, x)`` tuples: a point force W (N) at distance x (m) from the left end.
Supports are ``(x, R)`` tuples. Reactions are positive upward; a negative value is
uplift, which is statically correct (for example pin A of the compound beam when a
load sits to the right of the hinge).
"""
from .config import BALANCE_X, BEAM_LENGTH, HINGE_X, SELF_WEIGHT


def self_loads(beam_type):
    """Self-weight as point loads at the centroid of each segment."""
    if beam_type == 'simple':
        return [(SELF_WEIGHT, BEAM_LENGTH / 2)]
    left_share = HINGE_X / BEAM_LENGTH                    # left segment: 0 .. hinge
    right_share = (BEAM_LENGTH - HINGE_X) / BEAM_LENGTH   # right segment: hinge .. L
    return [(SELF_WEIGHT * left_share, HINGE_X / 2),
            (SELF_WEIGHT * right_share, (HINGE_X + BEAM_LENGTH) / 2)]


def reactions(beam_type, loads):
    """Return (supports [(x, R)], reading of the balance support, balance position)."""
    if beam_type == 'simple':
        b = sum(w * x for w, x in loads) / BEAM_LENGTH
        return [(0, sum(w for w, _ in loads) - b), (BEAM_LENGTH, b)], b, BEAM_LENGTH
    left = [load for load in loads if load[1] <= HINGE_X]
    right = [load for load in loads if load[1] > HINGE_X]
    c = sum(w * (x - HINGE_X) for w, x in right) / (BEAM_LENGTH - HINGE_X)   # roller C (right end)
    hinge_force = sum(w for w, _ in right) - c            # force passed through the hinge
    b = (sum(w * x for w, x in left) + hinge_force * HINGE_X) / BALANCE_X    # roller B (balance)
    a = sum(w for w, _ in left) + hinge_force - b                            # pin A
    return [(0, a), (BALANCE_X, b), (BEAM_LENGTH, c)], b, BALANCE_X


def bending_moment(supports, loads, xs):
    """Bending moment (N*m) at each station in ``xs``, from the left-hand forces."""
    return [sum(r * (x - s) for s, r in supports if x > s)
            - sum(w * (x - a) for w, a in loads if x > a)
            for x in xs]
