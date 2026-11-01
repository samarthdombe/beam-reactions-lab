// DOM panels (live values, table, conclusion), config consumer, and the Add / Reset flows.
import { analyze, ApiError } from './api.js';
import { EQUILIBRIUM_TOLERANCE, SNAP_TOLERANCE, X_RESOLUTION } from './constants.js';
import { draw } from './render.js';
import { buildRow, clearExperiment, state } from './state.js';

const $ = (id) => document.getElementById(id);

export const BACKEND_MESSAGE =
  'Python backend not reachable. Run "python scripts/run_local.py" or "vercel dev" locally, or deploy to Vercel.';

export function msg(text) {
  $('msg').textContent = text || '';
}

/** A 400 carries the server's own explanation; anything else means the backend is not reachable. */
function errorText(error) {
  return error instanceof ApiError && error.status === 400 ? error.message : BACKEND_MESSAGE;
}

// ---- config consumer: physics constants from the server response ----

/** Show the server's constants in the Live values panel and as input limits. */
function applyConfig(config) {
  $('cfgL').textContent = config.L.toFixed(2) + ' m';
  $('cfgSelfWeight').textContent = config.selfWeight.toFixed(2) + ' N';
  $('cfgWMax').textContent = config.wMax + ' N';
  $('W').min = config.wMin;
  $('W').max = config.wMax;
  $('X').min = config.xMin;
  $('X').max = config.xMax;
  $('beamL').min = config.lMin;
  $('beamL').max = config.lMax;
  $('beamL').value = config.L;
  $('beamSW').min = config.selfWeightMin;
  $('beamSW').max = config.selfWeightMax;
  $('beamSW').value = config.selfWeight;
}

// ---- load-position handle (the x field and the draggable handle stay in sync) ----

/** Round x to a multiple of 1/X_RESOLUTION metres that lies inside the server's range [min, max]. */
function snapWithin(x, min, max) {
  const lo = Math.ceil(min * X_RESOLUTION - SNAP_TOLERANCE) / X_RESOLUTION;
  const hi = Math.floor(max * X_RESOLUTION + SNAP_TOLERANCE) / X_RESOLUTION;
  return Math.min(hi, Math.max(lo, Math.round(x * X_RESOLUTION) / X_RESOLUTION));
}

/** Snap a load position to the handle's resolution, inside the accepted range. */
function snapX(x) {
  return snapWithin(x, state.config.xMin, state.config.xMax);
}

/** Move the handle and the x field to x (no redraw). */
function placeHandle(x) {
  state.pendingX = snapX(x);
  $('X').value = state.pendingX.toFixed(2);
}

/** Move the handle (dragging) and redraw. */
export function setPendingX(x) {
  placeHandle(x);
  draw();
}

// ---- middle support (roller B of the compound beam) ----

/** Show roller B at x while it is being dragged (the server is asked only when it is released). */
export function setBalancePreview(x) {
  state.balancePreview = snapWithin(x, state.config.xbMin, state.config.xbMax);
  draw();
}

/** The drag was a plain click, or was abandoned: put roller B back. */
export function cancelBalancePreview() {
  state.balancePreview = null;
  draw();
}

/**
 * Roller B was released at a new position. Readings taken with B somewhere else no longer
 * apply, so the experiment restarts on the new layout.
 */
export function commitBalance() {
  const x = state.balancePreview;
  state.balancePreview = null;
  if (x === null || Math.abs(x - state.config.xb) < SNAP_TOLERANCE) return draw();
  const { length, selfWeight } = state.beam ?? { length: state.config.L, selfWeight: state.config.selfWeight };
  state.beam = { length, selfWeight, balanceX: x };
  return resetExperiment();
}

/** The x field was edited by hand: move the handle to match, leaving what was typed alone. */
export function syncHandleFromInput() {
  const text = $('X').value;
  if (text === '' || !Number.isFinite(+text)) return;
  state.pendingX = +text;
  draw();
}

/** Adopt a server analysis as the current one. */
function acceptAnalysis(analysis) {
  state.A = analysis;
  state.config = analysis.config;
  applyConfig(analysis.config);
  if (state.pendingX === null) placeHandle(analysis.config.L / 2); // starts at the midpoint
}

// ---- panels ----

/** Format a force in newtons; `+ 0` turns -0 into 0 so nothing shows as "-0.000". */
const newtons = (value) => (value + 0).toFixed(3);

function renderTable() {
  $('tb').innerHTML = state.rows.length
    ? state.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.W.toFixed(2)}</td><td>${r.x.toFixed(2)}</td>`
      + `<td>${newtons(r.ra)}</td><td>${newtons(r.rb)}</td></tr>`).join('')
    : '<tr><td colspan="5" class="muted" style="text-align:center">No readings yet. Add a weight to begin.</td></tr>';
}

/** Check ΣF = 0 and ΣM = 0 (about A) for the current loads, using the server's reactions. */
function renderConclusion() {
  const { A, rows, loads } = state;
  let html = '<p>Add weights to generate the conclusion.</p>';
  if (rows.length) {
    const L = state.config.L;
    const added = loads.reduce((sum, v) => sum + v.W, 0);
    const total = A.self_w + added;
    const upward = A.sup.reduce((sum, p) => sum + p.r, 0);
    // the self-weight acts at mid-span (also for the compound beam: its two segment
    // shares together have their moment at L/2)
    const loadMoment = loads.reduce((sum, v) => sum + v.W * v.x, 0) + A.self_w * (L / 2);
    const reactionMoment = A.sup.reduce((sum, p) => sum + p.r * p.x, 0);
    const sumF = upward - total;
    const sumM = reactionMoment - loadMoment;
    const ok = Math.abs(sumF) < EQUILIBRIUM_TOLERANCE && Math.abs(sumM) < EQUILIBRIUM_TOLERANCE;
    const [ra, rb, rc] = A.sup.map((p) => p.r);
    const reactionText = A.sup.length === 3
      ? `R<sub>A</sub> + R<sub>B</sub> + R<sub>C</sub> = ${newtons(ra)} + ${newtons(rb)} + ${newtons(rc)} = ${newtons(upward)} N`
      : `R<sub>A</sub> + R<sub>B</sub> = ${newtons(ra)} + ${newtons(rb)} = ${newtons(upward)} N`;
    html = `<p>With ${rows.length} weight${rows.length > 1 ? 's' : ''} on the beam (${added.toFixed(2)} N added + ${A.self_w.toFixed(2)} N self-weight = <b>${total.toFixed(2)} N</b> total load), the support reactions are ${reactionText}.</p>
  <p>ΣF<sub>y</sub> = ${newtons(upward)} − ${total.toFixed(3)} = <b>${newtons(sumF)} N</b> and ΣM about A = <b>${newtons(sumM)} N·m</b>.</p>
  <p class="${ok ? 'ok' : 'bad'}"><b>${ok ? 'The beam is in static equilibrium: ΣF = 0 and ΣM = 0, so the moment law is verified.' : 'The sums are not zero. Check the loads and supports.'}</b></p>`;
  }
  $('ctext').innerHTML = html;
}

/** Redraw every panel and the canvas from the current state. */
export function refresh() {
  const { A } = state;
  if (!A) return;
  $('tot').textContent = A.total.toFixed(2) + ' N';
  renderTable();
  renderConclusion();
  draw();
}

// ---- flows ----

/** Validate the inputs, ask the server for the new analysis, record a reading. */
export async function addLoad() {
  if (state.busy) return;
  const W = +$('W').value;
  const x = +$('X').value;
  const limits = state.config; // unknown until the first server response; the server validates too
  if (limits) {
    if (!(W >= limits.wMin && W <= limits.wMax)) return msg(`Enter a weight between ${limits.wMin} and ${limits.wMax} N.`);
    if (!(x >= limits.xMin && x <= limits.xMax)) return msg(`Enter a distance between ${limits.xMin} and ${limits.xMax} m.`);
  }
  msg();
  state.busy = true;
  const id = ++state.requestId;

  let analysis;
  try {
    analysis = await analyze(state.type, state.loads.concat({ W, x }), state.beam);
  } catch (e) {
    if (id !== state.requestId) return;
    msg(errorText(e));
    state.busy = false;
    return;
  }

  try {
    if (id !== state.requestId) return; // superseded by a Reset or beam-type change: drop the stale result
    state.loads.push({ W, x });
    acceptAnalysis(analysis);
    state.rows.push(buildRow(analysis, W, x));
    refresh();
  } catch (e) {
    console.error(e);
    if (id === state.requestId) {
      msg('Application error while updating simulation. See console for details.');
    }
  } finally {
    if (id === state.requestId) state.busy = false;
  }
}

/** Clear the experiment and load a fresh unloaded beam from the server. */
export async function resetExperiment() {
  clearExperiment();
  state.busy = false; // an in-flight Add is superseded below, so it must not block new ones
  const id = ++state.requestId;
  msg();

  let analysis;
  try {
    analysis = await analyze(state.type, [], state.beam);
  } catch (e) {
    if (id !== state.requestId) return;
    msg(errorText(e));
    draw();
    return;
  }

  try {
    if (id !== state.requestId) return; // a newer request owns the screen now
    acceptAnalysis(analysis);
    refresh();
  } catch (e) {
    console.error(e);
    if (id === state.requestId) {
      msg('Application error while updating simulation. See console for details.');
    }
  }
}

/** The length or self-weight field changed: validate, then restart the experiment on the new beam. */
export function changeBeam() {
  const lengthText = $('beamL').value;
  const weightText = $('beamSW').value;
  const length = +lengthText;
  const selfWeight = +weightText;
  const c = state.config; // unknown until the first server response; the server validates too
  if (c) {
    const restore = () => {
      $('beamL').value = c.L;
      $('beamSW').value = c.selfWeight;
    };
    if (lengthText === '' || !(length >= c.lMin && length <= c.lMax)) {
      restore();
      return msg(`Enter a beam length between ${c.lMin} and ${c.lMax} m.`);
    }
    if (weightText === '' || !(selfWeight >= c.selfWeightMin && selfWeight <= c.selfWeightMax)) {
      restore();
      return msg(`Enter a self-weight between ${c.selfWeightMin} and ${c.selfWeightMax} N.`);
    }
    if (length === c.L && selfWeight === c.selfWeight) return msg();
  }
  state.beam = { length, selfWeight };
  // Loads placed on the old beam may not fit the new one, so the experiment restarts
  // with the handle back at the new midpoint.
  state.pendingX = Math.round((length / 2) * X_RESOLUTION) / X_RESOLUTION;
  $('X').value = state.pendingX.toFixed(2);
  return resetExperiment();
}

export function changeBeamType(type) {
  state.type = type;
  $('ctitle').textContent = 'Simulation: ' + type + ' beam';
  return resetExperiment();
}
