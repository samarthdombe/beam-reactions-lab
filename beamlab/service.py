"""Request pipeline: validate(body) -> analyze() -> (status, payload).

This is the only place request handling lives. ``api/analyze.py`` (Vercel) and
``scripts/run_local.py`` (dev server) both call :func:`process`. No network or
file I/O happens here.
"""
import json
import math

from . import config
from .deflection import deflection
from .statics import bending_moment, reactions, self_loads

BEAM_TYPES = ('simple', 'compound')


class ValidationError(ValueError):
    """The request body is not acceptable; the message is returned to the client."""


# --- Validation ------------------------------------------------------------

def _number_in_range(value, label, low, high, unit):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError(f'{label} must be a number')
    if isinstance(value, float) and not math.isfinite(value):
        raise ValidationError(f'{label} must be a finite number')
    if not low <= value <= high:
        raise ValidationError(f'{label} must be between {low:g} and {high:g} {unit}')
    return float(value)


BEAM_KEYS = ('length', 'selfWeight', 'balanceX')


def _validate_beam(raw):
    """Optional ``beam`` object: {"length": m, "selfWeight": N, "balanceX": m}.

    Omitted fields use the defaults. ``balanceX`` is the position of roller B on the compound
    beam; it is accepted (and ignored) for the simple beam.
    """
    if raw is None:
        return config.Beam()
    if not isinstance(raw, dict):
        raise ValidationError('beam must be an object with length and/or selfWeight')
    unknown = sorted(set(raw) - set(BEAM_KEYS))
    if unknown:
        raise ValidationError(f"beam has unknown field '{unknown[0]}' (allowed: length, selfWeight, balanceX)")
    length = config.DEFAULT_LENGTH
    self_weight = config.DEFAULT_SELF_WEIGHT
    if 'length' in raw:
        length = _number_in_range(raw['length'], 'beam.length', config.L_MIN, config.L_MAX, 'm')
    if 'selfWeight' in raw:
        self_weight = _number_in_range(raw['selfWeight'], 'beam.selfWeight',
                                       config.SELF_WEIGHT_MIN, config.SELF_WEIGHT_MAX, 'N')
    balance_position = None
    if 'balanceX' in raw:
        limits = config.Beam(length=length)
        balance_position = _number_in_range(raw['balanceX'], 'beam.balanceX',
                                            limits.balance_min, limits.balance_max, 'm')
    return config.Beam(length=length, self_weight=self_weight, balance_position=balance_position)


def validate(body):
    """Check a parsed JSON body; return ``(beam_type, [(W, x), ...], Beam)`` or raise ValidationError."""
    if not isinstance(body, dict):
        raise ValidationError('Request body must be a JSON object')
    beam_type = body.get('type', 'simple')
    if not isinstance(beam_type, str) or beam_type not in BEAM_TYPES:
        raise ValidationError("type must be 'simple' or 'compound'")
    beam = _validate_beam(body.get('beam'))
    raw_loads = body.get('loads', [])
    if not isinstance(raw_loads, list):
        raise ValidationError('loads must be a list')
    if len(raw_loads) > config.MAX_LOADS:
        raise ValidationError(f'loads must contain at most {config.MAX_LOADS} items')
    loads = []
    for i, item in enumerate(raw_loads):
        if not isinstance(item, dict):
            raise ValidationError(f'loads[{i}] must be an object with W and x')
        for key in ('W', 'x'):
            if key not in item:
                raise ValidationError(f'loads[{i}].{key} is required')
        w = _number_in_range(item['W'], f'loads[{i}].W', config.W_MIN, config.W_MAX, 'N')
        x = _number_in_range(item['x'], f'loads[{i}].x', beam.x_min, beam.x_max, 'm')
        loads.append((w, x))
    return beam_type, loads, beam


# --- Analysis --------------------------------------------------------------

def analyze(beam_type, added, beam=config.Beam()):
    """Analyse ``beam`` under its self-weight plus the ``added`` (W, x) loads."""
    own = self_loads(beam_type, beam)
    all_loads = own + added
    supports, balance, xb = reactions(beam_type, all_loads, beam)
    n = config.N_POINTS
    xs = [i * beam.length / n for i in range(n + 1)]
    moments = bending_moment(supports, all_loads, xs)
    defl = deflection(moments, supports, beam)
    peak = max(abs(m) for m in moments)
    x_peak = xs[[abs(m) for m in moments].index(peak)] if peak else beam.length / 2
    sigma = 6 * peak / (config.SECTION_B * config.SECTION_H * config.SECTION_H)
    total = sum(w for w, _ in added)
    return {'sup': [{'x': s, 'r': r} for s, r in supports], 'xb': xb, 'bal': balance,
            'init_bal': reactions(beam_type, own, beam)[1],
            'added_bal': reactions(beam_type, added, beam)[1] if added else 0.0,
            'M': peak, 'xm': x_peak, 'sigma': sigma, 'total': total, 'self_w': beam.self_weight,
            's': max(sigma / config.ULTIMATE_STRESS, total / config.W_MAX), 'defl': defl,
            'config': config.public_config(beam)}


# --- Request pipeline ------------------------------------------------------

def handle(body):
    """Validate and analyse a parsed body. Returns ``(http_status, payload_dict)``."""
    try:
        beam_type, loads, beam = validate(body)
    except ValidationError as err:
        return 400, {'error': str(err)}
    return 200, analyze(beam_type, loads, beam)


def body_length(header_value):
    """Parse a Content-Length header: bytes to read, or None when it is invalid."""
    if header_value is None:
        return 0
    try:
        length = int(header_value)
    except ValueError:
        return None
    return length if length >= 0 else None


def process(raw):
    """Full pipeline for one POST. ``raw`` is the request body bytes, or None if unreadable."""
    if raw is None:
        return 400, {'error': 'Invalid Content-Length header'}
    try:
        body = json.loads(raw or b'{}')
    except (ValueError, RecursionError):
        return 400, {'error': 'Request body is not valid JSON'}
    try:
        return handle(body)
    except Exception:  # keep the connection answerable; details stay server-side
        return 500, {'error': 'Internal error'}
