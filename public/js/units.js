// Display units for lengths. The server always works in metres; the page converts only what it
// shows and what the user types.
import { UNITS } from './constants.js';
import { state } from './state.js';

const unit = () => UNITS[state.unit];

/** Metres -> the chosen display unit. */
export const toUnit = (metres) => metres * unit().factor;

/** A value typed in the chosen display unit -> metres. */
export const fromUnit = (value) => value / unit().factor;

/** Symbol of the chosen unit: 'm' or 'cm'. */
export const unitSymbol = () => state.unit;

/** A length in metres, formatted in the chosen unit (no symbol). */
export const formatLength = (metres) => toUnit(metres).toFixed(unit().decimals);

/** Round a converted limit so floating-point noise never shows (0.30000000000000004 -> 0.3). */
export const unitLimit = (metres) => +toUnit(metres).toFixed(6);

/** Input step for load positions and for the beam length, in the chosen unit. */
export const xStep = () => unit().xStep;
export const lengthStep = () => unit().lengthStep;
