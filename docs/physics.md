# Physics reference

Everything here describes what `beamlab/` computes today. The code is the source of
truth, and `tests/golden/` pins its numeric output for the default beam. Constants and limits
are defined once, in `beamlab/config.py`.

## Inputs and ranges

| Input | Default | Allowed range |
|---|---|---|
| Beam length `L` | 1.0 m | 0.5 to 2.0 m |
| Self-weight (total) | 4 N | 0 to 20 N |
| Roller B position `xb` (compound beam) | `0.4·L` | `0.1·L` to `0.5·L` |
| Added load `W` | none | 0.5 to 50 N, at most 50 loads |
| Load position `x` | none | `0.05·L` to `0.95·L` |

Fixed in `config.py` and not user inputs: the hinge at `0.6·L`, the section
`b × h = 20 mm × 10 mm`, `E = 10 GPa`, the ultimate stress `40 MPa`, and the grid of `N = 100`
intervals. The ranges above are design choices, not physical limits, and can be widened in `config.py`.

## Model and assumptions

- 2-D static beam of length `L`, rectangular timber section `b × h = 20 mm × 10 mm`,
  `E = 10 GPa`, so `EI = E·b·h³/12 ≈ 16.67 N·m²`.
- Self-weight is a total that does not depend on `L`. It is applied as **point loads**, not as a
  distributed load:
  - simple beam: one load (the whole self-weight) at `L/2`;
  - compound beam: split by segment length, with each part at the centre of its segment. For the
    default beam that is 2.4 N at 0.3 m (left segment) and 1.6 N at 0.8 m (right segment).
- Added loads are point loads `(W, x)` measured from the left end.
- Reactions are positive upward. A negative reaction means uplift.
- The beam is analysed on a grid of `N = 100` intervals (101 stations, `Δx = L/N`).

## Beam types

**Simple beam.** Pin at A (`x = 0`), roller at B (`x = L`). B is where the balance reads.

```
R_B = Σ(W·x) / L
R_A = ΣW − R_B
```

**Compound beam.** Pin at A (`x = 0`), roller B (`x = xb`, where the balance reads), an internal hinge
(`x = hx = 0.6·L`) and roller C (`x = L`). For the default beam that is B at 0.4 m, the hinge at
0.6 m and C at 1.0 m.

- B can be moved between `0.1·L` and `0.5·L`, but it has to stay left of the hinge. With B on the
  right segment that segment would have three supports and the beam would be statically
  indeterminate.
- The hinge carries no moment, so the right segment (hinge to C) is solved first and its hinge
  force is applied to the left segment.
- Loads at `x ≤ hx` belong to the left segment and loads at `x > hx` to the right one.

```
R_C = Σ_right W·(x − hx) / (L − hx)
H   = Σ_right W − R_C                        (force passed through the hinge)
R_B = (Σ_left W·x + H·hx) / xb               (moments about A)
R_A = Σ_left W + H − R_B
```

Because the right segment does not involve B, `R_C` does not change when B is moved.

**Equilibrium.** In both beam types `ΣR` equals the total load (self-weight plus added loads), and
`Σ(R·x)` equals `Σ(W·x)`, the moment balance about A. For the compound beam the bending moment is
zero at the hinge. The tests check all three over many lengths, self-weights and B positions.

## Worked examples

These are the hand-computed reference cases used in `tests/test_beam_params.py`.

**1. Simple beam, `L = 2 m`, self-weight 4 N, 10 N at 0.5 m.** The self-weight acts at 1 m.

```
R_B = (10·0.5 + 4·1) / 2 = 4.5 N
R_A = (10 + 4) − 4.5      = 9.5 N
```

**2. Compound beam, `L = 2 m`, self-weight 6 N, 10 N at 1.8 m.** The hinge is at 1.2 m and B at 0.8 m.
Self-weight gives 3.6 N at 0.6 m (left) and 2.4 N at 1.6 m (right).

```
R_C = (10·0.6 + 2.4·0.4) / 0.8 = 8.7 N
H   = (10 + 2.4) − 8.7         = 3.7 N
R_B = (3.6·0.6 + 3.7·1.2) / 0.8 = 8.25 N
R_A = (3.6 + 3.7) − 8.25       = −0.95 N   (uplift)
```

**3. Compound beam, default `L = 1 m`, 4 N self-weight, 10 N at 0.8 m, B moved to 0.2 m.**
Self-weight gives 2.4 N at 0.3 m (left) and 1.6 N at 0.8 m (right).

```
R_C = (1.6 + 10)·0.2 / 0.4     = 5.8 N     (unchanged from B at 0.4 m)
H   = 11.6 − 5.8               = 5.8 N
R_B = (2.4·0.3 + 5.8·0.6) / 0.2 = 21.0 N
R_A = (2.4 + 5.8) − 21.0       = −12.8 N   (uplift)
```

## Bending moment, stress and failure

At each station `x`:

```
M(x) = Σ_supports R·(x − s)  [x > s]  −  Σ_loads W·(x − a)  [x > a]
```

- `M_max` is the largest `|M|` on the grid and `x_m` its position (`L/2` if the beam is unloaded).
- Extreme-fibre bending stress: `σ = M_max / (b·h²/6) = 6·M_max / (b·h²)`.
- Utilisation: `s = max(σ / σ_ult, ΣW_added / W_max)` with `σ_ult = 40 MPa` and `W_max = 50 N`.
  The beam is treated as failed when `s ≥ 1`. The second term means the total added load alone
  can trigger failure at 50 N, even if the stress is lower.

## Deflection

1. Integrate `M/EI` twice with the trapezoidal rule from `x = 0`, starting at zero slope and zero
   deflection: `θ` then `y`.
2. Remove the rigid-body part piecewise: between each pair of neighbouring supports, subtract the
   straight line through `y` at those two supports. Deflection is therefore zero at every support,
   with each support placed at the nearest of the 101 grid stations.
3. Report the result in millimetres, downward positive.

The front end exaggerates the drawn deflection (0.3 px/mm for the simple beam, 2.5 px/mm for the
compound beam, divided by `L³`) so bending is visible. Deflection grows with `L³`, so without the
division a 2 m beam would be drawn through the bench. This affects the picture only.

## Measurement noise (front end)

The "balance reading" shown in the observation table is simulated. The exact added-load reaction
is multiplied by `1 + ε` with `ε` uniform in `[−0.02, +0.02)`, so the percentage error in the
table comes from this noise model and not from any physics error. The noise function is
injectable (`buildRow(analysis, W, x, noise)` in `public/js/state.js`) for deterministic tests.

## Known limitations

These are documented, not fixed. Fixing them would change results or visible behaviour.

1. **Compound deflection shape is approximate.** The slope is continuous at the hinge
   (`x = hx`) and has a kink at roller B (`x = xb`). Real behaviour is the reverse: a hinge
   rotates freely, while the beam is continuous over B. Reactions, moments and stress are
   unaffected. Only the drawn deflection shape is.
2. **Uplift at pin A (compound beam).** A load to the right of the hinge can make `R_A` negative
   (see worked example 2, or `W = 10 N` at `x = 0.8 m` on the default beam, which gives
   `R_A = −2.3 N`). This is statically correct: the pin has to hold the beam down. The front end
   only displays the balance reading at B, not `R_A`.
3. **Ambiguous `R_analytical` column.** In the observation table `R_analytical` is the
   *cumulative* balance reaction due to **all** loads added so far (`added_bal`), while `W` and `x`
   show only the *latest* load. Rows therefore only line up with their W and x on the first
   reading.
4. **Self-weight is lumped.** Treating self-weight as point loads (not distributed) slightly changes
   the moment diagram and deflection compared with a uniformly loaded beam.
5. **Failure criterion mixes two limits.** See "Bending moment, stress and failure" above.
6. **Supports sit on grid stations.** If B is between two of the 101 stations, deflection is zeroed
   at the nearest one, which is off by less than half a station (at most `0.005·L`). Reactions use
   the exact position.
7. **Self-weight does not scale with length.** A longer beam is not heavier unless the self-weight
   input is raised.
