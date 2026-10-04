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
DEFAULT_SELF_WEIGHT = 4.0  # total self-weight of the beam (N)
SELF_WEIGHT_MIN = 0.0      # lightest accepted beam (N)
SELF_WEIGHT_MAX = 20.0     # heaviest accepted beam (N)

# --- Section and material ---------------------------------------------------
SECTION_B = 0.02           # timber section width b (m)
SECTION_H = 0.01           # timber section height h (m)
YOUNGS_MODULUS = 10e9      # E (Pa)
ULTIMATE_STRESS = 40e6     # ultimate bending stress (Pa)

# --- Compound beam layout, as fractions of the beam length -------------------
HINGE_FRACTION = 0.6       # internal hinge position / L
BALANCE_FRACTION = 0.4     # default position of roller B (where the balance reads) / L
BALANCE_MIN_FRACTION = 0.1 # roller B can be moved between these fractions of L; it must stay
BALANCE_MAX_FRACTION = 0.5 # left of the hinge (0.6 L), or the beam is no longer statically determinate

# --- Load limits (enforced by the server) ------------------------------------
W_MIN = 0.5                # smallest accepted added load (N)
W_MAX = 50.0               # largest accepted added load (N); also the failure load
X_MIN_FRACTION = 0.05      # nearest accepted load position to the left end / L
X_MAX_FRACTION = 0.95      # farthest accepted load position / L
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
        return HINGE_FRACTION * self.length

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
        'xMin': beam.x_min,
        'xMax': beam.x_max,
        'xbMin': beam.balance_min,
        'xbMax': beam.balance_max,
        'lMin': L_MIN,
        'lMax': L_MAX,
        'selfWeightMin': SELF_WEIGHT_MIN,
        'selfWeightMax': SELF_WEIGHT_MAX,
    }