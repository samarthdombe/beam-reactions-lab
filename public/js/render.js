// Canvas rendering: bench, beam, supports, load blocks, cracks, and the failure animation.
import { state } from './state.js';
import {
  BEAM_HALF_DRIFT, BEAM_HALF_SPIN, BEAM_LEFT_PX, BEAM_PX, BEAM_THICKNESS, BEAM_TOP, BENCH_HEIGHT,
  CRACK_JITTER, CRACK_ONSET, CRACK_RANGE, DEFLECTION_SCALE, GRAIN_LINES, GRAIN_WAVE_FREQ, GRAVITY, GROUND_Y,
  HANDLE_COLOR, HANDLE_HIT_PADDING, HANDLE_RADIUS, HANDLE_Y, LOAD_BASE_HEIGHT, LOAD_HEIGHT_PER_N, LOAD_WIDTH, OFFSCREEN_MARGIN,
} from './constants.js';

const canvas = document.getElementById('cv');
const ctx = canvas.getContext('2d');
const ARC_END = 7; // radians; just over a full turn, so arcs close into a circle

// ---- coordinate helpers (physics constants come from state.config) ----

/** Beam position in metres -> canvas x in pixels. */
const sx = (x) => BEAM_LEFT_PX + (x / state.config.L) * BEAM_PX;

/** Beam position in metres -> index into the server's deflection array. */
const gridIndex = (x) => Math.round((x / state.config.L) * state.config.nPoints);

/**
 * Drawn sag in pixels for a computed deflection in mm. The picture is exaggerated, and
 * deflection grows with L cubed, so dividing by L^3 keeps the drawn bending comparable
 * for any beam length (a no-op at L = 1 m).
 */
const drawnDeflection = (mm) => (mm * DEFLECTION_SCALE[state.type]) / state.config.L ** 3;

/** Drawn deflection (pixels) at a position in metres. */
const deflectionAt = (x) => (state.A ? drawnDeflection(state.A.defl[gridIndex(x)]) : 0);

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
  if (!state.config || state.pendingX === null || state.broken) return false;
  const distance = Math.hypot(p.x - sx(clampX(state.pendingX)), p.y - HANDLE_Y);
  return distance <= HANDLE_RADIUS + HANDLE_HIT_PADDING;
}

/** The handle: a dashed guide down to the beam, a grip, and the x label. */
function drawHandle() {
  if (state.pendingX === null) return;
  const x = clampX(state.pendingX);
  const px = sx(x);
  const beamY = BEAM_TOP + deflectionAt(x);
  ctx.save();
  ctx.strokeStyle = HANDLE_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(px, HANDLE_Y + HANDLE_RADIUS);
  ctx.lineTo(px, beamY);
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
    let base = BEAM_TOP + deflectionAt(load.x);
    blocks.forEach((other) => {
      if (Math.abs(other.x - px) < w) base = Math.min(base, other.y - other.h / 2);
    });
    blocks.push({ x: px, y: base - h / 2, w, h, t: load.W % 1 ? load.W.toFixed(1) : load.W });
  });
  return blocks;
}

// ---- drawing primitives ----

function rect(x, y, w, h, angle, fill, label) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = fill;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = 'rgba(30,41,59,.5)';
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  if (label !== undefined) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
  }
  ctx.restore();
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
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x - 38, GROUND_Y + 5, 76, 22);
      ctx.strokeStyle = '#64748b';
      ctx.strokeRect(x - 38, GROUND_Y + 5, 76, 22);
      ctx.fillStyle = '#4ade80';
      ctx.font = '12px ui-monospace,monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((state.reading ?? state.A.init_bal).toFixed(3) + ' N', x, GROUND_Y + 16);
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
  if (state.broken) {
    state.bodies.forEach((b) => rect(b.x, b.y, b.w, b.h, b.a, b.c, b.t));
    return;
  }

  const n = state.config.nPoints;
  const severity = Math.min(1, A.s); // 0 = unloaded, 1 = at failure
  A.sup.forEach((p, i) => {
    const kind = i === 0 ? 'pin' : Math.abs(p.x - A.xb) < 1e-9 ? 'scale' : 'roller';
    support(sx(p.x), kind);
  });

  // beam body: top edge left->right, bottom edge right->left
  const d = A.defl.map((mm) => drawnDeflection(mm));
  ctx.beginPath();
  d.forEach((v, i) => {
    if (i) ctx.lineTo(sx((i / n) * state.config.L), BEAM_TOP + v);
    else ctx.moveTo(sx(0), BEAM_TOP + v);
  });
  for (let i = n; i >= 0; i--) ctx.lineTo(sx((i / n) * state.config.L), BEAM_TOP + BEAM_THICKNESS + d[i]);
  ctx.closePath();
  const wood = ctx.createLinearGradient(0, BEAM_TOP, 0, BEAM_TOP + BEAM_THICKNESS);
  wood.addColorStop(0, '#e6bb83');
  wood.addColorStop(0.5, '#c9955c');
  wood.addColorStop(1, '#a8743d');
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.fillStyle = `rgba(220,38,38,${severity * 0.55})`; // red tint grows with stress
  ctx.fill();
  ctx.strokeStyle = '#6b4423';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // wood grain
  ctx.strokeStyle = 'rgba(107,68,35,.35)';
  ctx.lineWidth = 1;
  GRAIN_LINES.forEach((f) => {
    ctx.beginPath();
    d.forEach((v, i) => {
      const y = BEAM_TOP + BEAM_THICKNESS * f + v + Math.sin(i * GRAIN_WAVE_FREQ + f * 9) * 0.8;
      if (i) ctx.lineTo(sx((i / n) * state.config.L), y);
      else ctx.moveTo(sx(0), y);
    });
    ctx.stroke();
  });

  // internal hinge (compound beam only)
  if (state.type === 'compound') {
    const hx = sx(state.config.hx);
    const hy = BEAM_TOP + BEAM_THICKNESS / 2 + deflectionAt(state.config.hx);
    steel(hx - 4, BEAM_TOP - 4 + deflectionAt(state.config.hx), 8, BEAM_THICKNESS + 8, true);
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(hx, hy, 6, 0, ARC_END);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.stroke();
  }

  // cracks appear above CRACK_ONSET utilisation, at the point of maximum moment
  if (A.s > CRACK_ONSET) {
    const count = Math.ceil(((A.s - CRACK_ONSET) / CRACK_RANGE) * 6);
    const len = BEAM_THICKNESS * Math.min(1, (A.s - CRACK_ONSET) / CRACK_RANGE + 0.3);
    const im = gridIndex(A.xm);
    ctx.strokeStyle = '#450a0a';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < count; i++) {
      const x = sx(A.xm) + (i - 2.5) * 9;
      const y = BEAM_TOP + BEAM_THICKNESS + d[im];
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 1; k <= 4; k++) {
        ctx.lineTo(x + (k % 2 ? 3 : -3) * (1 + Math.sin(i * 7 + k) * CRACK_JITTER), y - (len * k) / 4);
      }
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  // load blocks
  layoutLoads().forEach((b) => {
    const steelGrad = ctx.createLinearGradient(b.x - b.w / 2, 0, b.x + b.w / 2, 0);
    steelGrad.addColorStop(0, '#475569');
    steelGrad.addColorStop(0.45, '#cbd5e1');
    steelGrad.addColorStop(1, '#475569');
    rect(b.x, b.y, b.w, b.h, 0, steelGrad);
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

// ---- failure effect ----

/** Short noise burst, like timber cracking. Audio is optional: failures are silent. */
function playCrack() {
  try {
    const audio = new (window.AudioContext || window.webkitAudioContext)();
    const length = audio.sampleRate * 0.5;
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 700;
    source.connect(filter);
    filter.connect(audio.destination);
    source.start();
  } catch (e) { /* no audio support */ }
}

/** Split the beam at the point of maximum moment and set the load blocks tumbling. */
export function prepareFailure() {
  const xm = sx(state.A.xm);
  state.bodies = [
    {
      x: (BEAM_LEFT_PX + xm) / 2, y: BEAM_TOP + BEAM_THICKNESS / 2, w: xm - BEAM_LEFT_PX, h: BEAM_THICKNESS,
      a: 0, vx: -BEAM_HALF_DRIFT, vy: 0, va: -BEAM_HALF_SPIN, c: '#b9814b',
    },
    {
      x: (xm + BEAM_LEFT_PX + BEAM_PX) / 2, y: BEAM_TOP + BEAM_THICKNESS / 2, w: BEAM_LEFT_PX + BEAM_PX - xm,
      h: BEAM_THICKNESS, a: 0, vx: BEAM_HALF_DRIFT, vy: 0, va: BEAM_HALF_SPIN, c: '#b9814b',
    },
  ];
  layoutLoads().forEach((b) => state.bodies.push({
    ...b, a: 0, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, va: (Math.random() - 0.5) * 0.1, c: '#64748b',
  }));
  playCrack();
}

function fall() {
  state.bodies.forEach((b) => {
    b.vy += GRAVITY;
    b.y += b.vy;
    b.x += b.vx;
    b.a += b.va;
  });
  draw();
  if (state.bodies.some((b) => b.y < canvas.height + OFFSCREEN_MARGIN)) requestAnimationFrame(fall);
}

export function animateFailure() {
  requestAnimationFrame(fall);
}
