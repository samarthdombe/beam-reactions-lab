# AGENTS.md

Guide for anyone (human or coding agent) changing this repo. For the current state of the work,
what is verified and what is open, read [HANDOFF.md](HANDOFF.md) first.

## 1. Project context
- **Purpose:** Browser lab simulation of the support reactions of a **rigid** beam. Simple beam (pin A,
  roller B at the right end) or compound beam (pin A, sliding roller **C** with the internal hinge on
  top of it, roller B at the right end). Users add point loads, read the reactions under each support
  and in an observation table, check ΣF = 0 and ΣM = 0, and export a PDF report.
- **Tech stack:** Python 3.10+ standard library only (no runtime or dev dependencies), `unittest`;
  static HTML/CSS + vanilla JS as native ES modules (no bundler, no TypeScript, no build step);
  html2pdf.js from a CDN; Node only for `node --check`; Vercel Python function; GitHub Actions CI.

## 2. Architecture
- `beamlab/config.py`: single source of truth for constants and limits, and the frozen `Beam`
  dataclass (length, self_weight, balance_position; derived hinge_x = balance_x, x_min/x_max,
  balance_min/max). `public_config(beam)` builds the `config` object sent to the browser.
- `beamlab/statics.py`: `self_loads`, `reactions(beam_type, loads, beam)`, `bending_moment`.
- `beamlab/deflection.py`: double integration; still computed and tested, not shown by the browser.
- `beamlab/service.py`: `validate` -> `analyze` -> `handle` -> `process(raw bytes)` returning
  `(status, dict)`. All request handling lives here.
- `api/analyze.py` (`handler` class + WSGI `app`) and `scripts/run_local.py` (dev server): thin
  wrappers around `service.process`. Keep them thin.
- `public/js/`: `main.js` (wiring), `api.js`, `state.js` (state, `buildRow`, `formatWeight`),
  `units.js` (m/cm display conversion), `render.js` (canvas, readouts, hit-testing), `ui.js`
  (panels, flows, config consumer), `handle.js` (pointer drags), `report.js` (PDF), `constants.js`
  (UI/drawing only, plus the `UNITS` table).
- `tests/`: `test_golden` (+ `golden/*.json`), `test_equilibrium`, `test_validation`,
  `test_beam_params`, `test_entrypoints`. `scripts/run_tests.py` runs them plus `node --check`.
- **Data flow:** browser POST `/api/analyze` `{type, loads, beam?}` (metres) -> `service.process` ->
  JSON with `sup`, `bal`, `total`, `self_w`, ... and `config`. The browser reads every physics constant
  and limit from `state.config`, converts lengths only for display (`units.js`), and drops stale
  responses with `state.requestId`.

## 3. Commands
| Purpose | Command |
|---|---|
| Dev server | `python3 scripts/run_local.py` (Windows: `py scripts\run_local.py`) -> http://localhost:8040 (dual-stack, retries next 5 ports if busy; override with `PORT`) |
| All checks, any OS | `python3 scripts/run_tests.py` (Windows: `py scripts\run_tests.py`); expect 51 tests OK + JS check |
| Unit tests only (CI) | `python -m unittest discover -s tests` from the repo root |
| Real exception behind a 500 | `python -c "from beamlab import service; print(service.handle({...}))"` |
| Deploy | push to `main` (Vercel auto-deploys) or `vercel` / `vercel --prod` |

- CI (`.github/workflows/ci.yml`) runs unittest and `node --check` on Python 3.10 and 3.12, on Linux.
- After editing Python, restart the dev server. After editing JS, hard refresh.
- No linter or formatter. Follow `.editorconfig` (UTF-8, LF, 4 spaces; 2 for js/json/yml/html/css);
  `.gitattributes` keeps LF on Windows checkouts.

## 4. Conventions
- Readable multi-line JS; Python 3.10-compatible syntax; docstrings explain why.
- Physics constants and limits only in `beamlab/config.py`; pixels and UI values only in
  `public/js/constants.js`. Never hard-code a physics value in `public/js`.
- The server is stateless and works in metres. Client state is the `state` object in `state.js`.
  Beam changes go through `changeBeam()` / `commitBalance()`, which restart via `resetExperiment()`;
  `changeUnit()` only re-renders.
- Validation: raise `ValidationError` -> HTTP 400 `{"error": msg}`; anything unexpected -> 500.
- Any new validation rule or physics change needs a `unittest` case, and new physics needs a
  **hand-computed** reference (see `docs/physics.md`), not a value copied from the code.

## 5. Guardrails
- **Support names differ between browser and API.** Browser C = API "B"/balance (`balanceX`, `xb`,
  `bal`, `sup[1]`); browser B = API `sup[2]` (right end) on the compound beam. Do not rename the API
  fields without updating the browser, tests and docs together.
- **Golden fixtures:** never edit `tests/golden/*.json` to make a test pass. Regenerate only for a
  deliberate physics change, explained in the commit. Simple fixtures = original prototype output;
  compound fixtures were regenerated for the hinge-on-C layout. `test_golden` runs them on the
  prototype beam (1 m, 4 N) because the default self-weight is now 0 N.
- Never add a dependency, bundler, framework, TypeScript or build step.
- Never duplicate request handling in `api/analyze.py` or `scripts/run_local.py`.
- Never commit `__pycache__`/`.pyc`, `.DS_Store`, `venv/`, `.env*` or `.vercel/` (all in `.gitignore`).
- Never push, deploy, write a LICENSE or edit git config without the owner's approval.

## 6. Gotchas
- **Float limits:** derived limits are rounded to 6 decimals (`LIMIT_DECIMALS`); the browser snaps
  drags inward to 0.01 m (`snapWithin`) and compares typed values in the display unit
  (`unitLimit`). Removing either side makes valid input return 400.
- **Weights:** `W_DECIMALS = 4` is enforced on the server and in the browser (`+W.toFixed(4) === W`).
- **`FAILURE_LOAD` (50 N)** only feeds the utilisation `s`; it is separate from `W_MAX` (100 N) so the
  golden fixtures did not change. The browser ignores `s`.
- **Compound beam statics:** with the hinge on the sliding roller the beam is two simply supported
  spans (A..C and C..B in browser names). Loads at `x <= hx` belong to the left span. `R_A` is never
  negative.
- `_validate_beam` must set every default before conditionally overwriting; a missing one raises
  `UnboundLocalError`, which `process()` hides as a 500.
- `test_entrypoints` starts local HTTP servers, so it needs loopback socket access.
- Opening `simulation.html` via `file://` shows a warning message directing the user to the server;
  opening via a different static server shows "Python backend not reachable": only `run_local.py`,
  `vercel dev` or a deployment answers `POST /api/analyze`.
