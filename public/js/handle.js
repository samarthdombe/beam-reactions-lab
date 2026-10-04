// Pointer handling for the two draggable parts of the canvas:
//   1. the load-position handle (sets where the next weight goes), and
//   2. the middle support, roller B, of the compound beam (moves the balance).
import { DRAG_THRESHOLD } from './constants.js';
import { canvasPoint, isOnBalance, isOnHandle, xFromCanvasX } from './render.js';
import { state } from './state.js';
import { cancelBalancePreview, commitBalance, setBalancePreview, setPendingX } from './ui.js';

export function initHandle() {
  const canvas = document.getElementById('cv');
  let drag = null; // { kind: 'load' | 'balance', startX, moved }

  const hoverCursor = (point) => (isOnHandle(point) || isOnBalance(point) ? 'grab' : '');

  const moveTo = (event) => {
    const point = canvasPoint(event);
    if (drag.kind === 'load') return setPendingX(xFromCanvasX(point.x));
    if (!drag.moved && Math.abs(point.x - drag.startX) < DRAG_THRESHOLD) return; // still just a press
    drag.moved = true;
    setBalancePreview(xFromCanvasX(point.x));
  };

  const release = (event) => {
    if (!drag) return;
    const { kind, moved } = drag;
    drag = null;
    canvas.style.cursor = hoverCursor(canvasPoint(event));
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (e) { /* capture was already released */ }
    if (kind === 'balance') return moved && event.type === 'pointerup' ? commitBalance() : cancelBalancePreview();
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (state.broken || !state.config) return;
    const point = canvasPoint(event);
    const kind = isOnHandle(point) ? 'load' : isOnBalance(point) ? 'balance' : null;
    if (!kind) return;
    drag = { kind, startX: point.x, moved: false };
    canvas.style.cursor = 'grabbing';
    try {
      canvas.setPointerCapture(event.pointerId); // keep receiving moves outside the canvas
    } catch (e) { /* pointer capture not supported */ }
    event.preventDefault();
    moveTo(event);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (drag) return moveTo(event);
    canvas.style.cursor = hoverCursor(canvasPoint(event));
  });

  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
}