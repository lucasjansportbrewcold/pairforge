// Initial colour (section E) when the TRF(x) does not specify it (XXC white1 /
// black1): like JaVaFo it is derived from the tournament name (last 012 record):
// white when the Java hashCode of the name is even, black for an empty name.

export function javaHashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export function initialColourIsWhite(data) {
  const name = (data.lastName ?? '').trim();
  if (name === '') return false;
  return javaHashCode(name) % 2 === 0;
}
