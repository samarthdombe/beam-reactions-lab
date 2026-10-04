"""Single source of truth for every physical constant and input limit.

Beam length and self-weight are request-time inputs. The values below are their
*defaults* and allowed ranges; ``Beam`` holds the effective values for one request.
The front end never hard-codes any of this: ``public_config()`` is returned with each
API response and the browser reads its values from there.
"""
from dataclasses import dataclass

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
BALANCE_FRACTION = 0.4     # roller B (where the balance reads) / L

# --- Load limits (enforced by the server) ------------------------------------
W_MIN = 0.5                # smallest accepted added load (N)
W_MAX = 50.0               # largest accepted added load (N); also the failure load
X_MIN_FRACTION = 0.05      # nearest accepted load position to the left end / L
X_MAX_FRACTION = 0.95      # farthest accepted load position / L
MAX_LOADS = 50             # most loads accepted in one request

# --- Numerics ----------------------------------------------------------------
N_POINTS = 100             # beam is discretised into N_POINTS intervals

# --- Derived -----------------------------------------------------------------
EI = YOUNGS_MODULUS * SECTION_B * SECTION_H ** 3 / 12   # flexural rigidity (N*m^2)


@dataclass(frozen=True)
class Beam:
    """The beam for one request: its length and self-weight, plus the positions derived from them."""

    length: float = DEFAULT_LENGTH
    self_weight: float = DEFAULT_SELF_WEIGHT

    @property
    def hinge_x(self):
        return HINGE_FRACTION * self.length

    @property
    def balance_x(self):
        return BALANCE_FRACTION * self.length

    @property
    def x_min(self):
        return X_MIN_FRACTION * self.length

    @property
    def x_max(self):
        return X_MAX_FRACTION * self.length


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
        'lMin': L_MIN,
        'lMax': L_MAX,
        'selfWeightMin': SELF_WEIGHT_MIN,
        'selfWeightMax': SELF_WEIGHT_MAX,
    }
