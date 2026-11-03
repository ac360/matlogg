// Omräkning av mått till gram.
// Livsmedelsverkets data är per 100 g, så vikt per st/skiva/dl kommer från tabellen nedan.
// Regler matchas mot livsmedlets namn: första ordet i regeln måste vara första ordet i namnet
// (SLV-namn börjar med huvudlivsmedlet, t.ex. "Kyckling bröstfilé rå"), övriga ord var som helst.
// Mer specifika regler står först.

import { normalize } from './text.js';

// Volymmått i ml
export const VOLUME_ML = { ml: 1, cl: 10, dl: 100, l: 1000, msk: 15, tsk: 5, krm: 1, glas: 200, kopp: 150, skål: 250 };
export const MASS_G = { g: 1, hg: 100, kg: 1000 };
export const PIECE_UNITS = ['st', 'skiva', 'portion', 'tallrik', 'burk', 'förp', 'bit', 'klyfta', 'näve'];

// Värden i gram. dl = gram per dl.
const RULES = [
  // Ägg
  ['äggula', { st: 18 }], ['äggvita', { st: 32 }], ['ägg', { st: 50 }],
  // Frukt och bär
  ['banan torkad', { dl: 40 }], ['banan', { st: 115 }], ['äpple torkat', { dl: 25 }], ['äpple', { st: 150 }],
  ['päron', { st: 160 }], ['apelsinjuice', { dl: 104, glas: 200 }], ['apelsin', { st: 140 }],
  ['småcitrus', { st: 60 }], ['kiwi', { st: 75 }], ['avokado', { st: 140 }], ['citron', { st: 100 }],
  ['lime', { st: 60 }], ['persika', { st: 130 }], ['nektarin', { st: 130 }], ['plommon', { st: 50 }],
  ['mango', { st: 300 }], ['ananas', { st: 900, skiva: 80 }], ['vindruvor', { st: 5, dl: 65 }],
  ['dadlar', { st: 8 }], ['blåbär', { dl: 65 }], ['hallon', { dl: 50 }], ['jordgubbar', { st: 15, dl: 60 }],
  ['lingon', { dl: 60 }], ['russin', { dl: 65, näve: 30 }], ['vattenmelon', { skiva: 300, bit: 150 }],
  ['honungsmelon', { skiva: 150, bit: 100 }],
  // Grönsaker och rotfrukter
  ['tomat krossad', { dl: 105, burk: 400 }], ['tomat', { st: 90, skiva: 10 }], ['gurka', { st: 350, skiva: 8 }],
  ['paprika', { st: 150 }], ['lök', { st: 100 }], ['rödlök', { st: 80 }], ['vitlök', { st: 40, klyfta: 5 }],
  ['morot', { st: 70 }], ['sötpotatis', { st: 250 }], ['potatis', { st: 100 }], ['broccoli', { st: 300, dl: 35 }],
  ['blomkål', { st: 500, dl: 40 }], ['zucchini', { st: 250 }], ['champinjon', { st: 15 }],
  ['majskolv', { st: 150 }], ['majskorn', { dl: 65 }], ['gröna ärtor', { dl: 60 }], ['spenat', { dl: 25 }],
  ['isbergssallat', { st: 500, dl: 15 }], ['rödbeta', { st: 100 }],
  // Bröd och bakverk
  ['bröd tortilla', { st: 40 }], ['bröd vetetortilla', { st: 40 }], ['hårt bröd', { st: 12, skiva: 12 }],
  ['bröd', { skiva: 35, st: 50 }], ['knäckemacka', { st: 60 }], ['sött vetebröd', { st: 60 }],
  ['kanelbulle', { st: 60 }], ['korvbröd', { st: 40 }], ['tacoskal', { st: 12 }], ['riskaka', { st: 8 }],
  ['kex', { st: 8 }], ['muffins', { st: 70 }], ['våffla', { st: 40 }], ['pannkaka tunn', { st: 50 }],
  ['semla', { st: 120 }], ['croissant', { st: 50 }],
  // Mejeri
  ['mjölk', { dl: 103, glas: 206 }], ['mellanmjölk', { dl: 103, glas: 206 }], ['lättmjölk', { dl: 103, glas: 206 }],
  ['filmjölk', { dl: 103 }], ['yoghurt', { dl: 105 }], ['kvarg', { dl: 105 }],
  ['färskost cottage', { dl: 100 }], ['färskost', { dl: 100 }], ['havredryck', { dl: 103, glas: 206 }],
  ['sojadryck', { dl: 103, glas: 206 }], ['vispgrädde', { dl: 100 }], ['matlagningsgrädde', { dl: 100 }],
  ['kaffegrädde', { dl: 100 }], ['crème', { dl: 100 }], ['ost', { skiva: 10, dl: 40 }],
  ['smör', { dl: 95 }], ['matfettsblandning', { dl: 95 }],
  // Spannmål, pasta, ris
  ['havregryn', { dl: 35 }], ['havregrynsgröt', { dl: 105, portion: 250 }], ['frukostflingor müsli', { dl: 40 }],
  ['frukostflingor granola', { dl: 45 }], ['frukostflingor', { dl: 15 }],
  ['ris okokt', { dl: 85, portion: 70 }], ['ris kokt', { dl: 70, portion: 180 }], ['ris', { dl: 85, portion: 70 }],
  ['pasta okokt', { dl: 40, portion: 80 }], ['pasta kokt', { dl: 55, portion: 200 }],
  ['nudlar okokta', { portion: 70 }], ['nudlar kokta', { portion: 200 }],
  ['bulgur kokt', { dl: 70, portion: 180 }], ['bulgur', { dl: 75, portion: 70 }],
  ['couscous', { dl: 70, portion: 70 }], ['mjölmålla okokt', { dl: 85, portion: 70 }],
  ['vetemjöl', { dl: 60 }], ['potatismos', { dl: 100, portion: 200 }],
  // Baljväxter, nötter, frön
  ['linser torkade', { dl: 85 }], ['kikärtor', { dl: 80 }], ['tofu', { portion: 125 }],
  ['jordnötssmör', { dl: 100 }],
  // Socker, såser, fett
  ['socker', { dl: 85 }], ['honung', { dl: 140 }], ['majonnäs', { dl: 95 }], ['ketchup', { dl: 110 }],
  ['olivolja', { dl: 91 }],
  // Kött, fågel, fisk
  ['kyckling bröstfilé', { st: 130 }], ['kyckling lårfilé', { st: 90 }], ['köttbullar', { st: 15 }],
  ['korv wienerkorv', { st: 50 }], ['korv grillkorv', { st: 60 }], ['korv prinskorv', { st: 15 }],
  ['korv falukorv', { skiva: 30 }], ['gris bacon', { skiva: 12 }], ['påläggskorv', { skiva: 5 }],
  ['leverpastej', { msk: 15 }], ['fiskpinnar', { st: 25 }],
  ['hamburgare bröd', { st: 220 }], ['hamburgare', { st: 90 }],
  ['lax', { portion: 125 }], ['torsk', { portion: 125 }], ['tonfisk', { burk: 120 }],
  // Dryck
  ['läsk', { burk: 330, glas: 200 }], ['öl', { burk: 330, st: 330, glas: 400 }], ['energidryck', { burk: 250 }],
  ['vin', { glas: 150 }], ['kaffe', { kopp: 150 }], ['te', { kopp: 200 }],
  // Rätter och övrigt
  ['pizza', { st: 450, bit: 110 }], ['chips', { portion: 30, näve: 15 }], ['popcorn', { dl: 8 }],
  ['kebab bröd', { st: 400 }],
].map(([phrase, values]) => ({ words: normalize(phrase), values }));

// Standardvärden per livsmedelsgrupp (SLV:s gruppnamn).
const DISH_GROUPS = [
  'Kötträtt', 'Pastarätter', 'Potatisrätter', 'Fisk- och skaldjursrätt', 'Grönsaksrätter', 'Baljväxträtter',
  'Svamprätter', 'Maträtter och efterrätter', 'Matpaj eller pizza', 'Äggrätter', 'Livsmedelsrätter och ingredienser',
  'Cerealierätter t.ex. klimp, risotto, pannkakor med fyllning, couscous, smörgåsar',
];
const LIQUID_GROUPS = [
  'Mjölk', 'Fil och yoghurt', 'Juice och nektar', 'Dryck utan alkohol', 'Läsk', 'Öl eller maltdryck',
  'Cider och liknande drycker', 'Vin och vinliknande drycker', 'Vatten', 'Kaffe, te och kakao', 'Soppa', 'Grädde',
  'Sås i maträtt', 'Vegetabiliska mejeriprodukter',
];
function groupDefaults(group) {
  if (DISH_GROUPS.includes(group)) return { portion: 350, tallrik: 350, dl: 90 };
  if (group === 'Soppa') return { portion: 300, tallrik: 300, dl: 100 };
  if (group === 'Smörgåsar') return { st: 120, portion: 120 };
  if (LIQUID_GROUPS.includes(group)) return { dl: 100 };
  if (/fett|olja|margarin|smör/i.test(group)) return { dl: 93 };
  if (/nöt, frö/i.test(group)) return { dl: 60, näve: 30 };
  if (group === 'Frukostflingor') return { dl: 25 };
  if (/Rött kött|Fågel|Fisk$|Kött eller/.test(group)) return { portion: 125 };
  return {};
}

// Gissade vikter när inget annat finns (markeras som uppskattade).
const FALLBACK = { st: 100, skiva: 15, portion: 150, tallrik: 350, burk: 400, förp: 250, bit: 20, klyfta: 5, näve: 30 };

function ruleFor(words) {
  if (!words.length) return null;
  for (const r of RULES) {
    if (r.words[0] !== words[0]) continue;
    if (r.words.slice(1).every(w => words.includes(w))) return r.values;
  }
  return null;
}

// Samlar kända mått för ett livsmedel: egna mått > regel > grupp.
export function knownUnits(food, queryWords = []) {
  const rule = ruleFor(food.words) || ruleFor(queryWords) || {};
  return { ...groupDefaults(food.group), ...rule, ...(food.units || {}) };
}

// Mått som är rimliga att erbjuda i väljaren för ett livsmedel.
export function unitOptions(food, queryWords) {
  const known = knownUnits(food, queryWords);
  const opts = ['g'];
  for (const u of PIECE_UNITS) if (known[u]) opts.push(u);
  const hasVolume = known.dl || Object.keys(VOLUME_ML).some(u => known[u]);
  if (hasVolume) opts.push('dl', 'msk', 'tsk', 'ml');
  for (const u of ['glas', 'kopp']) if (known[u]) opts.push(u);
  return [...new Set(opts)];
}

// Väljer standardmått när inget mått angavs ("2 ägg", "en banan", "köttfärs").
export function defaultUnit(food, qty, queryWords) {
  const known = knownUnits(food, queryWords);
  if (qty != null && qty >= 20 && !known.st) return 'g'; // "200 köttfärs" = gram
  if (known.st) return 'st';
  if (known.portion) return 'portion';
  return qty == null ? 'g' : 'st';
}

// Räknar om mängd + mått till gram. approx=true när vikten är en grov gissning.
export function toGrams(food, qty, unit, { size = 1, queryWords = [] } = {}) {
  if (qty != null && isNaN(qty)) qty = null;
  if (!unit) unit = defaultUnit(food, qty, queryWords);
  if (qty == null) qty = unit === 'g' ? 100 : 1;
  if (MASS_G[unit]) return { grams: qty * MASS_G[unit], unit, qty, approx: false };

  const known = knownUnits(food, queryWords);
  if (known[unit]) return { grams: qty * known[unit] * size, unit, qty, approx: false };

  if (VOLUME_ML[unit]) {
    const perDl = known.dl;
    const grams = (qty * VOLUME_ML[unit] * (perDl || 100)) / 100;
    return { grams, unit, qty, approx: !perDl };
  }
  if (unit === 'tallrik' && known.portion) return { grams: qty * known.portion * size, unit, qty, approx: false };
  if (unit === 'st' && known.portion) return { grams: qty * known.portion * size, unit, qty, approx: true };
  return { grams: qty * (FALLBACK[unit] || 100) * size, unit, qty, approx: true };
}
