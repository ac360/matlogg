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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Provar modellerna i tur och ordning. Överbelastad modell (503) får ett nytt försök och sedan
// tas nästa modell; likaså om kvoten är slut eller modellen inte finns. Den modell som fungerar
// sparas och används först nästa gång.
async function runWithFallback(provider, cfg, text, signal) {
  let primary = cfg.model !== 'auto' ? cfg.model : cfg.resolvedModel;
  let models = cfg.models || [];
  if (!primary || (cfg.model === 'auto' && !models.length)) {
    models = await provider.listModels(cfg.apiKey, { signal });
    if (!models.length) throw new AiError('model', 'Hittade ingen lämplig modell för nyckeln.');
    primary = primary || models[0];
    await saveConfig({ models, resolvedModel: primary });
  }
  const order = cfg.model !== 'auto' ? [primary] : [primary, ...models.filter(m => m !== primary)].slice(0, 4);

  let lastErr;
  for (const model of order) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await provider.estimate(text, { apiKey: cfg.apiKey, model, signal });
        const out = { ...clean(res.data), model };
        if (cfg.model === 'auto' && model !== cfg.resolvedModel) await saveConfig({ resolvedModel: model });
        return out;
      } catch (err) {
        if (!(err instanceof AiError)) throw err;
        lastErr = err;
        if ((err.code === 'unavailable' || err.code === 'internal') && attempt === 1) { await sleep(1200); continue; }
        if (['unavailable', 'internal', 'rate-limit', 'model', 'bad-response'].includes(err.code)) break; // nästa modell
        throw err;
      }
    }
  }
  throw lastErr;
}

// fresh: true hoppar över sessionens minne ("Fråga igen").
export async function estimate(text, { signal, fresh = false } = {}) {
  const cfg = await getConfig();
  if (!cfg.apiKey) throw new AiError('no-key', 'Ingen API-nyckel är inlagd. Lägg in den under Inställningar → AI.');
  const key = `${cfg.provider}:${text.trim().toLowerCase()}`;
  if (!fresh && memo.has(key)) return memo.get(key);
  const provider = PROVIDERS[cfg.provider] || gemini;
  const out = await runWithFallback(provider, cfg, text, signal);
  memo.set(key, out);
  return out;
}

// Testar nyckeln på riktigt: hämtar modeller och ställer en liten fråga.
// Returnerar { model, sample } eller kastar AiError (nyckeln sparas ändå).
export async function testConnection(apiKey) {
  const cfg = await saveConfig({ apiKey });
  const provider = PROVIDERS[cfg.provider] || gemini;
  const models = await provider.listModels(apiKey);
  if (!models.length) throw new AiError('model', 'Nyckeln fungerar men ingen lämplig Flash-modell hittades.');
  const fresh = await saveConfig({ models, resolvedModel: cfg.model === 'auto' ? models[0] : cfg.resolvedModel });
  const out = await runWithFallback(provider, fresh, '1 banan', undefined);
  return { model: out.model, sample: out };
}

export function lastError() {
  return gemini.getLastError?.() || null;
}

export function errorText(err) {
  if (err instanceof AiError) {
    // Visa Googles egen förklaring när den finns, så att orsaken går att se.
    const d = err.detail && ['unavailable', 'internal', 'invalid', 'bad-response', 'model', 'auth', 'rate-limit'].includes(err.code)
      ? ` (Google: ${String(err.detail).slice(0, 140)})` : '';
    return err.message + d;
  }
  if (err?.name === 'AbortError') return 'Avbrutet.';
  return 'AI:n gick inte att nå. Skriv in värden själv eller försök igen.';
}
