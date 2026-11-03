// Flik för sparade måltider, recept/matlådor och egna livsmedel.

import { esc, h, num, openSheet, toast } from '../ui.js';
import * as db from '../db.js';
import * as foods from '../foods.js';
import { listMeals, listRecipes, saveMeal, saveRecipe, deleteRecipe } from '../recipes.js';
import { KEYS, LABELS, UNITS, fmt, fmtIn, scaleBy } from '../nutrition.js';
import { createItemsList } from './items-list.js';
import { totalsText } from './log.js';
import { sourceBadge } from './item-editor.js';

export async function renderRecipes(main) {
  const [meals, recipes] = await Promise.all([listMeals(), listRecipes()]);
  const custom = foods.allCustomFoods().sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  const rerender = () => renderRecipes(main);

  main.innerHTML = `
    <header class="topbar"><h1>Recept & måltider</h1></header>
    <div class="content recipes">
      <section>
        <div class="section-head"><h2 class="section-title">Sparade måltider</h2>
          <button type="button" class="btn-text new-meal">+ Ny måltid</button></div>
        <div class="card list">
          ${meals.length ? meals.map(m => `
            <button type="button" class="list-row meal-row" data-id="${m.id}">
              <span class="row-main"><span class="row-name">${esc(m.name)}</span>
                <span class="row-meta">${m.items.length} delar · ${fmt(m.totals?.kcal)} kcal · ${fmt(m.totals?.protein)} g protein</span></span>
              <span class="chev">›</span>
            </button>`).join('')
          : '<p class="hint pad">Logga till exempel din vanliga frukost och tryck <b>Spara som måltid</b> i dagsvyn. Sedan lägger du in hela frukosten med ett tryck.</p>'}
        </div>
      </section>

      <section>
        <div class="section-head"><h2 class="section-title">Recept och matlådor</h2>
          <button type="button" class="btn-text new-recipe">+ Nytt recept</button></div>
        <div class="card list">
          ${recipes.length ? recipes.map(r => {
            const per = scaleBy(r.totals || {}, 1 / (r.portions || 1));
            return `
            <button type="button" class="list-row recipe-row" data-id="${r.id}">
              <span class="row-main"><span class="row-name">${esc(r.name)}</span>
                <span class="row-meta">${r.portions} portioner · ${fmt(per.kcal)} kcal · ${fmt(per.protein)} g protein per portion</span></span>
              <span class="chev">›</span>
            </button>`;
          }).join('')
          : '<p class="hint pad">Ange ingredienserna för en hel sats och hur många portioner det blev. Logga sedan till exempel <b>1 matlåda chili</b>.</p>'}
        </div>
      </section>

      <section>
        <h2 class="section-title">Egna livsmedel</h2>
        <div class="card list">
          ${custom.length ? custom.map(f => `
            <button type="button" class="list-row food-row" data-id="${f.ref.id}">
              <span class="row-main"><span class="row-name">${esc(f.name)}</span>
                <span class="row-meta">${sourceBadge(f)} ${fmt(f.per100.kcal)} kcal · ${fmt(f.per100.protein, 1)} g protein / 100 g</span></span>
              <span class="chev">›</span>
            </button>`).join('')
          : '<p class="hint pad">Livsmedel du skriver in själv, hämtar från Open Food Facts eller får uppskattade av AI hamnar här.</p>'}
        </div>
      </section>
    </div>`;

  main.querySelector('.new-meal').addEventListener('click', () => openMealSheet(null, rerender));
  main.querySelector('.new-recipe').addEventListener('click', () => openRecipeSheet(null, rerender));
  main.querySelectorAll('.meal-row').forEach(b => b.addEventListener('click', () =>
    openMealSheet(meals.find(m => m.id === b.dataset.id), rerender)));
  main.querySelectorAll('.recipe-row').forEach(b => b.addEventListener('click', () =>
    openRecipeSheet(recipes.find(r => r.id === b.dataset.id), rerender)));
  main.querySelectorAll('.food-row').forEach(b => b.addEventListener('click', () =>
    openCustomFoodSheet(b.dataset.id, rerender)));
}

function addForm(placeholder) {
  return `<form class="log-form add-form" autocomplete="off">
      <textarea class="log-input" rows="2" enterkeyhint="go" placeholder="${esc(placeholder)}"></textarea>
      <button type="submit" class="btn primary">Lägg till</button>
    </form>`;
}

function bindAddForm(body, list) {
  const input = body.querySelector('.add-form .log-input');
  body.querySelector('.add-form').addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    input.blur();
    await list.addText(text);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); body.querySelector('.add-form').requestSubmit(); }
  });
}

function openMealSheet(meal, onDone) {
  const body = h(`
    <div class="log">
      <label class="field"><span>Namn</span><input class="name" type="text" value="${esc(meal?.name || '')}" placeholder="t.ex. Vanlig frukost"></label>
      <p class="hint">Delar som läggs in när du väljer måltiden:</p>
      <div class="items-slot"></div>
      ${addForm('Lägg till del, t.ex. 1 dl havregryn')}
      ${meal ? '<button type="button" class="btn danger delete">Ta bort måltiden</button>' : ''}
    </div>`);
  const footer = h('<div class="log-foot"><div class="log-total"></div><button type="button" class="btn primary save">Spara</button></div>');
  const sheet = openSheet({ title: meal ? 'Redigera måltid' : 'Ny måltid', body, footer });
  const list = createItemsList({
    expandMeals: false,
    onChange: () => { footer.querySelector('.log-total').innerHTML = list.length ? totalsText(list.nutrients()) : ''; },
  });
  body.querySelector('.items-slot').replaceWith(list.el);
  bindAddForm(body, list);
  if (meal) list.addEntries(meal.items);

  footer.querySelector('.save').addEventListener('click', async () => {
    const name = body.querySelector('.name').value.trim();
    if (!name) return toast('Ge måltiden ett namn.');
    if (!list.length) return toast('Lägg till minst en del.');
    const res = await list.collect();
    if (res.error) return toast(res.error);
    await saveMeal({ id: meal?.id, name, items: res.fields.map(([, f]) => f) });
    toast('Måltiden är sparad');
    sheet.close();
    onDone?.();
  });
  body.querySelector('.delete')?.addEventListener('click', async () => {
    if (!confirm(`Ta bort måltiden ”${meal.name}”? Redan loggad mat påverkas inte.`)) return;
    await deleteRecipe(meal.id);
    sheet.close();
    onDone?.();
  });
}

function openRecipeSheet(recipe, onDone) {
  const body = h(`
    <div class="log">
      <label class="field"><span>Namn</span><input class="name" type="text" value="${esc(recipe?.name || '')}" placeholder="t.ex. Chili con carne"></label>
      <label class="field"><span>Antal portioner</span><input class="portions" type="text" inputmode="numeric" value="${fmtIn(recipe?.portions || 4, 0)}"></label>
      <label class="field"><span>Färdig vikt (g)</span><input class="cooked" type="text" inputmode="numeric" value="${recipe?.cookedGrams ? fmtIn(recipe.cookedGrams, 0) : ''}" placeholder="valfritt"></label>
      <p class="hint">Färdig vikt behövs bara om du vill logga i gram. Väg hela grytan utan kastrull.</p>
      <h3 class="sub-title">Ingredienser för hela satsen</h3>
      <div class="items-slot"></div>
      ${addForm('t.ex. 500 g köttfärs, 2 burkar krossade tomater, 1 gul lök')}
      <div class="card recipe-sum"></div>
      ${recipe ? '<button type="button" class="btn danger delete">Ta bort receptet</button>' : ''}
    </div>`);
  const footer = h('<div class="log-foot"><div class="log-total"></div><button type="button" class="btn primary save">Spara recept</button></div>');
  const sheet = openSheet({ title: recipe ? 'Redigera recept' : 'Nytt recept', body, footer });

  const sumBox = body.querySelector('.recipe-sum');
  const portionsInput = body.querySelector('.portions');
  const refresh = () => {
    const portions = num(portionsInput.value) || 1;
    const totals = list.nutrients();
    if (!list.length) { sumBox.innerHTML = '<p class="hint">Lägg till ingredienser ovan.</p>'; footer.querySelector('.log-total').innerHTML = ''; return; }
    const t = totalsText(totals);
    const per = totalsText(totals.map(n => scaleBy(n, 1 / portions)));
    sumBox.innerHTML = `<div class="row"><span>Hela satsen</span><span class="vals">${t}</span></div>
      <div class="row per"><span>Per portion</span><span class="vals">${per}</span></div>`;
    footer.querySelector('.log-total').innerHTML = `<span>Per portion</span>${per}`;
  };
  const list = createItemsList({ expandMeals: false, onChange: refresh });
  body.querySelector('.items-slot').replaceWith(list.el);
  portionsInput.addEventListener('input', refresh);
  bindAddForm(body, list);
  if (recipe) list.addEntries(recipe.items);
  refresh();

  footer.querySelector('.save').addEventListener('click', async () => {
    const name = body.querySelector('.name').value.trim();
    const portions = num(portionsInput.value);
    if (!name) return toast('Ge receptet ett namn.');
    if (!(portions > 0)) return toast('Ange antal portioner.');
    if (!list.length) return toast('Lägg till minst en ingrediens.');
    const res = await list.collect();
    if (res.error) return toast(res.error);
    await saveRecipe({
      id: recipe?.id, name, portions, cookedGrams: num(body.querySelector('.cooked').value),
      items: res.fields.map(([, f]) => f),
    });
    toast(`Sparat. Logga med t.ex. ”1 matlåda ${name.toLowerCase()}”.`, { duration: 4000 });
    sheet.close();
    onDone?.();
  });
  body.querySelector('.delete')?.addEventListener('click', async () => {
    if (!confirm(`Ta bort receptet ”${recipe.name}”? Redan loggad mat påverkas inte.`)) return;
    await deleteRecipe(recipe.id);
    sheet.close();
    onDone?.();
  });
}

async function openCustomFoodSheet(id, onDone) {
  const rec = await db.get('customFoods', id);
  if (!rec) return;
  const p = rec.per100g || {};
  const body = h(`
    <div class="log">
      <div class="card form">
        <label class="field"><span>Namn</span><input class="name" type="text" value="${esc(rec.name)}"></label>
        <p class="hint">Värden per 100 g:</p>
        ${KEYS.map(k => `<label class="field"><span>${LABELS[k]} (${UNITS[k]})</span><input data-k="${k}" type="text" inputmode="decimal" value="${fmtIn(p[k], 1)}"></label>`).join('')}
      </div>
      ${rec.source === 'ai' && rec.aiReason ? `<p class="note warn">AI: ${esc(rec.aiReason)}</p>` : ''}
      ${rec.brand ? `<p class="hint">Märke: ${esc(rec.brand)}${rec.barcode ? ` · streckkod ${esc(rec.barcode)}` : ''}</p>` : ''}
      <p class="hint">Ändringar gäller nästa gång du loggar. Redan loggad mat påverkas inte.</p>
      <button type="button" class="btn danger delete">Ta bort livsmedlet</button>
    </div>`);
  const footer = h('<div class="log-foot"><span></span><button type="button" class="btn primary save">Spara</button></div>');
  const sheet = openSheet({ title: 'Eget livsmedel', body, footer });

  footer.querySelector('.save').addEventListener('click', async () => {
    const per100g = {};
    for (const k of KEYS) {
      const v = num(body.querySelector(`[data-k="${k}"]`).value);
      if (v == null || v < 0) return toast(`Ange ett giltigt värde för ${LABELS[k].toLowerCase()}.`);
      per100g[k] = v;
    }
    const name = body.querySelector('.name').value.trim();
    if (!name) return toast('Ange ett namn.');
    await db.put('customFoods', { ...rec, name, per100g, source: rec.source === 'ai' ? 'ai' : rec.source });
    await foods.reloadCustomFoods();
    toast('Sparat');
    sheet.close();
    onDone?.();
  });
  body.querySelector('.delete').addEventListener('click', async () => {
    if (!confirm(`Ta bort ”${rec.name}”? Redan loggad mat påverkas inte.`)) return;
    await foods.deleteCustomFood(id);
    sheet.close();
    onDone?.();
  });
}
