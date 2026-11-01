# AGENTS.md

## 1. Project Context & Mission
- **Core Purpose:** Browser lab simulation of beam support reactions (simple beam; compound beam with pin A, roller/balance B, internal hinge, roller C). Users add point loads, watch bending/failure, fill an observation table, export a PDF report.
- **Current Development Phase:** Just finished: restructure into a tested repo, variable beam length and self-weight, draggable load handle, draggable roller B (compound beam), docs, and a Vercel configuration (`[tool.vercel] entrypoint = "api.analyze:handler"` in `pyproject.toml`). **Vercel deployment is still unverified.** Next objective: confirm a Vercel deploy answers `POST /api/analyze` (fallbacks in section 5), then the owner decides LICENSE (MIT proposed, not written).
- **Tech Stack:** Python 3.10+ stdlib only (CI tests 3.10 and 3.12, venv tested on 3.12.9; no runtime/dev deps), `unittest`; static HTML/CSS + vanilla JS as native ES modules (no bundler, no TS, no build step); html2pdf.js via CDN (classic script); Node 20 only for `node --check` in CI; Vercel Python serverless function; GitHub Actions CI.

## 2. Project Architecture & Mapping
- **Key Modules:**
  - `beamlab/config.py`: single source of truth for constants, limits and the frozen `Beam` dataclass (length, self_weight, balance_position; derived hinge_x, balance_x, x_min/x_max, balance_min/max). `public_config(beam)` builds the `config` object sent to the browser.
  - `beamlab/statics.py`: `self_loads(beam_type, beam)` and `reactions(beam_type, loads, beam)` take a `Beam`; `bending_moment(supports, loads, xs)` takes `(supports, loads, xs)`.
  - `beamlab/deflection.py`: double integration (trapezoid) + piecewise support correction (`deflection(moments, supports, beam)`).
  - `beamlab/service.py`: `validate` -> `analyze` -> `handle` -> `process(raw bytes)` returning `(status, dict)`. All request logic lives here.
  - `api/analyze.py` (Vercel `handler` class) and `scripts/run_local.py` (dev server `Handler` class): thin wrappers around `service.process`; keep them that way.
  - `public/js/`: `main.js` (wiring), `api.js`, `state.js` (state + `buildRow`, injectable noise), `render.js` (canvas, handles, hit-testing), `ui.js` (panels, Add/Reset/beam-change flows, drag commit), `handle.js` (pointer drags), `report.js` (PDF), `constants.js` (UI/drawing only, no physics).
  - `tests/`: `golden/*.json` (8 fixtures captured from the ORIGINAL prototype), `test_golden`, `test_equilibrium`, `test_validation`, `test_beam_params`, `test_entrypoints`.
  - `docs/physics.md`: equations, ranges, worked examples, Known limitations.
- **Data & State Flow:** Browser `fetch` POST `/api/analyze` `{type, loads, beam?}` -> `service.process` -> `(status, dict)` -> JSON. Response carries `config` (L, hx, xb, selfWeight, wMax, nPoints, section, E, ultimateStress, wMin, xMin, xMax, xbMin, xbMax, lMin, lMax, selfWeightMin, selfWeightMax). The browser reads every physics constant from `state.config`, never from literals. `state.requestId` discards stale responses.

## 3. Critical Commands & Workflows
| Purpose | Command |
|---|---|
| Dev server (serves `public/` + API) | `python scripts/run_local.py` -> http://localhost:8040 (PORT is 8040 in code; use `python3` on Mac/Linux) |
| Unit tests (expect 47, OK) | `python -m unittest discover -s tests` (run from repo root; 47 tests pass in CI/normal environments; socket tests require loopback permission) |
| JS syntax check (CI) | `for f in public/js/*.js; do node --check "$f"; done` |
| Real exception behind a 500 | `python -c "from beamlab import service; print(service.handle({...}))"` |
| Deploy | push to `main` (Vercel auto-deploys); `vercel` / `vercel --prod` also work |
- **Linting / Formatting:** No linter or formatter is configured. Follow `.editorconfig` (UTF-8, LF, 4 spaces; 2 for js/json/yml/html/css).
- CI (`.github/workflows/ci.yml`) runs exactly two commands (unittest, `node --check`) on Python 3.10 and 3.12. Do not add steps.
- After editing Python, restart the dev server. After editing JS, hard refresh (Ctrl+Shift+R).

## 4. Coding Conventions & Patterns
- **Style Rules:** Readable multi-line JS (no one-liners); Python 3.10-compatible syntax; docstrings explain why. Constants only in `beamlab/config.py` (physics, limits) or `public/js/constants.js` (pixels, UI).
- **State/Database Conventions:** No database. Server is stateless: every request carries the full beam and load list. Client state is the `state` object in `state.js`; to change beam inputs go through `changeBeam()` / `commitBalance()`, which restart the experiment via `resetExperiment()`.
- **Validation:** Reject with `ValidationError` -> HTTP 400 `{"error": msg}`; unexpected exceptions -> 500 `{"error": "Internal error"}`. Load `x` limits scale with L (0.05 L to 0.95 L).
- **Testing Requirements:** Any new validation rule or physics change needs a `unittest` case. New physics needs a hand-computed reference (see `docs/physics.md` worked examples), not a value copied from the code. Equilibrium (sum R, sum R*x, zero moment at hinge) must hold for any new input.

## 5. System Boundaries & Guardrails (CRITICAL)
- **Never Actions:**
  - Never edit `tests/golden/*.json` to make a test pass. They pin the original numeric output; only regenerate on a deliberate physics change, explained in the commit.
  - Never change physics formulas or numeric results for valid default input.
  - Never add a dependency, bundler, framework, TypeScript or build step.
  - Never hard-code physics values (0.6, 0.4, 50, 4.0, 100 ...) in `public/js` outside `constants.js`; read them from `state.config`.
  - Never duplicate request handling in `api/analyze.py` or `scripts/run_local.py`.
  - Never `git push`, create a remote, deploy, write a LICENSE, or edit git config without the owner's approval.
  - Never commit `__pycache__`/`.pyc` (use `PYTHONDONTWRITEBYTECODE=1`), `.env*`, or `.vercel/`.
  - Never let roller B reach the hinge (B max is 0.5 L; the hinge is 0.6 L): the beam would no longer be statically determinate.
  - Never change visible copy/CSS values in the HTML pages as a side effect of refactors.
- **Known Gotchas & Friction Points:**
  - **Float limits:** derived limits are rounded to 6 decimals (`LIMIT_DECIMALS`) because `0.05*0.8` is `0.04000000000000001`. The browser snaps drags to 0.01 m, inward (`snapWithin` in `ui.js`); removing either side makes valid drags return 400.
  - **`_validate_beam` must set every default** (`length`, `self_weight`) before conditionally overwriting; a missing one raises `UnboundLocalError`, which `process()` hides as a 500 (five tests failed this way once).
  - Moving B restarts the experiment; Reset keeps B (`state.beam.balanceX`); changing length drops B back to 0.4 L. `balanceX` is ignored for the simple beam.
  - Drawn sag is divided by L^3 (picture only). Compound deflection shape is approximate (kink at B, continuous at hinge: reversed from reality). Reactions/moments are unaffected.
  - Compound beam: a load right of the hinge gives negative R_A (uplift); correct, do not "fix". Loads at `x <= hx` count as the left segment.
  - `R_analytical` in the table is cumulative for all added loads while W/x show the latest load: ambiguous, documented, not fixed.
  - `test_entrypoints.py` imports `api.analyze` and `scripts.run_local`: run tests from the repo root. Note that `EntrypointTest` requires loopback socket access to run its ephemeral HTTP test servers; running inside a network-isolated sandbox without socket permissions raises `WinError 10013`.
  - `run_local.py` serves `public/` on GET, but handles only `POST /api/analyze` (404 for other POST paths). It runs on port 8040 (`PORT = 8040` in `scripts/run_local.py`). Opening `simulation.html` directly via `file://` shows "Python backend not reachable".
  - **Vercel (unverified):** `pyproject.toml` is already configured with `[tool.vercel] entrypoint = "api.analyze:handler"`. If pages 404, remove `"outputDirectory": "public"` from `vercel.json`. Framework Preset must be "Other". Vercel runs the function as a `BaseHTTPRequestHandler` `handler` class.
  - The browser code (drags, drawing, flows) has **no automated tests**; earlier checks were throwaway Node scripts against the live server, not in the repo. Add real tests before refactoring `render.js`/`ui.js`/`handle.js`.
  - Out of scope, documented in README: duplicated nav markup, static "Assumed values" in `theory.html` (describes the default beam), html2pdf CDN without SRI.
