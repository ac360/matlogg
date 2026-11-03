// Förbereder en ny version: höjer versionsnumret i sw.js och js/version.js
// och kontrollerar att alla appfiler finns med i service workerns cachelista.
// Kör: node tools/release.mjs

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function listFiles(dir) {
  const out = [];
  for (const e of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(relative('.', p));
  }
  return out;
}

const swPath = join(ROOT, 'sw.js');
const verPath = join(ROOT, 'js', 'version.js');
let sw = await readFile(swPath, 'utf8');
let ver = await readFile(verPath, 'utf8');

const current = ver.match(/APP_VERSION = '(\d+)\.(\d+)\.(\d+)'/);
if (!current) throw new Error('Hittade inte APP_VERSION i js/version.js');
const next = `${current[1]}.${current[2]}.${Number(current[3]) + 1}`;

ver = ver.replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${next}'`);
sw = sw.replace(/CACHE_VERSION = '[^']+'/, `CACHE_VERSION = 'v${next}'`);
await writeFile(verPath, ver);
await writeFile(swPath, sw);
console.log(`Version: ${current[0].split("'")[1]} → ${next}`);

const files = [...(await listFiles('js')), ...(await listFiles('css')), ...(await listFiles('data')), ...(await listFiles('icons'))];
const missing = files.filter(f => !sw.includes(`'${f}'`));
if (missing.length) {
  console.warn('\nVARNING: dessa filer saknas i ASSETS i sw.js och fungerar inte offline:');
  for (const f of missing) console.warn('  ' + f);
} else {
  console.log('Alla appfiler finns i service workerns cachelista.');
}
