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
