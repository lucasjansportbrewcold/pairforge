// Colour allocation (FIDE Dutch rules, section E).

import { ABS } from './state.js';

// A.2 order: higher score first, then lower pairing number.
export const higherRanked = (a, b) => (a.score !== b.score ? a.score > b.score : a.pn < b.pn);

// Returns true when `a` gets white against `b`.
export function whiteFor(a, b, initialWhite) {
  const [hi, lo] = higherRanked(a, b) ? [a, b] : [b, a];
  const hiWhite = hiGetsWhite(hi, lo, initialWhite);
  return a === hi ? hiWhite : !hiWhite;
}

function hiGetsWhite(hi, lo, initialWhite) {
  const ph = hi.pref;
  const pl = lo.pref;
  // E.1 grant both preferences (a player without preference accepts any colour)
  if (ph && pl) {
    if (ph !== pl) return ph === 'W';
  } else if (ph) {
    return ph === 'W';
  } else if (pl) {
    return pl === 'B';
  }
  if (ph && pl) {
    // E.2 grant the stronger preference; both absolute: the wider colour difference
    if (hi.strength !== lo.strength) {
      return (hi.strength > lo.strength) === (ph === 'W');
    }
    if (hi.strength === ABS) {
      const dh = Math.abs(hi.cd);
      const dl = Math.abs(lo.cd);
      if (dh !== dl) return (dh > dl) === (ph === 'W');
    }
    // E.3 alternate to the most recent time one had white and the other black
    const ch = hi.colors;
    const cl = lo.colors;
    for (let i = ch.length - 1, j = cl.length - 1; i >= 0 && j >= 0; i--, j--) {
      if (ch[i] !== cl[j]) return ch[i] === 'B';
    }
    // E.4 grant the preference of the higher ranked player
    return ph === 'W';
  }
  // E.5 initial colour for an odd pairing number of the higher ranked player
  return (hi.e5 % 2 === 1) === initialWhite;
}
