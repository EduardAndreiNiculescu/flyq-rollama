# Prompturi de predare: backend și cei care îl folosesc

Fiecare bloc se lipește ca atare în Claude Code (sau în alt asistent) deschis în repo-ul `flightflow`. Lista de taskuri completă e în `docs/HANDOFF_TASKS.md`.

---

## 1. Prompt pentru echipa de BACKEND

```
Lucrezi în repo-ul FlightFlow (TypeScript, Node 22, vitest). Construiești backendul de zbor de PRODUCȚIE. Aplicația de pe iPhone vorbește doar cu el; nu vede niciodată chei de furnizor.

CITEȘTE ÎNTÂI (nu scrie cod până nu le-ai citit): docs/HANDOFF_TASKS.md (secțiunea 1, taskurile B1-B10), docs/BACKEND_CONTEXT.md, docs/GATEWAY.md, src/core/types.ts (FlightRecord), src/tracking/result.ts (TrackingResult, schemaVersion 1), server/airlabsClient.ts, server/gateway/providers.ts, server/gateway/gateway.ts, tests/gateway.test.ts, tests/airlabs.test.ts.

CONTRACTE ÎNGHEȚATE (nu le schimbi fără acordul echipei AI):
- GET /v1/flights/{număr}?date=YYYY-MM-DD  ->  200 { record: FlightRecord, tracking: TrackingResult }
- Numărul din răspuns e MEREU cel IATA (CPA253 -> CX253, QTR037 -> QR37, zerourile din față se taie). Conversia o face providers.ts prin lista de companii a furnizorului.
- Erori stabile, fără detalii interne (fără chei, URL-uri, IP-uri): 400 bad_request, 401 unauthorized, 404 not_found, 429 rate_limited, 502 upstream, 503 budget_exhausted. Corp: { error: "<cod>" }.
- TrackingResult.kind = 'unavailable' cu reason din lista din result.ts. Nu inventa poziții. Viteza AirLabs e km/h, altitudinea m; fără altitudine = la sol; zbor 'landed' => flight_completed; poziție veche => stale_position.
- Zero cifre inventate: dacă furnizorul nu dă un câmp, pune null, nu estima.

NU intră în producție (rămân doar în gateway-ul de test): GET /ui, POST /v1/chat, /v1/device/*, POST /v1/bench, GATEWAY_LOG_CHAT, tokenul comun pe rețea locală.

TASKURI, în ordine: B1 endpoint de producție, B2 autentificare per utilizator/sesiune + HTTPS, B3 cache comun + single-flight + rate limit per utilizator, B4 normalizare ICAO->IATA cu cache persistent, B5 zborul pe dată (BCBP are data; nepotrivire = 404), B6 erori stabile, B7 aeroporturi verificate (sursă + dată de verificare), B8 poziție corectă, B9 chei doar în variabile de mediu, B10 observabilitate fără date personale (fără chat sau numere de zbor în clar în loguri).

REGULI DE LUCRU:
- Scrie testul întâi; `npm run check` trebuie să fie verde înainte de fiecare commit.
- Cheile nu apar în cod, loguri sau teste. Cheia AirLabs din docs/BACKEND_HANDOFF_PRIVATE.md se rotește (B9).
- Un taskuri = un commit mic, cu mesaj clar. Nu atingi src/tools/, src/llm/, src/core/prompt.ts, eval/, finetune/ (aparțin echipei AI).
- La final de task spune: ce ai schimbat, ce teste noi, ce NU ai verificat.
```

---

## 2. Prompt pentru cei care FOLOSESC backendul (frontend și hartă)

```
Lucrezi în repo-ul FlightFlow (Expo SDK 58, React Native 0.88, TypeScript). Aplicația rulează un asistent AI complet pe telefon (Qwen3-4B + adaptor), fără internet. Tu NU modifici modelul; îl integrezi.

CITEȘTE ÎNTÂI: docs/HANDOFF_TASKS.md (secțiunile 2 și 3), docs/TEST_MODE.md, docs/FRONTEND_*.md, src/services/types.ts, src/services/index.ts, src/tools/registry.ts, src/core/assistant.ts (NavigationHandler).

CUM FUNCȚIONEAZĂ ASISTENTUL (nu reimplementa nimic din asta):
- Modelul NU știe fapte. Le cere unor unelte, iar codul le calculează. Unelte (nume exacte, argumente exacte):
  - get_flight_details({flightNumber?})  orele programate/estimate, rută, poartă, status, întârziere
  - get_gate({flightNumber?})            poarta doar dacă e confirmată
  - get_time_remaining({flightNumber?})  timp până la decolare/aterizare
  - get_live_tracking({flightNumber?})   ultima poziție observată (doar online)
  - search_knowledge({query})            baza offline de reguli (bagaje, lichide, drepturi...)
  - open_airport_map({destination})      deschide harta; destination = text liber 2-64 caractere
- flightNumber e opțional: implicit zborul selectat de pasager. Format: litere/cifre, max 10.
- Ciclul: întrebare -> model emite <tool_call>{"name":..., "arguments":{...}}</tool_call> -> src/tools/loop.ts execută unealta -> rezultatul se întoarce modelului -> răspuns final -> garda (src/tools/guardAnswer.ts) îl verifică. Maximum 3 pași.

CONTRACTELE TALE (nu le schimbi fără acord):
- Date de zbor: FlightRecord (src/core/types.ts). Poziție: TrackingResult (src/tracking/result.ts) validat cu parseTrackingResult.
- Hartă: IndoorMapProps din src/components/map/MapPlaceholder.tsx (floor, route, position, targetNodeId, showDebug). Asistentul apelează NavigationHandler.openAirportMap({destination, fromZone}); tu legi destination de un nod (src/services/live/poiMatch.ts). Un cuvânt necunoscut întoarce "nu am găsit", nu un loc la întâmplare.
- Implementările de servicii se aleg într-un singur loc: src/services/index.ts.

TESTARE:
- Ecranul "Mod test" + telecomanda de pe laptop (docs/TEST_MODE.md). Benchmark pe telefon din ecranul Live. Nimic din Mod test nu intră în producție (F2).
- `npm run check` verde înainte de fiecare commit.

REGULI:
- Orice valoare derivată (oră îmbarcare, închidere poartă) e marcată vizibil ca derivată, nu oficială. Datele demo sunt marcate MOCK.
- Nu atingi src/tools/, src/llm/, src/core/prompt.ts, finetune/, eval/. Orice schimbare de text în promptul modelului sau în rezultatele uneltelor cere reantrenare: o ceri echipei AI.
- Date personale (bilet, nume, PNR, token) nu se loghează și nu se salvează necriptat (F3).
```

---

## 3. Exemple exacte de apel de unealtă (pentru testele lor)

Format emis de model (Qwen3), pe o singură linie:

```
<tool_call>
{"name": "get_gate", "arguments": {}}
</tool_call>
```

| Întrebare | Apel corect |
|---|---|
| „La ce poartă sunt?" | `get_gate` `{}` |
| „Când aterizează CX253?" | `get_flight_details` `{"flightNumber":"CX253"}` (sau `get_time_remaining`) |
| „Unde e avionul acum?" | `get_live_tracking` `{}` |
| „Pot lua apă prin securitate?" | `search_knowledge` `{"query":"apă prin securitate"}` |
| „Unde e toaleta?" | `open_airport_map` `{"destination":"toaletă"}` |

Rezultatul unui apel (ce primește modelul înapoi) conține mereu `flightNumber`, ca să-l poată copia în răspuns. Dacă zborul nu e găsit, unealta întoarce eroare, iar modelul trebuie să spună că nu poate confirma zborul, fără să inventeze.
