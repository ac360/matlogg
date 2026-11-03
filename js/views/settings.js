// Inställningar: profil, dagsmål, backup och om appen.

import { esc, h, num, toast } from '../ui.js';
import * as db from '../db.js';
import * as foods from '../foods.js';
import { ACTIVITY_LEVELS, GOAL_TYPES, DEFAULT_GOALS, suggestGoals } from '../goals.js';
import { KEYS, LABELS, UNITS, fmtIn, isoDate } from '../nutrition.js';
import { APP_VERSION } from '../version.js';

const DEFAULT_PROFILE = { sex: 'male', age: null, weight: null, height: null, activity: 'moderate', goal: 'leanbulk' };

export async function renderSettings(main) {
  const [profile, goals, lastBackup, persisted] = await Promise.all([
    db.getSetting('profile', DEFAULT_PROFILE),
    db.getSetting('goals', DEFAULT_GOALS),
    db.getSetting('lastBackup'),
    navigator.storage?.persisted ? navigator.storage.persisted() : Promise.resolve(null),
  ]);
  const p = { ...DEFAULT_PROFILE, ...profile };
  const g = { ...DEFAULT_GOALS, ...goals };
  const meta = foods.getSlvMeta();

  main.innerHTML = `
    <header class="topbar"><h1>Inställningar</h1></header>
    <div class="content settings">
      <section>
        <h2 class="section-title">Profil</h2>
        <div class="card form">
          <label class="field"><span>Kön</span>
            <select name="sex">
              <option value="male" ${p.sex === 'male' ? 'selected' : ''}>Man</option>
              <option value="female" ${p.sex === 'female' ? 'selected' : ''}>Kvinna</option>
            </select></label>
          <label class="field"><span>Ålder</span><input name="age" type="text" inputmode="numeric" value="${fmtIn(p.age, 0)}" placeholder="år"></label>
          <label class="field"><span>Vikt (kg)</span><input name="weight" type="text" inputmode="decimal" value="${fmtIn(p.weight, 1)}" placeholder="kg"></label>
          <label class="field"><span>Längd (cm)</span><input name="height" type="text" inputmode="numeric" value="${fmtIn(p.height, 0)}" placeholder="cm"></label>
          <label class="field stacked"><span>Aktivitetsnivå</span>
            <select name="activity">${ACTIVITY_LEVELS.map(a => `<option value="${a.id}" ${a.id === p.activity ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select></label>
          <label class="field stacked"><span>Mål</span>
            <select name="goal">${GOAL_TYPES.map(t => `<option value="${t.id}" ${t.id === p.goal ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
          <button type="button" class="btn secondary suggest">Föreslå dagsmål</button>
          <p class="hint suggestion" hidden></p>
        </div>
      </section>

      <section>
        <h2 class="section-title">Dagsmål</h2>
        <div class="card form goals">
          ${KEYS.map(k => `<label class="field"><span>${LABELS[k]} (${UNITS[k]})</span><input name="${k}" type="text" inputmode="numeric" value="${fmtIn(g[k], 0)}"></label>`).join('')}
          <button type="button" class="btn primary save-goals">Spara mål</button>
        </div>
      </section>

      <section>
        <h2 class="section-title">Backup</h2>
        <div class="card form">
          <p class="hint">All data finns bara på den här telefonen. Exportera en backup då och då och spara den i Filer eller iCloud Drive.</p>
          <p class="hint">${lastBackup ? `Senaste export: ${new Date(lastBackup).toLocaleDateString('sv-SE')}` : 'Ingen export gjord än.'}
            ${persisted === true ? ' · Lagringen är skyddad mot automatisk rensning.' : ''}</p>
          <button type="button" class="btn secondary export">Exportera all data (JSON)</button>
          <label class="btn secondary import-label">Importera backup…<input type="file" class="import" accept="application/json,.json" hidden></label>
        </div>
      </section>

      <section>
        <h2 class="section-title">Om</h2>
        <div class="card about">
          <p>Näringsvärden från <a href="${esc(meta?.url || 'https://www.livsmedelsverket.se')}" target="_blank" rel="noopener">Livsmedelsverkets livsmedelsdatabas</a>
          (${meta?.count ?? '–'} livsmedel, hämtad ${esc(meta?.imported || '–')}). Källa: Livsmedelsverket, licens CC BY 4.0.</p>
          <p class="hint">Version ${APP_VERSION}</p>
        </div>
      </section>
    </div>`;

  const val = name => main.querySelector(`[name="${name}"]`).value;

  const readProfile = () => ({
    sex: val('sex'), age: num(val('age')), weight: num(val('weight')), height: num(val('height')),
    activity: val('activity'), goal: val('goal'),
  });

  main.querySelectorAll('.settings section:first-child input, .settings section:first-child select').forEach(el =>
    el.addEventListener('change', () => db.setSetting('profile', readProfile())));

  main.querySelector('.suggest').addEventListener('click', async () => {
    const prof = readProfile();
    await db.setSetting('profile', prof);
    const s = suggestGoals(prof);
    const out = main.querySelector('.suggestion');
    if (!s) {
      out.hidden = false;
      out.textContent = 'Fyll i ålder, vikt och längd först.';
      return;
    }
    for (const k of KEYS) main.querySelector(`.goals [name="${k}"]`).value = fmtIn(s.goals[k], 0);
    out.hidden = false;
    out.textContent = s.explanation + ' Tryck "Spara mål" för att använda förslaget.';
  });

  main.querySelector('.save-goals').addEventListener('click', async () => {
    const next = {};
    for (const k of KEYS) {
      const v = num(main.querySelector(`.goals [name="${k}"]`).value);
      if (v == null || v < 0) return toast(`Ange ett giltigt värde för ${LABELS[k].toLowerCase()}.`);
      next[k] = v;
    }
    await db.setSetting('goals', next);
    toast('Målen är sparade');
  });

  main.querySelector('.export').addEventListener('click', exportBackup);
  main.querySelector('.import').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await importBackup(file, () => renderSettings(main));
  });
}

async function exportBackup() {
  const data = await db.exportAll();
  const json = JSON.stringify(data, null, 1);
  const name = `matlogg-backup-${isoDate()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
    } else {
      const url = URL.createObjectURL(file);
      const a = h(`<a href="${url}" download="${name}"></a>`);
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    await db.setSetting('lastBackup', new Date().toISOString());
    toast('Backup exporterad');
  } catch (err) {
    if (err.name !== 'AbortError') toast('Exporten misslyckades: ' + err.message);
  }
}

async function importBackup(file, done) {
  try {
    const data = JSON.parse(await file.text());
    const n = (data?.stores?.entries || []).filter(e => !e.deleted).length;
    const when = data?.exported ? new Date(data.exported).toLocaleString('sv-SE') : 'okänt datum';
    if (!confirm(`Ersätta ALL data i appen med backupen från ${when} (${n} poster)? Det går inte att ångra.`)) return;
    await db.importAll(data);
    await foods.reloadCustomFoods();
    toast('Backupen är återställd');
    done?.();
  } catch (err) {
    toast('Kunde inte läsa backupen: ' + err.message, { duration: 5000 });
  }
}
