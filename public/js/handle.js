// Pointer handling for the draggable load-position handle on the canvas.
import { canvasPoint, isOnHandle, xFromCanvasX } from './render.js';
import { state } from './state.js';
import { setPendingX } from './ui.js';

export function initHandle() {
  const canvas = document.getElementById('cv');
  let dragging = false;

  const moveTo = (event) => setPendingX(xFromCanvasX(canvasPoint(event).x));

  const release = (event) => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = isOnHandle(canvasPoint(event)) ? 'grab' : '';
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (e) { /* capture was already released */ }
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (state.broken || !state.config || !isOnHandle(canvasPoint(event))) return;
    dragging = true;
    canvas.style.cursor = 'grabbing';
    try {
      canvas.setPointerCapture(event.pointerId); // keep receiving moves outside the canvas
    } catch (e) { /* pointer capture not supported */ }
    event.preventDefault();
    moveTo(event);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (dragging) return moveTo(event);
    canvas.style.cursor = isOnHandle(canvasPoint(event)) ? 'grab' : '';
  });

  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
}
