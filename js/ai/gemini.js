// Google Gemini via REST, direkt från webbläsaren. Nyckeln skickas i en header, aldrig i URL:en.

import { AiError, SYSTEM_PROMPT, ESTIMATE_SCHEMA } from './common.js';

export const label = 'Google Gemini';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 45000;

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
  if (res.status === 429) throw new AiError('rate-limit', 'Gratiskvoten hos Google är slut för stunden. Vänta en minut (eller till i morgon) eller skriv in värden själv.', msg);
  if (res.status === 400 && /api key/i.test(msg)) throw new AiError('auth', 'API-nyckeln fungerar inte. Kontrollera den under Inställningar.', msg);
  if (res.status === 401 || res.status === 403) throw new AiError('auth', 'API-nyckeln saknar behörighet. Kontrollera den under Inställningar.', msg);
  if (res.status === 404) throw new AiError('model', 'AI-modellen finns inte längre.', msg);
  if (res.status >= 500) throw new AiError('unavailable', 'Googles AI-tjänst har tillfälliga problem. Försök igen om en stund.', msg);
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
    const score = (preview ? 0 : 1000) + (lite ? 0 : 100) + version + (isAlias ? 50 : 0);
    cands.push({ id, score });
  }
  cands.sort((a, b) => b.score - a.score);
  return cands.map(c => c.id);
}

export async function listModels(apiKey, { signal } = {}) {
  const data = await call('models?pageSize=1000', { apiKey, signal });
  return rankModels(data.models || []);
}

export async function estimate(text, { apiKey, model, signal }) {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: `Det här har jag ätit: "${text}"` }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: ESTIMATE_SCHEMA,
    },
  };
  const data = await call(`models/${encodeURIComponent(model)}:generateContent`, { apiKey, method: 'POST', body, signal });
  const cand = data.candidates?.[0];
  if (!cand) {
    const reason = data.promptFeedback?.blockReason;
    throw new AiError('bad-response', reason ? 'AI:n ville inte svara på den här frågan.' : 'AI:n gav inget svar.');
  }
  const textOut = (cand.content?.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
  try {
    return { data: JSON.parse(textOut), model };
  } catch {
    throw new AiError('bad-response', 'AI:ns svar gick inte att tolka. Försök igen.');
  }
}
