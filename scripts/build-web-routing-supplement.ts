import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Label = 'get_flight_details' | 'get_gate' | 'none';
type Seed = { question: string; label: Label; sourceUrl: string; sourceName: string };

const statusSources = {
  ryanair: ['Ryanair Airport & Flight Information', 'https://help.ryanair.com/hc/en-gb/sections/12502418324241-Airport-Flight-Information'],
  jetblue: ['JetBlue Flight Status FAQ', 'https://www.jetblue.com/help/flight-status'],
  changi: ['Changi Airport FAQ', 'https://www.changiairport.com/en/help/assistance/faq.html'],
  sita: ['SITA Flight Status Overview', 'https://www.developer.aero/api-catalog/flight-status-overview'],
} as const;
const gateSources = {
  transavia: ['Transavia gate FAQ', 'https://www.transavia.com/help/en-eu/preparation-and-check-in/airport/gate-flight'],
  phl: ['PHL Boarding Passes & Flight Information', 'https://phl.helpscoutdocs.com/article/365-boarding-passes-flight-information'],
  jetblue: statusSources.jetblue,
  ryanair: statusSources.ryanair,
} as const;
const noneSources = {
  aa: ['American Airlines FAQ', 'https://www.aa.com/web/i18n/customer-service/support/flying-with-american.html'],
  gva: ['Geneva Airport FAQ', 'https://www.gva.ch/en/passengers/travel-preparation/faq'],
  sydney: ['Sydney Airport FAQ', 'https://www.sydneyairport.com.au/info-sheet/contact-us-faq'],
  yyc: ['Calgary Airport FAQ', 'https://www.yyc.com/at-the-airport/faqs'],
} as const;

const mk = (questions: string[], label: Label, source: readonly [string, string]): Seed[] =>
  questions.map((question) => ({ question, label, sourceName: source[0], sourceUrl: source[1] }));

const rows: Seed[] = [
  ...mk([
    'Is my flight RO311 still on time?', 'Has flight W61234 been delayed?', 'What is the current status of my flight?',
    'Did my flight leave on schedule?', 'Has the departure time changed?', 'Is the arrival of RO311 delayed?',
    'What is the latest estimated departure time?', 'Has my flight been cancelled today?',
  ], 'get_flight_details', statusSources.ryanair),
  ...mk([
    'What time is my flight scheduled to arrive?', 'Has the estimated arrival time changed?',
    'Is my plane expected to depart late?', 'What is the scheduled departure for DEMO123?',
    'Does my itinerary show local arrival time?', 'Has my flight already departed?',
    'Is the inbound flight running behind schedule?', 'What is the updated arrival time for my plane?',
  ], 'get_flight_details', statusSources.jetblue),
  ...mk([
    'What is the difference between my scheduled and estimated departure?',
    'What is the latest ETA for my flight?', 'Is the flight listed as boarding or delayed?',
    'Has my flight status changed to cancelled?', 'What does the departure board say about my flight?',
    'Is my flight expected or already departed?', 'What is the estimated time of arrival?',
  ], 'get_flight_details', statusSources.changi),
  ...mk([
    'Is my flight en route now?', 'Has the aircraft arrived at the airport?', 'Is the flight diverted?',
    'Does the provider mark my flight as departed?', 'Is the status still expected?',
    'What status code is reported for my flight?', 'Has the plane landed yet?',
  ], 'get_flight_details', statusSources.sita),

  ...mk([
    'From which gate does my flight depart?', 'What is the boarding gate for RO311?',
    'Has a gate been assigned to my flight?', 'Which gate should I go to for W61234?',
    'What gate is shown for my departure?', 'Can you tell me my departure gate number?',
    'Has my boarding gate been announced?', 'Where does my flight board?',
  ], 'get_gate', gateSources.transavia),
  ...mk([
    'Did the gate for my flight change?', 'Is the gate on my boarding pass still correct?',
    'What is the latest gate assignment?', 'The monitor shows another gate; which gate is current?',
    'Why is no gate number listed for my flight?', 'Has the airport published my gate yet?',
    'Which gate is assigned to DEMO123?', 'Can you confirm the new gate after a gate change?',
  ], 'get_gate', gateSources.phl),
  ...mk([
    'Does my boarding pass have an outdated gate?', 'What gate does my plane leave from?',
    'Is my flight leaving from gate B12?', 'Where can I see the latest gate for my flight?',
    'Has my terminal or gate changed?', 'Which boarding gate is correct for my itinerary?',
    'What gate should I wait at?',
  ], 'get_gate', gateSources.jetblue),
  ...mk([
    'What gate number is displayed for my flight?', 'Has Ryanair updated my boarding gate?',
    'Which gate is listed in the travel assistant?', 'Do I have a gate assignment yet?',
    'What is my gate for today’s departure?', 'Can you check the gate for flight RO311?',
    'Has the departure gate changed since check-in?',
  ], 'get_gate', gateSources.ryanair),

  ...mk([
    'Can you upgrade my seat to business class?', 'How many loyalty miles will this trip earn?',
    'Can you change the name printed on my ticket?', 'What is the cheapest fare for next month?',
    'Can you book a window seat for me?', 'Why was my credit card declined when buying the ticket?',
    'Can I use airline miles to pay for this booking?', 'What meal did I select in my reservation?',
  ], 'none', noneSources.aa),
  ...mk([
    'What exchange rate does the airport currency desk offer today?', 'Can you reserve an airport locker for me?',
    'What shops are open at Geneva Airport tonight?', 'Can you purchase lounge access for me?',
    'What is the Wi-Fi password at this airport?', 'Can you make a restaurant reservation in the terminal?',
    'How much cash can the airport ATM dispense?', 'Can you buy a local SIM card for me?',
  ], 'none', noneSources.gva),
  ...mk([
    'How much does parking cost for five days?', 'Can you reserve an airport parking space?',
    'Which lounge membership is cheapest?', 'Can you connect my phone to the airport Wi-Fi?',
    'What currency exchange commission will I pay?', 'Can you order a taxi from the airport?',
    'Which restaurant has the best reviews?',
  ], 'none', noneSources.sydney),
  ...mk([
    'Can you book a hotel near the airport?', 'How much is a rental car for the weekend?',
    'Can you find my lost phone in the terminal?', 'What is the best travel credit card?',
    'Can you tell me a joke while I wait?', 'Who won the football match last night?',
    'What is the weather forecast for my holiday destination?',
  ], 'none', noneSources.yyc),
];

if (rows.length !== 90) throw new Error(`expected 90 rows, got ${rows.length}`);
const enriched = rows.map((row, index) => ({
  id: `web-routing-${String(index + 1).padStart(3, '0')}`,
  ...row,
  expectedAny: row.label === 'none' ? [] : [row.label],
  expectedAction: row.label === 'none' ? 'none' : 'execute',
  forbidden: row.label === 'none' ? ['get_flight_details', 'get_gate', 'get_time_remaining', 'get_live_tracking', 'search_knowledge', 'open_airport_map'] : [],
  split: index % 2 === 0 ? 'calibration' : 'heldout',
  annotation: 'human-authored paraphrase grounded in cited web FAQ/source',
}));
const out = join(process.cwd(), 'eval', 'web-routing-supplement.json');
writeFileSync(out, JSON.stringify(enriched, null, 2), 'utf8');
console.log(JSON.stringify({ total: enriched.length, calibration: enriched.filter((x) => x.split === 'calibration').length, heldout: enriched.filter((x) => x.split === 'heldout').length }, null, 2));
