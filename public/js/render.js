// Canvas rendering: bench, rigid beam, supports with reaction readouts, load blocks, load handle.
// The beam is treated as rigid: it is always drawn straight and never bends, cracks or breaks.
import { state } from './state.js';
import {
  BEAM_LEFT_PX, BEAM_PX, BEAM_THICKNESS, BEAM_TOP, BENCH_HEIGHT, GRAIN_LINES, GRAIN_WAVE_FREQ, GROUND_Y,
  BALANCE_ARROW_OFFSET, BALANCE_HIT_BELOW, BALANCE_HIT_HALF_WIDTH,
  HANDLE_COLOR, HANDLE_HIT_PADDING, HANDLE_RADIUS, HANDLE_Y, LOAD_BASE_HEIGHT, LOAD_HEIGHT_PER_N, LOAD_WIDTH,
} from './constants.js';

const canvas = document.getElementById('cv');
const ctx = canvas.getContext('2d');
const ARC_END = 7; // radians; just over a full turn, so arcs close into a circle

// ---- coordinate helpers (physics constants come from state.config) ----

/** Beam position in metres -> canvas x in pixels. */
const sx = (x) => BEAM_LEFT_PX + (x / state.config.L) * BEAM_PX;

// ---- draggable load-position handle ----

/** Keep a position inside the range the server accepts. */
const clampX = (x) => Math.min(state.config.xMax, Math.max(state.config.xMin, x));

/** Canvas x in pixels -> beam position in metres (the inverse of sx). */
export const xFromCanvasX = (px) => ((px - BEAM_LEFT_PX) / BEAM_PX) * state.config.L;

/** Pointer event -> canvas pixel coordinates (the canvas is scaled by CSS). */
export function canvasPoint(event) {
  const box = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) * canvas.width) / box.width,
    y: ((event.clientY - box.top) * canvas.height) / box.height,
  };
}

/** True if canvas point `p` is on (or just around) the handle, so it can be grabbed. */
export function isOnHandle(p) {
  if (!state.config || state.pendingX === null) return false;
  const distance = Math.hypot(p.x - sx(clampX(state.pendingX)), p.y - HANDLE_Y);
  return distance <= HANDLE_RADIUS + HANDLE_HIT_PADDING;
}

/** Two small arrows either side of a support: it moves left and right. */
function dragArrows(x, y) {
  ctx.fillStyle = HANDLE_COLOR;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(x + side * (BALANCE_ARROW_OFFSET - 6), y - 5);
    ctx.lineTo(x + side * (BALANCE_ARROW_OFFSET + 3), y);
    ctx.lineTo(x + side * (BALANCE_ARROW_OFFSET - 6), y + 5);
    ctx.closePath();
    ctx.fill();
  });
}

/** True if canvas point `p` is on the middle support (compound beam only), so it can be dragged. */
export function isOnBalance(p) {
  const a = state.A;
  if (!state.config || !a || state.type !== 'compound' || a.sup.length !== 3) return false;
  const centre = sx(state.balancePreview !== null ? state.balancePreview : a.xb);
  return Math.abs(p.x - centre) <= BALANCE_HIT_HALF_WIDTH
    && p.y >= BEAM_TOP + BEAM_THICKNESS
    && p.y <= GROUND_Y + BALANCE_HIT_BELOW;
}

/** The handle: a dashed guide down to the beam, a grip, and the x label. */
function drawHandle() {
  if (state.pendingX === null) return;
  const x = clampX(state.pendingX);
  const px = sx(x);
  ctx.save();
  ctx.strokeStyle = HANDLE_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(px, HANDLE_Y + HANDLE_RADIUS);
  ctx.lineTo(px, BEAM_TOP);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = HANDLE_COLOR;
  ctx.beginPath();
  ctx.arc(px, HANDLE_Y, HANDLE_RADIUS, 0, ARC_END);
  ctx.fill();
  ctx.fillStyle = '#fff';
  [-1, 1].forEach((side) => { // two small arrows: this handle moves left and right
    ctx.beginPath();
    ctx.moveTo(px + side * 3, HANDLE_Y - 4);
    ctx.lineTo(px + side * 8, HANDLE_Y);
    ctx.lineTo(px + side * 3, HANDLE_Y + 4);
    ctx.closePath();
    ctx.fill();
  });
  ctx.fillStyle = HANDLE_COLOR;
  ctx.font = 'bold 12px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`x = ${x.toFixed(2)} m`, px, HANDLE_Y - HANDLE_RADIUS - 6);
  ctx.restore();
}

// ---- load blocks ----

/** Stack the added loads as blocks; blocks near each other sit on top of each other. */
function layoutLoads() {
  const blocks = [];
  state.loads.forEach((load) => {
    const px = sx(load.x);
    const w = LOAD_WIDTH;
    const h = LOAD_BASE_HEIGHT + Math.min(load.W, state.config.wMax) * LOAD_HEIGHT_PER_N;
    let base = BEAM_TOP;
    blocks.forEach((other) => {
      if (Math.abs(other.x - px) < w) base = Math.min(base, other.y - other.h / 2);
    });
    blocks.push({ x: px, y: base - h / 2, w, h, t: load.W % 1 ? load.W.toFixed(1) : load.W });
  });
  return blocks;
}

// ---- drawing primitives ----

function rect(x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.strokeStyle = 'rgba(30,41,59,.5)';
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
}

function steel(x, y, w, h, vertical) {
  const gradient = vertical
    ? ctx.createLinearGradient(0, y, 0, y + h)
    : ctx.createLinearGradient(x, 0, x + w, 0);
  gradient.addColorStop(0, '#64748b');
  gradient.addColorStop(0.5, '#e2e8f0');
  gradient.addColorStop(1, '#64748b');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#334155';
  ctx.strokeRect(x, y, w, h);
}

function bolt(x, y) {
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.arc(x, y, 2.5, 0, ARC_END);
  ctx.fill();
}

/** Digital display under a support showing its reaction force in newtons. */
function readout(x, newtons) {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x - 38, GROUND_Y + 5, 76, 22);
  ctx.strokeStyle = '#64748b';
  ctx.strokeRect(x - 38, GROUND_Y + 5, 76, 22);
  ctx.fillStyle = '#4ade80';
  ctx.font = '12px ui-monospace,monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // + 0 turns -0 into 0, so a zero reaction never shows as "-0.000 N"
  ctx.fillText((newtons + 0).toFixed(3) + ' N', x, GROUND_Y + 16);
}

/** kind: 'pin' (fixed pin), 'roller', or 'scale' (roller sitting on the balance). */
function support(x, kind) {
  const top = BEAM_TOP + BEAM_THICKNESS;
  steel(x - 34, GROUND_Y - 8, 68, 8, true);
  bolt(x - 26, GROUND_Y - 4);
  bolt(x + 26, GROUND_Y - 4);
  if (kind === 'pin') {
    const gradient = ctx.createLinearGradient(x - 22, 0, x + 22, 0);
    gradient.addColorStop(0, '#64748b');
    gradient.addColorStop(0.5, '#cbd5e1');
    gradient.addColorStop(1, '#64748b');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x, top + 6);
    ctx.lineTo(x - 24, GROUND_Y - 8);
    ctx.lineTo(x + 24, GROUND_Y - 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(x, top + 6, 6, 0, ARC_END);
    ctx.fill();
    ctx.stroke();
    readout(x, state.A.sup[0].r); // reaction at A from the server (self-weight + added loads)
  } else {
    steel(x - 14, top + 22, 28, GROUND_Y - 8 - top - 22, false);
    steel(x - 26, top + 2, 52, 5, true);
    [-9, 9].forEach((offset) => {
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(x + offset, top + 15, 7, 0, ARC_END);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.stroke();
    });
    if (kind === 'scale') {
      readout(x, state.A.bal); // reaction at B from the server
      if (state.type === 'compound') dragArrows(x, GROUND_Y + 16); // this support can be dragged
    }
  }
}

// ---- main draw ----

export function draw() {
  const { A } = state;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bench = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + BENCH_HEIGHT);
  bench.addColorStop(0, '#a8a29e');
  bench.addColorStop(1, '#78716c');
  ctx.fillStyle = bench;
  ctx.fillRect(0, GROUND_Y, canvas.width, BENCH_HEIGHT);
  if (!A) return;

  A.sup.forEach((p, i) => {
    const isBalance = i !== 0 && Math.abs(p.x - A.xb) < 1e-9;
    const kind = i === 0 ? 'pin' : isBalance ? 'scale' : 'roller';
    // while roller B is being dragged it is drawn at the pointer, before the server has answered
    const at = isBalance && state.balancePreview !== null ? state.balancePreview : p.x;
    support(sx(at), kind);
  });

  // rigid beam: a straight timber bar
  const left = sx(0);
  const right = sx(state.config.L);
  const wood = ctx.createLinearGradient(0, BEAM_TOP, 0, BEAM_TOP + BEAM_THICKNESS);
  wood.addColorStop(0, '#e6bb83');
  wood.addColorStop(0.5, '#c9955c');
  wood.addColorStop(1, '#a8743d');
  ctx.fillStyle = wood;
  ctx.fillRect(left, BEAM_TOP, right - left, BEAM_THICKNESS);
  ctx.strokeStyle = '#6b4423';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(left, BEAM_TOP, right - left, BEAM_THICKNESS);

  // wood grain
  ctx.strokeStyle = 'rgba(107,68,35,.35)';
  ctx.lineWidth = 1;
  GRAIN_LINES.forEach((f) => {
    ctx.beginPath();
    for (let px = left; px <= right; px += 8) {
      const y = BEAM_TOP + BEAM_THICKNESS * f + Math.sin(px * GRAIN_WAVE_FREQ * 0.1 + f * 9) * 0.8;
      if (px === left) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();
  });

  // internal hinge (compound beam only)
  if (state.type === 'compound') {
    const hx = sx(state.config.hx);
    const hy = BEAM_TOP + BEAM_THICKNESS / 2;
    steel(hx - 4, BEAM_TOP - 4, 8, BEAM_THICKNESS + 8, true);
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(hx, hy, 6, 0, ARC_END);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.stroke();
  }

  // load blocks
  layoutLoads().forEach((b) => {
    const steelGrad = ctx.createLinearGradient(b.x - b.w / 2, 0, b.x + b.w / 2, 0);
    steelGrad.addColorStop(0, '#475569');
    steelGrad.addColorStop(0.45, '#cbd5e1');
    steelGrad.addColorStop(1, '#475569');
    rect(b.x, b.y, b.w, b.h, steelGrad);
    ctx.fillStyle = '#334155';
    ctx.fillRect(b.x - 5, b.y - b.h / 2 - 5, 10, 5); // hook
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.t, b.x, b.y);
  });

  // labels
  ctx.fillStyle = '#334155';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('A (pin)', sx(0) - 16, GROUND_Y + 40);
  if (state.type === 'compound') ctx.fillText('hinge', sx(state.config.hx) - 14, BEAM_TOP - 10);

  drawHandle();
}
