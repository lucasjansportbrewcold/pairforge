// Initial colour (section E) when the TRF(x) does not specify it and round 1 is
// to be paired: like JaVaFo, a deterministic "random" choice from the tournament
// file name and the tournament name (last 012 record). It is white when the Java
// hashCode of the combination is even; only its parity matters, which is the
// parity of the sum of the character codes (31 is odd). The name, when present,
// is joined with a separator of odd parity.

export function javaHashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

const parity = (s) => {
  let p = 0;
  for (let i = 0; i < s.length; i++) p ^= s.charCodeAt(i) & 1;
  return p;
};

// Base name of a tournament file as JaVaFo reports it: no directory, no
// extension, dots replaced by underscores.
export function fileBase(file) {
  if (!file) return '';
  const base = file.split(/[\\/]/).pop();
  return base.replace(/\.[^.]*$/, '').replace(/\./g, '_');
}

export function initialColourIsWhite(data) {
  const name = (data.lastName ?? '').trim();
  let p = parity(data.fileBase ?? '');
  if (name !== '') p ^= parity(name) ^ 1;
  return p === 0;
}
