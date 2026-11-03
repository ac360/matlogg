// Baslista: vanliga produkter som saknas i Livsmedelsverkets databas.
// Värdena är typvärden per 100 g från vanliga svenska förpackningar, inte ett specifikt märke.
// I appen märks de "typvärde". a = extra sökord, u = mått i gram.

export const BASE_FOODS = [
  // Kvarg, skyr och proteinmejeri
  { id: 'vaniljkvarg', n: 'Kvarg vanilj (sötad)', a: ['vaniljkvarg', 'mild kvarg vanilj', 'kesella vanilj'], k: 63, p: 10, c: 4.8, f: 0.3, fi: 0, u: { burk: 500, portion: 150, dl: 105 } },
  { id: 'kvarg-smak', n: 'Kvarg smaksatt (jordgubb, hallon m.fl.)', a: ['fruktkvarg', 'jordgubbskvarg', 'hallonkvarg', 'kvarg jordgubb', 'kvarg hallon', 'smaksatt kvarg'], k: 66, p: 10, c: 5.5, f: 0.3, fi: 0, u: { burk: 500, portion: 150, dl: 105 } },
  { id: 'skyr', n: 'Skyr naturell', a: ['skyr'], k: 62, p: 11, c: 4, f: 0.2, fi: 0, u: { portion: 150, burk: 150, dl: 105 } },
  { id: 'skyr-smak', n: 'Skyr smaksatt (vanilj, bär m.fl.)', a: ['vaniljskyr', 'skyr vanilj', 'skyr jordgubb', 'skyr blåbär'], k: 76, p: 9.5, c: 8, f: 0.2, fi: 0, u: { portion: 150, burk: 150, dl: 105 } },
  { id: 'proteinyoghurt', n: 'Proteinyoghurt naturell', a: ['proteinyoghurt', 'yoghurt protein'], k: 58, p: 10, c: 3.9, f: 0.2, fi: 0, u: { portion: 200, dl: 105 } },
  { id: 'proteinpudding', n: 'Proteinpudding', a: ['proteinpudding', 'pudding protein'], k: 76, p: 10, c: 6, f: 1.4, fi: 0, u: { st: 200, förp: 200 } },
  { id: 'proteindryck', n: 'Proteindryck färdig (mjölkbaserad)', a: ['proteinshake', 'proteindrink', 'proteinmjölk', 'nutramino', 'mjölkproteindryck'], k: 60, p: 8.5, c: 5, f: 0.6, fi: 0, u: { st: 330, flaska: 330, förp: 330, glas: 200, dl: 103 } },

  // Proteinpulver och kosttillskott
  { id: 'whey', n: 'Proteinpulver vassle (whey)', a: ['proteinpulver', 'whey', 'vassleprotein', 'proteinpulver vanilj', 'proteinpulver choklad'], k: 390, p: 75, c: 8, f: 6.5, fi: 0, u: { skopa: 30, msk: 8, dl: 40 } },
  { id: 'whey-isolat', n: 'Proteinpulver vassleisolat', a: ['proteinpulver isolat', 'whey isolat', 'isolat'], k: 370, p: 88, c: 2, f: 1, fi: 0, u: { skopa: 30, msk: 8, dl: 40 } },
  { id: 'kasein', n: 'Proteinpulver kasein', a: ['kasein', 'kaseinpulver', 'proteinpulver kasein'], k: 360, p: 80, c: 5, f: 2, fi: 0, u: { skopa: 30, msk: 8, dl: 40 } },
  { id: 'veganprotein', n: 'Proteinpulver veganskt (ärta/ris)', a: ['veganskt proteinpulver', 'ärtprotein', 'proteinpulver veganskt', 'växtprotein'], k: 385, p: 75, c: 5, f: 7.5, fi: 2, u: { skopa: 30, msk: 8, dl: 40 } },
  { id: 'kreatin', n: 'Kreatin', a: ['kreatin', 'creatine'], k: 0, p: 0, c: 0, f: 0, fi: 0, u: { skopa: 5, tsk: 5 } },

  // Bars och snacks
  { id: 'proteinbar', n: 'Proteinbar', a: ['proteinbar', 'proteinbars', 'proteinkaka', 'barebells', 'njie bar', 'swebar'], k: 365, p: 32, c: 32, f: 13, fi: 6, u: { st: 55, bit: 55 } },
  { id: 'snickers', n: 'Snickers (chokladbit)', a: ['snickers'], k: 488, p: 8.6, c: 60, f: 24, fi: 2, u: { st: 50 } },
  { id: 'kexchoklad', n: 'Kexchoklad', a: ['kexchoklad'], k: 506, p: 6, c: 61, f: 26, fi: 2, u: { st: 60 } },

  // Dryck
  { id: 'energidryck-zero', n: 'Energidryck sockerfri (typ Nocco, Celsius)', a: ['nocco', 'celsius', 'energidryck zero', 'sockerfri energidryck', 'energidryck sockerfri', 'monster zero', 'red bull zero', 'bcaa dryck'], k: 3, p: 0, c: 0.5, f: 0, fi: 0, u: { burk: 330, st: 330 } },
  { id: 'energidryck', n: 'Energidryck med socker (typ Red Bull, Monster)', a: ['red bull', 'monster', 'energidryck'], k: 46, p: 0, c: 11, f: 0, fi: 0, u: { burk: 500, st: 500 } },
  { id: 'sportdryck', n: 'Sportdryck (typ Powerade)', a: ['sportdryck', 'powerade', 'gatorade'], k: 24, p: 0, c: 6, f: 0, fi: 0, u: { flaska: 500, st: 500 } },

  // Pålägg
  { id: 'kycklingpalagg', n: 'Kycklingpålägg (kycklingbröst skivat)', a: ['kycklingpålägg', 'kycklingbröst pålägg', 'kycklingskinka'], k: 105, p: 20, c: 1.5, f: 2, fi: 0, u: { skiva: 8, förp: 120 } },
  { id: 'kalkonpalagg', n: 'Kalkonpålägg (kalkonbröst skivat)', a: ['kalkonpålägg', 'kalkonbröst pålägg', 'kalkonskinka'], k: 100, p: 20, c: 1.5, f: 1.5, fi: 0, u: { skiva: 8, förp: 120 } },
  { id: 'skinkpalagg', n: 'Skinka kokt rökt (pålägg)', a: ['skinkpålägg', 'kokt skinka', 'rökt skinka', 'pålägg skinka', 'skinka'], k: 110, p: 19, c: 1.5, f: 3, fi: 0, u: { skiva: 10, förp: 120 } },
];
