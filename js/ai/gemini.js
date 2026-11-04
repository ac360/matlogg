// Google Gemini via REST, direkt från webbläsaren. Nyckeln skickas i en header, aldrig i URL:en.

import { AiError, SYSTEM_PROMPT, ESTIMATE_SCHEMA } from './common.js';

export const label = 'Google Gemini';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 45000;

// Senaste felet från Google, visas under Inställningar för felsökning.
let lastError = null;
export const getLastError = () => lastError;

async function call(path, { apiKey, method = 'GET', body, signal }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), TIMEOUT_MS);
  signal?.addEventListener('abort', () => ctrl.abort(signal.reason), { once: true });
  let res;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method,
      headers: { 'x-goog-api-key': apiKey, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (ctrl.signal.aborted) throw new AiError('timeout', 'AI:n svarade inte i tid. Försök igen.');
    throw new AiError('network', navigator.onLine === false
      ? 'Ingen internetanslutning. Skriv in värden själv eller försök senare.'
      : 'AI:n gick inte att nå. Kontrollera anslutningen.');
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return res.json();

  let msg = '';
  try { msg = (await res.json())?.error?.message || ''; } catch {}
  lastError = { status: res.status, message: msg, path: path.split(':')[0], at: new Date().toISOString() };
  if (res.status === 429) throw new AiError('rate-limit', 'Gratiskvoten hos Google är slut för stunden. Vänta en minut (eller till i morgon) eller skriv in värden själv.', msg);
  if (res.status === 400 && /api key/i.test(msg)) throw new AiError('auth', 'API-nyckeln fungerar inte. Kontrollera den under Inställningar.', msg);
  if (res.status === 401 || res.status === 403) throw new AiError('auth', 'API-nyckeln saknar behörighet. Kontrollera den under Inställningar.', msg);
  if (res.status === 404) throw new AiError('model', 'AI-modellen finns inte längre.', msg);
  if (res.status === 400) throw new AiError('invalid', `AI-anropet avvisades (400).`, msg);
  if (res.status === 500) throw new AiError('internal', 'Googles AI-tjänst fick ett internt fel.', msg);
  if (res.status >= 500) throw new AiError('unavailable', 'Googles AI-modeller är överbelastade just nu. Försök igen om en stund eller skriv in värden själv.', msg);
  throw new AiError('bad-response', `AI-anropet misslyckades (${res.status}).`, msg);
}

// Rangordnar Flash-modeller: stabila före preview, vanlig Flash före Flash-Lite, högst version först.
export function rankModels(list) {
  const cands = [];
  for (const m of list) {
    const id = (m.name || '').replace(/^models\//, '');
    if (!/^gemini-/.test(id) || !/flash/.test(id)) continue;
    if (!(m.supportedGenerationMethods || []).includes('generateContent')) continue;
    if (/image|tts|audio|live|embedding|thinking|exp|vision|computer|native/.test(id)) continue;
    const version = parseFloat((id.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1]) || 0;
    const isAlias = /latest/.test(id);
    const lite = /lite/.test(id);
    const preview = /preview/.test(id);
    // Alias som "gemini-flash-latest" kan peka på en förhandsversion: lägg dem efter namngivna stabila modeller.
    const score = (preview ? 0 : 1000) + (lite ? 0 : 100) + (isAlias ? 0 : version);
    cands.push({ id, score });
  }
  cands.sort((a, b) => b.score - a.score);
  return cands.map(c => c.id);
}

export async function listModels(apiKey, { signal } = {}) {
  const data = await call('models?pageSize=1000', { apiKey, signal });
  return rankModels(data.models || []);
}

// JSON Schema med små bokstäver (responseJsonSchema) från det gemensamma schemat.
function toJsonSchema(node) {
  if (Array.isArray(node)) return node.map(toJsonSchema);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = k === 'type' ? String(v).toLowerCase() : toJsonSchema(v);
  return out;
}

const PROMPT_FORMAT = `
Svara med exakt ett JSON-objekt och inget annat, på formen:
{"name": "...", "items": [{"name": "...", "grams": 0, "kcal": 0, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0}], "reason": "...", "confidence": "medel"}`;

// Kort tänkande räcker och gör svaret snabbare. Bara Gemini 3 och senare har thinkingLevel.
const supportsThinkingLevel = model => /^gemini-(?:[3-9]|\d{2,})/.test(model);

// Anropsvarianter, från bäst till enklast. Avvisar Google en variant (400 eller internt fel 500)
// provas nästa, så att appen fungerar även om API:t ändras.
function variants(model) {
  const v = [];
  if (supportsThinkingLevel(model)) v.push({ schema: 'json', thinking: { thinkingLevel: 'LOW' } });
  v.push({ schema: 'json' }, { schema: 'openapi' }, { schema: 'none' });
  return v;
}

function buildBody(text, variant) {
  const generationConfig = { responseMimeType: 'application/json' };
  if (variant.schema === 'json') generationConfig.responseJsonSchema = toJsonSchema(ESTIMATE_SCHEMA);
  if (variant.schema === 'openapi') generationConfig.responseSchema = ESTIMATE_SCHEMA;
  if (variant.thinking) generationConfig.thinkingConfig = variant.thinking;
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT + (variant.schema === 'none' ? PROMPT_FORMAT : '') }] },
    contents: [{ role: 'user', parts: [{ text: `Det här har jag ätit: "${text}"` }] }],
    generationConfig,
  };
}

function parseJson(textOut) {
  const t = textOut.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('no json');
}

export async function estimate(text, { apiKey, model, signal }) {
  let lastErr;
  for (const variant of variants(model)) {
    let data;
    try {
      data = await call(`models/${encodeURIComponent(model)}:generateContent`, {
        apiKey, method: 'POST', body: buildBody(text, variant), signal,
      });
    } catch (err) {
      lastErr = err;
      if (err instanceof AiError && (err.code === 'invalid' || err.code === 'internal')) continue;
      throw err;
    }
    const cand = data.candidates?.[0];
    if (!cand) {
      if (data.promptFeedback?.blockReason) throw new AiError('bad-response', 'AI:n ville inte svara på den här frågan.');
      lastErr = new AiError('bad-response', 'AI:n gav inget svar.');
      continue;
    }
    const textOut = (cand.content?.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
    try {
      return { data: parseJson(textOut), model };
    } catch {
      lastErr = new AiError('bad-response', 'AI:ns svar gick inte att tolka.', `finishReason ${cand.finishReason || '?'}: ${textOut.slice(0, 80)}`);
    }
  }
  if (lastErr?.code === 'invalid') throw new AiError('invalid', 'Google avvisade AI-anropet.', lastErr.detail);
  throw lastErr;
}
