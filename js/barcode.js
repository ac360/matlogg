// Streckkodsavläsning med zxing-wasm (vendor/zxing). Wasm-filen ligger i appen så att det fungerar offline.
// Laddas först när skannern öppnas, så att appens start inte blir långsammare.

import { prepareZXingModule, readBarcodes } from '../vendor/zxing/es/reader/index.js';

let ready = null;

export function initDecoder() {
  if (!ready) {
    ready = prepareZXingModule({
      overrides: {
        locateFile: (path, prefix) =>
          path.endsWith('.wasm') ? new URL('../vendor/zxing/zxing_reader.wasm', import.meta.url).href : prefix + path,
      },
      fireImmediately: true,
    });
  }
  return ready;
}

// Livsmedel har EAN-13 (ibland EAN-8, UPC på importvaror).
const OPTIONS = { formats: ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E'], tryHarder: true, maxNumberOfSymbols: 1 };

// input: ImageData (kamerabild) eller Blob (foto). Returnerar streckkoden som text, eller null.
export async function decode(input) {
  await initDecoder();
  const results = await readBarcodes(input, OPTIONS);
  const hit = results.find(r => r.isValid && r.text);
  return hit ? hit.text : null;
}

// Kontrollsiffra för EAN-8/EAN-13/UPC-A, för koder som skrivs in för hand.
export function isValidCode(code) {
  if (!/^\d{8}$|^\d{12,13}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
