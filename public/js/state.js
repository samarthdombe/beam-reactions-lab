// Shared experiment state, plus the pure (DOM-free) row logic.

export const state = {
  type: 'simple',    // 'simple' | 'compound'
  loads: [],         // [{ W, x }] accepted loads
  rows: [],          // observation-table rows
  A: null,           // latest analysis from the server
  config: null,      // physics constants, taken from the latest server response
  beam: null,        // { length, selfWeight } chosen by the user; null = server defaults
  pendingX: null,    // x (m) where the next weight will go; moved by the handle or the x field
  balancePreview: null, // x (m) of roller B while it is being dragged; null when not dragging
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
 * are exact statics: `ra` is the reaction at pin A and `rb` at support B (the balance), both
 * including the beam's self-weight and every load added so far.
 */
export function buildRow(analysis, W, x) {
  return { W, x, ra: analysis.sup[0].r, rb: analysis.bal };
}
