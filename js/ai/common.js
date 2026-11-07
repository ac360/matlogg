// Delas av alla AI-leverantörer: feltyp, instruktioner och svarsschema.

export class AiError extends Error {
  // code: 'no-key' | 'auth' | 'rate-limit' | 'model' | 'network' | 'timeout' | 'unavailable' | 'internal' | 'invalid' | 'bad-response'
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

// Instruktionerna är desamma oavsett leverantör.
export const SYSTEM_PROMPT = `Du är en svensk kostexpert som uppskattar näringsinnehåll i mat som någon har ätit.
Regler:
- Utgå från beskrivningen och den mängd som anges. Anges ingen mängd: anta en normal svensk portion. Står det restaurang, gatukök eller liknande: anta en typisk restaurangportion.
- Dela upp rätter och måltider i sina huvuddelar (t.ex. bröd, kött, ost, sås, pommes) med uppskattad vikt i gram för varje del. En enkel vara blir en enda del.
- Alla näringsvärden gäller HELA vikten för respektive del, inte per 100 g.
- kcal i kilokalorier; protein, kolhydrater (tillgängliga), fett och fiber i gram.
- name: kort svenskt namn på det som åts, utan mängd (t.ex. "Smashburger, restaurang").
- reason: högst två korta meningar på svenska om de viktigaste antagandena (portionsstorlek, tillagning).
- confidence: "hög", "medel" eller "låg".
Svara endast med JSON enligt schemat.`;

export const ESTIMATE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          grams: { type: 'NUMBER' },
          kcal: { type: 'NUMBER' },
          protein: { type: 'NUMBER' },
          carbs: { type: 'NUMBER' },
          fat: { type: 'NUMBER' },
          fiber: { type: 'NUMBER' },
        },
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'fiber'],
      },
    },
    reason: { type: 'STRING' },
    confidence: { type: 'STRING', description: 'hög, medel eller låg' },
  },
  required: ['name', 'items', 'reason', 'confidence'],
};


// ---- Avläsning av näringsdeklaration från foto ----

export const LABEL_PROMPT = `Du läser av ett foto av en livsmedelsförpackning, främst näringsvärdestabellen.
Regler:
- Ange värden per 100 g. För dryck: per 100 ml räknas som per 100 g.
- Energi i kcal. Står bara kJ: dela med 4,184.
- carbs = kolhydrater totalt (inte "varav sockerarter"). fiber = fiber, annars 0.
- Finns bara värden per portion: räkna om till per 100 g med portionens vikt.
- name: produktens namn på svenska om det syns, kort (t.ex. "Proteinbar choklad"). brand: märket om det syns, annars tom text.
- servingGrams: portionsstorlek i gram om den står, annars 0. packageGrams: nettovikt i gram om den syns, annars 0.
- readable: false om bilden inte visar någon läsbar näringsvärdestabell.
- notes: högst en kort mening på svenska om något var otydligt, annars tom text.
Svara endast med JSON enligt schemat.`;

export const LABEL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    readable: { type: 'BOOLEAN' },
    name: { type: 'STRING' },
    brand: { type: 'STRING' },
    kcal: { type: 'NUMBER' },
    protein: { type: 'NUMBER' },
    carbs: { type: 'NUMBER' },
    fat: { type: 'NUMBER' },
    fiber: { type: 'NUMBER' },
    servingGrams: { type: 'NUMBER' },
    packageGrams: { type: 'NUMBER' },
    notes: { type: 'STRING' },
  },
  required: ['readable', 'name', 'kcal', 'protein', 'carbs', 'fat', 'fiber'],
};

export const LABEL_FORMAT = `
Svara med exakt ett JSON-objekt och inget annat, på formen:
{"readable": true, "name": "...", "brand": "...", "kcal": 0, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0, "servingGrams": 0, "packageGrams": 0, "notes": ""}`;
