import euPack from '../data/eu-knowledge.json';
import type { KbEntry } from './types';

const EU261 = {
  name: 'Regulation (EC) No 261/2004 (air passenger rights)',
  url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32004R0261',
  jurisdiction: 'EU',
  verifiedOn: null, // TODO(human): verify text against source before release
};
const EU_AVSEC = {
  name: 'EU aviation security - European Commission',
  url: 'https://transport.ec.europa.eu/transport-modes/air/security_en',
  jurisdiction: 'EU',
  verifiedOn: null,
};
const AIR_RIGHTS = {
  name: 'Your Europe - Air passenger rights',
  url: 'https://europa.eu/youreurope/citizens/travel/passenger-rights/air/',
  jurisdiction: 'EU',
  verifiedOn: '2026-10-29',
};
const AIR_FAQ = {
  name: 'Your Europe - Air passenger rights FAQ',
  url: 'https://europa.eu/youreurope/citizens/travel/passenger-rights/air/faq/index_en.htm',
  jurisdiction: 'EU',
  verifiedOn: '2026-10-29',
};
const CRA_SECURITY = {
  name: 'Aeroportul Craiova - Controlul de securitate',
  url: 'https://aeroportcraiova.ro/controlul-de-securitate/',
  jurisdiction: 'RO',
  verifiedOn: '2026-10-29',
};
const GENERIC = {
  name: 'General passenger guidance (team-written, NOT an official source)',
  url: 'about:blank',
  verifiedOn: null,
};

/**
 * MVP seed content. An entry is UNVERIFIED while its source.verifiedOn is null; it becomes verified only when
 * a person has read the cited page and compared it with the text. The prompt tells the model to say so.
 */
const SEED_ENTRIES: KbEntry[] = [
  {
    id: 'term-gate-en', topic: 'terminology', lang: 'en', title: 'Gate, boarding and final call',
    body: 'The gate is the numbered door where you board. Boarding opens before departure; "final call" means boarding is about to close. Gates can change, so always check the airport screens.',
    keywords: ['gate', 'boarding', 'final call', 'terminology', 'airside'], source: GENERIC, mayBeOutdated: false,
  },
  {
    id: 'term-gate-ro', topic: 'terminology', lang: 'ro', title: 'Poartă (gate), îmbarcare, ultimul apel',
    body: 'Poarta (gate) este ușa numerotată pe unde te îmbarci. Îmbarcarea începe înainte de decolare; „ultimul apel" (final call) înseamnă că îmbarcarea se închide în curând. Poarta se poate schimba, deci verifică mereu ecranele din aeroport.',
    keywords: ['poarta', 'gate', 'imbarcare', 'ultimul apel', 'final call', 'terminologie'], source: GENERIC, mayBeOutdated: false,
  },
  {
    id: 'security-liquids-en', topic: 'security', lang: 'en', title: 'Security screening and liquids',
    body: 'At Craiova Airport, take laptops and other electronic devices out of your hand baggage for screening. Containers over 100 ml cannot go through security. Check the prohibited-items list before packing and follow staff instructions.',
    keywords: ['security', 'liquids', '100 ml', 'screening', 'laptop', 'hand baggage', 'craiova'], source: CRA_SECURITY, mayBeOutdated: true,
  },
  {
    id: 'security-liquids-ro', topic: 'security', lang: 'ro', title: 'Controlul de securitate și lichidele',
    body: 'La Aeroportul Craiova, scoate laptopurile și alte echipamente electronice din bagajul de mână pentru control. Recipientele de peste 100 ml nu trec de securitate. Verifică lista obiectelor interzise înainte să faci bagajul și urmează indicațiile personalului.',
    keywords: ['securitate', 'control', 'lichide', '100 ml', 'laptop', 'bagaj de mana', 'craiova'], source: CRA_SECURITY, mayBeOutdated: true,
  },
  {
    id: 'baggage-allowance-en', topic: 'baggage', lang: 'en', title: 'Baggage allowance depends on the airline',
    body: 'Cabin and checked baggage size, weight and fees are set by your airline and fare, not by the airport. Check your booking confirmation. Exceeding limits at the gate can mean extra fees.',
    keywords: ['baggage', 'luggage', 'cabin', 'checked', 'weight', 'allowance', 'fee'], source: GENERIC, mayBeOutdated: true,
  },
  {
    id: 'baggage-allowance-ro', topic: 'baggage', lang: 'ro', title: 'Bagajul permis depinde de compania aeriană',
    body: 'Dimensiunea, greutatea și taxele pentru bagajul de cabină și cel de cală sunt stabilite de compania aeriană și tariful tău, nu de aeroport. Verifică confirmarea rezervării. Depășirea limitelor la poartă poate genera taxe suplimentare.',
    keywords: ['bagaj', 'bagaje', 'cabina', 'cala', 'greutate', 'taxa', 'valiza'], source: GENERIC, mayBeOutdated: true,
  },
  {
    id: 'baggage-lost-en', topic: 'baggage', lang: 'en', title: 'Delayed or missing baggage',
    body: 'If your bag does not arrive, tell the airline as soon as possible (at the baggage service desk in arrivals if you are still at the airport) and ask for a written report reference (PIR). Keep your baggage tag and receipts for essential purchases. A written claim to the airline is due within 7 days if the bag is damaged, and within 21 days after you receive it if it was delayed.',
    keywords: ['lost', 'missing', 'delayed', 'baggage', 'luggage', 'pir', 'claim'], source: { ...AIR_RIGHTS, verifiedOn: null }, mayBeOutdated: true,
  },
  {
    id: 'baggage-lost-ro', topic: 'baggage', lang: 'ro', title: 'Bagaj întârziat sau pierdut',
    body: 'Dacă bagajul nu ajunge, anunță compania aeriană cât mai repede (la biroul de bagaje din zona de sosiri, dacă ești încă în aeroport) și cere o referință scrisă (PIR). Păstrează eticheta bagajului și bonurile pentru achizițiile esențiale. Reclamația scrisă către companie se face în 7 zile dacă bagajul e deteriorat și în 21 de zile de la primirea lui dacă a întârziat.',
    keywords: ['pierdut', 'disparut', 'nu a ajuns', 'intarziat', 'bagaj', 'valiza', 'pir', 'reclamatie', 'lipsa'], source: { ...AIR_RIGHTS, verifiedOn: null }, mayBeOutdated: true,
  },
  {
    id: 'rights-delay-en', topic: 'passenger_rights', lang: 'en', title: 'Cancellation, long delay and denied boarding (EU)',
    body: 'In the EU, passengers affected by cancellations, long delays or denied boarding may be entitled to assistance (meals, communication, sometimes accommodation), re-routing or refund, and in some cases compensation. Eligibility depends on distance, delay length and cause. This is general information, not legal advice; ask the airline.',
    keywords: ['delay', 'delayed', 'cancelled', 'canceled', 'cancellation', 'compensation', 'rights', 'denied boarding', 'refund'], source: AIR_RIGHTS, mayBeOutdated: true,
  },
  {
    id: 'rights-delay-ro', topic: 'passenger_rights', lang: 'ro', title: 'Anulare, întârziere mare, refuz îmbarcare (UE)',
    body: 'În UE, pasagerii afectați de anulări, întârzieri mari sau refuzul îmbarcării pot avea dreptul la asistență (mese, comunicații, uneori cazare), redirecționare sau rambursare și, în unele cazuri, compensație. Eligibilitatea depinde de distanță, durata întârzierii și cauză. Sunt informații generale, nu consiliere juridică; întreabă compania aeriană.',
    keywords: ['intarziere', 'intarziat', 'anulat', 'anulare', 'compensatie', 'drepturi', 'refuz', 'rambursare', 'zbor pierdut'], source: AIR_RIGHTS, mayBeOutdated: true,
  },
  {
    id: 'missed-flight-en', topic: 'missed_flight', lang: 'en', title: 'You missed your flight',
    body: 'Go to your airline desk or service point straight away and ask about rebooking options. Do not assume a refund or free rebooking: it depends on the fare and why you missed it. Keep all documents.',
    keywords: ['missed', 'miss', 'late', 'flight', 'rebook'], source: GENERIC, mayBeOutdated: false,
  },
  {
    id: 'missed-flight-ro', topic: 'missed_flight', lang: 'ro', title: 'Ai pierdut zborul',
    body: 'Mergi imediat la biroul companiei aeriene și întreabă despre reprogramare. Nu presupune rambursare sau reprogramare gratuită: depinde de tarif și de motivul pierderii zborului. Păstrează toate documentele.',
    keywords: ['pierdut', 'am pierdut', 'zborul', 'intarziat', 'reprogramare', 'avion'], source: GENERIC, mayBeOutdated: false,
  },
  {
    id: 'docs-lost-en', topic: 'travel_documents', lang: 'en', title: 'Lost or forgotten travel documents',
    body: 'A photo or scan of a passport or ID does not replace the original document for border control or boarding. If a document is lost, contact the police and your country\'s embassy or consulate for emergency travel documents, and tell your airline. Rules differ by country.',
    keywords: ['passport', 'id', 'document', 'lost', 'forgot', 'visa', 'embassy', 'scan'], source: GENERIC, mayBeOutdated: true,
  },
  {
    id: 'docs-lost-ro', topic: 'travel_documents', lang: 'ro', title: 'Documente de călătorie pierdute sau uitate',
    body: 'O fotografie sau o scanare a pașaportului ori a buletinului nu înlocuiește documentul original la controlul de frontieră sau la îmbarcare. Dacă ai pierdut un document, anunță poliția și ambasada sau consulatul țării tale pentru documente provizorii și informează compania aeriană. Regulile diferă în funcție de țară.',
    keywords: ['pasaport', 'buletin', 'document', 'documente', 'pierdut', 'uitat', 'viza', 'ambasada', 'carte de identitate'], source: GENERIC, mayBeOutdated: true,
  },
  {
    id: 'emergency-en', topic: 'emergency', lang: 'en', title: 'Emergencies',
    body: 'In any emergency in the EU dial 112. Inside the airport, go to the nearest staff member or information desk. Do not rely on this app for urgent medical or safety help.',
    keywords: ['emergency', 'help', 'medical', 'police', 'ambulance', '112'], source: GENERIC, mayBeOutdated: false,
  },
  {
    id: 'emergency-ro', topic: 'emergency', lang: 'ro', title: 'Urgențe',
    body: 'În caz de urgență în UE sună la 112. În aeroport, mergi la cel mai apropiat angajat sau la biroul de informații. Nu te baza pe această aplicație pentru urgențe medicale sau de siguranță.',
    keywords: ['urgenta', 'urgente', 'ajutor', 'medical', 'politie', 'ambulanta', '112'], source: GENERIC, mayBeOutdated: false,
  },
  {
    id: 'boarding-en', topic: 'boarding', lang: 'en', title: 'Check-in and boarding deadlines',
    body: 'You must check in and present yourself for boarding within the time set by your airline. If you arrive after the deadlines you can be refused boarding, and you may have no right to compensation. Check your airline\'s exact deadlines on your ticket.',
    keywords: ['check-in', 'checkin', 'boarding', 'gate', 'boarding pass', 'close', 'late', 'refused', 'deadline'], source: AIR_FAQ, mayBeOutdated: true,
  },
  {
    id: 'boarding-ro', topic: 'boarding', lang: 'ro', title: 'Termenele de check-in și îmbarcare',
    body: 'Trebuie să faci check-in și să te prezinți la îmbarcare în termenul stabilit de compania aeriană. Dacă ajungi după termene, îmbarcarea îți poate fi refuzată, iar compensația poate să nu ți se cuvină. Verifică termenele exacte ale companiei pe bilet.',
    keywords: ['check-in', 'checkin', 'imbarcare', 'poarta', 'cartea de imbarcare', 'ghiseu', 'intarziat', 'termen', 'refuz'], source: AIR_FAQ, mayBeOutdated: true,
  },
];

type EuFile = {
  checkedOn: string;
  sources: Record<string, { name: string; url: string; jurisdiction: string }>;
  entries: {
    id: string; topic: string; source: string; checked: boolean; mayBeOutdated: boolean; keywords: string[];
    ro: { title: string; body: string }; en: { title: string; body: string };
  }[];
};

/** Expand the bilingual JSON pack into one KbEntry per language. verifiedOn is set only when checked=true. */
function expandEu(file: EuFile): KbEntry[] {
  return file.entries.flatMap((e) =>
    (['ro', 'en'] as const).map((lang) => ({
      id: `${e.id}_${lang}`, topic: e.topic, lang, title: e[lang].title, body: e[lang].body, keywords: e.keywords,
      source: { ...file.sources[e.source], verifiedOn: e.checked ? file.checkedOn : null },
      mayBeOutdated: e.mayBeOutdated,
    })),
  );
}

export const KNOWLEDGE_BASE: KbEntry[] = [...SEED_ENTRIES, ...expandEu(euPack as EuFile)];

const STOP = new Set(['the', 'a', 'an', 'is', 'to', 'and', 'of', 'i', 'my', 'in', 'what', 'do', 'if', 'for', 'si', 'la', 'de', 'ce', 'cum', 'un', 'o', 'pe', 'cu', 'este', 'am', 'mi', 'in']);

export function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export type Retrieved = { entry: KbEntry; score: number };

export type KnowledgeSafety = {
  allowed: boolean;
  reason?: 'prompt-injection' | 'unsupported-jurisdiction' | 'unsupported-topic' | 'ambiguous-jurisdiction';
};

/** Guard retrieval before lexical matching. Documents are data, never instructions. */
export function assessKnowledgeSafety(query: string): KnowledgeSafety {
  const q = normalize(query).join(' ');
  const injection = /ignore (all|previous|prior|the) instructions|ignore .*legal training|disregard (all|previous|prior)|ignor(a|ă) toate regulile|system prompt|reveal (the )?prompt|jailbreak|developer message|system override|instrucțiune de sistem|dan mode|admin token|bypass (all|the )?(filters|security)|bypass .*database|dump (memory|state)|drop table|select \*|raw json|delete all|invent(eaza|ă|a) (o )?(lege|law)|rescrie regulile|forget .*persona|script alert|xss exploit|return .*tool.?call|weapons? (are )?allowed|manufacture .*explosive|spune.*(nu are nevoie|gratuit)|convert all documents|captain ordered|restrictions cancelled|uncertified lithium fireworks/.test(q);
  if (injection) return { allowed: false, reason: 'prompt-injection' };

  // This offline pack is EU/RO scoped. Do not answer a US/UK/non-EU question
  // with an EU document merely because both contain words such as "liquids".
  const unsupported = /\b(usa|us|united states|america|canada|canadian|mexic|mexican|uk|united kingdom|anglia|marea britanie|london|australia|india|japan|china|serbia|moldova|elvetia|switzerland|norway|egipt|egypt|turkey|turcia|thailand|tailanda|qatar|doha|africa|new york|jfk|tsa|heathrow|american airlines|orientul mijlociu|middle east|fin cen|non eu|non-eu)\b/.test(q);
  if (unsupported) return { allowed: false, reason: 'unsupported-jurisdiction' };
  // Stems, not whole words: Romanian inflects ("lichide", "bagajul", "documentele"); a whole-word list refused "Am voie cu lichide?" as off-topic.
  const aviation = /\b(?:airport|aeroport|flight|zbor|airline|companie aeriana|passenger|pasager|boarding|imbarc|gate|poart|baggage|bagaj|luggage|pierd|disparut|lost|missing|lichid|liquid|passport|pasaport|security|securit|customs|vam|visa|viz|animal|pisic|caine|wheelchair|scaun|rotile|delay|intarzier|cancel|anulat|compensat|despagub|rights|drepturi|carry|lua|travel|calator|plane|avion|terminal|duty free|schengen|document|buletin|bebelus|copil|medicament|laptop|electronic|mancare|cabin|valiz|troler|check in|checkin|bilet|ticket|control|powerbank|baterie|cala|geanta|voie|permis|interzis|allowed|prohibited|bring|alcool|parfum|bricheta|tigar|cutit|foarfec|asisten|instrument|bicicl|echipament)\w*|\b(?:pet|apa|bag|id|vin|bere)\b/.test(q);
  if (!aviation) return { allowed: false, reason: 'unsupported-topic' };
  // Word boundaries: without them "tent" matched "asistenta" and "cort" other words, so every question with "asistenta" was refused as off-topic.
  const unrelated = /\b(?:bitcoin|sarmale|train ticket|curs valutar|leaking bathroom|iphone 15|marriott|permanent resident|football|detergent|apartment price|tigaie|parcare.*trotineta|trotineta|espresso|programming language|metrou|pariuri|windows 11|macintosh|property taxes|vin rosu|sightseeing|stocks|actiuni|sala de culturism|autostrada|tigru|tiger|driving license|permis de conducere|cort|tent|adopt|adopta|stray|vagabond|street cat)\b/.test(q);
  if (unrelated) return { allowed: false, reason: 'unsupported-topic' };
  return { allowed: true };
}

/**
 * Synonym groups (RO + EN, diacritics optional: everything goes through normalize()).
 * Passengers paraphrase ("geamantan", "m-au lasat pe tusa") while the KB keywords are
 * formal ("bagaj", "refuz imbarcare"); a group bridges the two. Multi-word terms are
 * matched as phrases. Groups are topical, not exhaustive: keep them short and specific,
 * because a generic word in a group would make out-of-scope queries match.
 */
export const SYNONYM_GROUPS: string[][] = [
  ['bagaj', 'bagaje', 'valiza', 'valize', 'geamantan', 'geanta', 'troler', 'troleu', 'baggage', 'luggage', 'suitcase', 'bag', 'bags', 'trolley'],
  ['pierdut', 'disparut', 'dispare', 'lipsa', 'lost', 'missing', 'nu a ajuns', 'nu a aparut', 'nu a venit', 'never arrived', 'did not arrive', 'showed up', 'went missing'],
  ['deteriorat', 'stricat', 'rupt', 'spart', 'avariat', 'damaged', 'broken', 'torn', 'destroyed'],
  ['anulat', 'anulare', 'anulata', 'cancelled', 'canceled', 'cancel', 'scrapped', 'called off'],
  ['rambursare', 'rambursat', 'banii inapoi', 'inapoi banii', 'bani inapoi', 'refund', 'money back', 'reimbursement', 'reimburse'],
  ['compensatie', 'despagubire', 'despagubiri', 'compensation', 'compensate', 'owed'],
  ['intarziere', 'intarziat', 'intarzie', 'delay', 'delayed', 'late', 'hours late'],
  ['suprarezervare', 'overbooking', 'refuz', 'refuzat', 'denied boarding', 'bumped', 'lasat tusa', 'too many seats', 'prea multe locuri', 'not allowed on', 'refused boarding'],
  ['imbarcare', 'imbarcat', 'boarding', 'board'],
  ['caine', 'catel', 'catelus', 'pisica', 'animal', 'animale', 'pet', 'pets', 'dog', 'puppy', 'kitten', 'ferret', 'dihor', 'microcip', 'vaccin'],
  ['scaun cu rotile', 'scaun rulant', 'rotile', 'mobilitate', 'wheelchair', 'dizabilitate', 'handicap', 'invalid', 'disability', 'cannot walk', 'electric wheelchair'],
  ['copil', 'copii', 'bebelus', 'minor', 'minori', 'child', 'children', 'kid', 'kids', 'baby', 'toddler', 'infant', 'nepot', 'fiica'],
  ['pasaport', 'buletin', 'act', 'acte', 'carte de identitate', 'id', 'passport', 'identity card', 'paperwork', 'documente', 'document'],
  ['urgenta', 'urgente', 'ambulanta', 'ambulance', 'emergency', 'politie', 'police', 'doctor', 'medic', 'pompieri', 'heart attack', 'collapsed', 'face rau', 'ajutor'],
  ['lichid', 'lichide', 'apa', 'sticla', 'gel', 'water', 'bottle', 'liquid', 'liquids', 'drink'],
  ['powerbank', 'power bank', 'baterie externa', 'acumulator extern', 'baterie', 'baterii', 'litiu', 'lithium', 'battery', 'batteries'],
  ['medicament', 'medicamente', 'insulina', 'insulin', 'medicine', 'medication', 'pastile', 'pills', 'tratament'],
  ['briceag', 'cutit', 'foarfeca', 'foarfece', 'ascutit', 'knife', 'scissors', 'blade', 'razor', 'pocket knife', 'sharp'],
  ['petarde', 'artificii', 'explozibili', 'explosive', 'fireworks', 'inflamabil', 'gunpowder', 'munitie'],
  ['securitate', 'control', 'scanner', 'screening', 'security', 'detector'],
  ['bagaj de mana', 'bagaj cabina', 'cabina', 'carry-on', 'carry on', 'cabin', 'hand luggage', 'hand baggage'],
  ['greutate', 'kg', 'kilograme', 'cantareste', 'cantari', 'weight', 'heavy', 'weigh', 'dimensiuni', 'marime', 'size'],
  ['duty free', 'dutyfree', 'alcool', 'parfum', 'vin', 'wine', 'perfume', 'sealed', 'sigilat'],
  ['masa', 'mancare', 'hotel', 'cazare', 'food', 'meals', 'accommodation', 'refreshments'],
  ['poarta', 'gate', 'inchide', 'close', 'closes'],
  ['frontiera', 'border', 'schengen', 'vama', 'customs'],
  ['ambasada', 'consulat', 'embassy', 'consulate'],
  ['strainatate', 'abroad', 'foreign'],
];

/** Prefix-tolerant matching so "bagajul"/"bagaj" and "delayed"/"delay" hit. */
function tokenMatch(q: string, d: string): boolean {
  if (q === d) return true;
  const n = Math.min(q.length, d.length);
  return n >= 4 && (q.startsWith(d.slice(0, n)) || d.startsWith(q.slice(0, n))) && Math.abs(q.length - d.length) <= 4;
}

// Expanded (synonym) matches count less than literal ones (kw 3 / text 1).
const W_LITERAL_KW = 3;
const W_LITERAL_TEXT = 1;
const W_SYN_KW = 2;
const W_SYN_TEXT = 0.7;
// A query word that appears nowhere in the KB is exactly the paraphrase case
// ("geamantan", "briceag"): its group is the only way to reach the right entry.
const OOV_BOOST = 3;
const SYN_COVERAGE = 0.4;
// Literal keyword hits on generic tokens (in many entries) are worth less than rare ones.
const IDF_FLOOR = 0.5;
const MIN_SCORE = 3;

type Group = { words: string[]; phrases: string[] };
const GROUPS: Group[] = SYNONYM_GROUPS.map((terms) => {
  const norm = terms.map((t) => normalize(t));
  return {
    words: norm.filter((t) => t.length === 1).map((t) => t[0]),
    phrases: norm.filter((t) => t.length > 1).map((t) => t.join(' ')),
  };
});

type Index = { kwTokens: string[]; textTokens: string[]; kwStr: string; textStr: string };
const indexCache = new WeakMap<KbEntry[], { idx: Index[]; vocab: string[] }>();

/** 0..1: how rare a token is among entries' keywords (generic words like "bagaj" are near 0). */
function rarity(q: string, idx: Index[]): number {
  const df = idx.filter((i) => i.kwTokens.some((t) => tokenMatch(q, t))).length;
  return df <= 1 ? 1 : Math.max(0, 1 - Math.log(df) / Math.log(Math.max(2, idx.length)));
}
function indexKb(kb: KbEntry[]) {
  let hit = indexCache.get(kb);
  if (!hit || hit.idx.length !== kb.length) {
    const idx = kb.map((e) => {
      const kwTokens = e.keywords.flatMap(normalize);
      const textTokens = normalize(e.title + ' ' + e.body);
      return {
        kwTokens, textTokens,
        kwStr: ' ' + e.keywords.map((k) => normalize(k).join(' ')).join(' | ') + ' ',
        textStr: ' ' + textTokens.join(' ') + ' ',
      };
    });
    hit = { idx, vocab: [...new Set(idx.flatMap((i) => [...i.kwTokens, ...i.textTokens]))] };
    indexCache.set(kb, hit);
  }
  return hit;
}

/** Groups triggered by the query, with a flag for "trigger word unknown to the KB". */
export function expandQuery(query: string, vocab: string[] = []): { group: number; oov: boolean }[] {
  const qt = normalize(query);
  const joined = ' ' + qt.join(' ') + ' ';
  const out: { group: number; oov: boolean }[] = [];
  GROUPS.forEach((g, gi) => {
    const word = qt.find((q) => g.words.some((w) => tokenMatch(q, w)));
    const phrase = g.phrases.some((p) => joined.includes(' ' + p + ' '));
    if (word === undefined && !phrase) return;
    const oov = phrase || (word !== undefined && !vocab.some((v) => tokenMatch(word, v)));
    out.push({ group: gi, oov });
  });
  return out;
}

/**
 * Lightweight lexical retrieval over the in-memory KB. Unit-testable on Node;
 * the app can swap in a SQLite FTS5 implementation behind the same signature.
 * Literal query tokens score as before; synonym-group expansion adds lower-weight
 * evidence, so the MIN_SCORE gate still rejects off-topic queries.
 */
export function retrieve(
  query: string,
  lang: 'en' | 'ro' | null,
  k = 3,
  kb: KbEntry[] = KNOWLEDGE_BASE,
): Retrieved[] {
  // RO "cât" loses its diacritic in normalize() and would match the keyword "cat" (the animal).
  const qt = normalize(query).filter((t) => !(lang === 'ro' && t === 'cat'));
  if (qt.length === 0) return [];
  const { idx, vocab } = indexKb(kb);
  const groups = expandQuery(qt.join(' '), vocab);
  const rar = new Map(qt.map((q) => [q, rarity(q, idx)] as const));
  const scored = kb.map((entry, i) => {
    const { kwTokens, textTokens, kwStr, textStr } = idx[i];
    let score = 0;
    let rare = 0; // tie-break: entries matching the query's rare words first ("caine" beats "cabina")
    let exact = 0; // tie-break 2: the query word is a keyword on its own, not only a part of a phrase
    for (const q of qt) {
      if (kwTokens.some((t) => tokenMatch(q, t))) {
        score += W_LITERAL_KW * (IDF_FLOOR + (1 - IDF_FLOOR) * rar.get(q)!);
        rare += rar.get(q)!;
        if (kwStr.includes(' ' + q + ' |') || kwStr.endsWith(' ' + q + ' ')) exact += 1;
      }
      else if (textTokens.some((t) => tokenMatch(q, t))) score += W_LITERAL_TEXT;
    }
    for (const { group, oov } of groups) {
      const g = GROUPS[group];
      const kwHits = g.words.filter((w) => kwTokens.some((t) => tokenMatch(w, t))).length + g.phrases.filter((p) => kwStr.includes(' ' + p)).length;
      const inKw = kwHits > 0;
      const inText = !inKw && (g.words.some((w) => textTokens.some((t) => tokenMatch(w, t))) || g.phrases.some((p) => textStr.includes(' ' + p)));
      // for paraphrase triggers, several synonyms in the entry's keywords = the entry is really about this concept
      const w = inKw ? W_SYN_KW + (oov ? SYN_COVERAGE * Math.min(kwHits - 1, 3) : 0) : inText ? W_SYN_TEXT : 0;
      score += w ? w + (oov ? OOV_BOOST : 0) : 0;
    }
    if (lang && entry.lang === lang) score *= 1.5;
    return { entry, score, rare, exact };
  });
  return scored.filter((s) => s.score >= MIN_SCORE).sort((a, b) => b.score - a.score || b.rare - a.rare || b.exact - a.exact).slice(0, k).map(({ entry, score }) => ({ entry, score }));
}

export function formatForPrompt(hits: Retrieved[]): string {
  if (hits.length === 0) return '(no relevant offline documents found)';
  return hits
    .map(({ entry: e }, i) => {
      const v = e.source.verifiedOn ? `verified ${e.source.verifiedOn}` : 'NOT VERIFIED';
      const stale = e.mayBeOutdated ? '; may be outdated' : '';
      return `[DOC ${i + 1}] ${e.title}\n${e.body}\n(source: ${e.source.name}; ${v}${stale})`;
    })
    .join('\n\n');
}
