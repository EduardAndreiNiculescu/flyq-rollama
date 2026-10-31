# FlightFlow — Apify discovery benchmark

Data: 30 octombrie 2026

Setul `eval/apify-flight-discovery.json` conține 1.551 texte RO extrase din
rezultate web. Etichetele au fost generate euristic și toate exemplele au
`verified: false`. Prin urmare, rezultatele de mai jos măsoară acordul cu
etichetele euristice, nu acuratețea reală.

## Tier 1 — router determinist

- total: 1.551
- execuții directe: 1.107 (71,37%)
- fallback model: 444 (28,63%)
- acord cu eticheta euristică: 58,48%
- execuții din lista `forbidden`: 0
- latență mediană PC: 0,083 ms
- p95 PC: 0,219 ms

## Tier 2 — Char-CNN ONNX INT8 singur

- acord cu eticheta euristică: 30,24%
- execuții directe: 643 (41,46%)
- `none`: 905
- `clarify`: 3
- latență mediană PC: 0,337 ms
- p95 PC: 0,551 ms

## Hibrid Tier 1 -> Tier 2

- Tier 1 rezolvă: 1.107
- Tier 2 vede: 444
- acord cu eticheta euristică: 62,28%
- coverage direct final: 81,04%
- Tier 2 mediană pe fallback-uri: 0,344 ms

## Interpretare

Creșterea de la 58,48% la 62,28% arată că Tier 2 recuperează o parte dintre
fallback-urile routerului. Totuși, setul este dominat de fragmente SEO și
snippet-uri, iar 0/1.551 etichete sunt validate manual. Nu folosim aceste cifre
ca poartă de release. Următorul pas corect este validarea manuală stratificată a
unui eșantion și rerularea pe acel control set.

Comandă reproductibilă pentru Tier 1:

```powershell
npm run 06b:apify-eval
```

## Control set filtrat — 300 de întrebări

`eval/apify-control-300.json` este construit determinist din întrebări web care
trec filtre stricte de formă și intenție. Snippet-urile tăiate, reclamele și
textele care nu sunt întrebări sunt eliminate. Distribuția sursei nu permite un
set echilibrat pe toate toolurile: 266 de cazuri sunt knowledge, 28 sunt `none`,
4 flight details și 2 gate.

Rezultate pe acest control candidat:

- Tier 1: acord 65,33%, coverage 63,67%, false executions 0;
- Tier 1 -> Char-CNN INT8: acord 87,33%, coverage 86,33%;
- Tier 2 vede 109/300 fallback-uri;
- Tier 2 mediană PC pe fallback: 0,340 ms;
- false executions hibrid: 0.

Acesta este un control set cu etichete stricte revizuite prin reguli și audit de
dezacorduri, nu un gold set etichetat independent de doi oameni. Nu înlocuiește
benchmarkul V4 și nu justifică singur shippingul.

```powershell
npm run 06b:control-build
npx tsx eval/run-apify-router.ts --input eval/apify-control-300.json
```
