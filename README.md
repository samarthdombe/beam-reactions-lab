# Beam Reactions Lab

A browser lab simulation for the **support reactions of a rigid beam**. Add weights to a simple
beam or to a compound beam and read the reaction at every support. The lab records the reactions in
an observation table, checks static equilibrium (ΣF = 0, ΣM = 0) and exports a report as PDF.

- **Simple beam:** pin A at the left end, roller B at the right end.
- **Compound beam:** pin A at the left end, a sliding roller **C** with an internal hinge directly on
  top of it (drag it anywhere between 0.1·L and 0.9·L), and roller B at the right end.
- The beam is **rigid**: it does not bend, crack or break. Only the reactions change.
- Weights from **0 to 100 N** (up to 4 decimal places), placed anywhere from **x = 0 to x = L**.
- Beam length 0.5 to 2 m and self-weight 0 to 20 N (default **0 N**). Lengths can be shown in
  **metres or centimetres**.

**Why it exists:** a hands-on way to see the moment law hold, without lab equipment. The physics runs
on a small Python backend and the front end is plain HTML, CSS and JavaScript. There are **no
dependencies, no bundler and no build step**.

## Quickstart

### Local

Requires Python 3.10+. Nothing to install.

```sh
python3 scripts/run_local.py      # macOS / Linux
py scripts\run_local.py           # Windows (or: python scripts\run_local.py)
```

Open <http://localhost:8040>. Press `Control+C` to stop. The script serves `public/` and answers
`POST /api/analyze` over a dual-stack (IPv6+IPv4) socket. If the port is busy or reserved, it
automatically tries the next 5 ports, or you can override it with `PORT=8050 python3 scripts/run_local.py`.
Opening `simulation.html` directly (`file://`) shows an in-page warning directing you to run the server.

### Vercel

The repo is set up for Vercel (`vercel.json`): `public/` is the static site and `api/analyze.py` is
a Python function. `api/analyze.py` offers the same handler twice: `handler` (a
`BaseHTTPRequestHandler` class, for Vercel's classic Python runtime) and `app` (a WSGI callable, which
newer runtimes and `vercel dev` require; `pyproject.toml` points `[tool.vercel] entrypoint` at it).

```sh
vercel          # preview deploy
vercel --prod   # production deploy
vercel dev      # local, through the Vercel CLI
```

## Using the lab

Open **Simulation** from the navigation bar.

1. **Pick a beam** with *Beam type*: *Simple beam* or *Compound beam*.
2. **Optionally change the beam.** *Length unit* switches every length between metres and
   centimetres (display only; the experiment is kept). *Beam length L* and *Beam self-weight* restart
   the experiment when you change them.
3. **Choose where the weight goes.** Drag the blue handle above the beam (it snaps to 0.01 m), or
   type the value in *Distance x from support A*. The two stay in sync.
4. **Enter a weight and press *Add weight*.** The readouts under every support, the observation
   table and the equilibrium check update. *Reset experiment* starts again.
5. **Compound beam only:** drag the sliding support C (marked with blue arrows). The hinge moves
   with it. The server is asked when you let go, and the experiment restarts, because readings taken
   with C somewhere else no longer apply. *Reset experiment* keeps C where you put it; changing the
   beam length puts it back at 0.4·L.
6. **Download experiment report as PDF** exports the report section.

The observation table has one row per added weight: the weight, its position, and the reactions
**with every weight added so far** (and the self-weight): R<sub>A</sub>, R<sub>B</sub> and, on the
compound beam, R<sub>C</sub>.

## Repository layout

```
beam-reactions-lab/
├── api/analyze.py          # Vercel entrypoint (handler class + WSGI app) -> beamlab.service
├── beamlab/                # stdlib-only package, no I/O
│   ├── config.py           # single source of truth for all constants and limits
│   ├── statics.py          # self-loads, reactions, bending moment
│   ├── deflection.py       # double integration + support correction (not shown by the browser)
│   └── service.py          # validate(body) -> analyze() -> (status, dict)
├── public/                 # static site
│   ├── index.html  theory.html  simulation.html
│   ├── css/style.css
│   └── js/                 # native ES modules
│       ├── main.js         # entry point, wires the controls
│       ├── api.js          # POST /api/analyze client
│       ├── state.js        # shared state, observation-table rows
│       ├── units.js        # metre / centimetre display conversion
│       ├── render.js       # canvas: rigid beam, supports, reaction readouts, load blocks
│       ├── ui.js           # panels, Add/Reset/beam/unit flows, config consumer
│       ├── handle.js       # drag handling: load-position handle and support C
│       ├── report.js       # PDF export
│       └── constants.js    # UI and drawing constants (no physics)
├── scripts/
│   ├── run_local.py        # dev server, calls beamlab.service
│   └── run_tests.py        # every CI check, on any OS, from any folder
├── tests/                  # unittest only; tests/golden/*.json
├── docs/physics.md         # equations, worked examples, known limitations
├── .github/                # CI workflow, PR template
├── AGENTS.md  HANDOFF.md   # guide for contributors and coding agents; current project state
└── README.md  CONTRIBUTING.md  pyproject.toml  vercel.json  .gitignore  .gitattributes  .editorconfig
```

## API

`POST /api/analyze` with a JSON body. All lengths are in metres; the browser converts for display.

| Field   | Type                  | Notes |
|---------|-----------------------|-------|
| `type`  | `"simple"` or `"compound"` | Optional, defaults to `"simple"`. |
| `loads` | list of `{W, x}`      | Optional, defaults to `[]`. At most 50. `W` in [0, 100] N with at most 4 decimal places, `x` in [0, L] m. |
| `beam`  | `{length, selfWeight, balanceX}` | Optional, and so is each field. `length` in [0.5, 2.0] m (default 1.0), `selfWeight` in [0, 20] N (default 0), `balanceX` = position of the sliding roller on the compound beam, in [0.1·L, 0.9·L] m (default 0.4·L; accepted and ignored for the simple beam). Unknown fields are rejected. |

> **Support names.** The browser and the API name the compound beam's supports differently, because
> the API keeps its original names. API `balanceX`, `xb`, `bal` and `sup[1]` are the **sliding
> roller (browser C)**; API `sup[2]` is the **right-end roller (browser B)**. On the simple beam
> `sup[1]` is roller B in both. The hinge sits on the sliding roller: `hx = xb`.

**Request**

```sh
curl -s -X POST localhost:8040/api/analyze \
  -d '{"type":"compound","loads":[{"W":10,"x":0.8}]}'
```

This uses the default beam (1 m, 0 N self-weight, sliding roller and hinge at 0.4 m). To choose
another, add for example `"beam":{"length":2.0,"selfWeight":6,"balanceX":1.2}`.

**Response `200`** (numbers rounded and `defl` shortened here; the server returns full precision):

```json
{
  "sup": [{"x": 0, "r": 0.0}, {"x": 0.4, "r": 3.333}, {"x": 1.0, "r": 6.667}],
  "xb": 0.4,
  "bal": 3.333,
  "init_bal": 0.0,
  "added_bal": 3.333,
  "M": 1.333,
  "xm": 0.8,
  "sigma": 4000000.0,
  "total": 10.0,
  "self_w": 0.0,
  "s": 0.2,
  "defl": [0.0, 0.0, 0.0, "... 101 values, mm, downward positive"],
  "config": {
    "L": 1.0, "hx": 0.4, "xb": 0.4, "selfWeight": 0.0, "wMax": 100.0, "nPoints": 100,
    "section": {"b": 0.02, "h": 0.01}, "E": 10000000000.0, "ultimateStress": 40000000.0,
    "wMin": 0.0, "wDecimals": 4, "xMin": 0.0, "xMax": 1.0,
    "xbMin": 0.1, "xbMax": 0.9,
    "lMin": 0.5, "lMax": 2.0, "selfWeightMin": 0.0, "selfWeightMax": 20.0
  }
}
```

Reactions `sup[i].r` are in newtons, positive upward. `config` carries every physics constant and
input limit for the beam you asked for, and the front end reads them from there. The server also
returns bending moment (`M`, `xm`), stress (`sigma`), utilisation (`s`) and deflection (`defl`);
the rigid-beam front end does not use them.

**Response `400`** for invalid input, with a JSON body:

```json
{"error": "loads[0].W must be between 0 and 100 N"}
```

The server rejects: `W` or `x` outside their ranges, `W` with more than 4 decimal places, a `beam`
object with a bad or unknown field, non-finite numbers (`NaN`, `Infinity`), values that are not
numbers (strings, booleans, `null`), missing `W` or `x`, an unknown `type`, `loads` that is not a
list, more than 50 loads, and malformed JSON. Unexpected server failures return `500` with
`{"error": "Internal error"}`.

## Testing

One command runs everything CI runs, on Windows, macOS and Linux, from any folder:

```sh
python3 scripts/run_tests.py      # macOS / Linux
py scripts\run_tests.py           # Windows (or: python scripts\run_tests.py)
```

It runs the Python unit tests (51), then `node --check` on every file in `public/js/` (skipped with a
note if Node.js is not installed). The individual commands, from the repo root:

```sh
python -m unittest discover -s tests
for f in public/js/*.js; do node --check "$f"; done                          # macOS / Linux
Get-ChildItem public/js/*.js | ForEach-Object { node --check $_.FullName }   # Windows PowerShell
```

The unit tests cover:

- **Golden parity**: output must equal the fixtures in `tests/golden/` (simple and compound beam ×
  no load, one load, three loads, heavy load). The simple-beam fixtures are the original prototype's
  output; the compound ones were regenerated when the hinge moved onto the sliding roller. They run
  on the prototype beam (1 m, 4 N self-weight).
- **Hand-computed cases**: reference values worked out on paper (see `docs/physics.md`), including the
  sliding roller at 0.2 m and past mid-span at 0.8 m.
- **Equilibrium**: ΣR equals the total load and ΣR·x equals ΣW·x, with zero moment at the hinge, over
  many lengths, self-weights and roller positions.
- **Validation**: every rule above returns `400` with a JSON error, and the full ranges are accepted.
- **Entrypoints**: the Vercel handler and the local server answer the same way.

The browser code has **no automated tests**; `node --check` only catches syntax errors.

## Deploy

1. Push the repo to GitHub and import it in Vercel (or run `vercel` from the repo root).
2. No build command, environment variables or dependencies are needed. `vercel.json` serves
   `public/` and bundles `beamlab/**` with the function.
3. Open `/simulation.html` on the deployment and add a weight to confirm the API responds.

## Known limitations

- **Rigid beam only.** The server still computes deflection, stress and failure, but the browser
  ignores them. Those computations are approximate (see [docs/physics.md](docs/physics.md)).
- **Self-weight is lumped** as point loads at the centre of each span, and does not grow with length.
- **Moving support C restarts the experiment**, because earlier readings no longer apply.
- **Static copy in the HTML.** `theory.html`'s "Assumed values" and the initial numbers on the
  simulation page describe the default beam; the server's `config` overwrites the simulation page's
  values on the first response.
- **Navigation bar is copy-pasted** into all three HTML pages.
- **The front end is not covered by automated tests.**
- **html2pdf loads from a CDN** without a Subresource Integrity (SRI) hash, so PDF export needs an
  internet connection.
- **No LICENSE file yet.** Until one is added, the code is "all rights reserved" by default.
