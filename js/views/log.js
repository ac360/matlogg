// Ark för att logga ny mat och för att redigera en befintlig post.

import { esc, h, openSheet, toast } from '../ui.js';
import { parseInput } from '../parser.js';
import * as db from '../db.js';
import * as foods from '../foods.js';
import { MEALS, sum, fmt, dateLabel } from '../nutrition.js';
import { itemFromParsed, itemFromEntry, createItemEditor, toEntryFields, currentNutrients } from './item-editor.js';

function mealSegment(selected) {
  return `<div class="segment" role="radiogroup" aria-label="Måltid">
    ${MEALS.map(m => `<button type="button" role="radio" data-meal="${m.id}" aria-checked="${m.id === selected}">${m.label}</button>`).join('')}
  </div>`;
}

function bindSegment(root, onSelect) {
  root.querySelectorAll('.segment button').forEach(btn => btn.addEventListener('click', () => {
    root.querySelectorAll('.segment button').forEach(b => b.setAttribute('aria-checked', b === btn));
    onSelect(btn.dataset.meal);
  }));
}

function totalsText(items) {
  const list = items.map(currentNutrients).filter(Boolean);
  const t = sum(list);
  return `<span><b>${fmt(t.kcal)}</b> kcal</span><span class="prot"><b>${fmt(t.protein, 1)}</b> g protein</span>`;
}

export function openLogSheet({ date, meal, initialText = '', onSaved }) {
  let currentMeal = meal;
  const editors = [];

  const body = h(`
    <div class="log">
      ${mealSegment(currentMeal)}
      <form class="log-form" autocomplete="off">
        <textarea class="log-input" rows="2" enterkeyhint="go" placeholder="Vad åt du? T.ex. 150 g köttfärs, 2 ägg"></textarea>
        <button type="submit" class="btn primary">Lägg till</button>
      </form>
      <p class="hint log-hint">Flera saker? Separera med komma eller ny rad. Loggas på ${esc(dateLabel(date).toLowerCase())}.</p>
      <div class="items"></div>
    </div>`);
  const footer = h(`
    <div class="log-foot">
      <div class="log-total"></div>
      <button type="button" class="btn primary save" disabled>Spara</button>
    </div>`);

  const sheet = openSheet({ title: 'Logga mat', body, footer });
  const input = body.querySelector('.log-input');
  const itemsBox = body.querySelector('.items');
  const saveBtn = footer.querySelector('.save');
  const totalBox = footer.querySelector('.log-total');

  bindSegment(body, m => { currentMeal = m; });

  const refresh = () => {
    const items = editors.map(e => e.item);
    totalBox.innerHTML = items.length ? totalsText(items) : '';
    saveBtn.disabled = !items.length;
    saveBtn.textContent = items.length > 1 ? `Spara ${items.length} saker` : 'Spara';
  };

  async function addText(text) {
    const parsed = parseInput(text);
    if (!parsed.length) return;
    for (const p of parsed) {
      const item = await itemFromParsed(p);
      const ed = createItemEditor(item, {
        onChange: refresh,
        onRemove: () => {
          editors.splice(editors.indexOf(ed), 1);
          ed.el.remove();
          refresh();
        },
      });
      editors.push(ed);
      itemsBox.append(ed.el);
    }
    refresh();
  }

  body.querySelector('.log-form').addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    input.blur();
    await addText(text);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      body.querySelector('.log-form').requestSubmit();
    }
  });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      const fields = [];
      for (const ed of editors) {
        const f = await toEntryFields(ed.item);
        if (f.error) {
          toast(f.error);
          ed.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          saveBtn.disabled = false;
          return;
        }
        fields.push([ed.item, f]);
      }
      for (const [item, f] of fields) {
        await db.put('entries', { ...f, date, meal: currentMeal });
        if (f.foodRef && item.query) await foods.rememberChoice(item.query, f.foodRef);
      }
      toast(fields.length > 1 ? `Sparade ${fields.length} saker` : 'Sparat');
      sheet.close();
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast('Kunde inte spara: ' + err.message);
      saveBtn.disabled = false;
    }
  });

  if (initialText) addText(initialText);
  else setTimeout(() => input.focus(), 50);
  refresh();
  return sheet;
}

export function openEditSheet(entry, { onSaved } = {}) {
  let currentMeal = entry.meal;
  const item = itemFromEntry(entry);
  const body = h(`<div class="log">${mealSegment(currentMeal)}<div class="items"></div>
    <button type="button" class="btn danger delete">Ta bort posten</button></div>`);
  const footer = h('<div class="log-foot"><div class="log-total"></div><button type="button" class="btn primary save">Spara ändringar</button></div>');
  const sheet = openSheet({ title: 'Redigera', body, footer });
  const totalBox = footer.querySelector('.log-total');
  const refresh = () => { totalBox.innerHTML = currentNutrients(item) ? totalsText([item]) : ''; };
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
