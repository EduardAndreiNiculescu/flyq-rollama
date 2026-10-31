/** The EU-wide emergency number, also used in the app's passenger guide. */
export const EU_EMERGENCY_NUMBER = '112';

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2019\u2018]/g, "'").replace(/\s+/g, ' ').trim();

/** Broader than the immediate shortcut: an informational emergency question may still need a model answer. */
export function isEmergencyRelated(question: string): boolean {
  return /\b(?:emergenc\w*|urgent\w*|ambulanc\w*|urgen\w*|ambulant\w*|112)\b/.test(plain(question));
}

/** Only unmistakable requests for immediate help bypass model loading and network access. */
export function urgentSafetyAnswer(question: string, preferred: 'ro' | 'en' = 'ro'): string | null {
  const q = plain(question)
    .replace(/\bnu (?:am|avem) nevoie de (?:o )?ambulanta\b/g, ' ')
    .replace(/\bnu (?:am|avem) nevoie de ajutor urgent\b|\bnu (?:chema|chemati|suna|sunati) (?:o )?ambulanta\b/g, ' ')
    .replace(/\b(?:i|we) (?:do not|don't) need an ambulance\b/g, ' ')
    .replace(/\b(?:do not|don't) call (?:an? |the )?ambulance\b/g, ' ')
    .replace(/\bnu a lesinat\b|\bnu (?:e|este) inconstient(?:a)?\b/g, ' ')
    .replace(/\bnu (?:e|este) (?:o )?urgenta\b|\b(?:it is not|it's not|not) an emergency\b/g, ' ');
  const ro = /^(?:ajutor|ajutor acum|ajuta-ma|urgenta|ambulanta|sos|salvati-ma)[!?. ]*$|\b(?:am|avem|e|este) (?:o )?urgenta\b|\b(?:am nevoie de|cheama|chemati|suna|sunati) (?:o )?ambulanta\b|\b(?:am|avem) nevoie de ajutor urgent\b|\bnu pot respira\b|\ba lesinat\b|\b(?:e|este) inconstient(?:a)?\b|\b(?:este|e|avem) (?:un )?incendiu\b/.test(q);
  const en = /^(?:help|help me|help me now|emergency|ambulance|sos)[!?. ]*$|\b(?:this is|it is|it's|we have) an? emergency\b|\b(?:i need|we need|call|send) (?:an? |the )?ambulance\b|\b(?:i|we) (?:can't|cannot) breathe\b|\b(?:collapsed|fainted|unconscious)\b|\bthere is a fire\b/.test(q);
  if (!ro && !en) return null;
  const lang = ro && !en ? 'ro' : en && !ro ? 'en' : preferred;
  return lang === 'ro'
    ? `Dacă este o urgență în UE, sună acum la ${EU_EMERGENCY_NUMBER}. Cere ajutor celui mai apropiat angajat al aeroportului. Nu pot apela eu serviciile de urgență.`
    : `If this is an emergency in the EU, call ${EU_EMERGENCY_NUMBER} now. Ask the nearest airport staff member for help. I cannot call emergency services for you.`;
}
