// Sparade måltider och recept (lagret 'recipes').
//   kind 'meal'   en mall med flera rader som loggas på en gång (t.ex. "Vanlig frukost")
//   kind 'recipe' en sats med ingredienser och antal portioner; loggas som "1 portion/matlåda"
// items har samma fält som en post: { input, name, foodRef, qty, unit, grams, nutrients, override, estimated }

import * as db from './db.js';
import { reloadCustomFoods } from './foods.js';
import { sum } from './nutrition.js';
import { normKey } from './text.js';

const pickItem = it => ({
  input: it.input, name: it.name, foodRef: it.foodRef || null, qty: it.qty, unit: it.unit,
  grams: it.grams, nutrients: { ...it.nutrients }, override: !!it.override, estimated: !!it.estimated,
});

export async function listMeals() {
  const rows = await db.getAll('recipes');
  return rows.filter(r => r.kind === 'meal').sort((a, b) => (b.uses || 0) - (a.uses || 0) || a.name.localeCompare(b.name, 'sv'));
}

export async function listRecipes() {
  const rows = await db.getAll('recipes');
  return rows.filter(r => r.kind === 'recipe').sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}

export const getRecipe = id => db.get('recipes', id);

export async function saveMeal({ id, name, items }) {
  const prev = id ? await db.get('recipes', id) : null;
  const clean = items.map(pickItem);
  return db.put('recipes', {
    ...(prev || {}), kind: 'meal', name: name.trim(), items: clean, totals: sum(clean.map(i => i.nutrients)),
  });
}

// cookedGrams: färdig vikt efter tillagning (valfritt). Annars summan av ingrediensernas vikt.
export async function saveRecipe({ id, name, portions, cookedGrams, items }) {
  const prev = id ? await db.get('recipes', id) : null;
  const clean = items.map(pickItem);
  const rawGrams = clean.reduce((s, i) => s + (i.grams || 0), 0);
  const rec = await db.put('recipes', {
    ...(prev || {}),
    kind: 'recipe',
    name: name.trim(),
    portions: portions > 0 ? portions : 1,
    cookedGrams: cookedGrams > 0 ? cookedGrams : null,
    totalGrams: cookedGrams > 0 ? cookedGrams : rawGrams,
    items: clean,
    totals: sum(clean.map(i => i.nutrients)),
  });
  await reloadCustomFoods();
  return rec;
}

export async function deleteRecipe(id) {
  await db.softDelete('recipes', id);
  await reloadCustomFoods();
}

export async function markMealUsed(id) {
  const rec = await db.get('recipes', id);
  if (rec) await db.put('recipes', { ...rec, uses: (rec.uses || 0) + 1 });
}

// Hittar en sparad måltid vars namn matchar texten exakt ("vanlig frukost").
export async function findMealByName(text) {
  const key = normKey(text);
  if (!key) return null;
  return (await listMeals()).find(m => normKey(m.name) === key) || null;
}
