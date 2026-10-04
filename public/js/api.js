// API client for POST /api/analyze.
import { API_URL } from './constants.js';

/** The server answered with an error status. `message` is the server's own explanation. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** `beam` is optional: { length, selfWeight }. Without it the server uses its defaults. */
export async function analyze(type, loads, beam = null) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(beam ? { type, loads, beam } : { type, loads }),
  });
  if (!response.ok) {
    let message = 'API ' + response.status;
    try {
      const body = await response.json();
      if (body && typeof body.error === 'string') message = body.error;
    } catch (e) { /* body was not JSON; keep the status text */ }
    throw new ApiError(response.status, message);
  }
  return response.json();
}
