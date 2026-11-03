// Open Food Facts: sökning bland märkesvaror sålda i Sverige.
// Senare: uppslag via streckkod (productByBarcode) när kameraskanning läggs till.

import { splitCompounds } from './foods.js';

const SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';
const PRODUCT = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'code,product_name,product_name_sv,brands,nutriments,serving_quantity,product_quantity,quantity';

export class OffError extends Error {}

async function getJson(url, signal) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal });
      // Tjänsten svarar ibland 503 när den är hårt belastad: försök upp till tre gånger.
      if (res.status >= 500 && attempt < 3) throw new Error('retry');
      if (!res.ok) throw new OffError(res.status === 429 ? 'För många sökningar. Vänta en minut.' : 'Open Food Facts svarar inte just nu.');
      return await res.json();
    } catch (err) {
      if (signal?.aborted || err instanceof OffError) throw err;
      if (attempt >= 3) {
        throw new OffError(navigator.onLine === false ? 'Ingen internetanslutning.' : 'Open Food Facts svarar inte just nu. Försök igen.');
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

const r1 = v => Math.round(v * 10) / 10;

// Gör om en produkt till appens format. Returnerar null om värdena saknas eller är orimliga.
export function toFood(p) {
  const n = p.nutriments || {};
  let kcal = Number(n['energy-kcal_100g']);
  if (!Number.isFinite(kcal) && Number.isFinite(Number(n['energy-kj_100g']))) kcal = Number(n['energy-kj_100g']) / 4.184;
  const protein = Number(n.proteins_100g), carbs = Number(n.carbohydrates_100g), fat = Number(n.fat_100g);
  const fiber = Number(n.fiber_100g) || 0;
  if (![kcal, protein, carbs, fat].every(Number.isFinite)) return null;
  if (kcal < 0 || kcal > 900 || protein > 100 || protein + carbs + fat > 105) return null;
  const name = (p.product_name_sv || p.product_name || '').trim();
  if (!name) return null;
  const brand = (p.brands || '').split(',')[0].trim();
  const units = {};
  const serving = Number(p.serving_quantity);
  const pack = Number(p.product_quantity);
  if (serving > 0 && serving < 2000) units.portion = serving;
  if (pack > 0 && pack < 5000) units.förp = pack;
  return {
    code: p.code,
    name,
    brand,
    per100g: { kcal: Math.round(kcal), protein: r1(protein), carbs: r1(carbs), fat: r1(fat), fiber: r1(fiber) },
    units,
  };
}

export async function searchProducts(query, { signal, limit = 8 } = {}) {
  const run = async q => {
    const params = new URLSearchParams({
      search_terms: q, search_simple: '1', action: 'process', json: '1', page_size: '24', fields: FIELDS,
      tagtype_0: 'countries', tag_contains_0: 'contains', tag_0: 'sweden',
    });
    const data = await getJson(`${SEARCH}?${params}`, signal);
    return (data.products || []).map(toFood).filter(Boolean);
  };
  let results = await run(query);
  // Sammansatta ord ("vaniljkvarg") hittas ofta bara som separata ord ("vanilj kvarg").
  const split = splitCompounds(query);
  if (results.length < 3 && split !== query.toLowerCase().trim()) {
    const more = await run(split);
    results = [...results, ...more];
  }
  const seen = new Set();
  return results.filter(f => {
    const k = `${f.brand}|${f.name}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, limit);
}

export async function productByBarcode(code, { signal } = {}) {
  const data = await getJson(`${PRODUCT}/${encodeURIComponent(code)}.json?fields=${FIELDS}`, signal);
  return data.product ? toFood(data.product) : null;
}
