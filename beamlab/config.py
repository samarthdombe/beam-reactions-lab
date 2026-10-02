"""Single source of truth for every physical constant and input limit.

The front end never hard-codes these: ``public_config()`` is returned with each
API response and the browser reads its values from there.
"""

# --- Geometry and material -------------------------------------------------
BEAM_LENGTH = 1.0          # L, beam length (m)
SELF_WEIGHT = 4.0          # total self-weight of the beam (N)
SECTION_B = 0.02           # timber section width b (m)
SECTION_H = 0.01           # timber section height h (m)
YOUNGS_MODULUS = 10e9      # E (Pa)
ULTIMATE_STRESS = 40e6     # ultimate bending stress (Pa)

# --- Compound beam layout --------------------------------------------------
HINGE_X = 0.6              # internal hinge position (m)
BALANCE_X = 0.4            # roller B, where the balance reads (m)

# --- Load limits (enforced by the server) ----------------------------------
W_MIN = 0.5                # smallest accepted added load (N)
W_MAX = 50.0               # largest accepted added load (N); also the failure load
X_MIN = 0.05               # nearest accepted load position to the left support (m)
X_MAX = 0.95               # farthest accepted load position (m)
MAX_LOADS = 50             # most loads accepted in one request

# --- Numerics --------------------------------------------------------------
N_POINTS = 100             # beam is discretised into N_POINTS intervals

# --- Derived ---------------------------------------------------------------
EI = YOUNGS_MODULUS * SECTION_B * SECTION_H ** 3 / 12   # flexural rigidity (N*m^2)


def public_config():
    """Constants the browser needs, in the JSON shape sent as ``config``."""
    return {
        'L': BEAM_LENGTH,
        'hx': HINGE_X,
        'xb': BALANCE_X,
        'selfWeight': SELF_WEIGHT,
        'wMax': W_MAX,
        'nPoints': N_POINTS,
        'section': {'b': SECTION_B, 'h': SECTION_H},
        'E': YOUNGS_MODULUS,
        'ultimateStress': ULTIMATE_STRESS,
        'wMin': W_MIN,
        'xMin': X_MIN,
        'xMax': X_MAX,
    }
