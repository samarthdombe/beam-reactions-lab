# Handoff: project state (2026-11-01)

Snapshot for whoever picks this up next. How to work in the repo is in [AGENTS.md](AGENTS.md); how to
use it is in [README.md](README.md).

## Where things stand

The lab is a **rigid-beam support-reaction simulator**. Everything below is implemented, and
`python3 scripts/run_tests.py` passes (51 unit tests + `node --check` on every JS file).

| Area | State |
|---|---|
| Simple beam | Pin A + roller B. Readouts under A and B; table columns R<sub>A</sub>, R<sub>B</sub>. |
| Compound beam | Pin A, sliding roller C with the hinge on top (drag between 0.1·L and 0.9·L), roller B at the right end. Readouts under A, C and B; table adds R<sub>C</sub>. |
| Inputs | W 0 to 100 N (≤ 4 decimals), x 0 to L, L 0.5 to 2 m, self-weight 0 to 20 N (default 0). |
| Units | Length display in m or cm (`units.js`); the API stays in metres. |
| Rigid beam | No deflection, stress, cracks or failure in the browser; the server still computes them. |
| Conclusion | ΣF and ΣM about A from the server's reactions, with a pass/fail verdict. |
| Local dev | `scripts/run_local.py` on port 8040; Windows and macOS commands documented. |
| Vercel | `api/analyze.py` exposes `handler` (classic runtime) and WSGI `app` (newer runtimes, `vercel dev`). |

## Changes in this round

1. **Backend reachability.** `vercel dev` crashed because its newer Python runtime only accepts
   ASGI/WSGI apps; added the WSGI `app` and pointed `[tool.vercel] entrypoint` at it.
2. **Cross-platform tests.** `scripts/run_tests.py`, explicit UTF-8 in `test_golden`, `.gitattributes`.
3. **Rigid beam.** Removed deflection drawing, stress panel, cracks, failure animation and
   measurement noise from the browser; the table shows reactions only.
4. **Compound layout.** The hinge sits on the sliding roller and moves with it; the roller can move
   past mid-span (0.1·L to 0.9·L). Browser names: slider = C, right end = B.
5. **Inputs and defaults.** W 0 to 100 N with 4 decimals, x 0 to L, default self-weight 0 N, m/cm
   switch.
6. **Tests and fixtures.** Hand-computed compound cases rewritten; compound golden fixtures
   regenerated (simple fixtures unchanged); validation tests for the new limits.
7. **Docs.** README, AGENTS.md, CONTRIBUTING, `docs/physics.md`, Theory and Home pages updated.

## Verified

- All unit tests and JS syntax checks pass (run on Linux; the commands are cross-platform).
- In a headless browser: simple and compound beams, adding weights at the range limits, 4-decimal
  weights, the m/cm switch (including typing lengths in cm), dragging C past mid-span with the hinge
  following, and the equilibrium conclusion. No console errors.
- Hand-checked values, for example: simple beam, 12.3456 N at 0.3 m -> R<sub>A</sub> = 8.6419 N;
  compound, C at 0.8 m, 10 N at 0.4 m and 10 N at 0.9 m -> R<sub>A</sub> = 5, R<sub>C</sub> = 10,
  R<sub>B</sub> = 5 N.

## Not verified / open

- **Vercel deployment** with the new WSGI `app` entrypoint has not been tried. After deploying, open
  `/simulation.html` and add a weight. If the function fails, point `[tool.vercel] entrypoint` back
  to `api.analyze:handler` (the classic runtime accepts the class).
- **Not run on a real Windows machine**, only on Linux with the same commands.
- **No browser tests in the repo.** The checks above were throwaway Playwright scripts.
- **API names vs browser names** for the compound supports differ (see AGENTS.md section 5). Renaming
  the API fields is possible but touches the browser, tests and docs.
- **Dead server physics:** deflection, stress and `s` are still computed and pinned by the golden
  tests although the browser ignores them. Removing them is a larger cleanup (fixtures, tests, docs).
- **LICENSE** not chosen.

## Local clean-up

Generated files are ignored by git and safe to delete: `__pycache__/` folders, `.DS_Store`, and the
`.vercel/` cache. On macOS / Linux, from the repo root:

```sh
find . -name __pycache__ -not -path './venv/*' -prune -exec rm -rf {} + ; find . -name .DS_Store -delete
```
