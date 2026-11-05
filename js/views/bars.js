// Förloppsstapel som delas av vyerna.

export function bar(value, goal, cls) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  const over = goal > 0 && value > goal * 1.05;
  return `<div class="bar ${cls} ${over ? 'over' : ''}"><span style="width:${pct}%"></span></div>`;
}
