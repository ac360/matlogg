// Dagsvy: summering mot mål och poster per måltid.

import { esc, h, icons } from '../ui.js';
import * as db from '../db.js';
import { MEALS, sum, fmt, dateLabel, addDays, isoDate, amountText, defaultMeal } from '../nutrition.js';
import { DEFAULT_GOALS } from '../goals.js';
import { openLogSheet, openEditSheet } from './log.js';

function bar(value, goal, cls) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  const over = goal > 0 && value > goal * 1.05;
  return `<div class="bar ${cls} ${over ? 'over' : ''}"><span style="width:${pct}%"></span></div>`;
}

function summaryCard(t, goals) {
  const left = goals.kcal - t.kcal;
  const protLeft = goals.protein - t.protein;
  return `
    <section class="card summary">
      <div class="sum-kcal">
        <div>
          <div class="big">${fmt(t.kcal)}</div>
          <div class="sub">av ${fmt(goals.kcal)} kcal</div>
        </div>
        <div class="left ${left < 0 ? 'neg' : ''}">
          <div class="big-sm">${fmt(Math.abs(left))}</div>
          <div class="sub">${left < 0 ? 'kcal över' : 'kcal kvar'}</div>
        </div>
      </div>
      ${bar(t.kcal, goals.kcal, 'kcal')}
      <div class="sum-protein">
        <div class="row">
          <span class="label">Protein</span>
          <span class="val"><b>${fmt(t.protein)}</b> / ${fmt(goals.protein)} g</span>
        </div>
        ${bar(t.protein, goals.protein, 'protein')}
        <div class="sub">${protLeft > 0 ? `${fmt(protLeft)} g kvar` : 'Proteinmålet är nått'}</div>
      </div>
      <div class="sum-macros">
        <div>
          <div class="row"><span class="label">Kolhydrater</span><span class="val">${fmt(t.carbs)} / ${fmt(goals.carbs)} g</span></div>
          ${bar(t.carbs, goals.carbs, 'carbs')}
        </div>
        <div>
          <div class="row"><span class="label">Fett</span><span class="val">${fmt(t.fat)} / ${fmt(goals.fat)} g</span></div>
          ${bar(t.fat, goals.fat, 'fat')}
        </div>
      </div>
      <div class="sum-fiber">Fiber ${fmt(t.fiber, 1)} / ${fmt(goals.fiber)} g</div>
    </section>`;
}

function mealSection(meal, entries) {
  const t = sum(entries.map(e => e.nutrients));
  return `
    <section class="meal" data-meal="${meal.id}">
      <header class="meal-head">
        <h3>${meal.label}</h3>
        <span class="meal-sum">${entries.length ? `${fmt(t.kcal)} kcal · ${fmt(t.protein)} g protein` : ''}</span>
      </header>
      <div class="card meal-list">
        ${entries.map(e => `
          <button type="button" class="entry" data-id="${e.id}">
            <span class="entry-main">
              <span class="entry-name">${esc(e.name)}${e.estimated ? ' <span class="badge badge-warn">uppskattning</span>' : ''}</span>
              <span class="entry-amount">${esc(amountText(e.qty, e.unit, e.grams))}</span>
            </span>
            <span class="entry-nutr"><span><b>${fmt(e.nutrients.kcal)}</b> kcal</span><small>${fmt(e.nutrients.protein, 1)} g prot</small></span>
          </button>`).join('')}
        <button type="button" class="add-to-meal" data-meal="${meal.id}">${icons.plus}<span>Lägg till</span></button>
      </div>
    </section>`;
}

export async function renderDay(main, state) {
  const date = state.date;
  const [entries, goals] = await Promise.all([
    db.getByIndex('entries', 'date', date),
    db.getSetting('goals', DEFAULT_GOALS),
  ]);
  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const totals = sum(entries.map(e => e.nutrients));
  const byMeal = Object.fromEntries(MEALS.map(m => [m.id, entries.filter(e => e.meal === m.id)]));
  const reminder = await backupReminder(entries.length);

  main.innerHTML = `
    <header class="topbar daybar">
      <button type="button" class="icon-btn prev" aria-label="Föregående dag">${icons.left}</button>
      <label class="date-title">
        <span>${esc(dateLabel(date))}</span>
        <input type="date" class="date-pick" value="${date}" aria-label="Välj datum">
      </label>
      <button type="button" class="icon-btn next" aria-label="Nästa dag">${icons.right}</button>
    </header>
    <div class="content day">
      ${reminder}
      ${summaryCard(totals, { ...DEFAULT_GOALS, ...goals })}
      ${MEALS.map(m => mealSection(m, byMeal[m.id])).join('')}
      ${date !== isoDate() ? '<button type="button" class="btn-text to-today">Gå till idag</button>' : ''}
    </div>
    <div class="log-bar">
      <button type="button" class="log-bar-btn">${icons.search}<span>Vad har du ätit?</span></button>
    </div>`;

  const rerender = () => renderDay(main, state);
  const sheetOpen = () => !!document.querySelector('.sheet-backdrop');
  const go = d => { state.date = d; rerender(); };

  main.querySelector('.prev').addEventListener('click', () => go(addDays(date, -1)));
  main.querySelector('.next').addEventListener('click', () => go(addDays(date, 1)));
  main.querySelector('.to-today')?.addEventListener('click', () => go(isoDate()));
  main.querySelector('.date-pick').addEventListener('change', e => { if (e.target.value) go(e.target.value); });
  main.querySelector('.log-bar-btn').addEventListener('click', () => {
    if (!sheetOpen()) openLogSheet({ date, meal: date === isoDate() ? defaultMeal() : 'middag', onSaved: rerender });
  });
  main.querySelectorAll('.add-to-meal').forEach(btn => btn.addEventListener('click', () => {
    if (!sheetOpen()) openLogSheet({ date, meal: btn.dataset.meal, onSaved: rerender });
  }));
  main.querySelectorAll('.entry').forEach(btn => btn.addEventListener('click', () => {
    if (sheetOpen()) return;
    const entry = entries.find(e => e.id === btn.dataset.id);
    if (entry) openEditSheet(entry, { onSaved: rerender });
  }));
  main.querySelector('.backup-now')?.addEventListener('click', () => { location.hash = '#/installningar'; });

  bindSwipe(main.querySelector('.content'), dir => go(addDays(date, dir)));
}

// Svep åt sidan för att byta dag.
function bindSwipe(el, onSwipe) {
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) onSwipe(dx < 0 ? 1 : -1);
  }, { passive: true });
}

async function backupReminder(entriesToday) {
  if (!entriesToday) return '';
  const last = await db.getSetting('lastBackup');
  const days = last ? (Date.now() - new Date(last).getTime()) / 86400000 : Infinity;
  if (days < 14) return '';
  const all = await db.getAll('entries');
  if (all.length < 10) return '';
  return `<div class="banner">
    <span>${last ? `Senaste backup för ${Math.floor(days)} dagar sedan.` : 'Du har inte tagit någon backup än.'}</span>
    <button type="button" class="btn-text backup-now">Ta backup</button>
  </div>`;
}
