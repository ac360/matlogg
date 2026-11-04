// Veckosammanfattning (måndag–söndag) för veckan som innehåller ett datum.

import * as db from './db.js';
import { sum, addDays, isoDate, KEYS } from './nutrition.js';
import { goalsForDate, weekdayIndex } from './goals.js';

// Dagar med mindre än så här mycket registrerat räknas som ofullständigt loggade
// och hoppas över i snitt och över/under-planen (dagens pågående dag räknas aldrig).
export const INCOMPLETE_KCAL = 1200;

export function weekStart(iso) {
  return addDays(iso, -weekdayIndex(iso));
}

export async function weekSummary(iso, baseGoals, plan) {
  const start = weekStart(iso);
  const today = isoDate();
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const entriesPerDay = await Promise.all(dates.map(d => db.getByIndex('entries', 'date', d)));

  const days = dates.map((date, i) => {
    const entries = entriesPerDay[i];
    const totals = sum(entries.map(e => e.nutrients));
    const logged = entries.length > 0;
    return {
      date,
      totals,
      goal: goalsForDate(baseGoals, plan, date),
      logged,
      incomplete: logged && date < today && totals.kcal < INCOMPLETE_KCAL,
      isToday: date === today,
      future: date > today,
    };
  });

  // Snitt räknas på avslutade, fullständigt loggade dagar: tomma dagar, dagar under
  // INCOMPLETE_KCAL och dagens pågående dag drar inte ner det.
  const counted = d => d.logged && !d.incomplete && d.date < today;
  const logged = days.filter(counted);
  const avg = {}, avgGoal = {};
  for (const k of KEYS) {
    avg[k] = logged.length ? logged.reduce((s, d) => s + d.totals[k], 0) / logged.length : 0;
    avgGoal[k] = logged.length ? logged.reduce((s, d) => s + d.goal[k], 0) / logged.length : baseGoals[k];
  }

  const target = days.reduce((s, d) => s + d.goal.kcal, 0);
  const consumed = days.reduce((s, d) => s + d.totals.kcal, 0);
  const containsToday = dates.includes(today);

  // Över/under planen för tidigare loggade dagar i veckan (dagar utan loggning räknas inte).
  const before = days.filter(counted);
  const balanceBefore = before.reduce((s, d) => s + d.totals.kcal - d.goal.kcal, 0);
  const daysLeftInclToday = containsToday ? days.filter(d => d.date >= today).length : 0;
  const todayDay = days.find(d => d.isToday);
  // Sprid skillnaden jämnt på idag och resten av veckan.
  const adjustedToday = containsToday && before.length
    ? Math.round(todayDay.goal.kcal - balanceBefore / daysLeftInclToday)
    : null;

  return {
    start, end: dates[6], days, avg, avgGoal, loggedCount: logged.length,
    incompleteCount: days.filter(d => d.incomplete).length,
    target, consumed, containsToday, balanceBefore, daysBefore: before.length, daysLeftInclToday, adjustedToday,
  };
}
