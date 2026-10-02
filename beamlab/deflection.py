"""Beam deflection by double integration of M/EI (trapezoidal rule).

Known limitation (see docs/physics.md): for the compound beam the slope is kept
continuous at the hinge and has a kink at roller B. Real behaviour is the reverse
(the hinge rotates freely, B is continuous), so the compound shape is approximate.
"""
from .config import BEAM_LENGTH, EI, N_POINTS


def deflection(moments, supports):
    """Deflection (mm, downward positive) at N_POINTS + 1 stations.

    ``moments`` has N_POINTS + 1 values. The rigid-body part is removed
    piecewise between neighbouring supports so deflection is zero at every support.
    """
    n, length = N_POINTS, BEAM_LENGTH
    theta, y = [0.0], [0.0]
    for i in range(1, n + 1):
        theta.append(theta[-1] + (moments[i] + moments[i - 1]) / 2 / EI * length / n)
        y.append(y[-1] + (theta[i] + theta[i - 1]) / 2 * length / n)
    idx = [round(s * n / length) for s, _ in supports]
    defl = [0.0] * (n + 1)
    for j in range(len(idx) - 1):
        for i in range(idx[j], idx[j + 1] + 1):
            u = (i - idx[j]) / (idx[j + 1] - idx[j])
            defl[i] = -(y[i] - (y[idx[j]] + (y[idx[j + 1]] - y[idx[j]]) * u)) * 1000
    return defl
