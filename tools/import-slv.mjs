// Hämtar Livsmedelsverkets livsmedelsdatabas och skriver data/livsmedel.json.
// Kör: node tools/import-slv.mjs
// Kräver Node 18+ (inbyggd fetch).

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://dataportal.livsmedelsverket.se/livsmedel/api/v1';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'livsmedel.json');
const CONCURRENCY = 6;

async function getJson(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i >= tries) throw new Error(`${url}: ${err.message}`);
      await new Promise(r => setTimeout(r, 500 * i * i));
    }
  }
}

const round1 = v => Math.round(v * 10) / 10;

function pick(nutrients) {
  const out = { k: 0, p: 0, c: 0, f: 0, fi: 0 };
  for (const n of nutrients) {
    const v = Number(n.varde) || 0;
    switch (n.euroFIRkod) {
      case 'ENERC': if (n.enhet === 'kcal') out.k = Math.round(v); break;
      case 'PROT': out.p = round1(v); break;
      case 'CHO': out.c = round1(v); break;
      case 'FAT': out.f = round1(v); break;
      case 'FIBT': out.fi = round1(v); break;
    }
  }
  return out;
}

function classify(classes) {
  const group = classes.find(c => c.fasett?.startsWith('A '))?.namn || '';
  const heat = classes.find(c => c.fasett?.startsWith('F '))?.namn || '';
  return { group, raw: /rå|ej värmebehandlad/i.test(heat) };
}

async function main() {
  const info = await getJson(`${BASE}/api-info`).catch(() => null);
  const list = await getJson(`${BASE}/livsmedel?offset=0&limit=5000&sprak=1`);
  const items = list.livsmedel;
  console.log(`Hittade ${items.length} livsmedel. Hämtar näringsvärden…`);

  const groups = [];
  const groupIndex = new Map();
  const foods = new Array(items.length);
  let next = 0, done = 0;

  async function worker() {
    while (next < items.length) {
      const idx = next++;
      const it = items[idx];
      const [nutr, cls] = await Promise.all([
        getJson(`${BASE}/livsmedel/${it.nummer}/naringsvarden?sprak=1`),
        getJson(`${BASE}/livsmedel/${it.nummer}/klassificeringar?sprak=1`).catch(() => []),
      ]);
      const { group, raw } = classify(cls);
      if (group && !groupIndex.has(group)) { groupIndex.set(group, groups.length); groups.push(group); }
      foods[idx] = {
        i: it.nummer,
        n: it.namn.trim(),
        ...pick(nutr),
        g: group ? groupIndex.get(group) : -1,
        ...(raw ? { r: 1 } : {}),
      };
      if (++done % 200 === 0) console.log(`  ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const data = {
    source: 'Livsmedelsverkets livsmedelsdatabas',
    license: 'CC BY 4.0 – källa: Livsmedelsverket',
    url: 'https://dataportal.livsmedelsverket.se/livsmedel',
    apiVersion: info?.version ?? null,
    imported: new Date().toISOString().slice(0, 10),
    // Fält: i=nummer, n=namn, k=kcal, p=protein, c=kolhydrater, f=fett, fi=fiber (per 100 g),
    // g=index i groups, r=1 om rå/ej värmebehandlad
    groups,
    foods: foods.sort((a, b) => a.i - b.i),
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data));
  console.log(`Klart: ${foods.length} livsmedel → ${OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
