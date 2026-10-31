# Liste de taskuri pe echipe (backend, hartă, frontend)

Ce există azi în repo, ce trebuie construit de fiecare și când e "gata". Fișierele-contract sunt cele pe care nu le schimbă nimeni fără acord (vezi `docs/TEAM.md`). Tot ce e marcat **[dev]** a fost construit doar ca să testăm și **nu intră în producție**.

## Cum se leagă (pe scurt)
```
iPhone (frontend + modelul local) ──HTTPS──► Backend de zbor ──► AirLabs (și OpenSky, nelegat încă)
        │
        └── harta indoor (modul separat): primește destinații din asistent, trimite zona curentă
```
Aplicația nu vorbește niciodată cu furnizorii de date și nu vede nicio cheie. Fără internet, aplicația merge cu ultimul instantaneu salvat, datat.

---

## 1. BACKEND (zbor)

**Ce există ca bază**: `server/airlabsClient.ts` (client AirLabs), `server/openskyClient.ts` (client OpenSky, nelegat), `server/gateway/providers.ts` (cache + plafon de apeluri + conversie ICAO→IATA), `server/gateway/gateway.ts` (server de test). Contractul de răspuns: `src/core/types.ts` (`FlightRecord`) și `src/tracking/result.ts` (`TrackingResult`, `schemaVersion: 1`). Testele din `tests/airlabs.test.ts` și `tests/gateway.test.ts` descriu comportamentul cerut.

### Taskuri obligatorii
| # | Task | Criteriu de gata |
|---|---|---|
| B1 | **`GET /v1/flights/{număr}` de producție**: întoarce `{record: FlightRecord, tracking: TrackingResult}`. Același format ca azi `GET /v1/flight/{n}` din gateway-ul de test. | Aplicația funcționează neschimbat cu noul URL; testele de contract trec. |
| B2 | **Autentificare per utilizator/sesiune** (nu un token comun), HTTPS obligatoriu, fără chei în aplicație. | Cerere fără token valid = 401; token expirat = 401. |
| B3 | **Cache comun + single-flight + rate limit per utilizator** (azi: 60 s per zbor, erorile cache-uite scurt, plafon fix de apeluri pe proces). | Același zbor cerut de 100 de utilizatori = cel mult 1 apel către furnizor pe fereastră; depășirea plafonului dă `429`, nu eroare 500. |
| B4 | **Normalizarea numărului de zbor**: `CPA253` (ICAO) → `CX253` (IATA) prin lista de companii a furnizorului, cu cache persistent (azi în memorie). Numărul din răspuns e mereu cel IATA. | `ABB864`, `CPA253`, `QTR037` ajung la același zbor ca echivalentul IATA. Notă: indicativul de apel nu e mereu egal cu numărul comercial. |
| B5 | **Zborul pe dată**: azi furnizorul întoarce "cel mai apropiat" zbor. Biletul (BCBP) are data, deci backendul trebuie să primească și data și să verifice că zborul întors e cel de pe acea dată. | Zbor de ieri/mâine nu e întors drept cel de azi; nepotrivire = `404`. |
| B6 | **Erori distincte și stabile**: `not_found` (404), `bad_request` (400), `upstream` (502), `rate_limited` (429), `budget_exhausted`. Fără mesaje cu detalii interne. | Aplicația poate afișa un mesaj corect pentru fiecare; niciun răspuns de eroare nu conține chei, URL-uri sau adrese IP. |
| B7 | **Date de aeroport verificate** (IATA → nume, oraș, coordonate, fus orar IANA, Schengen). Azi sunt 9 aeroporturi în `src/data/airports.json`, doar Craiova cu coordonate verificate, iar frontend-ul are un tabel aproximativ de test (`TEST_AIRPORTS`) care **nu trebuie să ajungă în producție**. | Fiecare aeroport servit are sursa și data verificării (regula "zero cifre inventate"); fără coordonate verificate, ETA rămâne "indisponibil". |
| B8 | **Poziția live corectă**: viteza AirLabs e km/h, altitudinea în metri și lipsește la sol; un zbor `landed` poate avea poziția veche (de întors `flight_completed`); poziția veche = `stale_position`. | Cazurile sunt acoperite de teste (există deja în `tests/gateway.test.ts`, de păstrat). |
| B9 | **Chei în variabile de mediu, rotite.** Cheia AirLabs apare în clar într-un fișier privat din repo (`docs/BACKEND_HANDOFF_PRIVATE.md`, în afara git). | Cheie nouă emisă; vechea revocată; nimic cu valori secrete în git. |
| B10 | **Observabilitate fără date personale**: `/health`, contor de apeluri către furnizor și rată de cache. Fără jurnalizarea întrebărilor sau a numerelor de zbor în clar. | Jurnalul nu conține conținut de chat. |

### Taskuri ulterioare
- B11 Legarea OpenSky ca sursă secundară de poziție (clientul există). Regulile din `docs/BACKEND_CONTEXT.md` rămân valabile (`on_ground` nu înseamnă "aterizat"; ICAO24 nu e zborul comercial).
- B12 Calibrarea ETA pe sosiri reale (acum `calibrated: false`).
- B13 Verificarea cu apel real a formei răspunsului OpenSky (decodorul e testat doar pe date simulate).

### NU intră în producție **[dev]**
`GET /ui`, `POST /v1/chat` (modelul de pe laptop), `/v1/device/*` (telecomanda telefonului), `POST /v1/bench`, `GATEWAY_LOG_CHAT` (jurnalizarea conținutului de chat) și ascultarea în rețea locală cu un token comun. Acestea trebuie scoase sau dezactivate prin configurare în build-ul de producție.

---

## 2. HARTĂ ȘI POZIȚIONARE

**Contracte**: `IndoorMapProps` din `src/components/map/MapPlaceholder.tsx` (`floor`, `route`, `position`, `targetNodeId`, `showDebug`; `MapPanel.tsx` nu se schimbă), `NavigationHandler.openAirportMap({destination, fromZone})` din `src/core/assistant.ts`, `PassengerContext` din `src/core/types.ts`.

| # | Task | Criteriu de gata |
|---|---|---|
| M1 | **Lista oficială de destinații și zone** (identificatori + etichete RO/EN + sinonime). Azi: `src/data/pois.json` (12 POI-uri) și `terminal.json`, date inventate de frontend. | Lista e predată în scris; asistentul validează `destination` față de ea (azi trece orice text cu litere). |
| M2 | **Harta indoor reală** în locul `MapPlaceholder`, cu aceleași props. | Se desenează etajul, ruta și punctul curent; `targetNodeId` din asistent deschide harta pe loc. |
| M3 | **Poziția curentă ca `currentZone` + `positionConfidence`** către asistent (azi simulată). | Întrebarea "unde e toaleta?" folosește zona reală. |
| M4 | **Potrivirea destinațiilor**: azi `src/services/live/poiMatch.ts` leagă "toaletă/baie/WC/restroom", "poarta 3", "farmacie" etc. de tipuri de POI (testat în `tests/fe/live.test.ts`). Hărții îi revine să-și extindă vocabularul. | Un cuvânt necunoscut nu deschide un loc la întâmplare, ci întoarce "nu am găsit". |

---

## 3. FRONTEND

**Ce există**: aplicația lui Nicu, integrată în `src/app`, `src/screens`, `src/components`, `src/store`, `src/services`. Interfețele de servicii sunt în `src/services/types.ts`; implementările se aleg într-un singur loc, `src/services/index.ts`.

| # | Task | Criteriu de gata |
|---|---|---|
| F1 | **Servicii reale în loc de mock**, mai ales `FlightDataService` și `FlightTrackerService` pe backendul B1. Interfețele de date sunt **sincrone** azi; datele reale sunt asincrone, deci datele de zbor se țin într-un store populat asincron. | Un zbor real apare fără modul de test. |
| F2 | **Ecranul "Mod test" și `linkEnabled` rămân doar în build-urile de dezvoltare.** Telecomanda (`src/services/live/deviceLink.ts`), benchmark-ul și `TEST_AIRPORTS` nu intră în producție. | Build-ul de producție nu conține nicio cale către `/v1/device/*`. |
| F3 | **Date personale**: biletele (`pass.raw`, nume, PNR) se salvează necriptat în AsyncStorage; token-urile la fel. | Date sensibile în Keychain/criptat; "Șterge datele locale" le golește. |
| F4 | **Instantaneu offline datat**: ultimul zbor și ultima poziție se păstrează cu momentul citirii și se afișează ca "vechi" fără rețea. | Fără rețea, ecranul spune cât de vechi e fiecare număr. |
| F5 | **Etichetele**: răspunsurile din mock trebuie să fie vizibil marcate (există deja `MOCK` în ecranul asistentului) și ora de îmbarcare/închiderea porții din modul test sunt derivate, nu de la furnizor. | Nicio valoare derivată nu e prezentată ca informație oficială. |
| F6 | **Afișarea vitezei și a poziției** din `AnswerStats` (tok/s, primul token) în build-uri de test; coordonatele brute nu se arată pasagerului, ci un reper ("deasupra Ungariei"). | — |
| F7 | **Teste pe telefon** înainte de predare: ecranele compact/tabletă, accesibilitate (`reduceTransparency`), Airplane Mode. | Lista din `docs/TEAM.md` → "Definiția de gata pentru demo". |

---

## 4. Ce rămâne la echipa AI (nu se predă)
Modelul și promptul (V4), uneltele (`src/tools/`), garda de răspuns, routerul și baza de cunoștințe. Orice schimbare de text în prompt sau în rezultatele uneltelor cere reantrenare, deci se cere o confirmare înainte (vezi `docs/GATEWAY.md`, "contractul înghețat").

## Ordinea recomandată
1. B1–B3 (altfel nimic nu se leagă), în paralel M1 (lista de destinații, de care depinde atât harta cât și asistentul).
2. B4–B7 și F1.
3. M2–M3 și F3–F4.
4. Restul, pe baza testelor pe telefon.
