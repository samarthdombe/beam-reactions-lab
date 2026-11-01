"""Single source of truth for every physical constant and input limit.

Beam length and self-weight are request-time inputs. The values below are their
*defaults* and allowed ranges; ``Beam`` holds the effective values for one request.
The front end never hard-codes any of this: ``public_config()`` is returned with each
API response and the browser reads its values from there.
"""
from dataclasses import dataclass
from typing import Optional

# --- Beam: defaults and allowed ranges (length and self-weight are user inputs) ---
DEFAULT_LENGTH = 1.0       # L, beam length (m)
L_MIN = 0.5                # shortest accepted beam (m)
L_MAX = 2.0                # longest accepted beam (m)
DEFAULT_SELF_WEIGHT = 0.0  # total self-weight of the beam (N); weightless unless the user sets one
SELF_WEIGHT_MIN = 0.0      # lightest accepted beam (N)
SELF_WEIGHT_MAX = 20.0     # heaviest accepted beam (N)

# --- Section and material ---------------------------------------------------
SECTION_B = 0.02           # timber section width b (m)
SECTION_H = 0.01           # timber section height h (m)
YOUNGS_MODULUS = 10e9      # E (Pa)
ULTIMATE_STRESS = 40e6     # ultimate bending stress (Pa)

# --- Compound beam layout, as fractions of the beam length -------------------
# The middle roller (the sliding support, shown as "C" in the browser; called "B"/balance in the API)
# can be moved, and the internal hinge sits exactly on top of it and moves with it.
BALANCE_FRACTION = 0.4     # default position of the sliding roller (and the hinge) / L
BALANCE_MIN_FRACTION = 0.1 # the sliding roller can be moved between these fractions of L
BALANCE_MAX_FRACTION = 0.9 # (past mid-span; the hinge rides on top, so any position keeps the beam determinate)

# --- Load limits (enforced by the server) ------------------------------------
W_MIN = 0.0                # smallest accepted added load (N)
W_MAX = 100.0              # largest accepted added load (N)
W_DECIMALS = 4             # an added load may have at most this many decimal places
FAILURE_LOAD = 50.0        # total added load at which the utilisation `s` reaches 1 (the browser,
                           # which treats the beam as rigid, ignores `s`)
X_MIN_FRACTION = 0.0       # loads can go anywhere from the left end ...
X_MAX_FRACTION = 1.0       # ... to the right end (fractions of L)
MAX_LOADS = 50             # most loads accepted in one request

# --- Numerics ----------------------------------------------------------------
N_POINTS = 100             # beam is discretised into N_POINTS intervals
LIMIT_DECIMALS = 6         # derived position limits are rounded to this many decimals

# --- Derived -----------------------------------------------------------------
EI = YOUNGS_MODULUS * SECTION_B * SECTION_H ** 3 / 12   # flexural rigidity (N*m^2)


@dataclass(frozen=True)
class Beam:
    """The beam for one request: its length and self-weight, plus the positions derived from them."""

    length: float = DEFAULT_LENGTH
    self_weight: float = DEFAULT_SELF_WEIGHT
    balance_position: Optional[float] = None   # roller B (m); None = the default BALANCE_FRACTION * L

    @property
    def hinge_x(self):
        """The internal hinge sits exactly on top of the sliding roller and moves with it."""
        return self.balance_x

    @property
    def balance_x(self):
        if self.balance_position is not None:
            return self.balance_position
        return BALANCE_FRACTION * self.length

    @property
    def balance_min(self):
        return round(BALANCE_MIN_FRACTION * self.length, LIMIT_DECIMALS)

    @property
    def balance_max(self):
        return round(BALANCE_MAX_FRACTION * self.length, LIMIT_DECIMALS)

    # The limits below are rounded to 6 decimals so each one is the double nearest its decimal
    # value (0.04, not 0.04000000000000001). The browser snaps drags to 0.01 m, and an unrounded
    # limit could sit a hair outside the value the browser sends.
    @property
    def x_min(self):
        return round(X_MIN_FRACTION * self.length, LIMIT_DECIMALS)

    @property
    def x_max(self):
        return round(X_MAX_FRACTION * self.length, LIMIT_DECIMALS)


def public_config(beam=None):
    """Constants the browser needs, in the JSON shape sent as ``config``."""
    beam = beam or Beam()
    return {
        'L': beam.length,
        'hx': beam.hinge_x,
        'xb': beam.balance_x,
        'selfWeight': beam.self_weight,
        'wMax': W_MAX,
        'nPoints': N_POINTS,
        'section': {'b': SECTION_B, 'h': SECTION_H},
        'E': YOUNGS_MODULUS,
        'ultimateStress': ULTIMATE_STRESS,
        'wMin': W_MIN,
        'wDecimals': W_DECIMALS,
        'xMin': beam.x_min,
        'xMax': beam.x_max,
        'xbMin': beam.balance_min,
        'xbMax': beam.balance_max,
        'lMin': L_MIN,
        'lMax': L_MAX,
        'selfWeightMin': SELF_WEIGHT_MIN,
        'selfWeightMax': SELF_WEIGHT_MAX,
    }