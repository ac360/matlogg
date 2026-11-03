// Livsmedelsregister och lokal sökning.
// Källor i registret (foodRef.source):
//   'slv'    Livsmedelsverket (data/livsmedel.json)
//   'base'   baslistan med vanliga produkter som saknas hos SLV (js/basfoods.js)
//   'custom' egna livsmedel i IndexedDB; origin säger varifrån: 'manual', 'ai' eller 'off' (Open Food Facts)
//   'recipe' recept/matlådor i IndexedDB (per portion)

import { normalize, normKey } from './text.js';
import * as db from './db.js';
import { BASE_FOODS } from './basfoods.js';

let slvMeta = null;
const foods = new Map(); // refKey → food
let vocab = new Set();
let vocabList = [];

export const refKey = ref => `${ref.source}:${ref.id}`;

// Vanliga vardagsord → hur Livsmedelsverket benämner saken.
const SYNONYMS = {
  'köttfärs': ['nöt färs rå'], 'nötfärs': ['nöt färs rå'], 'fläskfärs': ['gris färs rå'], 'lammfärs': ['lamm färs rå'],
  'kycklingfärs': ['kyckling färs'], 'blandfärs': ['nöt färs rå', 'gris färs rå'],
  'kycklingfilé': ['kyckling bröstfilé'], 'kycklingbröst': ['kyckling bröstfilé'], 'kycklingbröstfilé': ['kyckling bröstfilé'],
  'kycklinglårfilé': ['kyckling lårfilé'], 'kycklinglår': ['kyckling lår'],
  'kalkonfilé': ['kalkon filé'], 'kalkonbröst': ['kalkon filé'], 'laxfilé': ['lax'], 'torskfilé': ['torsk'],
  'keso': ['färskost cottage cheese naturell'], 'kesella': ['kvarg'], 'skyr': ['kvarg naturell'],
  'turkisk yoghurt': ['yoghurt naturell fett 10%'], 'grekisk yoghurt': ['yoghurt naturell fett 10%'],
  'mjölk': ['mellanmjölk'], 'standardmjölk': ['mjölk fett 3%'],
  'havremjölk': ['havredryck'], 'oatly': ['havredryck'], 'sojamjölk': ['sojadryck'],
  'spaghetti': ['pasta'], 'spagetti': ['pasta'], 'makaroner': ['pasta'], 'penne': ['pasta'], 'fusilli': ['pasta'],
  'tagliatelle': ['pasta'], 'jasminris': ['ris jasmin'], 'basmatiris': ['ris basmati'], 'fullkornsris': ['ris råris'],
  'cola': ['läsk cola'], 'coca cola': ['läsk cola'], 'pepsi': ['läsk cola'], 'cola zero': ['läsk cola light'],
  'coca cola zero': ['läsk cola light'], 'pepsi max': ['läsk cola light'],
  'avocado': ['avokado'], 'peanut butter': ['jordnötssmör'], 'fil': ['filmjölk'],
  'knäckebröd': ['hårt bröd'], 'knäcke': ['hårt bröd'], 'fralla': ['bröd vitt'], 'frallor': ['bröd vitt'],
  'tortilla': ['bröd vitt vetetortilla'], 'ost': ['ost hårdost'], 'prästost': ['ost hårdost fett 31%'],
  'herrgårdsost': ['ost hårdost fett 28%'], 'grevé': ['ost hårdost fett 28%'], 'cheddar': ['ost hårdost fett 31%'],
  'räkor': ['räka'], 'potatisar': ['potatis'], 'pommes': ['pommes frites'], 'smörgås': ['bröd'], 'macka': ['bröd'],
  'olja': ['rapsolja', 'olivolja'], 'quinoa': ['mjölmålla quinoa'],
  'kanelbulle': ['sött vetebröd kanelbulle'], 'kanelbullar': ['sött vetebröd kanelbulle'],
  'pasta m köttfärssås': ['spagetti m köttfärssås'], 'spagetti m köttfärssås': ['spagetti m köttfärssås'],
  'spaghetti m köttfärssås': ['spagetti m köttfärssås'], 'köttfärssås': ['köttfärssås nöt'],
  'äpple': ['äpple m skal'], 'äpplen': ['äpple m skal'], 'ägg': ['ägg rått', 'ägg kokt'],
  'bröd': ['bröd fullkorn', 'bröd vitt'],
};

const SYN = Object.fromEntries(Object.entries(SYNONYMS).map(([k, v]) => [normKey(k), v]));

const QUERY_STOP = new Set(['och', 'lite', 'av', 'på', 'till', 'en', 'ett', 'typ', 'ca']);
const QUERY_MAP = { med: 'm', utan: 'u' };

function makeFood(ref, name, per100, extra = {}) {
  const { aliases = [], ...rest } = extra;
  return {
    ref, key: refKey(ref), name, words: normalize(name), per100,
    alt: aliases.map(normalize).filter(a => a.length),
    ...rest,
  };
}

export async function loadFoods() {
  const res = await fetch('data/livsmedel.json');
  indexSlv(await res.json());
  indexBase();
  await reloadCustomFoods();
}

export function indexBase() {
  for (const b of BASE_FOODS) {
    const food = makeFood({ source: 'base', id: b.id }, b.n, { kcal: b.k, protein: b.p, carbs: b.c, fat: b.f, fiber: b.fi }, {
      aliases: b.a, units: b.u, typical: true,
    });
    foods.set(food.key, food);
  }
  rebuildVocab();
}

export function indexSlv(data) {
  slvMeta = { source: data.source, license: data.license, url: data.url, imported: data.imported, count: data.foods.length };
  for (const f of data.foods) {
    const food = makeFood({ source: 'slv', id: f.i }, f.n, { kcal: f.k, protein: f.p, carbs: f.c, fat: f.f, fiber: f.fi }, {
      group: data.groups[f.g] || '',
      raw: !!f.r,
    });
    foods.set(food.key, food);
  }
  rebuildVocab();
}

// Läser in egna livsmedel och recept från IndexedDB (anropas efter ändringar och import av backup).
export async function reloadCustomFoods() {
  for (const k of [...foods.keys()]) if (k.startsWith('custom:') || k.startsWith('recipe:')) foods.delete(k);
  for (const c of await db.getAll('customFoods')) {
    const food = makeFood({ source: 'custom', id: c.id }, c.name, c.per100g, {
      aliases: c.aliases || [], group: c.group || '', units: c.units || {}, origin: c.source,
      estimated: c.source === 'ai', brand: c.brand, barcode: c.barcode, aiReason: c.aiReason, components: c.components,
    });
    foods.set(food.key, food);
  }
  for (const r of await db.getAll('recipes')) {
    if (r.kind !== 'recipe' || !(r.totalGrams > 0)) continue;
    const per100 = {};
    for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fiber']) per100[k] = ((r.totals?.[k] || 0) * 100) / r.totalGrams;
    const portion = r.totalGrams / (r.portions || 1);
    const food = makeFood({ source: 'recipe', id: r.id }, r.name, per100, {
      aliases: r.aliases || [], units: { portion }, recipe: true,
    });
    foods.set(food.key, food);
  }
  rebuildVocab();
}

function rebuildVocab() {
  vocab = new Set();
  for (const f of foods.values()) {
    for (const w of f.words) if (w.length >= 2 && !/^\d/.test(w)) vocab.add(w);
    for (const a of f.alt) for (const w of a) if (w.length >= 2 && !/^\d/.test(w)) vocab.add(w);
  }
  vocabList = [...vocab];
}

export const getFood = ref => foods.get(refKey(ref)) || null;
export const getSlvMeta = () => slvMeta;

// ---- Sökning ----

const hasPrefix = stem => vocabList.some(w => w.startsWith(stem));

// Försöker göra om ett ord som inte finns i databasen: plural → singular, sammansatt ord → två ord.
function expandToken(t) {
  if (vocab.has(t) || t.length < 4) return [t];
  // Plural och böjda adjektiv: "tomater" → "tomat", "krossade" → "krossad", "kokta" → "kokt".
  for (const suf of ['arna', 'orna', 'erna', 'ar', 'or', 'er', 'na', 'en', 'n', 'r', 'e', 'a']) {
    if (t.endsWith(suf) && t.length - suf.length >= 4) {
      const stem = t.slice(0, -suf.length);
      if (vocab.has(stem) || hasPrefix(stem)) return [stem];
    }
  }
  for (let i = t.length - 3; i >= 3; i--) {
    let head = t.slice(0, i);
    const tail = t.slice(i);
    if (!vocab.has(head) && head.endsWith('s') && vocab.has(head.slice(0, -1))) head = head.slice(0, -1);
    if (vocab.has(head) && (vocab.has(tail) || hasPrefix(tail))) return [head, tail];
  }
  return [t];
}

function queryVariants(query) {
  const base = normalize(query).map(t => QUERY_MAP[t] || t).filter(t => !QUERY_STOP.has(t));
  if (!base.length) return [];
  // Synonymer är handplockade och får en liten bonus.
  const variants = [{ tokens: base, bonus: 0 }];
  const whole = base.join(' ');
  for (const syn of SYN[whole] || []) variants.push({ tokens: normalize(syn), bonus: 0.5 });
  base.forEach((t, i) => {
    if (base.length === 1) return;
    for (const syn of SYN[t] || []) {
      variants.push({ tokens: [...base.slice(0, i), ...normalize(syn), ...base.slice(i + 1)], bonus: 0.3 });
    }
  });
  const expanded = base.flatMap(expandToken);
  if (expanded.join(' ') !== whole) {
    variants.push({ tokens: expanded, bonus: 0 });
    const ek = expanded.join(' ');
    for (const syn of SYN[ek] || []) variants.push({ tokens: normalize(syn), bonus: 0.5 });
  }
  return variants;
}

// Småord i SLV-namn ("m.", "u.", "el.") räknas inte som omatchade ord.
const FILLER = new Set(['m', 'u', 'el', 'i', 'och', 'typ', 'ca', 'eko']);

function scoreFood(food, tokens) {
  let best = scoreWords(food.words, tokens, food.raw);
  for (const a of food.alt) best = Math.max(best, scoreWords(a, tokens, false));
  return best;
}

function scoreWords(words, tokens, raw) {
  let sum = 0, missing = 0, first = false;
  const used = new Set();
  for (const t of tokens) {
    let best = 0, bestJ = -1;
    for (let j = 0; j < words.length; j++) {
      const w = words[j];
      let s = 0;
      if (w === t) s = 3;
      else if (t.length >= 3 && w.startsWith(t)) s = w.length - t.length <= 2 ? 2.3 : 1.5;
      else if (w.length >= 4 && t.startsWith(w) && t.length - w.length <= 3) s = 2.3; // "tomater" ↔ "tomat", "kokta" ↔ "kokt"
      else if (t.length >= 4 && w.includes(t)) s = 1;
      else if (/^\d/.test(t) && w.startsWith(t.replace('%', ''))) s = 1.5; // "10%" ↔ "10"
      if (s > best || (s === best && s > 0 && j === 0)) { best = s; bestJ = j; }
    }
    if (best === 0) missing++;
    else { sum += best; used.add(bestJ); if (bestJ === 0) first = true; }
  }
  if (missing && (tokens.length < 3 || missing > 1)) return 0;
  let score = sum / tokens.length + (first ? 1.5 : 0) - missing * 2;
  if (words.join(' ') === tokens.join(' ')) score += 3;
  const unmatched = words.filter((w, j) => !used.has(j) && !FILLER.has(w)).length;
  score -= Math.min(2.5, unmatched * 0.3);
  if (raw) score += 0.2;
  return score;
}

const MIN_SCORE = 1.5;

// Söker i alla livsmedel. boost: Map refKey → extra poäng (t.ex. för ofta valda livsmedel).
// preferRecipe: texten nämner "matlåda" och syftar troligen på ett eget recept.
export function search(query, { limit = 8, boost, preferRecipe = false } = {}) {
  const variants = queryVariants(query);
  if (!variants.length) return [];
  const results = [];
  for (const food of foods.values()) {
    let best = 0;
    for (const v of variants) {
      const sc = scoreFood(food, v.tokens);
      if (sc > 0) best = Math.max(best, sc + v.bonus);
    }
    if (best < MIN_SCORE) continue;
    if (boost?.has(food.key)) best += boost.get(food.key);
    if (food.ref.source === 'recipe') best += preferRecipe ? 2.5 : 1;
    else if (food.ref.source === 'custom') best += 0.3;
    else if (food.ref.source === 'base') best += 0.2;
    results.push({ food, score: best });
  }
  results.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length);
  return results.slice(0, limit);
}

// ---- Ihågkomna val ----

let choiceCache = null;

async function loadChoices() {
  if (!choiceCache) choiceCache = await db.getAll('choices');
  return choiceCache;
}

function usageBoost(choices) {
  const boost = new Map();
  for (const c of choices) {
    const k = refKey(c.ref);
    boost.set(k, Math.min(1.5, (boost.get(k) || 0) + 0.5 * (c.count || 1)));
  }
  return boost;
}

export async function rememberChoice(query, ref) {
  const key = normKey(query);
  if (!key) return;
  const prev = await db.get('choices', key);
  const sameRef = prev && refKey(prev.ref) === refKey(ref);
  await db.put('choices', { ...(prev || {}), key, ref, count: sameRef ? (prev.count || 1) + 1 : 1 });
  choiceCache = null;
}

// Tolkar vilket livsmedel en fritext avser.
// Returnerar { candidates: [food], chosen: food|null, ambiguous: bool, remembered: bool }.
export async function resolve(query, { preferRecipe = false } = {}) {
  const choices = await loadChoices();
  const key = normKey(query);
  const remembered = choices.find(c => c.key === key);
  const results = search(query, { limit: 6, boost: usageBoost(choices), preferRecipe });
  const candidates = results.map(r => r.food);

  if (remembered) {
    const food = getFood(remembered.ref);
    if (food) {
      const rest = candidates.filter(f => f.key !== food.key);
      return { candidates: [food, ...rest].slice(0, 6), chosen: food, ambiguous: false, remembered: true };
    }
  }
  if (!results.length) return { candidates: [], chosen: null, ambiguous: false, remembered: false };
  const clear = results.length === 1 || results[0].score - results[1].score >= 0.6;
  return { candidates, chosen: clear ? results[0].food : null, ambiguous: !clear, remembered: false };
}

// Sparar ett eget livsmedel. extra kan innehålla aliases, brand, barcode, aiReason, components.
export async function saveCustomFood({ name, per100g, units, source = 'manual', group = '', ...extra }) {
  const clean = Object.fromEntries(Object.entries(extra).filter(([, v]) => v != null));
  const rec = await db.put('customFoods', { name, per100g, units: units || {}, source, group, ...clean });
  await reloadCustomFoods();
  return getFood({ source: 'custom', id: rec.id });
}

export async function findCustomByBarcode(code) {
  if (!code) return null;
  const rows = await db.getByIndex('customFoods', 'barcode', code);
  return rows[0] ? getFood({ source: 'custom', id: rows[0].id }) : null;
}

export async function deleteCustomFood(id) {
  await db.softDelete('customFoods', id);
  await reloadCustomFoods();
}

// Delar upp ett sammansatt ord med hjälp av ordförrådet, t.ex. "vaniljkvarg" → "vanilj kvarg".
export function splitCompounds(text) {
  return normalize(text).flatMap(t => {
    if (t.length < 7) return [t];
    for (let i = t.length - 3; i >= 3; i--) {
      let head = t.slice(0, i);
      const tail = t.slice(i);
      if (!vocab.has(head) && head.endsWith('s') && vocab.has(head.slice(0, -1))) head = head.slice(0, -1);
      if (vocab.has(head) && vocab.has(tail)) return [head, tail];
    }
    return [t];
  }).join(' ');
}

export function allCustomFoods() {
  return [...foods.values()].filter(f => f.ref.source === 'custom');
}
