// TRF(x) parsing: the FIDE Tournament Report File plus the JaVaFo extension codes
// (XXR, XXC, XXA, XXP, XXZ, XXS).

import { JaVaFoError } from './errors.js';

// Result codes allowed when there is no opponent (0000), and with an opponent.
const BYE_CODES = 'UFHZ+-= ';
const GAME_CODES = '10=+-WDL';

export class Game {
  constructor(opp, color, code) {
    this.opp = opp;       // opponent pairing-id (0 = none)
    this.color = color;   // 'w' | 'b' | '-'
    this.code = code;     // TRF result character
  }
  get hasOpponent() { return this.opp > 0; }
  // A game that was actually played over the board (forfeits are not).
  get played() { return this.opp > 0 && '10=WDL'.includes(this.code); }
  get isBlank() { return this.opp === 0 && this.code === ' ' && this.color === ' '; }
}

export class PlayerRecord {
  constructor() {
    this.id = 0;          // pairing-id (001 record, columns 5-8)
    this.pos = 0;         // positional id (1-based order of appearance)
    this.line = '';
    this.sex = '';
    this.title = '';
    this.name = '';
    this.rating = 0;
    this.fed = '';
    this.fideId = '';
    this.birth = '';
    this.points = 0;      // declared points (columns 81-84)
    this.rank = 0;
    this.games = [];      // Game per round (index 0 = round 1)
  }
}

export class TrfData {
  constructor() {
    this.lines = [];          // raw lines (without line terminators)
    this.headers = new Map(); // three-char code -> rest of first line with that code
    this.players = [];        // PlayerRecord in file order
    this.byId = new Map();
    this.totalRounds = 0;     // XXR (0 = not given)
    this.config = { rank: false, white1: false, black1: false };
    this.acceleration = new Map(); // id -> array of points per round (index 0 = round 1)
    this.forbidden = [];      // arrays of ids (XXP)
    this.absent = new Set();  // ids (XXZ)
    this.scoring = [];        // [code, value] pairs in order (XXS)
  }
}

function parseNumber(text) {
  const t = text.trim().replace(',', '.');
  if (t === '') return 0;
  const v = Number(t);
  if (!Number.isFinite(v)) throw new JaVaFoError(`Unexpected number '${text}'`);
  return v;
}

function parsePlayerLine(line, pos) {
  const p = new PlayerRecord();
  p.line = line;
  p.pos = pos;
  const idText = line.substring(4, 8).trim();
  if (!/^\d+$/.test(idText)) throw new JaVaFoError(`Unexpected format of player line: ${line}`);
  p.id = parseInt(idText, 10);
  p.sex = line.substring(9, 10).trim();
  p.title = line.substring(10, 13).trim();
  p.name = line.substring(14, 47).trim();
  const r = line.substring(48, 52).trim();
  p.rating = /^\d+$/.test(r) ? parseInt(r, 10) : 0;
  p.fed = line.substring(53, 56).trim();
  p.fideId = line.substring(57, 68).trim();
  p.birth = line.substring(69, 79).trim();
  try {
    p.points = parseNumber(line.substring(80, 84));
  } catch {
    throw new JaVaFoError(`Unexpected format of player line: ${line}`);
  }
  const rk = line.substring(85, 89).trim();
  p.rank = /^\d+$/.test(rk) ? parseInt(rk, 10) : 0;
  for (let i = 0, at = 91; at < line.length; i++, at += 10) {
    const slot = line.substring(at, at + 8).padEnd(8, ' ');
    const oppText = slot.substring(0, 4).trim();
    const color = slot[5];
    const code = slot[7];
    if (oppText !== '' && !/^\d+$/.test(oppText)) {
      throw new JaVaFoError(`Unexpected format of player line: ${line}`);
    }
    const opp = oppText === '' ? 0 : parseInt(oppText, 10);
    if (opp === 0) {
      if (!BYE_CODES.includes(code)) {
        throw new JaVaFoError(`Unexpected format of player line: ${line}`,
          `Unknown bye result '${code}' in round ${i + 1}for player ${p.id}`);
      }
    } else if (!GAME_CODES.includes(code) || !'wb-'.includes(color)) {
      throw new JaVaFoError(`Unexpected format of player line: ${line}`,
        `Unknown game result '${code}' in round ${i + 1}for player ${p.id}`);
    }
    p.games.push(new Game(opp, opp === 0 && color === ' ' ? ' ' : color, code));
  }
  // Trailing blank slots carry no information.
  while (p.games.length && p.games[p.games.length - 1].isBlank) p.games.pop();
  return p;
}

export function parseTrf(text) {
  const data = new TrfData();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  data.lines = text.split(/\r\n|\n|\r/);
  let pos = 0;
  for (const line of data.lines) {
    if (line.trim() === '') continue;
    const code = line.substring(0, 3);
    const rest = line.substring(4);
    if (code === '001') {
      const p = parsePlayerLine(line, ++pos);
      if (data.byId.has(p.id)) throw new JaVaFoError(`Duplicate player id ${p.id}`);
      data.players.push(p);
      data.byId.set(p.id, p);
      continue;
    }
    if (!data.headers.has(code)) data.headers.set(code, rest);
    switch (code) {
      case 'XXR': {
        const n = parseInt(rest.trim(), 10);
        if (!Number.isFinite(n)) throw new JaVaFoError(`Unexpected XXR record: ${line}`);
        data.totalRounds = n;
        break;
      }
      case 'XXC':
        for (const tok of rest.trim().split(/\s+/)) {
          const t = tok.toLowerCase();
          if (t === 'rank') data.config.rank = true;
          else if (t === 'white1') { data.config.white1 = true; data.config.black1 = false; }
          else if (t === 'black1') { data.config.black1 = true; data.config.white1 = false; }
        }
        break;
      case 'XXA': {
        const id = parseInt(line.substring(4, 8).trim(), 10);
        const pts = [];
        for (let at = 9; at < line.length; at += 5) {
          const t = line.substring(at, at + 4);
          pts.push(t.trim() === '' ? 0 : parseNumber(t));
        }
        data.acceleration.set(id, pts);
        break;
      }
      case 'XXP': {
        const ids = rest.trim().split(/\s+/).filter(Boolean).map((t) => parseInt(t, 10));
        data.forbidden.push(ids);
        break;
      }
      case 'XXZ':
        for (const t of rest.trim().split(/\s+/).filter(Boolean)) data.absent.add(parseInt(t, 10));
        break;
      case 'XXS':
        for (const tok of rest.trim().split(/\s+/).filter(Boolean)) {
          const eq = tok.indexOf('=');
          if (eq < 0) throw new JaVaFoError(`Unexpected XXS record: ${line}`);
          data.scoring.push([tok.substring(0, eq).toUpperCase(), parseNumber(tok.substring(eq + 1))]);
        }
        break;
      default:
        break;
    }
  }
  return data;
}

// Number of rounds for which pairings exist in the file: the last round in which
// some player has an opponent or a pairing-allocated bye.
export function pairedRounds(data) {
  let n = 0;
  for (const p of data.players) {
    for (let i = p.games.length - 1; i >= n; i--) {
      const g = p.games[i];
      if (g.opp > 0 || g.code === 'U' || (g.opp === 0 && g.code === '+')) { n = i + 1; break; }
    }
  }
  return n;
}
