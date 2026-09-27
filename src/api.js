// Programmatic interface modelled on JaVaFoApi.exec(operation, params...).
// The parameters are recognised by their type, in any order:
//   string          the TRF(x) text (for the generator: a model tournament)
//   Buffer          the TRF(x) bytes
//   plain object    generator properties (as in a configuration file, plus FirstSeed)
//   { write() }     an output stream: the result is written to it, exec returns null
//   number          the round to check (CHECK_ONE_ROUND)
// Without an output stream the result is returned as a string.

import { EOL } from 'node:os';
import { Tournament } from './tournament.js';
import { checklist } from './checklist.js';
import { checkTournament } from './checker.js';
import { pairingText } from './cli.js';
import { generate } from './rtg.js';
import { JaVaFoError } from './errors.js';

export const PAIRING = 1000;
export const PAIRING_WITH_BAKU = 1001;
export const PRE_PAIRING_CHECKLIST = 1100;
export const POST_PAIRING_CHECKLIST = 1110;
export const POST_PAIRING_WITH_BAKU_CHECKLIST = 1111;
export const CHECK_TOURNAMENT = 1200;
export const CHECK_ONE_ROUND = 1210;
export const RANDOM_GENERATOR = 1300;
export const RANDOM_GENERATOR_WITH_BAKU = 1301;

function propertiesText(props) {
  return Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n');
}

export function exec(operation, ...params) {
  let text = null, props = null, out = null, round = null;
  for (const p of params) {
    if (typeof p === 'string') text ??= p;
    else if (Buffer.isBuffer(p)) text ??= p.toString('utf8');
    else if (typeof p === 'number') round ??= p;
    else if (p && typeof p.write === 'function') out ??= p;
    else if (p && typeof p === 'object') props ??= p;
  }
  let result;
  switch (operation) {
    case PAIRING:
    case PAIRING_WITH_BAKU:
    case PRE_PAIRING_CHECKLIST:
    case POST_PAIRING_CHECKLIST:
    case POST_PAIRING_WITH_BAKU_CHECKLIST: {
      if (text === null) throw new JaVaFoError('No input tournament');
      const t = Tournament.fromText(text);
      const baku = operation === PAIRING_WITH_BAKU || operation === POST_PAIRING_WITH_BAKU_CHECKLIST;
      const res = t.pair(undefined, { baku });
      if (operation === PAIRING || operation === PAIRING_WITH_BAKU) result = pairingText(res);
      else if (operation === PRE_PAIRING_CHECKLIST) result = checklist({ ...res, pairs: [], bye: null }, EOL);
      else result = checklist(res, EOL);
      break;
    }
    case CHECK_TOURNAMENT:
    case CHECK_ONE_ROUND: {
      if (text === null) throw new JaVaFoError('No input tournament');
      const t = Tournament.fromText(text);
      const lines = checkTournament(t, 'tournament', operation === CHECK_ONE_ROUND ? round : null);
      result = lines.map((l) => l + EOL).join('');
      break;
    }
    case RANDOM_GENERATOR:
    case RANDOM_GENERATOR_WITH_BAKU: {
      const baku = operation === RANDOM_GENERATOR_WITH_BAKU;
      if (text !== null) result = generate({ model: text, baku });
      else if (props && props.FirstSeed !== undefined && Object.keys(props).length === 1) {
        result = generate({ config: String(props.FirstSeed), baku });
      } else {
        result = generate({ configText: props ? propertiesText(props) : null, seed: props?.FirstSeed, baku });
      }
      break;
    }
    default:
      throw new JaVaFoError(`Unknown operation ${operation}`);
  }
  if (out) {
    out.write(result);
    return null;
  }
  return result;
}
