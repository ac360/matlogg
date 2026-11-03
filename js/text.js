// Textnormalisering som delas av sökning och måttregler.

const ACCENTS = { é: 'e', è: 'e', ê: 'e', ë: 'e', à: 'a', á: 'a', â: 'a', ü: 'u', ú: 'u', ç: 'c', ô: 'o', ó: 'o', î: 'i', í: 'i', ñ: 'n' };

export function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[éèêëàáâüúçôóîíñ]/g, c => ACCENTS[c])
    .split(/[^a-zåäö0-9%]+/)
    .filter(Boolean);
}

export const normKey = str => normalize(str).join(' ');
