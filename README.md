# Beam Reactions Lab

A browser lab simulation for the **support reactions of a beam**. Add weights to a simple beam
or to a compound beam (pin A, roller/balance B, internal hinge, roller C), watch the beam bend
and, if you overload it, break. It records balance readings in an observation table, checks
static equilibrium, and exports a report as PDF.

**Why it exists:** a hands-on way to see the moment law (ΣF = 0, ΣM = 0) hold, without lab
equipment. The physics runs on a small Python backend and the front end is plain HTML, CSS and
JavaScript. There are **no dependencies, no bundler and no build step**.

<!-- TODO: add a screenshot, e.g. docs/screenshot.png, then replace this line with:
![Beam Reactions Lab simulation](docs/screenshot.png) -->
> *Screenshot placeholder.*

## Quickstart

### Local

Requires Python 3.10+. Nothing to install.

```sh
python scripts/run_local.py
```

Open <http://localhost:8000>. Press `Control+C` to stop. The script serves `public/` and answers
`POST /api/analyze`. Use `python3` if `python` is not available on your system.

### Vercel

The repo is set up for Vercel (`vercel.json`): `public/` is the static site and
`api/analyze.py` is a Python serverless function.

```sh
vercel          # preview deploy
vercel --prod   # production deploy
```

`vercel dev` runs the same layout locally, but routing through it has **not been verified** in this
repo yet. `python scripts/run_local.py` is the tested local path.

## Repository layout

```
beam-reactions-lab/
├── api/analyze.py          # thin Vercel entrypoint -> beamlab.service
├── beamlab/                # stdlib-only package, no I/O
│   ├── config.py           # single source of truth for all constants
│   ├── statics.py          # self-loads, reactions, bending moment
│   ├── deflection.py       # double integration + support correction
│   └── service.py          # validate(body) -> analyze() -> (status, dict)
├── public/                 # static site
│   ├── index.html  theory.html  simulation.html
│   ├── css/style.css
│   └── js/                 # native ES modules
│       ├── main.js         # entry point, wires the controls
│       ├── api.js          # POST /api/analyze client
│       ├── state.js        # shared state, measurement-noise model
│       ├── render.js       # canvas drawing, failure animation
│       ├── ui.js           # panels, Add/Reset flows, config consumer
│       ├── report.js       # PDF export
│       └── constants.js    # UI and drawing constants (no physics)
├── scripts/run_local.py    # dev server, calls beamlab.service
├── tests/                  # unittest only; tests/golden/*.json
├── docs/physics.md         # equations, assumptions, known limitations
├── .github/                # CI workflow, PR template
└── README.md  CONTRIBUTING.md  pyproject.toml  vercel.json  .gitignore  .editorconfig
```

## API

`POST /api/analyze` with a JSON body.

| Field   | Type                  | Notes                                                                |
|---------|-----------------------|----------------------------------------------------------------------|
| `type`  | `"simple"` or `"compound"` | Optional, defaults to `"simple"`.                               |
| `loads` | list of `{W, x}`      | Optional, defaults to `[]`. At most 50. `W` in [0.5, 50] N, `x` in [0.05, 0.95] m. |

**Request**

```sh
curl -s -X POST localhost:8000/api/analyze \
  -d '{"type":"compound","loads":[{"W":10,"x":0.8}]}'
```

**Response `200`** (numbers rounded and `defl` shortened here; the server returns full precision):

```json
{
  "sup": [{"x": 0, "r": -2.3}, {"x": 0.4, "r": 10.5}, {"x": 1.0, "r": 5.8}],
  "xb": 0.4,
  "bal": 10.5,
  "init_bal": 3.0,
  "added_bal": 7.5,
  "M": 1.16,
  "xm": 0.8,
  "sigma": 3480000.0,
  "total": 10.0,
  "self_w": 4.0,
  "s": 0.2,
  "defl": [0.0, -0.0374, -0.0746, "... 101 values, mm, downward positive"],
  "config": {
    "L": 1.0, "hx": 0.6, "xb": 0.4, "selfWeight": 4.0, "wMax": 50.0, "nPoints": 100,
    "section": {"b": 0.02, "h": 0.01}, "E": 10000000000.0, "ultimateStress": 40000000.0,
    "wMin": 0.5, "xMin": 0.05, "xMax": 0.95
  }
}
```

Reactions `sup[i].r` are in newtons, positive upward. `s` is the utilisation: the beam fails at
`s >= 1`. `config` carries every physics constant, and the front end reads them from it.
`wMin`, `xMin` and `xMax` are the input limits the server enforces. See
[docs/physics.md](docs/physics.md) for the equations.

**Response `400`** for invalid input, with a JSON body:

```json
{"error": "loads[0].W must be between 0.5 and 50 N"}
```

The server rejects: `W` or `x` outside their ranges, non-finite numbers (`NaN`, `Infinity`),
values that are not numbers (strings, booleans, `null`), missing `W` or `x`, an unknown `type`,
`loads` that is not a list, more than 50 loads, and malformed JSON. Unexpected server failures
return `500` with `{"error": "Internal error"}`.

## Testing

```sh
python -m unittest discover -s tests
for f in public/js/*.js; do node --check "$f"; done    # needs Node.js
```

The unit tests cover:

- **Golden parity**: the output must equal fixtures in `tests/golden/`, captured from the original
  prototype before it was refactored (simple and compound beams × no load, one load, three loads,
  and a load that breaks the beam).
- **Equilibrium**: ΣR equals the total load for both beam types.
- **Validation**: every rule above returns `400` with a JSON error.
- **Entrypoints**: the Vercel handler and the local server answer the same way.

CI (`.github/workflows/ci.yml`) runs exactly these two commands.

## Deploy

1. Push the repo to GitHub and import it in Vercel (or run `vercel` from the repo root).
2. No build command, environment variables or dependencies are needed. `vercel.json` serves
   `public/` and bundles `beamlab/**` with the function.
3. Open `/simulation.html` on the deployment and add a weight to confirm the API responds.

## Known limitations

The first three are about the physics and are explained in [docs/physics.md](docs/physics.md).
None of these have been fixed on purpose, because fixing them would change results or the visible behaviour.

- **Compound deflection shape is approximate.** The slope is continuous at the hinge and has a kink
  at roller B, the reverse of real behaviour. Reactions, moments and stress are unaffected.
- **Uplift at pin A.** A compound beam with loads to the right of the hinge gives a negative
  reaction at A. This is statically correct.
- **`R_analytical` row semantics are ambiguous.** Each table row shows the cumulative reaction of
  all loads added so far next to only the latest `W` and `x`.
- **Navigation bar is copy-pasted** into all three HTML pages.
- **"Assumed values" in `theory.html` are static text**, as are the numbers in the HTML that
  duplicate the config: the initial Live values and the `min`/`max` attributes on the weight and
  distance inputs. On the simulation page the server's `config` overwrites them as soon as the
  first response arrives.
- **html2pdf loads from a CDN without a Subresource Integrity (SRI) hash.**
- **Invalid input is now rejected.** Previously the server clamped `x` silently and accepted any
  `W`. Valid input gives the same numbers as before.
- **No LICENSE file yet.** Until one is added, the code is "all rights reserved" by default.
