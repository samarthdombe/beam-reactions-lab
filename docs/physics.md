# Physics reference

Everything here describes what `beamlab/` computes today. The code is the source of
truth, and `tests/golden/` pins its numeric output. Constants are defined once, in
`beamlab/config.py`.

## Model and assumptions

- 2-D static beam, length `L = 1 m`, rectangular timber section `b × h = 20 mm × 10 mm`,
  `E = 10 GPa`, so `EI = E·b·h³/12 ≈ 16.67 N·m²`.
- Self-weight is `4 N` in total. It is applied as **point loads**, not a distributed load:
  - simple beam: one 4 N load at `L/2`;
  - compound beam: split by segment length, 2.4 N at 0.3 m (left segment) and 1.6 N at
    0.8 m (right segment).
- Added loads are point loads `(W, x)` with `W` in `[0.5, 50] N` and `x` in `[0.05, 0.95] m`
  from the left end. At most 50 loads per request.
- Reactions are positive upward. A negative reaction means uplift.
- The beam is analysed on a grid of `N = 100` intervals (101 stations, `Δx = L/N`).

## Beam types

**Simple beam.** Pin at A (`x = 0`), roller at B (`x = L`). B is where the balance reads.

```
R_B = Σ(W·x) / L
R_A = ΣW − R_B
```

**Compound beam.** Pin at A (`x = 0`), roller B (`x = 0.4 m`, the balance), internal hinge at
`x = 0.6 m`, roller C (`x = 1.0 m`). The hinge carries no moment, so the right segment
(hinge to C) is solved first and its hinge force is applied to the left segment.
Loads at `x ≤ 0.6` belong to the left segment and loads at `x > 0.6` to the right one.

```
R_C = Σ_right W·(x − hx) / (L − hx)
H   = Σ_right W − R_C                        (force passed through the hinge)
R_B = (Σ_left W·x + H·hx) / xb               (moments about A)
R_A = Σ_left W + H − R_B
```

**Equilibrium.** In both beam types `ΣR = total load` (self-weight plus added loads). The
test suite checks this for several load sets.

## Bending moment, stress and failure

At each station `x`:

```
M(x) = Σ_supports R·(x − s)  [x > s]  −  Σ_loads W·(x − a)  [x > a]
```

- `M_max` is the largest `|M|` on the grid and `x_m` its position (`L/2` if the beam is unloaded).
- Extreme-fibre bending stress: `σ = M_max / (b·h²/6) = 6·M_max / (b·h²)`.
- Utilisation: `s = max(σ / σ_ult, ΣW_added / W_max)` with `σ_ult = 40 MPa`, `W_max = 50 N`.
  The beam is treated as failed when `s ≥ 1`. The second term means the total added load alone
  can trigger failure at 50 N, even if the stress is lower.

## Deflection

1. Integrate `M/EI` twice with the trapezoidal rule from `x = 0`, starting at zero slope and zero
   deflection: `θ` then `y`.
2. Remove the rigid-body part piecewise: between each pair of neighbouring supports, subtract the
   straight line through `y` at those two supports. Deflection is therefore zero at every support.
3. Report the result in millimetres, downward positive.

The front end exaggerates the drawn deflection (0.3 px/mm for the simple beam, 2.5 px/mm for the
compound beam) so bending is visible.

## Measurement noise (front end)

The "balance reading" shown in the observation table is simulated. The exact added-load reaction
is multiplied by `1 + ε` with `ε` uniform in `[−0.02, +0.02)`, so the percentage error in the
table comes from this noise model and not from any physics error. The noise function is
injectable (`buildRow(analysis, W, x, noise)` in `public/js/state.js`) for deterministic tests.

## Known limitations

These are documented, not fixed. Fixing them would change results or visible behaviour.

1. **Compound deflection shape is approximate.** The slope is continuous at the hinge
   (`x = 0.6`) and has a kink at roller B (`x = 0.4`). Real behaviour is the reverse: a hinge
   rotates freely, while the beam is continuous over B. Reactions, moments and stress are
   unaffected. Only the drawn deflection shape is.
2. **Uplift at pin A (compound beam).** A load to the right of the hinge can make `R_A` negative
   (for example `W = 10 N` at `x = 0.8 m` gives `R_A = −2.3 N`). This is statically correct: the
   pin has to hold the beam down. The front end only displays the balance reading at B, not `R_A`.
3. **Ambiguous `R_analytical` column.** In the observation table `R_analytical` is the
   *cumulative* balance reaction due to **all** loads added so far (`added_bal`), while `W` and `x`
   show only the *latest* load. Rows therefore only line up with their W and x on the first
   reading.
4. **Self-weight is lumped.** Treating self-weight as point loads (not distributed) slightly changes
   the moment diagram and deflection compared with a uniformly loaded beam.
5. **Failure criterion mixes two limits.** See "Bending moment, stress and failure" above.
