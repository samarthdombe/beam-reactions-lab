// Shared experiment state, plus the pure (DOM-free) row logic.

export const state = {
  type: 'simple',    // 'simple' | 'compound'
  unit: 'm',         // display unit for lengths: 'm' | 'cm' (the server always uses metres)
  loads: [],         // [{ W, x }] accepted loads
  rows: [],          // observation-table rows
  A: null,           // latest analysis from the server
  config: null,      // physics constants, taken from the latest server response
  beam: null,        // { length, selfWeight } chosen by the user; null = server defaults
  pendingX: null,    // x (m) where the next weight will go; moved by the handle or the x field
  balancePreview: null, // x (m) of sliding support C while it is being dragged; null when not dragging
  busy: false,       // an Add request is in flight
  requestId: 0,      // id of the newest request; older responses are ignored
};

/** Forget the experiment (loads and table). Keeps the beam type and server data. */
export function clearExperiment() {
  state.loads = [];
  state.rows = [];
}

/**
 * Build one observation-table row from a server analysis. The beam is rigid, so the reactions
 * are exact statics, including the beam's self-weight and every load added so far:
 * `ra` at pin A (left end), `rb` at roller B (right end) and, on the compound beam only,
 * `rc` at the sliding support C. (The server lists supports left to right: A, [C,] B.)
 */
/** A weight in newtons, with 2 to 4 decimals (10.00, 12.345, 12.3456). */
export function formatWeight(W) {
  return W.toFixed(4).replace(/0{1,2}$/, '');
}

export function buildRow(analysis, W, x) {
  const sup = analysis.sup;
  const row = { W, x, ra: sup[0].r, rb: sup[sup.length - 1].r };
  if (sup.length === 3) row.rc = sup[1].r;
  return row;
}
