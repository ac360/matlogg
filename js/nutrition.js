// Näringsberäkningar, datum och formatering.

export const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber'];
export const LABELS = { kcal: 'Energi', protein: 'Protein', carbs: 'Kolhydrater', fat: 'Fett', fiber: 'Fiber' };
export const UNITS = { kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g', fiber: 'g' };

const r1 = v => Math.round(v * 10) / 10;

export function empty() {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

export function scale(per100, grams) {
  const f = (grams || 0) / 100;
  const out = {};
  for (const k of KEYS) out[k] = k === 'kcal' ? Math.round((per100?.[k] || 0) * f) : r1((per100?.[k] || 0) * f);
  return out;
}

export function sum(list) {
  const out = empty();
  for (const n of list) for (const k of KEYS) out[k] += Number(n?.[k]) || 0;
  for (const k of KEYS) out[k] = k === 'kcal' ? Math.round(out[k]) : r1(out[k]);
  return out;
}

export function scaleBy(nutrients, factor) {
  const out = {};
  for (const k of KEYS) out[k] = k === 'kcal' ? Math.round(nutrients[k] * factor) : r1(nutrients[k] * factor);
  return out;
}

export const fmt = (n, digits = 0) =>
  (Number(n) || 0).toLocaleString('sv-SE', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

// Värde i ett inmatningsfält: ingen tusentalsavgränsare, decimalkomma.
export const fmtIn = (n, digits = 1) => {
  if (n == null || isNaN(n)) return '';
  const f = 10 ** digits;
  return String(Math.round(n * f) / f).replace('.', ',');
};

// ---- Måltider ----

export const MEALS = [
  { id: 'frukost', label: 'Frukost' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'middag', label: 'Middag' },
  { id: 'mellanmal', label: 'Mellanmål' },
  { id: 'ovrigt', label: 'Övrigt' },
];

export function defaultMeal(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 10) return 'frukost';
  if (h >= 10 && h < 14) return 'lunch';
  if (h >= 17 && h < 21) return 'middag';
  return 'mellanmal';
}

// ---- Datum (lokal tid, format ÅÅÅÅ-MM-DD) ----

export function isoDate(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(iso, n) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function dateLabel(iso) {
  const today = isoDate();
  if (iso === today) return 'Idag';
  if (iso === addDays(today, -1)) return 'Igår';
  if (iso === addDays(today, 1)) return 'Imorgon';
  const d = parseIso(iso);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('sv-SE', opts);
}

export function amountText(qty, unit, grams) {
  const q = fmt(qty, 2);
  if (unit === 'g') return `${q} g`;
  return `${q} ${unit} · ${fmt(grams)} g`;
}
