"""Beam analysis API: a Vercel Python serverless function (standard library only)."""
import json
from http.server import BaseHTTPRequestHandler

L, SW, WMAX, SU = 1.0, 4.0, 50.0, 40e6   # length (m), self-weight (N), max added load (N), ultimate stress (Pa)
B, H, E = 0.02, 0.01, 10e9               # section b x h (m), Young's modulus (Pa)
HX, XB = 0.6, 0.4                        # compound beam: hinge and balance positions (m)
EI, N = E * B * H ** 3 / 12, 100


def self_loads(t):
    return [(SW, .5)] if t == 'simple' else [(SW * .6, .3), (SW * .4, .8)]


def reactions(t, ls):
    """Return supports [(x, R)], reading of the balance support, and its position."""
    if t == 'simple':
        b = sum(w * x for w, x in ls) / L
        return [(0, sum(w for w, _ in ls) - b), (L, b)], b, L
    lf, rt = [l for l in ls if l[1] <= HX], [l for l in ls if l[1] > HX]
    c = sum(w * (x - HX) for w, x in rt) / (L - HX)      # roller C (right end)
    hy = sum(w for w, _ in rt) - c                       # force passed through the hinge
    b = (sum(w * x for w, x in lf) + hy * HX) / XB       # roller B (balance)
    a = sum(w for w, _ in lf) + hy - b                   # pin A
    return [(0, a), (XB, b), (L, c)], b, XB


def analyze(d):
    t = 'compound' if d.get('type') == 'compound' else 'simple'
    added = [(float(l['W']), min(.95, max(.05, float(l['x'])))) for l in d.get('loads', [])]
    allw = self_loads(t) + added
    sup, bal, xb = reactions(t, allw)
    xs = [i * L / N for i in range(N + 1)]
    M = [sum(r * (x - s) for s, r in sup if x > s) - sum(w * (x - a) for w, a in allw if x > a) for x in xs]
    # double integration of M/EI, then remove the rigid-body part so deflection is zero at every support
    th, y = [0.0], [0.0]
    for i in range(1, N + 1):
        th.append(th[-1] + (M[i] + M[i - 1]) / 2 / EI * L / N)
        y.append(y[-1] + (th[i] + th[i - 1]) / 2 * L / N)
    idx = [round(s * N / L) for s, _ in sup]
    defl = [0.0] * (N + 1)
    for j in range(len(idx) - 1):
        for i in range(idx[j], idx[j + 1] + 1):
            u = (i - idx[j]) / (idx[j + 1] - idx[j])
            defl[i] = -(y[i] - (y[idx[j]] + (y[idx[j + 1]] - y[idx[j]]) * u)) * 1000   # mm, downward positive
    Mm = max(abs(m) for m in M)
    xm = xs[[abs(m) for m in M].index(Mm)] if Mm else .5
    sig, tot = 6 * Mm / (B * H * H), sum(w for w, _ in added)
    return {'sup': [{'x': s, 'r': r} for s, r in sup], 'xb': xb, 'bal': bal,
            'init_bal': reactions(t, self_loads(t))[1],
            'added_bal': reactions(t, added)[1] if added else 0.0,
            'M': Mm, 'xm': xm, 'sigma': sig, 'total': tot, 'self_w': SW,
            's': max(sig / SU, tot / WMAX), 'defl': defl}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            data = json.loads(self.rfile.read(int(self.headers.get('content-length', 0))) or b'{}')
            body, code = json.dumps(analyze(data)).encode(), 200
        except Exception as e:
            body, code = json.dumps({'error': str(e)}).encode(), 400
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)
