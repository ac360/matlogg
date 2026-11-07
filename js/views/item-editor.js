// Ett redigerbart kort för en loggad sak: välj livsmedel, mängd och värden innan det sparas.
// Används vid ny loggning, när en post redigeras och för ingredienser i recept.
//
// Lägen (item.mode):
//   food        livsmedel valt ur registret (SLV, baslista, eget, recept)
//   fixed       sparad post utan kopplat livsmedel (värden för hand eller en del av en AI-uppdelning)
//   choose      flera träffar, användaren väljer
//   none        inga träffar
//   manual      användaren skriver in värden
//   ai-loading  väntar på AI
//   ai          AI-uppskattning visas

import { esc, h, num, toast } from '../ui.js';
import { normalize } from '../text.js';
import * as foods from '../foods.js';
import * as ai from '../ai/provider.js';
import { searchProducts, productByBarcode } from '../off.js';
import { toGrams, unitOptions, PIECE_UNITS } from '../portions.js';
import { KEYS, LABELS, scale, scaleBy, sum, fmt, fmtIn } from '../nutrition.js';
import { UNIT_LABELS, parseLine } from '../parser.js';

const MASS_UNITS = { g: 1, hg: 100, kg: 1000 };
const PHOTO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>';

// ---- Skapa tillstånd ----

function baseItem(parsed) {
  return {
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
}

// Vikt i gram om mängden angavs i g/hg/kg, annars null.
const massGrams = p => (p.qty != null && MASS_UNITS[p.unit] ? p.qty * MASS_UNITS[p.unit] : null);
const COOKED_GUESS_MIN_G = 130;

export async function itemFromParsed(parsed) {
  const item = baseItem(parsed);
  const grams = massGrams(parsed);
  const preferCooked = grams != null && grams >= COOKED_GUESS_MIN_G && !foods.mentionsCooking(parsed.raw);
  const res = await foods.resolve(parsed.name, { preferRecipe: /matlåd|låd(a|or)\b/i.test(parsed.raw), preferCooked });
  item.candidates = res.candidates;
  item.remembered = res.remembered;
  if (res.chosen) {
    let food = res.chosen;
    // Över 130 g okokt pasta/ris är ovanligt: anta kokt vikt (går att byta med ett tryck).
    const sib = foods.cookingSibling(food);
    if (preferCooked && !res.remembered && sib?.state === 'raw' && foods.isStarch(food)) food = sib.other;
    // Visa att appen antog kokt vikt, så att det är lätt att byta.
    if (preferCooked && !res.remembered && foods.isStarch(food) && foods.cookingSibling(food)?.state === 'cooked') {
      item.cookedGuess = true;
    }
    applyFood(item, food);
  } else item.mode = res.candidates.length ? 'choose' : 'none';
  if (item.mode === 'none') {
    const cfg = await ai.getConfig();
    item.autoAi = !!cfg.apiKey && cfg.auto;
  }
  return item;
}

// Skapar ett kort från en skannad streckkod: eget livsmedel → Open Food Facts → manuell inmatning.
export async function itemFromBarcode(code) {
  const item = baseItem({ raw: `Streckkod ${code}`, name: '', qty: null, unit: null, size: 1 });
  item.barcode = code;
  let food = await foods.findCustomByBarcode(code);
  let hint = '';
  let prefillName = '';
  if (!food) {
    try {
      const p = await productByBarcode(code);
      if (p && !p.incomplete) {
        food = await foods.saveCustomFood({
          name: p.name, per100g: p.per100g, units: p.units, source: 'off', barcode: code, brand: p.brand || undefined,
        });
      } else if (p?.incomplete) {
        prefillName = [p.name, p.brand && `(${p.brand})`].filter(Boolean).join(' ');
        hint = 'Produkten finns i Open Food Facts men saknar näringsvärden. Skriv av dem från förpackningen.';
      } else {
        hint = 'Produkten finns inte i Open Food Facts. Skriv av näringsvärdet per 100 g från förpackningen, så känner appen igen den nästa gång.';
      }
    } catch (err) {
      hint = `${err.message || 'Open Food Facts gick inte att nå.'} Skriv av näringsvärdet från förpackningen.`;
    }
  }
  if (food) {
    item.query = food.name.toLowerCase();
    item.queryWords = food.words;
    item.candidates = [food];
    applyFood(item, food);
    return item;
  }
  item.mode = 'manual';
  item.manual = {
    name: prefillName, grams: null, per100: true, saveAsFood: true, barcode: code, hint,
    values: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  };
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
  item.ai = null;
  const r = toGrams(food, item.parsedQty, item.parsedUnit, { size: item.size, queryWords: item.queryWords });
  Object.assign(item, { qty: r.qty, unit: r.unit, grams: Math.round(r.grams), approx: r.approx });
  item.nutrients = scale(food.per100, item.grams);
}

function isPiece(unit) {
  return unit && PIECE_UNITS.includes(unit);
}

function applyAi(item, res) {
  item.ai = res;
  item.food = null;
  item.mode = 'ai';
  item.name = res.name;
  item.override = false;
  item.estimated = true;
  item.approx = false;
  item.grams = res.items.reduce((s, p) => s + p.grams, 0);
  item.nutrients = sum(res.items);
  if (isPiece(item.parsedUnit) || (!item.parsedUnit && item.parsedQty)) {
    item.qty = item.parsedQty || 1;
    item.unit = item.parsedUnit || 'portion';
  } else {
    item.qty = item.grams;
    item.unit = 'g';
  }
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

// Gör om kortets tillstånd till fält för en post (eller { error }).
// Egna livsmedel (för hand eller från AI) sparas här, en gång per kort.
export async function toEntryFields(item) {
  if (item.mode === 'choose' || item.mode === 'none') return { error: `Välj livsmedel för ”${item.query}”.` };
  if (item.mode === 'ai-loading') return { error: 'Vänta tills AI:n har svarat.' };

  if (item.mode === 'manual') {
    const m = item.manual;
    if (!m.name.trim()) return { error: 'Ange ett namn.' };
    if (!(m.grams > 0)) return { error: `Ange mängd i gram för ”${m.name}”.` };
    const per100g = m.per100 ? { ...m.values } : scaleBy(m.values, 100 / m.grams);
    const totals = m.per100 ? scale(m.values, m.grams) : { ...m.values };
    let foodRef = item.savedFoodRef || null;
    if ((m.saveAsFood || m.barcode) && !foodRef) {
      // Portion och förpackning från bilden, om de stod där.
      const units = { ...(m.units || {}) };
      if (isPiece(item.parsedUnit) && item.parsedQty > 0) units[item.parsedUnit] = m.grams / item.parsedQty;
      // Skannad vara: mängden blir standardportion nästa gång (t.ex. en bar på 55 g).
      if (m.barcode) units.portion = m.grams;
      const food = await foods.saveCustomFood({
        name: m.name.trim(),
        per100g,
        units,
        source: m.fromPhoto ? 'label' : 'manual',
        barcode: m.barcode || undefined,
        aliases: item.query && item.query !== m.name.trim().toLowerCase() ? [item.query] : undefined,
      });
      foodRef = item.savedFoodRef = food.ref;
    }
    const piece = isPiece(item.parsedUnit);
    return {
      input: item.input,
      name: m.name.trim(),
      foodRef,
      qty: piece ? item.parsedQty ?? 1 : m.grams,
      unit: piece ? item.parsedUnit : 'g',
      grams: m.grams,
      nutrients: totals,
      override: !foodRef,
      estimated: false,
    };
  }

  if (item.mode === 'ai') {
    if (!(item.grams > 0)) return { error: `Ange mängd för ”${item.name}”.` };
    let foodRef = item.savedFoodRef || null;
    if (!foodRef) {
      const units = { portion: item.grams / (isPiece(item.unit) ? item.qty || 1 : 1) };
      if (isPiece(item.unit) && item.qty > 0) units[item.unit] = item.grams / item.qty;
      const food = await foods.saveCustomFood({
        name: item.name,
        per100g: scaleBy(item.nutrients, 100 / item.grams),
        units,
        source: 'ai',
        aliases: item.query ? [item.query] : undefined,
        aiReason: item.ai?.reason,
        components: item.ai?.items,
      });
      foodRef = item.savedFoodRef = food.ref;
    }
    return {
      input: item.input,
      name: item.name,
      foodRef,
      qty: item.qty,
      unit: item.unit,
      grams: item.grams,
      nutrients: { ...item.nutrients },
      override: item.override,
      estimated: true,
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

export function sourceBadge(food, estimated = false) {
  if (!food) return estimated ? '<span class="badge badge-warn">Uppskattning</span>' : '<span class="badge">Egen post</span>';
  switch (food.ref.source) {
    case 'slv': return '<span class="badge">Livsmedelsverket</span>';
    case 'base': return '<span class="badge badge-muted">Typvärde</span>';
    case 'recipe': return '<span class="badge">Recept</span>';
  }
  if (food.origin === 'ai') return '<span class="badge badge-warn">Uppskattning (AI)</span>';
  if (food.origin === 'off') return '<span class="badge">Open Food Facts</span>';
  if (food.origin === 'label') return '<span class="badge">Från förpackning</span>';
  return '<span class="badge">Eget livsmedel</span>';
}

function nutrLine(n) {
  return `<span class="kcal"><b>${fmt(n.kcal)}</b> kcal</span>
    <span class="prot"><b>${fmt(n.protein, 1)}</b> g protein</span>
    <span>K ${fmt(n.carbs, 1)}</span><span>F ${fmt(n.fat, 1)}</span><span class="fiber">fiber ${fmt(n.fiber, 1)}</span>`;
}

function sourceSuffix(food) {
  if (food.ref.source === 'base') return ' · typvärde';
  if (food.ref.source === 'recipe') return ' · recept';
  if (food.origin === 'ai') return ' · AI';
  if (food.origin === 'off') return food.brand ? ` · ${food.brand}` : ' · OFF';
  if (food.origin === 'label') return ' · från förpackning';
  if (food.ref.source === 'custom') return ' · eget';
  return '';
}

function candidateButton(food) {
  const p = food.per100;
  const meta = food.recipe && food.units?.portion
    ? `${fmt((p.kcal * food.units.portion) / 100)} kcal · ${fmt((p.protein * food.units.portion) / 100, 1)} g protein / portion`
    : `${fmt(p.kcal)} kcal · ${fmt(p.protein, 1)} g protein / 100 g`;
  return `<button type="button" class="choice" data-key="${esc(food.key)}">
    <span class="choice-name">${esc(food.name)}</span>
    <span class="choice-meta">${meta}${esc(sourceSuffix(food))}</span>
  </button>`;
}

function offButton(p, i) {
  return `<button type="button" class="choice off-choice" data-off="${i}">
    <span class="choice-name">${esc(p.name)}${p.brand ? ` <span class="choice-brand">${esc(p.brand)}</span>` : ''}</span>
    <span class="choice-meta">${fmt(p.per100g.kcal)} kcal · ${fmt(p.per100g.protein, 1)} g protein / 100 g</span>
  </button>`;
}

export function createItemEditor(item, { onChange = () => {}, onRemove, onSplit, removable = true, allowAi = true } = {}) {
  const el = h('<div class="item card"></div>');
  let candidateMap = new Map();
  let prevMode = null;
  let aiCtrl = null;

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
    else if (item.mode === 'ai-loading') body = renderAiLoading();
    else if (item.mode === 'ai') body = renderAi();
    else body = renderChoose();
    el.innerHTML = head + body;
    bind();
  }

  function amountRow(units) {
    return `
      <div class="item-amount">
        <input class="qty" type="text" inputmode="decimal" value="${fmtIn(item.qty, 2)}" aria-label="Mängd">
        <select class="unit" aria-label="Enhet">${units.map(u => `<option value="${u}" ${u === item.unit ? 'selected' : ''}>${UNIT_LABELS[u] || u}</option>`).join('')}</select>
        <span class="eq">=</span>
        <input class="grams" type="text" inputmode="decimal" value="${fmtIn(item.grams, 0)}" aria-label="Gram">
        <span class="unit-g">g</span>
      </div>`;
  }

  function valuesEditor(resetLabel) {
    return `
      <details class="values-editor">
        <summary>Ändra värden</summary>
        <div class="values-grid">
          ${KEYS.map(k => `<label><span>${LABELS[k]}</span><input data-k="${k}" type="text" inputmode="decimal" value="${fmtIn(item.nutrients[k], 1)}"></label>`).join('')}
        </div>
        ${resetLabel ? `<button type="button" class="btn-text reset-values">${resetLabel}</button>` : ''}
      </details>`;
  }

  function renderFood() {
    const units = item.food ? unitOptions(item.food, item.queryWords) : [item.unit || 'g'];
    if (item.unit && !units.includes(item.unit)) units.push(item.unit);
    const name = item.food ? item.food.name : item.name;
    return `
      <button type="button" class="item-food">
        <span class="item-name">${esc(name)}</span>
        <span class="item-food-meta">${sourceBadge(item.food, item.estimated)}${item.mode === 'food' ? '<span class="change">Byt</span>' : ''}</span>
      </button>
      ${cookingToggle()}
      ${amountRow(units)}
      <div class="item-nutr">${nutrLine(item.nutrients)}</div>
      ${item.cookedGuess ? '<p class="note">Antar att du vägde kokt. Tryck <b>Okokt</b> ovan om du vägde torrt.</p>' : ''}
      ${item.approx ? '<p class="note">≈ Vikten är en uppskattning. Justera gram om du vet bättre.</p>' : ''}
      ${item.override ? '<p class="note">Värdena är ändrade för hand.</p>' : ''}
      ${item.food?.typical ? '<p class="note">Typiskt värde för produkttypen. Ditt märke kan skilja sig något.</p>' : ''}
      ${item.food?.estimated ? `<p class="note warn">AI-uppskattning, inte uppmätta värden.${item.food.aiReason ? ' ' + esc(item.food.aiReason) : ''}</p>` : ''}
      ${!item.food && item.estimated ? '<p class="note warn">Uppskattade värden.</p>' : ''}
      ${valuesEditor(item.override && item.food ? 'Återställ till databasens värden' : '')}`;
  }

  function cookingToggle() {
    const sib = item.mode === 'food' ? foods.cookingSibling(item.food) : null;
    if (!sib) return '';
    const raw = sib.state === 'raw';
    return `<div class="segment cook-toggle" role="radiogroup" aria-label="Vägt som">
      <button type="button" role="radio" data-cook="raw" aria-checked="${raw}">${sib.rawLabel}</button>
      <button type="button" role="radio" data-cook="cooked" aria-checked="${!raw}">Kokt</button>
    </div>`;
  }

  function renderAi() {
    const a = item.ai;
    const units = [item.unit];
    return `
      <div class="item-food static">
        <span class="item-name">${esc(item.name)}</span>
        <span class="item-food-meta"><span class="badge badge-warn">Uppskattning (AI)</span><span class="conf">Säkerhet: ${esc(a.confidence)}</span></span>
      </div>
      ${amountRow(units)}
      <div class="item-nutr">${nutrLine(item.nutrients)}</div>
      ${a.reason ? `<p class="note warn">${esc(a.reason)}</p>` : ''}
      ${a.items.length > 1 ? `
        <details class="ai-parts">
          <summary>Uppdelning (${a.items.length} delar)</summary>
          <ul>${a.items.map(p => `<li><span>${esc(p.name)}</span><span>${fmt(p.grams)} g · ${fmt(p.kcal)} kcal · ${fmt(p.protein, 1)} g prot</span></li>`).join('')}</ul>
        </details>` : ''}
      ${valuesEditor('')}
      <div class="row-actions wrap">
        ${a.items.length > 1 && onSplit ? '<button type="button" class="btn-text ai-split">Dela upp i rader</button>' : ''}
        <button type="button" class="btn-text ai-again">Fråga igen</button>
        <button type="button" class="btn-text ai-back">Sök i databasen</button>
      </div>`;
  }

  function renderAiLoading() {
    return `
      <div class="ai-loading">
        <span class="spinner" aria-hidden="true"></span>
        <span>AI uppskattar ”${esc(item.input || item.query)}”…</span>
      </div>
      <div class="row-actions"><button type="button" class="btn-text ai-cancel">Avbryt</button></div>`;
  }

  function renderChoose() {
    const isNone = !item.candidates.length;
    const canCancel = prevMode === 'food' && item.food;
    const off = item.off || {};
    return `
      ${isNone
        ? `<p class="item-q">Hittade inget för ”${esc(item.query)}” i databasen.</p>`
        : `<p class="item-q">Vilken menar du med ”${esc(item.query)}”?</p>`}
      ${item.aiError ? `<p class="note error-note">${esc(item.aiError)}</p>` : ''}
      <div class="choices">${item.candidates.slice(0, 5).map(candidateButton).join('')}</div>
      <div class="search-row">
        <input class="search" type="search" placeholder="Sök på annat namn…" enterkeyhint="search" autocomplete="off">
      </div>
      <div class="choices search-results"></div>
      <div class="alt-actions">
        ${allowAi ? '<button type="button" class="btn secondary small ask-ai">✦ Fråga AI</button>' : ''}
        <button type="button" class="btn secondary small off-search">Sök märkesvaror</button>
      </div>
      ${off.status === 'loading' ? '<p class="hint"><span class="spinner small"></span> Söker i Open Food Facts…</p>' : ''}
      ${off.status === 'error' ? `<p class="note error-note">${esc(off.error)}</p>` : ''}
      ${off.status === 'done' ? (off.results.length
        ? `<p class="hint off-hint">Från Open Food Facts (öppen databas, värden per 100 g):</p><div class="choices">${off.results.map(offButton).join('')}</div>`
        : '<p class="hint">Inga märkesvaror hittades.</p>') : ''}
      <div class="row-actions">
        <button type="button" class="btn-text go-manual">Skriv in värden själv</button>
        ${canCancel ? '<button type="button" class="btn-text cancel-choose">Avbryt</button>' : ''}
      </div>`;
  }

  function renderManual() {
    const m = item.manual;
    return `
      <div class="manual">
        ${m.hint && !m.fromPhoto ? `<p class="note">${esc(m.hint)}</p>` : ''}
        ${m.reading
          ? '<div class="ai-loading"><span class="spinner" aria-hidden="true"></span><span>Läser av förpackningen…</span></div>'
          : `<label class="btn secondary m-photo">${PHOTO_ICON}<span>${m.fromPhoto ? 'Fota igen' : 'Fota näringsvärdet'}</span><input type="file" accept="image/*" capture="environment" hidden></label>`}
        ${m.photoError ? `<p class="note error-note">${esc(m.photoError)}</p>` : ''}
        ${m.fromPhoto ? `<p class="note">Avläst från bilden. Kontrollera värdena och fyll i hur mycket du åt.</p>
          ${m.fromPhoto.warning ? `<p class="note warn">${esc(m.fromPhoto.warning)}</p>` : ''}
          ${m.fromPhoto.notes ? `<p class="note">${esc(m.fromPhoto.notes)}</p>` : ''}` : ''}
        <label class="field"><span>Namn</span><input class="m-name" type="text" value="${esc(m.name)}" placeholder="t.ex. Proteinbar choklad"></label>
        <label class="field"><span>Mängd (gram)</span><input class="m-grams" type="text" inputmode="decimal" value="${m.grams ? fmtIn(m.grams, 0) : ''}" placeholder="${m.units?.portion ? `portion ${m.units.portion} g` : 'gram'}"></label>
        ${m.units?.portion && !m.grams ? `<button type="button" class="btn-text m-use-portion">1 portion = ${fmt(m.units.portion)} g</button>` : ''}
        <div class="segment two m-basis" role="radiogroup" aria-label="Värdena gäller">
          <button type="button" role="radio" data-basis="per100" aria-checked="${!!m.per100}">Per 100 g</button>
          <button type="button" role="radio" data-basis="total" aria-checked="${!m.per100}">För hela mängden</button>
        </div>
        <div class="values-grid">
          ${KEYS.map(k => `<label><span>${LABELS[k]}</span><input data-k="${k}" type="text" inputmode="decimal" value="${m.values[k] ? fmtIn(m.values[k], 1) : ''}" placeholder="0"></label>`).join('')}
        </div>
        ${m.barcode ? `<p class="hint">Sparas som eget livsmedel med streckkod ${esc(m.barcode)}.</p>`
          : `<label class="check"><input type="checkbox" class="m-save" ${m.saveAsFood ? 'checked' : ''}> Spara som eget livsmedel</label>`}
        ${m.barcode ? '' : '<button type="button" class="btn-text back-search">Tillbaka till sökning</button>'}
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

  function choose(food) {
    if (!item.candidates.some(f => f.key === food.key)) item.candidates = [food, ...item.candidates];
    applyFood(item, food);
    item.userChose = true;
    item.aiError = null;
    render();
    changed();
  }

  async function askAi(fresh = false) {
    const cfg = await ai.getConfig();
    if (!cfg.apiKey) {
      item.aiError = 'Lägg in din Gemini-nyckel under Inställningar → AI för att använda AI-uppskattning.';
      if (item.mode !== 'choose' && item.mode !== 'none') item.mode = item.candidates.length ? 'choose' : 'none';
      render();
      return;
    }
    const back = item.mode === 'ai' ? (item.candidates.length ? 'choose' : 'none') : item.mode;
    item.aiPrevMode = back === 'food' ? 'choose' : back;
    item.aiError = null;
    item.mode = 'ai-loading';
    render();
    changed();
    aiCtrl = new AbortController();
    try {
      const res = await ai.estimate(item.input || item.query, { signal: aiCtrl.signal, fresh });
      applyAi(item, res);
      item.savedFoodRef = null;
    } catch (err) {
      if (item.mode !== 'ai-loading') return; // avbrutet
      item.aiError = ai.errorText(err);
      item.mode = item.candidates.length ? 'choose' : 'none';
    } finally {
      aiCtrl = null;
    }
    render();
    changed();
  }

  async function searchOff() {
    const term = el.querySelector('.search')?.value.trim() || item.query;
    item.off = { status: 'loading' };
    render();
    try {
      const results = await searchProducts(term);
      item.off = { status: 'done', results };
    } catch (err) {
      item.off = { status: 'error', error: err.message || 'Sökningen misslyckades.' };
    }
    render();
  }

  async function chooseOff(p) {
    let food = await foods.findCustomByBarcode(p.code);
    if (!food) {
      food = await foods.saveCustomFood({
        name: p.name, per100g: p.per100g, units: p.units, source: 'off',
        barcode: p.code, brand: p.brand || undefined, aliases: [item.query],
      });
    }
    item.off = null;
    choose(food);
  }

  function bind() {
    el.querySelector('.item-remove')?.addEventListener('click', () => { aiCtrl?.abort(); onRemove?.(item); });

    el.querySelector('button.item-food')?.addEventListener('click', () => {
      if (item.mode !== 'food') return;
      prevMode = 'food';
      if (!item.candidates.length) item.candidates = foods.search(item.query, { limit: 6 }).map(r => r.food);
      item.mode = item.candidates.length ? 'choose' : 'none';
      render();
    });

    el.querySelectorAll('.cook-toggle button').forEach(btn => btn.addEventListener('click', () => {
      const sib = foods.cookingSibling(item.food);
      if (!sib || btn.dataset.cook === sib.state) return;
      // Byt livsmedel men behåll den vägda mängden.
      item.food = sib.other;
      item.override = false;
      item.cookedGuess = false;
      item.userChose = true;
      if (!item.candidates.some(f => f.key === sib.other.key)) item.candidates = [sib.other, ...item.candidates];
      recalcFromQty(item);
      item.nutrients = scale(item.food.per100, item.grams);
      render();
      changed();
    }));

    const qty = el.querySelector('.qty');
    qty?.addEventListener('input', () => {
      const v = num(qty.value);
      if (v == null) return;
      const old = item.qty;
      item.qty = v;
      if (item.mode === 'ai' && !MASS_UNITS[item.unit]) {
        // "2 portioner" i stället för 1: skala hela uppskattningen.
        if (old > 0) setGrams(item, Math.round((item.grams * v) / old));
      } else {
        recalcFromQty(item);
      }
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
      item.approx = false;
      setGrams(item, v);
      if (item.mode !== 'ai' || MASS_UNITS[item.unit]) {
        // Gram skrivna för hand gäller: byt till enheten gram.
        item.unit = 'g';
        item.qty = v;
        const q = el.querySelector('.qty');
        if (q) q.value = fmtIn(v, 2);
        const u = el.querySelector('.unit');
        if (u && [...u.options].some(o => o.value === 'g')) u.value = 'g';
      }
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

    el.querySelectorAll('.choice:not(.off-choice)').forEach(btn => btn.addEventListener('click', () => {
      const food = candidateMap.get(btn.dataset.key);
      if (food) choose(food);
    }));
    el.querySelectorAll('.off-choice').forEach(btn => btn.addEventListener('click', () => {
      const p = item.off?.results?.[Number(btn.dataset.off)];
      if (p) chooseOff(p).catch(err => toast('Kunde inte spara produkten: ' + err.message));
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
          box.innerHTML = results.length ? results.map(candidateButton).join('') : '<p class="hint">Inga träffar. Prova märkesvaror eller AI nedan.</p>';
          box.querySelectorAll('.choice').forEach(btn => btn.addEventListener('click', () => {
            const food = candidateMap.get(btn.dataset.key);
            item.candidates = [food, ...item.candidates.filter(f => f.key !== food.key)];
            choose(food);
          }));
        }, 150);
      });
    }

    el.querySelector('.cancel-choose')?.addEventListener('click', () => { item.mode = 'food'; render(); });
    el.querySelector('.ask-ai')?.addEventListener('click', () => askAi());
    el.querySelector('.ai-again')?.addEventListener('click', () => askAi(true));
    el.querySelector('.off-search')?.addEventListener('click', searchOff);
    el.querySelector('.ai-cancel')?.addEventListener('click', () => {
      aiCtrl?.abort();
      item.mode = item.aiPrevMode || 'none';
      render();
      changed();
    });
    el.querySelector('.ai-back')?.addEventListener('click', () => {
      item.mode = item.candidates.length ? 'choose' : 'none';
      render();
      changed();
    });
    el.querySelector('.ai-split')?.addEventListener('click', () => {
      const parts = item.ai.items.map(p => ({
        input: `${item.input} → ${p.name}`,
        name: p.name,
        foodRef: null,
        qty: p.grams,
        unit: 'g',
        grams: p.grams,
        nutrients: { kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, fiber: p.fiber },
        override: true,
        estimated: true,
      }));
      onSplit?.(item, parts);
    });

    el.querySelector('.go-manual')?.addEventListener('click', () => {
      const isMass = !item.parsedUnit || MASS_UNITS[item.parsedUnit];
      item.manual = {
        name: item.query.charAt(0).toUpperCase() + item.query.slice(1),
        grams: isMass && item.parsedQty ? item.parsedQty * (MASS_UNITS[item.parsedUnit] || 1) : null,
        values: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        saveAsFood: true,
        per100: false,
      };
      item.mode = 'manual';
      render();
      changed();
    });

    if (item.mode === 'manual') {
      const m = item.manual;
      el.querySelector('.m-photo input')?.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        m.reading = true;
        m.photoError = '';
        render();
        try {
          const r = await ai.readLabel(file);
          if (!m.name.trim()) m.name = [r.name, r.brand && !r.name.toLowerCase().includes(r.brand.toLowerCase()) ? `(${r.brand})` : '']
            .filter(Boolean).join(' ') || 'Okänd produkt';
          m.values = { ...r.per100g };
          m.per100 = true;
          m.units = {
            ...(r.servingGrams ? { portion: r.servingGrams } : {}),
            ...(r.packageGrams ? { förp: r.packageGrams } : {}),
          };
          m.fromPhoto = { warning: r.warning, notes: r.notes };
          m.saveAsFood = true;
        } catch (err) {
          m.photoError = err.code === 'no-key'
            ? 'Avläsning från bild kräver din Gemini-nyckel (Inställningar → AI). Skriv av värdena under tiden.'
            : ai.errorText(err);
        } finally {
          m.reading = false;
        }
        render();
        changed();
        if (m.fromPhoto && !m.grams) el.querySelector('.m-grams')?.focus();
      });
      el.querySelector('.m-use-portion')?.addEventListener('click', () => {
        m.grams = m.units.portion;
        render();
        changed();
      });
      el.querySelector('.m-name').addEventListener('input', e => { m.name = e.target.value; });
      el.querySelector('.m-grams').addEventListener('input', e => { m.grams = num(e.target.value); });
      el.querySelector('.m-save')?.addEventListener('change', e => { m.saveAsFood = e.target.checked; });
      el.querySelector('.m-grams').addEventListener('change', changed);
      el.querySelectorAll('.m-basis button').forEach(btn => btn.addEventListener('click', () => {
        m.per100 = btn.dataset.basis === 'per100';
        render();
        changed();
      }));
      el.querySelectorAll('.values-grid input[data-k]').forEach(inp => inp.addEventListener('input', () => {
        m.values[inp.dataset.k] = num(inp.value) || 0;
        changed();
      }));
      el.querySelector('.back-search')?.addEventListener('click', () => {
        item.mode = item.candidates.length ? 'choose' : 'none';
        render();
        changed();
      });
    }
  }

  render();
  if (item.autoAi && allowAi) {
    item.autoAi = false;
    askAi();
  }
  return { el, item, render };
}

// Näringsvärden som kortet bidrar med just nu (för summeringen).
export function currentNutrients(item) {
  if (item.mode === 'manual') return item.manual.per100 ? scale(item.manual.values, item.manual.grams || 0) : item.manual.values;
  if (item.mode === 'food' || item.mode === 'fixed' || item.mode === 'ai') return item.nutrients;
  return null;
}
