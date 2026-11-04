// Veckoplan med dragbara reglage: en rad per veckodag med % av dagsmålet, kcal och makron.
//
// Logik:
// - Drar man i en dag låses den på det värdet. Olåsta dagar delar lika på resten,
//   så att veckototalen alltid är 7 × dagsmålet.
// - Låsta dagar ändras inte när man drar i en annan dag.
// - Finns ingen olåst dag kvar att justera låses den dag upp som låstes först.
// - Ingen dag får gå under MIN_KCAL eller under/över reglagets gränser; dragningen stoppas där.

import { esc, h } from '../ui.js';
import { fmt } from '../nutrition.js';
import { WEEKDAYS, goalsForDate } from '../goals.js';

const MIN_KCAL = 1200;
const icons = {
  locked: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>',
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></svg>',
};

// Ett datum per veckodag (vilken vecka spelar ingen roll), för att återanvända goalsForDate.
const SAMPLE_DATES = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'];

const lockedText = n => (n === 0 ? 'inga låsta dagar' : n === 1 ? '1 låst dag' : `${n} låsta dagar`);

export function createWeekPlanEditor({ baseGoals, plan, onChange = () => {} }) {
  let base = { ...baseGoals };
  const state = {
    days: [...(plan.days || Array(7).fill(null))].map(v => (v > 0 ? v : null)),
    order: (plan.order || []).filter(i => plan.days?.[i] > 0),
  };
  // Äldre sparade planer saknar ordning: lägg låsta dagar i veckoordning.
  state.days.forEach((v, i) => { if (v != null && !state.order.includes(i)) state.order.push(i); });

  const limits = () => ({
    min: Math.max(MIN_KCAL, Math.round(base.kcal * 0.5 / 10) * 10),
    max: Math.round(base.kcal * 1.75 / 10) * 10,
  });

  // kcal för alla dagar: låsta som de är, olåsta delar lika på resten.
  function values() {
    const total = base.kcal * 7;
    const lockedSum = state.days.reduce((s, v) => s + (v ?? 0), 0);
    const auto = state.days.filter(v => v == null).length;
    const each = auto ? (total - lockedSum) / auto : 0;
    return state.days.map(v => v ?? each);
  }

  const el = h(`<div class="wp">
    ${WEEKDAYS.map((d, i) => `
      <div class="wp-row" data-i="${i}">
        <div class="wp-top">
          <span class="wp-day">${esc(d)}</span>
          <span class="wp-val"><b class="wp-pct"></b> <span class="wp-kcal"></span></span>
          <button type="button" class="wp-lock" aria-label="Lås ${esc(d.toLowerCase())}"></button>
        </div>
        <input class="wp-range" type="range" step="10" aria-label="${esc(d)} kcal">
        <div class="wp-macros"></div>
      </div>`).join('')}
    <div class="wp-sum"></div>
  </div>`);

  const rows = [...el.querySelectorAll('.wp-row')];

  function update(skip = -1) {
    const v = values();
    const { min, max } = limits();
    rows.forEach((row, i) => {
      const range = row.querySelector('.wp-range');
      range.min = min;
      range.max = max;
      if (i !== skip) range.value = Math.round(v[i]);
      const locked = state.days[i] != null;
      const kcal = Math.round(v[i]);
      row.classList.toggle('locked', locked);
      row.querySelector('.wp-pct').textContent = `${Math.round((v[i] / base.kcal) * 100)} %`;
      row.querySelector('.wp-kcal').textContent = `${fmt(kcal)} kcal`;
      const lockBtn = row.querySelector('.wp-lock');
      lockBtn.innerHTML = locked ? icons.locked : icons.open;
      lockBtn.setAttribute('aria-pressed', String(locked));
      const g = goalsForDate(base, { enabled: true, days: state.days.map((x, j) => (j === i ? kcal : x)) }, SAMPLE_DATES[i]);
      row.querySelector('.wp-macros').textContent =
        `Protein ${fmt(base.protein)} g · Kolh. ${fmt(g.carbs)} g · Fett ${fmt(g.fat)} g${locked ? '' : ' · auto'}`;
      // Fyllnad i reglaget fram till värdet.
      range.style.setProperty('--fill', `${((v[i] - min) / (max - min)) * 100}%`);
    });
    const sum = Math.round(v.reduce((s, x) => s + x, 0));
    const tooLow = v.some(x => x < limits().min - 1);
    el.querySelector('.wp-sum').innerHTML = tooLow
      ? `<span class="warn">Någon dag hamnar under ${fmt(limits().min)} kcal. Sänk de låsta dagarna.</span>`
      : `Veckototal <b>${fmt(sum)} kcal</b> · ${lockedText(state.days.filter(x => x != null).length)}`;
  }

  function lock(i, value) {
    state.days[i] = value;
    state.order = state.order.filter(x => x !== i);
    state.order.push(i);
  }

  function unlock(i) {
    state.days[i] = null;
    state.order = state.order.filter(x => x !== i);
  }

  // Sätter dag i till önskat värde och respekterar gränserna för de olåsta dagarna.
  function setDay(i, wanted) {
    const { min, max } = limits();
    lock(i, wanted);
    // Behöver någon annan dag ta upp skillnaden? Lås då upp den som låstes först.
    if (!state.days.some((v, j) => v == null && j !== i)) {
      const oldest = state.order.find(j => j !== i);
      if (oldest != null) unlock(oldest);
    }
    const total = base.kcal * 7;
    const otherLocked = state.days.reduce((s, v, j) => s + (j !== i && v != null ? v : 0), 0);
    const auto = state.days.filter(v => v == null).length;
    // Olåsta dagar måste hamna mellan min och max.
    const hi = Math.min(max, total - otherLocked - auto * min);
    const lo = Math.max(min, total - otherLocked - auto * max);
    state.days[i] = Math.round(Math.min(hi, Math.max(lo, wanted)) / 10) * 10;
    return state.days[i];
  }

  rows.forEach((row, i) => {
    const range = row.querySelector('.wp-range');
    range.addEventListener('input', () => {
      const actual = setDay(i, Number(range.value));
      if (actual !== Number(range.value)) range.value = actual;
      update(i);
      onChange();
    });
    range.addEventListener('change', () => update());
    row.querySelector('.wp-lock').addEventListener('click', () => {
      if (state.days[i] != null) unlock(i);
      else lock(i, Math.round(values()[i] / 10) * 10);
      update();
      onChange();
    });
  });

  update();

  return {
    el,
    getPlan: () => ({ days: [...state.days], order: [...state.order] }),
    setBase(goals) { base = { ...base, ...goals }; update(); },
    reset() { state.days = Array(7).fill(null); state.order = []; update(); onChange(); },
    isValid: () => !values().some(x => x < limits().min - 1),
  };
}
