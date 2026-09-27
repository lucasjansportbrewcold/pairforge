// Random Tournament Generator (-g): builds a complete random tournament whose
// rounds are paired by this engine. The parameters follow the JaVaFo manual
// (configuration file, model tournament or seed); results are drawn with the
// outcome probabilities of O. Milvang, "Probability for the outcome of a chess
// game based on rating" (2016).

import { readFileSync, existsSync } from 'node:fs';
import { EOL } from 'node:os';
import { Tournament } from './tournament.js';
import { parseTrf, pairedRounds } from './trf.js';
import { buildScoring, category, CODES, DEFAULT_VALUES } from './scoring.js';
import { decimalSeparator } from './format.js';
import { PairingError } from './errors.js';

// Deterministic generator (splitmix64 on BigInt state), so that a seed always
// produces the same tournament with this program.
class Rng {
  constructor(seed) {
    this.s = BigInt.asUintN(64, BigInt(seed));
  }
  nextU64() {
    this.s = BigInt.asUintN(64, this.s + 0x9e3779b97f4a7c15n);
    let z = this.s;
    z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
    z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
    return z ^ (z >> 31n);
  }
  next() { return Number(this.nextU64() >> 11n) / 2 ** 53; }
  int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  gaussian() {
    let u = 0;
    while (u === 0) u = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }
}

const POINT_KEYS = ['WWPoints', 'BWPoints', 'WDPoints', 'BDPoints', 'WLPoints', 'BLPoints',
  'ZPBPoints', 'HPBPoints', 'FPBPoints', 'PABPoints', 'FWPoints', 'FLPoints'];

function readProperties(text) {
  const props = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const eq = line.search(/[=:]/);
    if (eq < 0) continue;
    props[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return props;
}

// Probability of a white win / black win (Milvang 2016).
export function outcomeProbabilities(wr, br) {
  const rm = (wr + br) / 2;
  const rd = wr - br;
  const wcl = 40;
  const wcv = rm > 1200 ? 0.45 - (0.1 * (rm - 1200) ** 2) / 1200 ** 2 : 0.45;
  const wll = -1492 + rm * 0.391;
  const wul = 1691 - rm * 0.428;
  let pw;
  if (rd < wll) pw = 0;
  else if (rd <= wcl) pw = (wcv * (rd - wll) ** 2) / (wcl - wll) ** 2;
  else if (rd <= wul) pw = 1 - ((1 - wcv) * (rd - wul) ** 2) / (wcl - wul) ** 2;
  else pw = 1;
  const bcl = -80;
  const bcv = rm > 1200 ? 0.46 - (0.13 * (rm - 1200) ** 2) / 1200 ** 2 : 0.46;
  const bll = -1753 + rm * 0.416;
  const bul = 1428 - rm * 0.388;
  let pb;
  if (rd < bll) pb = 1;
  else if (rd <= bcl) pb = 1 - ((1 - bcv) * (rd - bll) ** 2) / (bcl - bll) ** 2;
  else if (rd <= bul) pb = (bcv * (rd - bul) ** 2) / (bcl - bul) ** 2;
  else pb = 0;
  if (pw + pb > 1) { const s = pw + pb; pw /= s; pb /= s; }
  return { pw, pb };
}

// Parameters from a model tournament: sizes and rates observed in it.
function modelParameters(text) {
  const data = parseTrf(text);
  const scoring = buildScoring(data);
  const rounds = data.totalRounds || pairedRounds(data);
  let games = 0, forfeits = 0, quick = 0, slots = 0, zpb = 0, hpb = 0, fpb = 0;
  for (const p of data.players) {
    for (let r = 0; r < rounds; r++) {
      const g = p.games[r];
      slots++;
      if (!g) continue;
      if (g.opp > 0) {
        games++;
        if ('+-'.includes(g.code)) forfeits++;
        if ('WDL'.includes(g.code)) quick++;
      } else if (g.code === 'Z' || g.code === '-' || g.code === ' ') zpb++;
      else if (g.code === 'H' || g.code === '=') hpb++;
      else if (g.code === 'F') fpb++;
    }
  }
  const perMille = (a, b) => (b ? Math.round((1000 * a) / b) : 0);
  return {
    PlayersNumber: data.players.length,
    RoundsNumber: rounds,
    ForfeitRate: perMille(forfeits, games),
    QuickgameRate: perMille(quick, games),
    ZPBRate: perMille(zpb, slots),
    HPBRate: perMille(hpb, slots),
    FPBRate: perMille(fpb, slots),
    ratings: data.players.map((p) => p.rating),
    points: scoring.values,
  };
}

function formatPoints(x) {
  // like java.text.DecimalFormat("#.##"): no leading zero, no trailing zeros
  let s = (Math.round(x * 100) / 100).toString();
  if (s.startsWith('0.')) s = s.slice(1);
  else if (s.startsWith('-0.')) s = '-' + s.slice(2);
  return s.replace('.', decimalSeparator());
}

// config: a configuration file name or a seed (a long integer); configText: the
// contents of a configuration; seed: explicit seed (FirstSeed).
export function generate({ model = null, config = null, configText = null, seed: firstSeed = null, baku = false } = {}) {
  let seed;
  let props = {};
  if (config !== null && /^\d+$/.test(config)) {
    seed = BigInt(config);
  } else {
    seed = firstSeed !== null && firstSeed !== undefined
      ? BigInt(firstSeed)
      : BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000));
    if (config !== null) {
      if (!existsSync(config)) throw new PairingError(`Cannot read file ${config}`);
      props = readProperties(readFileSync(config, 'utf8'));
    } else if (configText !== null) {
      props = readProperties(configText);
    }
  }
  const rng = new Rng(seed);
  const m = model ? modelParameters(model) : null;
  const num = (key, lo, hi) => {
    if (props[key] !== undefined && props[key] !== '') return Number(props[key].replace(',', '.'));
    if (m && m[key] !== undefined) return m[key];
    return rng.int(lo, hi);
  };
  const n = num('PlayersNumber', 15, 415);
  const R = num('RoundsNumber', 5, 17);
  const forfeitRate = num('ForfeitRate', 10, 100);
  const quickRate = num('QuickgameRate', 0, 20);
  const zpbRate = num('ZPBRate', 0, 20);
  const hpbRate = num('HPBRate', 5, 45);
  const fpbRate = num('FPBRate', 0, 2);
  let high = num('HighestRating', 2400, 2800);
  let low = num('LowestRating', 1400, 2300);
  let groups = num('Groups', 0, 10);
  const separator = num('Separator', 20, 70);
  if (low > high) [low, high] = [high, low];
  const values = DEFAULT_VALUES.slice();
  if (m) m.points.forEach((v, i) => { values[i] = v; });
  POINT_KEYS.forEach((k, i) => { if (props[k] !== undefined) values[i] = Number(props[k].replace(',', '.')); });

  // ratings
  let ratings;
  if (m) {
    ratings = m.ratings.slice();
  } else {
    const median = (high + low) / 2 - separator;
    const over = (sigma) => {
      let c = 0;
      for (let i = 0; i < 200; i++) if (median + sigma * ((i - 99.5) / 40) > high) c++;
      return c;
    };
    while (over((high - low) / (groups + 1)) > 10 && groups < 50) groups++;
    const sigma = (high - low) / (groups + 1);
    ratings = [];
    for (let i = 0; i < n; i++) {
      let r;
      do r = Math.round(median + sigma * rng.gaussian()); while (r < low || r > high);
      ratings.push(r);
    }
    ratings.sort((a, b) => b - a);
  }

  const width = 91 + 10 * R;
  const header = [
    `012 AutoTest ${seed}`,
    `022 F${forfeitRate}Q${quickRate}Z${zpbRate}R0H${hpbRate}F${fpbRate}H${high}L${low}G${groups}S${separator}` +
      CODES.map((c, i) => `${c.replace('ZPB', 'ZP').replace('HPB', 'HP').replace('FPB', 'FP').replace('PAB', 'PA')}${formatPoints(values[i])}`).join(''),
    '032 FIDE',
    '042 ',
    '052 ',
    `062 ${n}`,
    `072 ${n}`,
    '082 0',
    '092 Individual  Swiss Dutch 2017 rules',
    '102 Auto-Generator',
    '122 ',
    '132'.padEnd(width, ' '),
  ];
  const xxs = CODES.map((c, i) => `${c}=${values[i]}`).join(' ');
  const results = Array.from({ length: n }, () => []); // slot strings per round
  const accel = Array.from({ length: n }, () => []);
  const pts = (code, colour, opp) => values[category({ code, color: colour, opp })];
  const playerLine = (i, round, points) => {
    const id = i + 1;
    let s = `001 ${String(id).padStart(4)}`.padEnd(14) + `Test${String(id).padStart(4, '0')} Player${String(id).padStart(4, '0')}`;
    s = s.padEnd(48) + String(ratings[i]).padStart(4);
    s = s.padEnd(80) + points.toFixed(1).padStart(4) + ' ' + '    ';
    s = s.padEnd(91) + results[i].slice(0, round).join('');
    return s;
  };

  for (let round = 1; round <= R; round++) {
    // absences announced before the pairing
    const absent = new Map();
    for (let i = 0; i < n; i++) {
      const x = rng.next() * 1000;
      if (x < zpbRate) absent.set(i, 'Z');
      else if (x < zpbRate + hpbRate) absent.set(i, 'H');
      else if (x < zpbRate + hpbRate + fpbRate) absent.set(i, 'F');
    }
    const lines = header.slice(0, 11);
    lines.push(`XXR ${R}`);
    lines.push(`XXS ${xxs}`);
    for (let i = 0; i < n; i++) {
      if (accel[i].length) lines.push(`XXA ${String(i + 1).padStart(4)}` + accel[i].map((a) => ' ' + a.toFixed(1).padStart(4)).join(''));
    }
    for (let i = 0; i < n; i++) {
      let p = 0;
      for (const s of results[i]) p += pts(s[7], s[5], parseInt(s.substring(0, 4), 10) || 0);
      if (absent.has(i)) {
        results[i].push(`0000 - ${absent.get(i)}  `);
        p += pts(absent.get(i), '-', 0);
        lines.push(playerLine(i, round, p));
        results[i].pop();
      } else {
        lines.push(playerLine(i, round - 1, p));
      }
    }
    const t = Tournament.fromText(lines.join('\n') + '\n', `AutoTest${seed}`);
    const res = t.pair(round, { baku });
    if (baku && t.override) {
      for (let i = 0; i < n; i++) {
        const a = t.override.points.get(i + 1);
        while (accel[i].length < round - 1) accel[i].push(0);
        accel[i].push(a ? a / 1000 : 0);
      }
    }
    for (const [i, code] of absent) results[i].push(`0000 - ${code}  `);
    for (const [w, b] of res.pairs) {
      const wi = w.id - 1, bi = b.id - 1;
      let rw, rb;
      const u = rng.next() * 1000;
      if (u < forfeitRate) {
        if (rng.next() < 0.5) { rw = '+'; rb = '-'; } else { rw = '-'; rb = '+'; }
      } else {
        const { pw, pb } = outcomeProbabilities(ratings[wi], ratings[bi]);
        const x = rng.next();
        const quick = rng.next() * 1000 < quickRate;
        if (x < pw) { rw = quick ? 'W' : '1'; rb = quick ? 'L' : '0'; }
        else if (x < pw + pb) { rw = quick ? 'L' : '0'; rb = quick ? 'W' : '1'; }
        else { rw = quick ? 'D' : '='; rb = quick ? 'D' : '='; }
      }
      results[wi].push(`${String(b.id).padStart(4)} w ${rw}  `);
      results[bi].push(`${String(w.id).padStart(4)} b ${rb}  `);
    }
    if (res.bye) results[res.bye.id - 1].push('0000 - U  ');
  }

  // final standings: points, Buchholz, Sonneborn-Berger, id
  const total = results.map((rs) => rs.reduce((s, x) => s + pts(x[7], x[5], parseInt(x.substring(0, 4), 10) || 0), 0));
  const opps = results.map((rs) => rs.map((x) => ({ opp: parseInt(x.substring(0, 4), 10) || 0, code: x[7], col: x[5] })));
  const buch = opps.map((os) => os.reduce((s, o) => s + (o.opp > 0 ? total[o.opp - 1] : 0), 0));
  const sb = opps.map((os) => os.reduce((s, o) => s + (o.opp > 0 ? pts(o.code, o.col, o.opp) * total[o.opp - 1] : 0), 0));
  const order = [...Array(n).keys()].sort((a, b) => (total[b] - total[a]) || (buch[b] - buch[a]) || (sb[b] - sb[a]) || (a - b));
  const rank = new Array(n);
  order.forEach((i, k) => { rank[i] = k + 1; });
  const out = header.slice();
  if (baku) {
    for (let i = 0; i < n; i++) {
      const a = accel[i];
      let last = a.length;
      while (last > 0 && !a[last - 1]) last--;
      if (!last) continue;
      let s = `XXA ${String(i + 1).padStart(4)}`;
      for (let r = 0; r < R; r++) s += ' ' + (r < last && a[r] ? a[r].toFixed(1).padStart(4) : '    ');
      out.push(s);
    }
  }
  for (let i = 0; i < n; i++) {
    let s = `001 ${String(i + 1).padStart(4)}`.padEnd(14) + `Test${String(i + 1).padStart(4, '0')} Player${String(i + 1).padStart(4, '0')}`;
    s = s.padEnd(48) + String(ratings[i]).padStart(4);
    s = s.padEnd(80) + total[i].toFixed(1).padStart(4) + ' ' + String(rank[i]).padStart(4);
    s = s.padEnd(91) + results[i].join('');
    out.push(s.padEnd(width, ' '));
  }
  return out.join(EOL) + EOL;
}
