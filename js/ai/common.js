// Delas av alla AI-leverantörer: feltyp, instruktioner och svarsschema.

export class AiError extends Error {
  // code: 'no-key' | 'auth' | 'rate-limit' | 'model' | 'network' | 'timeout' | 'unavailable' | 'bad-response'
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
