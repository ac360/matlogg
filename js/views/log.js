// Ark för att logga ny mat och för att redigera en befintlig post.

import { esc, h, icons, openSheet, toast } from '../ui.js';
import { parseInput } from '../parser.js';
import * as db from '../db.js';
import * as foods from '../foods.js';
import { listMeals, saveMeal, markMealUsed } from '../recipes.js';
import { MEALS, sum, fmt, dateLabel } from '../nutrition.js';
import { itemFromEntry, itemFromBarcode, createItemEditor, toEntryFields, currentNutrients } from './item-editor.js';
import { openScanner } from './scanner.js';
import { createItemsList } from './items-list.js';

export function mealSegment(selected) {
  return `<div class="segment" role="radiogroup" aria-label="Måltid">
    ${MEALS.map(m => `<button type="button" role="radio" data-meal="${m.id}" aria-checked="${m.id === selected}">${m.label}</button>`).join('')}
  </div>`;
}

export function bindSegment(root, onSelect) {
  root.querySelectorAll('.segment button').forEach(btn => btn.addEventListener('click', () => {
    root.querySelectorAll('.segment button').forEach(b => b.setAttribute('aria-checked', b === btn));
    onSelect(btn.dataset.meal);
  }));
}

export function totalsText(list) {
  const t = sum(list);
  return `<span><b>${fmt(t.kcal)}</b> kcal</span><span class="prot"><b>${fmt(t.protein, 1)}</b> g protein</span>`;
}

// Sparar korten som en sparad måltid. Returnerar true om det sparades.
export async function saveItemsAsMeal(itemsList, suggestedName) {
  const res = await itemsList.collect();
  if (res.error) {
    toast(res.error);
    res.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  const name = prompt('Namn på måltiden (t.ex. "Vanlig frukost"):', suggestedName || '');
  if (!name?.trim()) return false;
  await saveMeal({ name, items: res.fields.map(([, f]) => f) });
  toast(`Sparade ”${name.trim()}”. Skriv namnet eller tryck på knappen nästa gång.`, { duration: 4000 });
  return true;
}

export async function openLogSheet({ date, meal, initialText = '', scan = false, onSaved }) {
  // Skannern öppnas innan något annat väntas in, så att iPhone kopplar kameran till trycket.
  let resolveList;
  const listReady = new Promise(r => { resolveList = r; });
  if (scan) openScanner({ onCode: async code => handleScanned(await listReady, code) });

  let currentMeal = meal;
  const meals = await listMeals();

  const body = h(`
    <div class="log">
      ${mealSegment(currentMeal)}
      ${meals.length ? `<div class="meal-chips" aria-label="Sparade måltider">
        ${meals.slice(0, 12).map(m => `<button type="button" class="chip" data-id="${m.id}">${esc(m.name)}<small>${fmt(m.totals?.kcal)} kcal</small></button>`).join('')}
      </div>` : ''}
      <form class="log-form" autocomplete="off">
        <textarea class="log-input" rows="2" enterkeyhint="go" placeholder="Vad åt du? T.ex. 150 g köttfärs, 2 ägg"></textarea>
        <div class="log-buttons">
          <button type="submit" class="btn primary">Lägg till</button>
          <button type="button" class="btn secondary scan-btn" aria-label="Skanna streckkod">${icons.scan}</button>
        </div>
      </form>
      <p class="hint log-hint">Flera saker? Separera med komma eller ny rad. Loggas på ${esc(dateLabel(date).toLowerCase())}.</p>
      <div class="items-slot"></div>
      <button type="button" class="btn-text save-meal" hidden>Spara de här som en måltid…</button>
    </div>`);
  const footer = h(`
    <div class="log-foot">
      <div class="log-total"></div>
      <button type="button" class="btn primary save" disabled>Spara</button>
    </div>`);

  const sheet = openSheet({ title: 'Logga mat', body, footer });
  const input = body.querySelector('.log-input');
  const saveBtn = footer.querySelector('.save');
  const totalBox = footer.querySelector('.log-total');
  const saveMealBtn = body.querySelector('.save-meal');
  const usedMeals = new Set();

  const list = createItemsList({
    onChange: () => {
      const n = list.length;
      totalBox.innerHTML = n ? totalsText(list.nutrients()) : '';
      saveBtn.disabled = !n;
      saveBtn.textContent = n > 1 ? `Spara ${n} saker` : 'Spara';
      saveMealBtn.hidden = n < 2;
    },
  });
  body.querySelector('.items-slot').replaceWith(list.el);

  bindSegment(body, m => { currentMeal = m; });

  body.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    const m = meals.find(x => x.id === chip.dataset.id);
    if (!m) return;
    list.addEntries(m.items);
    usedMeals.add(m.id);
    chip.classList.add('used');
  }));

  body.querySelector('.log-form').addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    input.blur();
    const used = await list.addText(text);
    for (const m of used) usedMeals.add(m.id);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      body.querySelector('.log-form').requestSubmit();
    }
  });

  saveMealBtn.addEventListener('click', () => saveItemsAsMeal(list, MEALS.find(m => m.id === currentMeal)?.label));

  resolveList(list);
  body.querySelector('.scan-btn').addEventListener('click', () => openScanner({ onCode: code => handleScanned(list, code) }));

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      const res = await list.collect();
      if (res.error) {
        toast(res.error);
        res.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        saveBtn.disabled = false;
        return;
      }
      for (const [item, f] of res.fields) {
        await db.put('entries', { ...f, date, meal: currentMeal });
        if (f.foodRef && item.query && item.mode !== 'fixed') await foods.rememberChoice(item.query, f.foodRef);
      }
      for (const id of usedMeals) await markMealUsed(id);
      const n = res.fields.length;
      toast(n > 1 ? `Sparade ${n} saker` : 'Sparat');
      sheet.close();
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast('Kunde inte spara: ' + err.message);
      saveBtn.disabled = false;
    }
  });

  if (initialText) await list.addText(initialText);
  else if (!scan) setTimeout(() => input.focus(), 50);
  return sheet;
}

async function handleScanned(list, code) {
  const t = toast('Söker produkten…', { duration: 0 });
  try {
    const ed = list.addItem(await itemFromBarcode(code));
    ed.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    toast('Kunde inte lägga till produkten: ' + err.message);
  } finally {
    t.remove();
  }
}

export function openEditSheet(entry, { onSaved } = {}) {
  let currentMeal = entry.meal;
  const item = itemFromEntry(entry);
  const body = h(`<div class="log">${mealSegment(currentMeal)}<div class="items"></div>
    <button type="button" class="btn danger delete">Ta bort posten</button></div>`);
  const footer = h('<div class="log-foot"><div class="log-total"></div><button type="button" class="btn primary save">Spara ändringar</button></div>');
  const sheet = openSheet({ title: 'Redigera', body, footer });
  const totalBox = footer.querySelector('.log-total');
  const refresh = () => { const n = currentNutrients(item); totalBox.innerHTML = n ? totalsText([n]) : ''; };
  const ed = createItemEditor(item, { onChange: refresh, removable: false });
  body.querySelector('.items').append(ed.el);
  bindSegment(body, m => { currentMeal = m; });
  refresh();

  footer.querySelector('.save').addEventListener('click', async () => {
    const f = await toEntryFields(item);
    if (f.error) return toast(f.error);
    await db.put('entries', { ...entry, ...f, input: entry.input, meal: currentMeal });
    if (item.userChose && f.foodRef && entry.input) {
      const q = parseInput(entry.input)[0]?.name;
      if (q) await foods.rememberChoice(q, f.foodRef);
    }
    toast('Ändringen är sparad');
    sheet.close();
    onSaved?.();
  });

  body.querySelector('.delete').addEventListener('click', async () => {
    if (!confirm(`Ta bort ”${entry.name}”?`)) return;
    await db.softDelete('entries', entry.id);
    sheet.close();
    onSaved?.();
    toast('Posten är borttagen', {
      action: 'Ångra',
      duration: 5000,
      onAction: async () => {
        await db.put('entries', { ...entry, deleted: false });
        onSaved?.();
      },
    });
  });
  return sheet;
}
