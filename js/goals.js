// Förslag på dagsmål utifrån profil.

export const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Stillasittande (lite träning)', factor: 1.2 },
  { id: 'light', label: 'Lätt aktiv (1–3 pass/vecka)', factor: 1.375 },
  { id: 'moderate', label: 'Måttligt aktiv (3–5 pass/vecka)', factor: 1.55 },
  { id: 'active', label: 'Mycket aktiv (6–7 pass/vecka)', factor: 1.725 },
  { id: 'athlete', label: 'Extremt aktiv (tungt jobb + träning)', factor: 1.9 },
];

export const GOAL_TYPES = [
  { id: 'cut', label: 'Gå ner i fett', kcalAdjust: k => -Math.min(500, k * 0.2), proteinPerKg: 2.2 },
  { id: 'maintain', label: 'Behålla vikten', kcalAdjust: () => 0, proteinPerKg: 1.8 },
  { id: 'leanbulk', label: 'Bygga muskler utan fettökning', kcalAdjust: k => Math.min(300, k * 0.1), proteinPerKg: 2.0 },
  { id: 'bulk', label: 'Bygga muskler snabbare', kcalAdjust: k => Math.min(500, k * 0.15), proteinPerKg: 1.8 },
];

export const DEFAULT_GOALS = { kcal: 2400, protein: 150, carbs: 270, fat: 75, fiber: 30 };

// Mifflin-St Jeor
export function bmr({ sex, weight, height, age }) {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return sex === 'female' ? base - 161 : base + 5;
}

export function suggestGoals(profile) {
  const { weight, height, age } = profile;
  if (!(weight > 0 && height > 0 && age > 0)) return null;
  const activity = ACTIVITY_LEVELS.find(a => a.id === profile.activity) || ACTIVITY_LEVELS[2];
  const goal = GOAL_TYPES.find(g => g.id === profile.goal) || GOAL_TYPES[2];

  const tdee = bmr(profile) * activity.factor;
  const kcal = Math.round((tdee + goal.kcalAdjust(tdee)) / 10) * 10;
  const protein = Math.round(weight * goal.proteinPerKg);
  const fat = Math.round((kcal * 0.27) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const fiber = Math.min(40, Math.max(25, Math.round((kcal / 1000) * 12)));

  const sv = n => String(n).replace('.', ',');
  return {
    goals: { kcal, protein, carbs, fat, fiber },
    explanation:
      `Grundförbrukning ≈ ${Math.round(bmr(profile))} kcal × aktivitet ${sv(activity.factor)} ` +
      `= ${Math.round(tdee)} kcal/dag. ${goal.label}: ${kcal >= tdee ? '+' : ''}${Math.round(kcal - tdee)} kcal. ` +
      `Protein ${sv(goal.proteinPerKg)} g/kg, fett ~27 % av energin, resten kolhydrater.`,
  };
}

// ---- Veckoplan: olika kalorimål per veckodag med samma veckototal ----
// Sparas som inställningen 'weekPlan': { enabled, days: [kcal|null × 7] } där index 0 = måndag.
// Dagar utan eget värde delar lika på det som blir kvar av veckototalen (7 × dagsmålet).

export const WEEKDAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
export const WEEKDAYS_SHORT = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
export const DEFAULT_WEEK_PLAN = { enabled: false, days: [null, null, null, null, null, null, null] };

// Måndag = 0 … söndag = 6, för ett datum på formen ÅÅÅÅ-MM-DD.
export function weekdayIndex(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(y, m - 1, d, 12).getDay() + 6) % 7;
}

// Returnerar kcal för varje veckodag. Summan är alltid exakt 7 × dagsmålet när någon dag är automatisk.
export function planKcal(baseKcal, plan) {
  const total = baseKcal * 7;
  if (!plan?.enabled) return Array(7).fill(baseKcal);
  const fixed = plan.days.map(v => (v > 0 ? v : null));
  const fixedSum = fixed.reduce((s, v) => s + (v || 0), 0);
  const autoCount = fixed.filter(v => v == null).length;
  if (!autoCount) return fixed;
  // Fördela resten i hela kcal så att summan blir exakt veckototalen.
  const rest = total - fixedSum;
  const each = Math.floor(rest / autoCount);
  let extra = rest - each * autoCount;
  return fixed.map(v => (v != null ? v : each + (extra-- > 0 ? 1 : 0)));
}

// Mål för ett visst datum. Protein och fiber är samma alla dagar; kolhydrater och fett
// skalas med den energi som inte kommer från protein.
export function goalsForDate(base, plan, iso) {
  if (!plan?.enabled) return { ...base, planned: false };
  const kcal = planKcal(base.kcal, plan)[weekdayIndex(iso)];
  if (kcal === base.kcal) return { ...base, planned: false };
  const baseNonProtein = Math.max(1, base.kcal - base.protein * 4);
  const factor = Math.max(0, kcal - base.protein * 4) / baseNonProtein;
  return {
    ...base,
    kcal,
    carbs: Math.round(base.carbs * factor),
    fat: Math.round(base.fat * factor),
    planned: true,
    diff: kcal - base.kcal,
  };
}

// Kontrollerar en plan innan den sparas. Returnerar en varning eller null.
export function checkPlan(baseKcal, plan) {
  const days = planKcal(baseKcal, plan);
  const min = Math.min(...days);
  if (min < 1200) return `En dag hamnar på ${min} kcal. Minska de inställda dagarna så att övriga dagar inte blir för låga.`;
  if (plan.days.every(v => v > 0) && Math.abs(days.reduce((s, v) => s + v, 0) - baseKcal * 7) > 50) {
    return `Alla dagar är inställda men summan blir ${days.reduce((s, v) => s + v, 0)} kcal i stället för ${baseKcal * 7}. Lämna minst en dag tom så fördelas resten automatiskt.`;
  }
  return null;
}
