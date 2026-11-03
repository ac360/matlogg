// Ett redigerbart kort för en loggad sak: välj livsmedel, mängd och värden innan det sparas.
// Används både vid ny loggning och när en befintlig post redigeras.

import { esc, h, num } from '../ui.js';
import { normalize } from '../text.js';
import * as foods from '../foods.js';
import { toGrams, unitOptions } from '../portions.js';
import { KEYS, LABELS, scale, scaleBy, fmt, fmtIn } from '../nutrition.js';
import { UNIT_LABELS, parseLine } from '../parser.js';

const MASS_UNITS = { g: 1, hg: 100, kg: 1000 };

// ---- Skapa tillstånd ----

export async function itemFromParsed(parsed) {
  const item = {
    input: parsed.raw,
    query: parsed.name,
    queryWords: normalize(parsed.name),
    size: parsed.size || 1,
    parsedQty: parsed.qty,
    parsedUnit: parsed.unit,
    mode: 'none',
    candidates: [],
    food: null,
    qty: parsed.qty,
    unit: parsed.unit,
    grams: 0,
    approx: false,
    nutrients: scale({}, 0),
    override: false,
    manual: null,
  };
  const res = await foods.resolve(parsed.name);
  item.candidates = res.candidates;
  item.remembered = res.remembered;
  if (res.chosen) applyFood(item, res.chosen);
  else item.mode = res.candidates.length ? 'choose' : 'none';
  return item;
}

export function itemFromEntry(entry) {
  const food = entry.foodRef ? foods.getFood(entry.foodRef) : null;
  return {
    input: entry.input,
    query: (entry.input && parseLine(entry.input).name) || entry.name,
    queryWords: normalize(entry.name),
    size: 1,
    parsedQty: entry.qty,
    parsedUnit: entry.unit,
    mode: food ? 'food' : 'fixed',
    candidates: [],
    food,
    name: entry.name,
    qty: entry.qty,
    unit: entry.unit,
    grams: entry.grams,
    approx: false,
    nutrients: { ...entry.nutrients },
    override: !!entry.override || !food,
    estimated: !!entry.estimated,
    manual: null,
  };
}

export function applyFood(item, food) {
  item.food = food;
  item.mode = 'food';
  item.override = false;
  const r = toGrams(food, item.parsedQty, item.parsedUnit, { size: item.size, queryWords: item.queryWords });
  Object.assign(item, { qty: r.qty, unit: r.unit, grams: Math.round(r.grams), approx: r.approx });
  item.nutrients = scale(food.per100, item.grams);
}

function setGrams(item, grams) {
  const old = item.grams;
  item.grams = grams;
  if (item.override || !item.food) {
    if (old > 0) item.nutrients = scaleBy(item.nutrients, grams / old);
  } else {
    item.nutrients = scale(item.food.per100, grams);
  }
}

function recalcFromQty(item) {
  if (MASS_UNITS[item.unit]) {
    item.approx = false;
    return setGrams(item, (item.qty || 0) * MASS_UNITS[item.unit]);
  }
  if (!item.food) return;
  const r = toGrams(item.food, item.qty || 0, item.unit, { size: item.size, queryWords: item.queryWords });
  item.approx = r.approx;
  setGrams(item, Math.round(r.grams));
}

// Gör om kortets tillstånd till fält för en post. Returnerar null om något saknas.
export async function toEntryFields(item) {
  if (item.mode === 'choose' || item.mode === 'none') return { error: `Välj livsmedel för ”${item.query}”.` };
  if (item.mode === 'manual') {
    const m = item.manual;
    if (!m.name.trim()) return { error: 'Ange ett namn.' };
    if (!(m.grams > 0)) return { error: `Ange mängd i gram för ”${m.name}”.` };
    let foodRef = null;
    if (m.saveAsFood) {
      const units = {};
      if (item.parsedUnit && !MASS_UNITS[item.parsedUnit] && item.parsedQty > 0) units[item.parsedUnit] = m.grams / item.parsedQty;
      const food = await foods.saveCustomFood({
        name: m.name.trim(),
        per100g: scaleBy(m.values, 100 / m.grams),
        units,
        source: 'manual',
      });
      foodRef = food.ref;
    }
    const isMass = !item.parsedUnit || MASS_UNITS[item.parsedUnit];
    return {
      input: item.input,
      name: m.name.trim(),
      foodRef,
      qty: isMass ? m.grams : item.parsedQty ?? 1,
      unit: isMass ? 'g' : item.parsedUnit,
      grams: m.grams,
      nutrients: { ...m.values },
      override: !foodRef,
      estimated: false,
    };
  }
  return {
    input: item.input,
    name: item.food ? item.food.name : item.name,
    foodRef: item.food ? item.food.ref : null,
    qty: item.qty,
    unit: item.unit,
    grams: item.grams,
    nutrients: { ...item.nutrients },
    override: item.override,
    estimated: item.food ? !!item.food.estimated : !!item.estimated,
  };
}

// ---- Rendering ----

function sourceBadge(food) {
  if (!food) return '<span class="badge">Egen post</span>';
  if (food.ref.source === 'slv') return '<span class="badge">Livsmedelsverket</span>';
  if (food.estimated) return '<span class="badge badge-warn">Uppskattning</span>';
  return '<span class="badge">Eget livsmedel</span>';
}

function nutrLine(n) {
  return `<span class="kcal"><b>${fmt(n.kcal)}</b> kcal</span>
    <span class="prot"><b>${fmt(n.protein, 1)}</b> g protein</span>
    <span>K ${fmt(n.carbs, 1)}</span><span>F ${fmt(n.fat, 1)}</span><span class="fiber">fiber ${fmt(n.fiber, 1)}</span>`;
}

function candidateButton(food) {
  const p = food.per100;
  return `<button type="button" class="choice" data-key="${esc(food.key)}">
    <span class="choice-name">${esc(food.name)}</span>
    <span class="choice-meta">${fmt(p.kcal)} kcal · ${fmt(p.protein, 1)} g protein / 100 g${food.ref.source !== 'slv' ? ' · eget' : ''}</span>
  </button>`;
}

export function createItemEditor(item, { onChange = () => {}, onRemove, removable = true } = {}) {
  const el = h('<div class="item card"></div>');
  let candidateMap = new Map();
  let prevMode = null;

  const changed = () => onChange(item);

  function render() {
    candidateMap = new Map(item.candidates.map(f => [f.key, f]));
    const head = `
      <div class="item-top">
        <div class="item-input">${esc(item.input || item.name || '')}</div>
        ${removable ? `<button type="button" class="icon-btn item-remove" aria-label="Ta bort">×</button>` : ''}
      </div>`;
    let body = '';
    if (item.mode === 'food' || item.mode === 'fixed') body = renderFood();
    else if (item.mode === 'manual') body = renderManual();
    else body = renderChoose();
    el.innerHTML = head + body;
    bind();
  }

  function renderFood() {
    const units = item.food ? unitOptions(item.food, item.queryWords) : [item.unit || 'g'];
    if (item.unit && !units.includes(item.unit)) units.push(item.unit);
    const name = item.food ? item.food.name : item.name;
    return `
      <button type="button" class="item-food">
        <span class="item-name">${esc(name)}</span>
        <span class="item-food-meta">${sourceBadge(item.food)}${item.mode === 'food' ? '<span class="change">Byt</span>' : ''}</span>
      </button>
      <div class="item-amount">
        <input class="qty" type="text" inputmode="decimal" value="${fmtIn(item.qty, 2)}" aria-label="Mängd">
        <select class="unit" aria-label="Enhet">${units.map(u => `<option value="${u}" ${u === item.unit ? 'selected' : ''}>${UNIT_LABELS[u] || u}</option>`).join('')}</select>
        <span class="eq">=</span>
        <input class="grams" type="text" inputmode="decimal" value="${fmtIn(item.grams, 0)}" aria-label="Gram">
        <span class="unit-g">g</span>
      </div>
      <div class="item-nutr">${nutrLine(item.nutrients)}</div>
      ${item.approx ? '<p class="note">≈ Vikten är en uppskattning. Justera gram om du vet bättre.</p>' : ''}
      ${item.override ? '<p class="note">Värdena är ändrade för hand.</p>' : ''}
      ${item.food?.estimated ? '<p class="note warn">Värdena är en uppskattning, inte uppmätta.</p>' : ''}
      <details class="values-editor">
        <summary>Ändra värden</summary>
        <div class="values-grid">
          ${KEYS.map(k => `<label><span>${LABELS[k]}</span><input data-k="${k}" type="text" inputmode="decimal" value="${fmtIn(item.nutrients[k], 1)}"></label>`).join('')}
        </div>
        ${item.override && item.food ? '<button type="button" class="btn-text reset-values">Återställ till databasens värden</button>' : ''}
      </details>`;
  }

  function renderChoose() {
    const isNone = !item.candidates.length;
    const canCancel = prevMode === 'food' && item.food;
    return `
      ${isNone
        ? `<p class="item-q">Hittade inget för ”${esc(item.query)}” i Livsmedelsverkets databas.</p>`
        : `<p class="item-q">Vilken menar du med ”${esc(item.query)}”?</p>`}
      <div class="choices">${item.candidates.slice(0, 5).map(candidateButton).join('')}</div>
      <div class="search-row">
        <input class="search" type="search" placeholder="Sök på annat namn…" enterkeyhint="search" autocomplete="off">
      </div>
      <div class="choices search-results"></div>
      <div class="row-actions">
        <button type="button" class="btn-text go-manual">Skriv in värden själv</button>
        ${canCancel ? '<button type="button" class="btn-text cancel-choose">Avbryt</button>' : ''}
      </div>`;
  }

  function renderManual() {
    const m = item.manual;
    return `
      <div class="manual">
        <label class="field"><span>Namn</span><input class="m-name" type="text" value="${esc(m.name)}"></label>
        <label class="field"><span>Mängd (gram)</span><input class="m-grams" type="text" inputmode="decimal" value="${m.grams ? fmtIn(m.grams, 0) : ''}"></label>
        <p class="hint">Värden för hela mängden:</p>
        <div class="values-grid">
          ${KEYS.map(k => `<label><span>${LABELS[k]}</span><input data-k="${k}" type="text" inputmode="decimal" value="${m.values[k] ? fmtIn(m.values[k], 1) : ''}" placeholder="0"></label>`).join('')}
        </div>
        <label class="check"><input type="checkbox" class="m-save" ${m.saveAsFood ? 'checked' : ''}> Spara som eget livsmedel</label>
        <button type="button" class="btn-text back-search">Tillbaka till sökning</button>
      </div>`;
  }

  function updateNumbers() {
    const n = el.querySelector('.item-nutr');
    if (n) n.innerHTML = nutrLine(item.nutrients);
    el.querySelectorAll('.values-editor input[data-k]').forEach(inp => {
      if (document.activeElement !== inp) inp.value = fmtIn(item.nutrients[inp.dataset.k], 1);
    });
    changed();
  }

  function bind() {
    el.querySelector('.item-remove')?.addEventListener('click', () => onRemove?.(item));

    el.querySelector('.item-food')?.addEventListener('click', () => {
      if (item.mode !== 'food') return;
      prevMode = 'food';
      if (!item.candidates.length) item.candidates = foods.search(item.query, { limit: 6 }).map(r => r.food);
      item.mode = item.candidates.length ? 'choose' : 'none';
      render();
    });

    const qty = el.querySelector('.qty');
    qty?.addEventListener('input', () => {
      const v = num(qty.value);
      if (v == null) return;
      item.qty = v;
      recalcFromQty(item);
      const g = el.querySelector('.grams');
      if (g) g.value = fmtIn(item.grams, 0);
      updateNumbers();
    });

    el.querySelector('.unit')?.addEventListener('change', e => {
      item.unit = e.target.value;
      item.size = 1;
      recalcFromQty(item);
      render();
      changed();
    });

    const grams = el.querySelector('.grams');
    grams?.addEventListener('input', () => {
      const v = num(grams.value);
      if (v == null) return;
      // Gram skrivna för hand gäller: byt till enheten gram.
      item.unit = 'g';
      item.qty = v;
      item.approx = false;
      setGrams(item, v);
      const q = el.querySelector('.qty');
      if (q) q.value = fmtIn(v, 2);
      const u = el.querySelector('.unit');
      if (u) u.value = 'g';
      updateNumbers();
    });

    el.querySelectorAll('.values-editor input[data-k]').forEach(inp => {
      inp.addEventListener('input', () => {
        const v = num(inp.value);
        if (v == null) return;
        item.nutrients[inp.dataset.k] = v;
        item.override = true;
        const n = el.querySelector('.item-nutr');
        if (n) n.innerHTML = nutrLine(item.nutrients);
        changed();
      });
    });
    el.querySelector('.reset-values')?.addEventListener('click', () => {
      item.override = false;
      item.nutrients = scale(item.food.per100, item.grams);
      render();
      changed();
    });

    el.querySelectorAll('.choice').forEach(btn => btn.addEventListener('click', () => {
      const food = candidateMap.get(btn.dataset.key);
      if (!food) return;
      if (!item.candidates.some(f => f.key === food.key)) item.candidates = [food, ...item.candidates];
      applyFood(item, food);
      item.userChose = true;
      render();
      changed();
    }));

    const search = el.querySelector('.search');
    if (search) {
      let t;
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const q = search.value.trim();
          const box = el.querySelector('.search-results');
          if (!q) { box.innerHTML = ''; return; }
          const results = foods.search(q, { limit: 6 }).map(r => r.food);
          for (const f of results) candidateMap.set(f.key, f);
          box.innerHTML = results.length ? results.map(candidateButton).join('') : '<p class="hint">Inga träffar.</p>';
          box.querySelectorAll('.choice').forEach(btn => btn.addEventListener('click', () => {
            const food = candidateMap.get(btn.dataset.key);
            item.candidates = [food, ...item.candidates.filter(f => f.key !== food.key)];
            applyFood(item, food);
            item.userChose = true;
            render();
            changed();
          }));
        }, 150);
      });
    }

    el.querySelector('.cancel-choose')?.addEventListener('click', () => { item.mode = 'food'; render(); });

    el.querySelector('.go-manual')?.addEventListener('click', () => {
      const isMass = !item.parsedUnit || MASS_UNITS[item.parsedUnit];
      item.manual = {
        name: item.query.charAt(0).toUpperCase() + item.query.slice(1),
        grams: isMass && item.parsedQty ? item.parsedQty * (MASS_UNITS[item.parsedUnit] || 1) : null,
        values: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        saveAsFood: true,
      };
      item.mode = 'manual';
      render();
      changed();
    });

    if (item.mode === 'manual') {
      const m = item.manual;
      el.querySelector('.m-name').addEventListener('input', e => { m.name = e.target.value; });
      el.querySelector('.m-grams').addEventListener('input', e => { m.grams = num(e.target.value); });
      el.querySelector('.m-save').addEventListener('change', e => { m.saveAsFood = e.target.checked; });
      el.querySelectorAll('.values-grid input[data-k]').forEach(inp => inp.addEventListener('input', () => {
        m.values[inp.dataset.k] = num(inp.value) || 0;
        changed();
      }));
      el.querySelector('.back-search').addEventListener('click', () => {
        item.mode = item.candidates.length ? 'choose' : 'none';
        render();
        changed();
      });
    }
  }

  render();
  return { el, item, render };
}

// Näringsvärden som kortet bidrar med just nu (för summeringen i arket).
export function currentNutrients(item) {
  if (item.mode === 'manual') return item.manual.values;
  if (item.mode === 'food' || item.mode === 'fixed') return item.nutrients;
  return null;
}
