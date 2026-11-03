// Gemensamt gränssnitt för AI-uppskattning. Varje leverantör (t.ex. ./gemini.js) exporterar:
//   label                                  visningsnamn
//   listModels(apiKey, { signal })         → [modellnamn] som kan användas, bästa först
//   estimate(text, { apiKey, model, signal }) → { data, model } där data följer ESTIMATE_SCHEMA
// Fel kastas som AiError. För att byta leverantör: lägg till en modul och registrera den i PROVIDERS.

import * as db from '../db.js';
import * as gemini from './gemini.js';
import { AiError } from './common.js';

export { AiError };

export const PROVIDERS = { gemini };

export const DEFAULT_AI = { provider: 'gemini', apiKey: '', model: 'auto', auto: true, models: [], resolvedModel: null };

export async function getConfig() {
  return { ...DEFAULT_AI, ...(await db.getSetting('ai', {})) };
}

export async function saveConfig(patch) {
  const next = { ...(await getConfig()), ...patch };
  await db.setSetting('ai', next);
  return next;
}

export async function isConfigured() {
  const c = await getConfig();
  return !!c.apiKey;
}

const r1 = v => Math.round(v * 10) / 10;
const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

// Kontrollerar och städar AI-svaret.
function clean(data) {
  if (!data || !Array.isArray(data.items) || !data.items.length) throw new AiError('bad-response', 'AI:n gav inget användbart svar.');
  const items = data.items
    .map(it => ({
      name: String(it.name || 'Okänd del').slice(0, 80),
      grams: Math.round(num(it.grams)),
      kcal: Math.round(num(it.kcal)),
      protein: r1(num(it.protein)),
      carbs: r1(num(it.carbs)),
      fat: r1(num(it.fat)),
      fiber: r1(num(it.fiber)),
    }))
    .filter(it => it.grams > 0 || it.kcal > 0);
  if (!items.length) throw new AiError('bad-response', 'AI:n gav inga mängder.');
  for (const it of items) {
    if (!it.grams) it.grams = 100;
    // Rimlighetskontroll: mer än 9 kcal per gram eller mer makron än vikten är inte möjligt.
    if (it.kcal / it.grams > 9.5 || it.protein + it.carbs + it.fat > it.grams * 1.05) {
      throw new AiError('bad-response', 'AI:ns värden var orimliga. Försök igen eller skriv in värden själv.');
    }
  }
  return {
    name: String(data.name || '').trim().slice(0, 80) || items[0].name,
    items,
    reason: String(data.reason || '').trim().slice(0, 300),
    confidence: ['hög', 'medel', 'låg'].includes(data.confidence) ? data.confidence : 'medel',
  };
}

// Samma fråga två gånger under samma session ger samma svar utan nytt anrop.
const memo = new Map();

// fresh: true hoppar över sessionens minne ("Fråga igen").
export async function estimate(text, { signal, fresh = false } = {}) {
  const cfg = await getConfig();
  if (!cfg.apiKey) throw new AiError('no-key', 'Ingen API-nyckel är inlagd. Lägg in den under Inställningar → AI.');
  const key = `${cfg.provider}:${text.trim().toLowerCase()}`;
  if (!fresh && memo.has(key)) return memo.get(key);
  const provider = PROVIDERS[cfg.provider] || gemini;

  let model = cfg.model !== 'auto' ? cfg.model : cfg.resolvedModel;
  if (!model) {
    const models = await provider.listModels(cfg.apiKey, { signal });
    if (!models.length) throw new AiError('model', 'Hittade ingen lämplig modell för nyckeln.');
    model = models[0];
    await saveConfig({ resolvedModel: model, models });
  }

  try {
    const res = await provider.estimate(text, { apiKey: cfg.apiKey, model, signal });
    const out = { ...clean(res.data), model: res.model };
    memo.set(key, out);
    return out;
  } catch (err) {
    // Modellen finns inte längre, eller dess gratiskvot är slut: prova nästa modell en gång.
    if (cfg.model === 'auto' && err instanceof AiError && (err.code === 'model' || err.code === 'rate-limit')) {
      const models = err.code === 'model' ? await provider.listModels(cfg.apiKey, { signal }) : cfg.models || [];
      const next = models.find(m => m !== model);
      if (next) {
        const res = await provider.estimate(text, { apiKey: cfg.apiKey, model: next, signal });
        const out = { ...clean(res.data), model: res.model };
        if (err.code === 'model') await saveConfig({ resolvedModel: next, models });
        memo.set(key, out);
        return out;
      }
    }
    throw err;
  }
}

// Testar nyckeln: listar modeller och returnerar den som kommer att användas.
export async function testConnection(apiKey) {
  const cfg = await getConfig();
  const provider = PROVIDERS[cfg.provider] || gemini;
  const models = await provider.listModels(apiKey);
  if (!models.length) throw new AiError('model', 'Nyckeln fungerar men ingen lämplig Flash-modell hittades.');
  await saveConfig({ apiKey, models, resolvedModel: models[0] });
  return models;
}

export function errorText(err) {
  if (err instanceof AiError) return err.message;
  if (err?.name === 'AbortError') return 'Avbrutet.';
  return 'AI:n gick inte att nå. Skriv in värden själv eller försök igen.';
}
