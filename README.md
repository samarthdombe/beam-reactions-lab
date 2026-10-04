# Beam Reactions Lab

A browser lab simulation for the **support reactions of a beam**. Add weights to a simple beam
or to a compound beam (pin A, roller/balance B, internal hinge, roller C), watch the beam bend and,
if you overload it, break. You choose the beam's length and self-weight, drag a handle to decide
where each weight goes, and on the compound beam drag the middle support (roller B) to move it. The
lab records balance readings in an observation table, checks static equilibrium, and exports a
report as PDF.

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

## Using the lab

Open **Simulation** from the navigation bar.

1. **Pick a beam** with *Beam type*: *Simple beam* or *Compound beam*.
2. **Optionally change the beam.** *Beam length L* (0.5 to 2.0 m) and *Beam self-weight* (0 to 20 N)
   restart the experiment when you change them.
3. **Choose where the weight goes.** Drag the blue handle above the beam (it starts at the midpoint
   and snaps to 0.01 m), or type the value in *Distance x*. The two stay in sync.
4. **Enter a weight and press *Add weight*.** The beam bends, the balance reading and the
   observation table update, and the stress bar fills. At full utilisation the beam breaks. Press
   *Reset experiment* to start again.
5. **Compound beam only:** drag the middle support (roller B, marked with blue arrows) left or right
   between 0.1·L and 0.5·L. The server is asked when you let go, and the experiment restarts,
   because readings taken with B somewhere else no longer apply. *Reset experiment* keeps B where you
   put it, and changing the beam length puts it back.
6. **Download experiment report as PDF** exports the report section.

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
│       ├── ui.js           # panels, Add/Reset/beam-change flows, config consumer
│       ├── handle.js       # drag handling: load-position handle and roller B
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
| `loads` | list of `{W, x}`      | Optional, defaults to `[]`. At most 50. `W` in [0.5, 50] N, `x` in [0.05·L, 0.95·L] m. |
| `beam`  | `{length, selfWeight, balanceX}` | Optional, and so is each field. `length` in [0.5, 2.0] m (default 1.0), `selfWeight` in [0, 20] N (default 4.0), `balanceX` = position of roller B on the compound beam, in [0.1·L, 0.5·L] m (default 0.4·L; accepted and ignored for the simple beam). Unknown fields are rejected. |

**Request**

```sh
curl -s -X POST localhost:8000/api/analyze \
  -d '{"type":"compound","loads":[{"W":10,"x":0.8}]}'
```

This uses the default beam (1 m, 4 N, roller B at 0.4 m). To choose another, add for example
`"beam":{"length":2.0,"selfWeight":6,"balanceX":0.5}`; the load position range then scales with the
length. Every field of `beam` is optional.

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
    "wMin": 0.5, "xMin": 0.05, "xMax": 0.95,
    "xbMin": 0.1, "xbMax": 0.5,
    "lMin": 0.5, "lMax": 2.0, "selfWeightMin": 0.0, "selfWeightMax": 20.0
  }
}
```

Reactions `sup[i].r` are in newtons, positive upward. `s` is the utilisation: the beam fails at
`s >= 1`. `config` carries every physics constant for the beam you asked for (length, hinge and balance
positions, self-weight), and the front end reads them from it. `wMin`, `xMin`, `xMax`, `xbMin`, `xbMax`, `lMin`,
`lMax`, `selfWeightMin` and `selfWeightMax` are the input limits the server enforces. See
[docs/physics.md](docs/physics.md) for the equations.

**Response `400`** for invalid input, with a JSON body:

```json
{"error": "loads[0].W must be between 0.5 and 50 N"}
```

The server rejects: `W` or `x` outside their ranges, a `beam` object with a bad or unknown field, non-finite numbers (`NaN`, `Infinity`),
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
- **Variable beam**: equilibrium (forces and moments), a zero-moment hinge, deflection at the supports,
  hand-computed 2 m reference cases, and the scaled limits, over several lengths and self-weights.
- **Movable roller B**: equilibrium and a zero-moment hinge for any B position (including loads exactly on
  the hinge or over B), a hand-computed case (B at 0.2 m), its range and validation, partial `beam`
  objects that fall back to the defaults, the exact error messages, and that every 0.01 m position the
  browser can snap to is accepted.
- **Entrypoints**: the Vercel handler and the local server answer the same way.

CI (`.github/workflows/ci.yml`) runs exactly these two commands.

The browser code (dragging, drawing, the Add and Reset flows) has **no automated tests in this repo**:
`node --check` only catches syntax errors. It was exercised during development with throwaway
Node scripts against the real server, which are not included.

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
- **"Assumed values" in `theory.html` are static text** and describe the default beam (1 m, 4 N, hinge
  at 0.6 m, roller B at 0.4 m), as are the numbers in the simulation page's HTML that duplicate the
  config: the initial Live values and the `min`/`max` attributes on the weight and distance inputs.
  On the simulation page the server's `config` overwrites them as soon as the first response arrives.
- **The drawn bending is exaggerated and normalised by L³** so that long and short beams look
  comparable. It shows the shape of the deflection, not its true size; the numbers come from the server.
- **Moving roller B restarts the experiment**, because readings taken with B somewhere else no longer
  apply. B must stay between 0.1·L and 0.5·L, left of the hinge; further right the beam would no longer be
  statically determinate. Deflection is zeroed at the nearest of the 101 grid stations, so for a B position
  between stations it is off by under half a station (at most 0.005·L).
- **Self-weight is independent of length.** A longer beam does not get heavier unless you raise the
  self-weight yourself.
- **The front end is not covered by automated tests**, as described under Testing.
- **html2pdf loads from a CDN without a Subresource Integrity (SRI) hash.**
- **Invalid input is now rejected.** Previously the server clamped `x` silently and accepted any
  `W`. Valid input gives the same numbers as before.
- **No LICENSE file yet.** Until one is added, the code is "all rights reserved" by default.
