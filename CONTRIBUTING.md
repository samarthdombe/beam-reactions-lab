# Contributing

Thanks for helping. This project is deliberately small: **Python standard library only
(3.10+), plain ES modules, no bundler, no framework, no build step.** Please keep it that way.
current venv runs on 3.12.9

## Setup

```sh
git clone https://github.com/advaetuc/beam-reactions-lab.git
cd beam-reactions-lab
python scripts/run_local.py          # http://localhost:8000
```

## Before you open a pull request

```sh
python -m unittest discover -s tests
for f in public/js/*.js; do node --check "$f"; done
```

Both commands also run in CI.

## Ground rules

- **One source of truth for physics.** Constants live in `beamlab/config.py` and reach the browser
  through the `config` object of the API response. Do not copy them into `public/js/`.
  `public/js/constants.js` is for UI and drawing values only.
- **`beamlab/` does no I/O.** Request handling lives in `beamlab/service.py`, and both
  `api/analyze.py` and `scripts/run_local.py` stay thin wrappers around it.
- **Numeric changes are deliberate.** `tests/golden/*.json` pin the output. If you change the physics
  on purpose, regenerate the affected fixtures in the same pull request and explain why.
  Otherwise the golden tests must keep passing unchanged.
- **Keep changes focused.** One concern per pull request, with a conventional-commit title
  (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
- **Add tests** for new validation rules or behaviour, using `unittest`.

See [docs/physics.md](docs/physics.md) for the model and its known limitations.
