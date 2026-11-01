# Physics reference

Everything here describes what `beamlab/` computes today. The code is the source of
truth, and `tests/golden/` pins its numeric output for the prototype beam (1 m, 4 N).

**Names.** This document uses the server's names. On the compound beam, roller **B** here is the
sliding roller (shown as **C** in the browser) and roller **C** here is the right-end roller (shown as
**B** in the browser). The browser treats the beam as rigid and shows only the reactions; bending,
stress and deflection below are still computed by the server but not displayed. Constants and limits
are defined once, in `beamlab/config.py`.

## Inputs and ranges

| Input | Default | Allowed range |
|---|---|---|
| Beam length `L` | 1.0 m | 0.5 to 2.0 m |
| Self-weight (total) | 0 N | 0 to 20 N |
| Roller B position `xb` (compound beam) | `0.4·L` | `0.1·L` to `0.9·L` |
| Added load `W` | none | 0 to 100 N, at most 4 decimal places, at most 50 loads |
| Load position `x` | none | `0` to `L` |

Fixed in `config.py` and not user inputs: the hinge on top of roller B (`hx = xb`), the section
`b × h = 20 mm × 10 mm`, `E = 10 GPa`, the ultimate stress `40 MPa`, and the grid of `N = 100`
intervals. The ranges above are design choices, not physical limits, and can be widened in `config.py`.

## Model and assumptions

- 2-D static beam of length `L`, rectangular timber section `b × h = 20 mm × 10 mm`,
  `E = 10 GPa`, so `EI = E·b·h³/12 ≈ 16.67 N·m²`.
- Self-weight is a total that does not depend on `L`. It is applied as **point loads**, not as a
  distributed load:
  - simple beam: one load (the whole self-weight) at `L/2`;
  - compound beam: split by segment length, with each part at the centre of its segment. For the
    default layout (hinge at 0.4 m) and a 4 N self-weight that is 1.6 N at 0.2 m (left segment) and
    2.4 N at 0.7 m (right segment).
- Added loads are point loads `(W, x)` measured from the left end.
- Reactions are positive upward. A negative reaction means uplift.
- The beam is analysed on a grid of `N = 100` intervals (101 stations, `Δx = L/N`).

## Beam types

**Simple beam.** Pin at A (`x = 0`), roller at B (`x = L`). B is where the balance reads.

```
R_B = Σ(W·x) / L
R_A = ΣW − R_B
```

**Compound beam.** Pin at A (`x = 0`), roller B (`x = xb`, where the balance reads) with the internal
hinge directly on top of it (`hx = xb`), and roller C (`x = L`). For the default beam that is B and the
hinge at 0.4 m and C at 1.0 m. (The browser labels these differently: the sliding roller B here is shown
as **C**, and roller C at the right end is shown as **B**.)

- B can be moved between `0.1·L` and `0.9·L` (past mid-span), and the hinge moves with it.
- The hinge carries no moment, so the beam acts as two simply supported spans, A–B and B–C. The right
  span is solved first and its hinge force is passed down into B.
- Loads at `x ≤ hx` belong to the left span and loads at `x > hx` to the right one.

```
R_C = Σ_right W·(x − hx) / (L − hx)
H   = Σ_right W − R_C                        (force passed through the hinge)
R_B = (Σ_left W·x + H·hx) / xb               (moments about A; with hx = xb this is Σ_left W·x / xb + H)
R_A = Σ_left W + H − R_B                     (= Σ_left W·(1 − x/xb), never negative)
```

Because the hinge sits on B, loads right of B never reach A: `R_A` depends only on the left span, so pin
A is never in uplift. Moving B changes both spans and every reaction.

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

**2. Compound beam, `L = 2 m`, self-weight 6 N, 10 N at 1.4 m.** B and the hinge are at 0.8 m.
Self-weight gives 2.4 N at 0.4 m (left span) and 3.6 N at 1.4 m (right span).

```
R_C = (3.6·0.6 + 10·0.6) / 1.2  = 6.8 N
H   = (3.6 + 10) − 6.8          = 6.8 N
R_B = 2.4·0.4 / 0.8 + 6.8       = 8.0 N
R_A = 2.4 − 2.4·0.4 / 0.8       = 1.2 N
```

**3. Compound beam, `L = 1 m`, 4 N self-weight, 10 N at 0.6 m, B moved to 0.2 m.**
The hinge moves with B to 0.2 m. Self-weight gives 0.8 N at 0.1 m (left, 0–0.2 m) and 3.2 N at
0.6 m (right, 0.2–1 m).

```
R_C = (3.2·0.4 + 10·0.4) / 0.8  = 6.6 N
H   = 13.2 − 6.6                = 6.6 N
R_B = 0.8·0.1 / 0.2 + 6.6       = 7.0 N
R_A = 0.8 − 0.4                 = 0.4 N
```

**4. Compound beam, `L = 1 m`, no self-weight, B moved past mid-span to 0.8 m, 10 N at 0.4 m and
10 N at 0.9 m.** Left span 0–0.8 m: 10 N at its middle gives 5 N to A and 5 N to B. Right span
0.8–1 m: 10 N at its middle gives 5 N to B and 5 N to C. So `R_A = 5 N`, `R_B = 10 N`, `R_C = 5 N`.

## Bending moment, stress and failure

At each station `x`:

```
M(x) = Σ_supports R·(x − s)  [x > s]  −  Σ_loads W·(x − a)  [x > a]
```

- `M_max` is the largest `|M|` on the grid and `x_m` its position (`L/2` if the beam is unloaded).
- Extreme-fibre bending stress: `σ = M_max / (b·h²/6) = 6·M_max / (b·h²)`.
- Utilisation: `s = max(σ / σ_ult, ΣW_added / W_fail)` with `σ_ult = 40 MPa` and `W_fail = 50 N`
  (`FAILURE_LOAD`, separate from the 100 N input limit `W_MAX`). `s ≥ 1` would mean failure; the
  rigid-beam browser ignores it.

## Deflection

1. Integrate `M/EI` twice with the trapezoidal rule from `x = 0`, starting at zero slope and zero
   deflection: `θ` then `y`.
2. Remove the rigid-body part piecewise: between each pair of neighbouring supports, subtract the
   straight line through `y` at those two supports. Deflection is therefore zero at every support,
   with each support placed at the nearest of the 101 grid stations.
3. Report the result in millimetres, downward positive.

The browser does not draw the deflection: it treats the beam as rigid.

## Known limitations

These affect only the server-side bending, stress and deflection values, which the rigid-beam
browser does not display, except where noted.

1. **Compound deflection shape is approximate.** The slope is kept continuous at the hinge, which
   sits on roller B; a real hinge rotates freely. Reactions are unaffected.
2. **Self-weight is lumped.** Self-weight is applied as point loads at the centre of each span, not
   as a distributed load. Reactions are exact for that model; the moment diagram and deflection differ
   slightly from a uniformly loaded beam.
3. **Failure criterion mixes two limits** (stress and total added load); see above.
4. **Supports sit on grid stations** for the deflection only. If B is between two of the 101
   stations, deflection is zeroed at the nearest one (off by at most `0.005·L`). Reactions use the
   exact position.
5. **Self-weight does not scale with length** (also visible in the browser). A longer beam is not
   heavier unless the self-weight input is raised.
