import { correctQuestion, defaultLexicon } from '../src/core/spell';
const lex = defaultLexicon();
console.log('lexicon size', lex.words.length);
for (const q of ['Mi-a dispărut bagjaul, ce fac?', 'Unde e toaleta', 'Vreau sa stiu despre securiatte', 'Am pierdut pasaprtul in aeroprt', 'My luggge did not arive', 'Wher is the departurre gate', 'zborul meu e intarziat', 'DEMO123 whn lands', 'pls help with the bagage']) {
  const r = correctQuestion(q);
  console.log(JSON.stringify(q), '->', JSON.stringify(r.text), r.changes.map((c) => `${c.from}>${c.to}`).join(' '));
}
