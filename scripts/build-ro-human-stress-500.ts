import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Label = 'get_flight_details' | 'get_gate' | 'get_time_remaining' | 'get_live_tracking' | 'search_knowledge' | 'open_airport_map' | 'clarify' | 'none';
type Spec = { label: Label; count: number; questions: string[] };

const specs: Spec[] = [
  { label: 'get_flight_details', count: 80, questions: [
    'la ce oră pleacă zborul meu', 'avem întârziere la zbor', 'mai e valabilă ora de plecare', 'când aterizează avionul',
    'zborul meu a fost anulat', 'care mai e situația cu zborul', 'a plecat deja avionul', 'care este ora estimată de sosire',
    's-a schimbat programul zborului', 'este zborul la timp', 'ce status are cursa mea', 'cât e întârzierea zborului',
    'la ce oră este decolarea', 'când ajunge cursa RO311', 'zborul W61234 mai pleacă azi', 'ora din bilet mai este corectă',
  ]},
  { label: 'get_gate', count: 70, questions: [
    'care e poarta zborului meu', 'de la ce poartă plec', 'unde trebuie să merg pentru îmbarcare', 's-a schimbat poarta',
    'ce gate am la RO311', 'unde se face boardingul', 'la ce poartă aștept', 'a apărut poarta pentru zborul meu',
    'îmi verifici poarta de plecare', 'pe unde urc în avion', 'care este numărul porții', 'poarta din bilet mai e bună',
    'unde e îmbarcarea pentru W61234', 'am altă poartă acum',
  ]},
  { label: 'get_time_remaining', count: 60, questions: [
    'cât mai am până pleacă avionul', 'în cât timp începe îmbarcarea', 'câte minute mai sunt până la zbor',
    'mai am timp să ajung la poartă', 'cât timp a rămas până la decolare', 'când trebuie să fiu la gate',
    'mai prind zborul dacă ajung acum', 'cât mai e până se închide poarta', 'în cât timp plecăm',
    'câte ore mai sunt până la zbor', 'mai am mult până la boarding', 'cât timp mai am pentru control',
  ]},
  { label: 'get_live_tracking', count: 50, questions: [
    'unde este avionul acum', 'arată-mi avionul pe hartă', 'pe unde zboară cursa mea', 'care e poziția avionului',
    'avionul a ajuns aproape', 'unde se află aeronava', 'pot urmări zborul live', 'ce coordonate are avionul',
    'avionul e încă în aer', 'unde e cursa RO311 în momentul ăsta',
  ]},
  { label: 'search_knowledge', count: 100, questions: [
    'pot lua powerbank în bagajul de mână', 'câte lichide am voie în avion', 'ce dimensiuni poate avea bagajul de cabină',
    'pot călători cu medicamente', 'am voie cu mâncare în avion', 'ce acte îmi trebuie pentru copil',
    'pot lua animalul de companie cu mine', 'ce compensație primesc pentru întârziere', 'am voie cu laptopul în bagaj',
    'pot transporta baterii de rezervă', 'cum procedez dacă mi-au pierdut bagajul', 'ce obiecte sunt interzise la control',
    'pot lua parfum în bagajul de mână', 'care sunt regulile pentru căruciorul copilului', 'am dreptul la despăgubire dacă se anulează zborul',
    'pot zbura dacă sunt însărcinată', 'cât alcool pot lua în bagaj', 'am voie cu țigara electronică',
    'trebuie să scot laptopul la securitate', 'ce fac dacă pașaportul e aproape expirat',
  ]},
  { label: 'open_airport_map', count: 50, questions: [
    'unde este toaleta cea mai apropiată', 'arată-mi drumul spre controlul de securitate', 'unde găsesc un bancomat',
    'cum ajung la terminalul doi', 'unde este biroul de informații', 'găsește-mi o cafenea în aeroport',
    'unde pot fuma în aeroport', 'arată-mi zona de ridicare bagaje', 'unde este lounge-ul',
    'cum ajung la poarta B12',
  ]},
  { label: 'clarify', count: 30, questions: [
    'și acum ce fac', 'unde trebuie să ajung', 'poți să verifici', 'care mai e treaba', 'ajută-mă cu zborul',
    'ce s-a întâmplat', 'unde e chestia aia', 'mai am ceva de făcut', 'cum stăm', 'ce trebuie să știu',
  ]},
  { label: 'none', count: 60, questions: [
    'spune-mi un banc', 'cine a câștigat meciul aseară', 'poți să-mi rezervi un hotel', 'cumpără-mi un bilet de avion',
    'schimbă-mi locul în avion', 'care este vremea la mare săptămâna viitoare', 'scrie-mi o poezie', 'cât costă un taxi până în centru',
    'fă-mi check-in online', 'care e parola de wifi', 'comandă-mi ceva de mâncare', 'poți să-mi anulezi rezervarea',
  ]},
];

const styles = ['plain', 'no-diacritics', 'slang', 'profanity', 'typo', 'terse', 'angry', 'filler', 'punctuation', 'mixed'] as const;
const profanities = ['frate', 'boss', 'bă', 'naibii', 'dracu', 'coaie'];
const contexts = ['sunt deja în aeroport', 'am biletul deschis', 'mă cam grăbesc', 'sunt la terminal', 'întreb pentru cursa de azi', 'nu văd nimic în aplicație', 'vreau răspuns scurt', 'e prima dată când zbor'];

function noDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ș/g, 's').replace(/ț/g, 't');
}

function typo(text: string): string {
  return noDiacritics(text)
    .replace(/poarta/g, 'poartaa').replace(/zborul/g, 'zboru').replace(/avionul/g, 'avionu')
    .replace(/unde/g, 'udne').replace(/care/g, 'crae').replace(/timp/g, 'tpim').replace(/bagajul/g, 'bagaju');
}

function stylize(base: string, style: typeof styles[number], index: number): string {
  const p = profanities[index % profanities.length];
  switch (style) {
    case 'plain': return `${base}?`;
    case 'no-diacritics': return `${noDiacritics(base)}?`;
    case 'slang': return `${p}, ${noDiacritics(base)} ca nu pricep`;
    case 'profanity': return `${base}, unde dracu verific asta?`;
    case 'typo': return `${typo(base)} pls`;
    case 'terse': return noDiacritics(base).replace(/\b(este|meu|mea|pentru)\b/g, '').replace(/\s+/g, ' ').trim();
    case 'angry': return `${noDiacritics(base).toUpperCase()}???`;
    case 'filler': return `salut, scuze că întreb, da ${base}, te rog`;
    case 'punctuation': return `${base}...??? răspunde repede pls`;
    case 'mixed': return `${p} pls, ${typo(base)}, mersi`;
  }
}

const cases: Array<Record<string, unknown>> = [];
let globalIndex = 0;
for (const spec of specs) {
  for (let i = 0; i < spec.count; i += 1) {
    const base = spec.questions[i % spec.questions.length];
    const style = styles[(i + spec.label.length) % styles.length];
    const variant = Math.floor(i / spec.questions.length);
    const question = `${stylize(base, style, i)}${variant > 0 ? `, ${contexts[(variant - 1) % contexts.length]}` : ''}`;
    const execute = !['none', 'clarify'].includes(spec.label);
    cases.push({
      id: `ro-human-${String(++globalIndex).padStart(3, '0')}`,
      question,
      label: spec.label,
      lang: 'ro',
      style,
      expectedAny: execute ? [spec.label] : [],
      expectedAction: spec.label === 'clarify' ? 'clarify' : spec.label === 'none' ? 'none' : 'execute',
      forbidden: spec.label === 'none' ? ['get_flight_details', 'get_gate', 'get_time_remaining', 'get_live_tracking', 'search_knowledge', 'open_airport_map'] : [],
      origin: 'synthetic-ro-human-stress-v1',
      verified: true,
      annotation: 'deterministic Romanian robustness stress case; not training data',
    });
  }
}

if (cases.length !== 500) throw new Error(`expected 500 cases, got ${cases.length}`);
const unique = new Set(cases.map((row) => row.question));
if (unique.size !== cases.length) throw new Error(`duplicate questions: ${cases.length - unique.size}`);
const output = join(process.cwd(), 'eval', 'ro-human-stress-500.json');
writeFileSync(output, JSON.stringify(cases, null, 2), 'utf8');
console.log(JSON.stringify({ total: cases.length, unique: unique.size, labels: Object.fromEntries(specs.map((s) => [s.label, s.count])) }, null, 2));
