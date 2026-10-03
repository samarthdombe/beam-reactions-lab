## What and why

<!-- What does this change, and why? Link any issue. -->

## Checklist

- [ ] `python -m unittest discover -s tests` passes
- [ ] `node --check` passes on every file in `public/js/`
- [ ] Physics constants live only in `beamlab/config.py` (none duplicated in `public/js/`)
- [ ] If numeric results change on purpose, the golden fixtures in `tests/golden/` were regenerated and the change is explained above
- [ ] No new dependencies, bundler or build step
