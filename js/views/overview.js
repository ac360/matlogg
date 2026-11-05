// Översikt: veckans sammanfattning, bläddring mellan veckor och trend för de senaste veckorna.

import { icons } from '../ui.js';
import * as db from '../db.js';
import { fmt, addDays, isoDate } from '../nutrition.js';
import { DEFAULT_GOALS, DEFAULT_WEEK_PLAN, WEEKDAYS, WEEKDAYS_SHORT } from '../goals.js';
import { weekSummary, weekStart, entriesByDate, INCOMPLETE_KCAL } from '../week.js';
import { bar } from './bars.js';

const HISTORY_WEEKS = 8;

function shortDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${m}`;
}

export function weekCard(w, selected) {
  const maxGoal = Math.max(...w.days.map(d => Math.max(d.goal.kcal, d.totals.kcal)), 1);
  const avgRow = (label, key, unit, cls) => `
    <div class="wk-stat ${cls}">
      <span class="wk-label">${label}</span>
      <span class="wk-val"><b>${fmt(w.avg[key])}</b> / ${fmt(w.avgGoal[key])} ${unit}</span>
      ${bar(w.avg[key], w.avgGoal[key], cls)}
    </div>`;

  let balance = '';
  if (w.containsToday && w.daysBefore) {
    const over = w.balanceBefore > 0;
    balance = `<p class="wk-balance ${over ? 'over' : ''}">
      Hittills i veckan ${over ? 'över' : 'under'} planen med <b>${fmt(Math.abs(w.balanceBefore))} kcal</b>.
      Sprids det ut på resten av veckan blir dagens mål cirka <b>${fmt(w.adjustedToday)} kcal</b>.</p>`;
  } else if (!w.containsToday && w.loggedCount) {
    const diff = w.consumed - w.target;
    balance = `<p class="wk-balance">Veckan totalt: ${fmt(w.consumed)} av ${fmt(w.target)} kcal (${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))}).</p>`;
  }

  return `
    <section class="card week">
      <div class="wk-head">
        <h3>Veckan</h3>
        <span class="sub">${shortDate(w.start)}–${shortDate(w.end)} · ${w.loggedCount
          ? `snitt för ${w.loggedCount} ${w.loggedCount === 1 ? 'avslutad dag' : 'avslutade dagar'}`
          : (w.containsToday ? 'snitt visas när en dag är avslutad' : 'inget att räkna')}</span>
      </div>
      ${w.loggedCount ? `
        <div class="wk-stats">
          ${avgRow('Energi', 'kcal', 'kcal', 'kcal')}
          ${avgRow('Protein', 'protein', 'g', 'protein')}
        </div>
        <div class="wk-small">Kolhydrater ${fmt(w.avg.carbs)} / ${fmt(w.avgGoal.carbs)} g · Fett ${fmt(w.avg.fat)} / ${fmt(w.avgGoal.fat)} g · Fiber ${fmt(w.avg.fiber, 1)} g</div>` : ''}
      ${w.incompleteCount ? `<p class="wk-incomplete">${w.incompleteCount === 1 ? '1 dag' : `${w.incompleteCount} dagar`} under ${fmt(INCOMPLETE_KCAL)} kcal räknas inte (troligen inte fullt loggad).</p>` : ''}
      <div class="wk-days">
        ${w.days.map((d, i) => {
          const hGoal = (d.goal.kcal / maxGoal) * 100;
          const hEat = (d.totals.kcal / maxGoal) * 100;
          const over = d.totals.kcal > d.goal.kcal * 1.05;
          return `<button type="button" class="wk-day ${d.date === selected ? 'sel' : ''} ${d.isToday ? 'today' : ''} ${d.incomplete ? 'incomplete' : ''}" data-date="${d.date}"
              aria-label="${WEEKDAYS[i]}: ${fmt(d.totals.kcal)} av ${fmt(d.goal.kcal)} kcal${d.incomplete ? ', räknas inte' : ''}">
            <span class="wk-col"><span class="wk-goal" style="height:${hGoal}%"></span><span class="wk-eat ${over ? 'over' : ''}" style="height:${hEat}%"></span></span>
            <span class="wk-dlabel">${WEEKDAYS_SHORT[i]}</span>
          </button>`;
        }).join('')}
      </div>
      ${balance}
    </section>`;
}

function pct(v, goal) {
  return goal > 0 ? Math.round((v / goal) * 100) : 0;
}

function trendChart(weeks, key, label, cls, unit) {
  // Lite luft ovanför så att mållinjen alltid syns.
  const max = Math.max(...weeks.map(w => Math.max(w.avg[key], w.avgGoal[key])), 1) * 1.12;
  return `
    <div class="trend">
      <div class="trend-head"><span class="trend-label ${cls}">${label}</span><span class="sub">snitt per dag</span></div>
      <div class="trend-cols" style="grid-template-columns: repeat(${weeks.length}, 1fr)">
        ${weeks.map(w => {
          const has = w.loggedCount > 0;
          const hv = has ? (w.avg[key] / max) * 100 : 0;
          const hg = (w.avgGoal[key] / max) * 100;
          return `<button type="button" class="trend-col" data-week="${w.start}" aria-label="Vecka ${w.week}: ${has ? `${fmt(w.avg[key])} av ${fmt(w.avgGoal[key])} ${unit}` : 'inga hela dagar'}">
            <span class="trend-val">${has ? fmt(w.avg[key]) : '–'}</span>
            <span class="trend-bar"><span class="trend-goal" style="bottom:${hg}%"></span><span class="trend-fill ${cls}" style="height:${hv}%"></span></span>
            <span class="trend-week">v${w.week}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
}

function historyRow(w, selected) {
  const has = w.loggedCount > 0;
  return `
    <button type="button" class="list-row hist-row ${w.start === selected ? 'sel' : ''}" data-week="${w.start}">
      <span class="row-main">
        <span class="row-name">Vecka ${w.week} <span class="sub">${shortDate(w.start)}–${shortDate(w.end)}</span></span>
        <span class="row-meta">${has
          ? `${fmt(w.avg.kcal)} kcal (${pct(w.avg.kcal, w.avgGoal.kcal)} %) · ${fmt(w.avg.protein)} g protein (${pct(w.avg.protein, w.avgGoal.protein)} %)`
          : 'Inga fullständigt loggade dagar'}</span>
        ${has ? `<span class="row-meta">${w.loggedCount} ${w.loggedCount === 1 ? 'dag' : 'dagar'} · ${w.withinKcal} inom ±10 % kcal · ${w.proteinOk} med protein nått</span>` : ''}
      </span>
      <span class="chev">›</span>
    </button>`;
}

export async function renderOverview(main, state) {
  const today = isoDate();
  if (!state.weekDate) state.weekDate = today;
  const [savedGoals, plan, byDate] = await Promise.all([
    db.getSetting('goals', DEFAULT_GOALS),
    db.getSetting('weekPlan', DEFAULT_WEEK_PLAN),
    entriesByDate(),
  ]);
  const base = { ...DEFAULT_GOALS, ...savedGoals };
  const selectedStart = weekStart(state.weekDate);
  const thisWeek = weekStart(today);

  const week = await weekSummary(state.weekDate, base, plan, { byDate });
  let history = [];
  for (let i = HISTORY_WEEKS - 1; i >= 0; i--) {
    history.push(await weekSummary(addDays(thisWeek, -7 * i), base, plan, { byDate }));
  }
  // Hoppa över veckor innan första loggningen (den här veckan visas alltid).
  const firstWithData = history.findIndex(w => w.days.some(d => d.logged));
  history = history.slice(firstWithData >= 0 ? firstWithData : history.length - 1);

  main.innerHTML = `
    <header class="topbar daybar">
      <button type="button" class="icon-btn prev" aria-label="Föregående vecka">${icons.left}</button>
      <div class="date-title"><span>${selectedStart === thisWeek ? 'Den här veckan' : `Vecka ${week.week}`}</span></div>
      <button type="button" class="icon-btn next" aria-label="Nästa vecka" ${selectedStart >= thisWeek ? 'disabled' : ''}>${icons.right}</button>
    </header>
    <div class="content overview">
      ${weekCard(week, today)}
      <section class="card trends">
        <h3 class="sub-title">${history.length > 1 ? `Senaste ${history.length} veckorna` : 'Trend'}</h3>
        ${trendChart(history, 'kcal', 'Energi', 'kcal', 'kcal')}
        ${trendChart(history, 'protein', 'Protein', 'protein', 'g')}
        <p class="hint">Linjen visar målet. Bara fullständigt loggade dagar (minst ${fmt(INCOMPLETE_KCAL)} kcal) räknas.</p>
      </section>
      <h2 class="section-title">Veckor</h2>
      <div class="card list">
        ${[...history].reverse().map(w => historyRow(w, selectedStart)).join('')}
      </div>
    </div>`;

  const rerender = () => renderOverview(main, state);
  const goWeek = d => { state.weekDate = d; rerender(); window.scrollTo(0, 0); };
  main.querySelector('.prev').addEventListener('click', () => goWeek(addDays(selectedStart, -7)));
  main.querySelector('.next').addEventListener('click', () => { if (selectedStart < thisWeek) goWeek(addDays(selectedStart, 7)); });
  main.querySelectorAll('[data-week]').forEach(b => b.addEventListener('click', () => goWeek(b.dataset.week)));
  // Tryck på en dag i veckokortet: öppna den dagen.
  main.querySelectorAll('.wk-day').forEach(b => b.addEventListener('click', () => {
    state.date = b.dataset.date;
    location.hash = '#/';
  }));
}
