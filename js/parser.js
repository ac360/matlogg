// Tolkar fritext som "150 g köttfärs", "2 ägg", "1 dl havregryn", "en stor banan".
// Returnerar { raw, qty, unit, size, name } där unit är normaliserad eller null.

export const UNIT_ALIASES = {
  g: 'g', gr: 'g', gram: 'g',
  kg: 'kg', kilo: 'kg',
  hg: 'hg', hekto: 'hg',
  ml: 'ml', cl: 'cl', dl: 'dl', l: 'l', liter: 'l',
  msk: 'msk', matsked: 'msk', matskedar: 'msk',
  tsk: 'tsk', tesked: 'tsk', teskedar: 'tsk',
  krm: 'krm', kryddmått: 'krm',
  st: 'st', 'st.': 'st', styck: 'st', stycken: 'st', stk: 'st',
  skiva: 'skiva', skivor: 'skiva', sk: 'skiva',
  portion: 'portion', portioner: 'portion', port: 'portion', 'port.': 'portion',
  glas: 'glas',
  kopp: 'kopp', koppar: 'kopp',
  burk: 'burk', burkar: 'burk',
  förp: 'förp', förpackning: 'förp', förpackningar: 'förp', paket: 'förp',
  bit: 'bit', bitar: 'bit',
  klyfta: 'klyfta', klyftor: 'klyfta',
  näve: 'näve', nävar: 'näve',
  skål: 'skål', skålar: 'skål',
  tallrik: 'tallrik', tallrikar: 'tallrik',
  matlåda: 'portion', matlådor: 'portion', låda: 'portion', lådor: 'portion',
};

export const UNIT_LABELS = {
  g: 'g', kg: 'kg', hg: 'hg', ml: 'ml', cl: 'cl', dl: 'dl', l: 'l',
  msk: 'msk', tsk: 'tsk', krm: 'krm', st: 'st', skiva: 'skiva', portion: 'portion',
  glas: 'glas', kopp: 'kopp', burk: 'burk', förp: 'förp', bit: 'bit',
  klyfta: 'klyfta', näve: 'näve', skål: 'skål', tallrik: 'tallrik',
};

const WORD_NUMBERS = {
  en: 1, ett: 1, två: 2, tre: 3, fyra: 4, fem: 5, sex: 6, sju: 7, åtta: 8,
  nio: 9, tio: 10, elva: 11, tolv: 12, femton: 15, tjugo: 20,
  halv: 0.5, halva: 0.5, halvt: 0.5,
};

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

const SIZES = {
  liten: 0.75, litet: 0.75, lilla: 0.75, små: 0.75,
  medelstor: 1, medelstort: 1, mellanstor: 1, normal: 1, normalstor: 1,
  stor: 1.3, stort: 1.3, stora: 1.3,
};

// "1,5" → 1.5, "1/2" → 0.5, "1½" → 1.5, "2-3" → 2.5. Annars null.
export function parseNumber(token) {
  if (!token) return null;
  let t = token.replace(',', '.');
  const range = t.match(/^(\d+(?:\.\d+)?)[-–](\d+(?:\.\d+)?)$/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac && Number(frac[2])) return Number(frac[1]) / Number(frac[2]);
  const uni = t.match(/^(\d*)([½¼¾⅓⅔⅛])$/);
  if (uni) return (uni[1] ? Number(uni[1]) : 0) + FRACTIONS[uni[2]];
  if (/^\d+(?:\.\d+)?$/.test(t)) return Number(t);
  return null;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/(\d)([a-zåäö])/g, '$1 $2') // 150g → 150 g
    .replace(/([a-zåäö])(\d)/g, (m, a, b) => (a === 'b' || a === 'd' ? m : `${a} ${b}`)) // behåll b12, d3
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

// Läser en mängd från början av tokens. Returnerar { qty, used }.
function readQuantity(tokens, start = 0) {
  let i = start;
  let qty = null;
  while (i < tokens.length) {
    const t = tokens[i];
    const n = parseNumber(t);
    if (n != null) {
      qty = (qty ?? 0) + n;
      i++;
      continue;
    }
    if ((t === 'en' || t === 'ett') && tokens[i + 1] === 'halv') {
      qty = (qty ?? 0) + 0.5; i += 2; continue;
    }
    if ((t === 'ett' || t === 'en') && tokens[i + 1] === 'par') {
      qty = (qty ?? 0) + 2; i += 2; continue;
    }
    if (t === 'och' && qty != null && i + 1 < tokens.length) {
      const look = readQuantity(tokens, i + 1);
      if (look.qty != null) { qty += look.qty; i = look.end; continue; }
      break;
    }
    if (t in WORD_NUMBERS && qty == null) {
      qty = WORD_NUMBERS[t]; i++; continue;
    }
    break;
  }
  return { qty, end: i };
}

export function parseLine(raw) {
  const tokens = tokenize(raw);
  let qty = null, unit = null, size = 1;

  let { qty: q, end } = readQuantity(tokens);
  let rest = tokens.slice(end);
  if (q != null) qty = q;

  if (rest.length && UNIT_ALIASES[rest[0]] && (qty != null || rest.length > 1)) {
    unit = UNIT_ALIASES[rest[0]];
    rest = rest.slice(1);
  }

  // Mängd på slutet: "köttfärs 150 g", "mjölk 2 dl"
  if (qty == null && rest.length >= 2) {
    const last = rest[rest.length - 1];
    if (UNIT_ALIASES[last] && parseNumber(rest[rest.length - 2]) != null) {
      unit = UNIT_ALIASES[last];
      qty = parseNumber(rest[rest.length - 2]);
      rest = rest.slice(0, -2);
    } else if (parseNumber(last) != null) {
      qty = parseNumber(last);
      rest = rest.slice(0, -1);
    }
  }

  if (rest[0] === 'av' || rest[0] === 'med') rest = rest.slice(1);
  if (rest.length > 1 && rest[0] in SIZES) {
    size = SIZES[rest[0]];
    rest = rest.slice(1);
  }

  const name = rest.join(' ').replace(/[.,;:!?]+$/, '').trim();
  return { raw: raw.trim(), qty, unit, size, name };
}

// Delar upp en inmatning i flera rader: "2 ägg, 1 dl mjölk" eller en rad per sak.
export function parseInput(text) {
  return text
    .split(/[\n,;+]|\s+samt\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(parseLine)
    .filter(p => p.name);
}
