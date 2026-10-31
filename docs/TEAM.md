# Echipa FlyQ – 5 fluxuri, un proprietar fiecare

Completează numele în tabel. Ipoteza: flux E = harta/poziționarea (modulul separat din `docs/INTEGRATION.md`). Schimbați dacă nu e așa.

| | Flux | Proprietar | Fișiere ale fluxului |
|---|---|---|---|
| **A** | iPhone: build, inferență, demo offline | _nume_ | `App.tsx`, `src/llm/`, `app.json`, `eas.json`, `docs/BENCHMARK.md` |
| **B** | Backend de zbor (AirLabs + OpenSky) | _nume_ | `server/`, `src/tracking/`, `docs/BACKEND_CONTEXT.md` |
| **C** | Conținut și date verificate | _nume_ | `src/data/`, `src/core/knowledge.ts`, `eval/questions.json` |
| **D** | AI: tool-uri, evaluare, antrenare | _nume_ | `src/tools/`, `src/core/assistant.ts`, `src/core/prompt.ts`, `eval/`, `finetune/` |
| **E** | Hartă, poziționare, UX navigație | _nume_ | modulul de hartă (în afara `src/core/`), `docs/INTEGRATION.md` |

Un PR atinge fișierele **propriului** flux. Dacă ai nevoie de o modificare în fișierul altuia, deschide PR către proprietarul lui sau cere-i-o.

## Contracte înghețate
Se schimbă doar cu acordul scris al ambelor părți, într-un PR separat:
- `PassengerContext`, `Intent`, `NavigationRequest` – `src/core/types.ts` (D ↔ E)
- `TrackingResult` – `src/tracking/result.ts` (B ↔ A, D)
- `LlmEngine`, `NavigationHandler` – `src/core/assistant.ts` (A ↔ D, E)
- `ToolDeps`, `ToolDef` – `src/tools/registry.ts` (D ↔ B, E)

## Reguli
1. PR-uri mici, cel puțin zilnic. `main` se protejează: doar prin PR, cu CI verde (`npm run check`).
2. Zero secrete în git. Chei doar în variabile de mediu; `docs/*PRIVATE*` rămâne în afara git. Cheie ajunsă în git = rotită imediat.
3. Zero cifre inventate: benchmark-urile vin din măsurători, `verifiedOn` se setează doar după ce un om a citit sursa.
4. Un build pe iPhone pe zi de pe `main`. Ultima zi: doar demo și repetiții în Airplane Mode, fără funcționalități noi.
5. Nu se afirmă "merge" fără ieșirea reală a comenzii.

## Sarcini pe flux

### A – iPhone (prioritatea 0, blochează demo-ul)
- [ ] Cont Expo, `eas login`, `eas device:create` pentru iPhone-ul de test, Developer Mode activat
- [ ] `eas.json` cu profilul `preview` (Release, fără dev server) și build iOS reușit
- [ ] Model descărcat pe telefon (validare mărime + header GGUF) și încărcat
- [ ] Test în Airplane Mode: răspunde offline
- [ ] Benchmark real (20 cereri consecutive, `n_ctx` 1024/2048/4096) în `docs/BENCHMARK.md`: încărcare, TTFT, tok/s, memorie, termică
- [ ] Decizie Q4_K_M vs Q5_K_M pe baza memoriei măsurate

### B – Backend
- [ ] Rotire secret OpenSky; confirmare drept de utilizare; chei în variabile de mediu
- [ ] Server HTTP cu `GET /health` și `GET /v1/flights/{flightKey}/tracking` → `TrackingResult`
- [x] `server/airlabsClient.ts` (fetch injectat, timeout, validare, URL redactat) + teste cu răspunsuri simulate (`tests/airlabs.test.ts`; doar răspunsuri simulate, niciun apel real)
- [ ] Cache comun, single-flight, rate limit per utilizator, autentificare
- [ ] Maparea număr zbor + dată → `hex`; verificare dată din răspunsul AirLabs
- [ ] Un test live manual, cu chei noi
- [ ] Verificat forma reală a răspunsului AirLabs cu un apel real și corectat parserul/testele dacă diferă
- [ ] Aceeași verificare pentru OpenSky (decodor, `server/openskyClient.ts`)

### C – Conținut
- [ ] Verificat pe sursele oficiale pasajele KB cu `verifiedOn: null` (acum 40 din 68: 18 intrări seed din `knowledge.ts` + 11 intrări UE × 2 limbi; 28 sunt verificate, vezi `eu-knowledge.json`)
- [ ] Informații reale Aeroport Craiova de pe site-ul oficial (adresă, facilități, check-in, contact) – citite de un om
- [ ] 30–50 de întrebări reale de pasageri în română (greșeli, fără diacritice) ca set de test nevăzut de model
- [ ] Verificare ton și corectitudine a răspunsurilor din `finetune/make_dataset_v2.ts`
- [ ] Coordonate verificate ale aeroporturilor țintă (pentru ETA)

### D – AI
- [x] Registru de tool-uri, validare argumente, buclă de tool-uri (`src/tools/`, `tests/tools.test.ts`)
- [ ] Legarea buclei de tool-uri în `App.tsx` cu comutator față de pipeline-ul determinist (acum aplicația apelează doar `assistant.ask`)
- [ ] Evaluare bază vs. adaptor v2 pe setul de test (cifre reale, nu impresii)
- [x] Set de 50 de întrebări cu tool-ul așteptat (`eval/tool-cases.json`) + runner testat cu server fals
- [ ] Rulat setul de tool-uri pe Qwen real (`eval/run-tools.ts`)
- [x] Router tolerant la greșeli ("Une e baia", "Cand imi ajunge avionul") + corector ortografic de domeniu (`src/core/router.ts`, `spell.ts`, teste)
- [ ] Lexiconul de cuvinte comune (`src/data/common-words.json`) e construit din corpusurile proiectului: reevaluat pe text real de pasageri (greșelile din benchmark sunt sintetice)
- [ ] Integrat "answer guard" (menționat în `templates.ts` ca fallback, dar neimplementat) și șabloanele deterministe din `templates.ts` în `assistant.ts`
- [ ] SQLite FTS5 pentru KB (acum e căutare în memorie)
- [ ] Terminat antrenarea adaptorului v2 (`finetune/out/status.json` arăta pasul 254/284) și validator de răspuns structurat; GGUF + cuantizare dacă adaptorul bate baza

### E – Hartă și poziționare
- [ ] Implementare `NavigationHandler.openAirportMap({ destination, fromZone })`
- [ ] Lista oficială de zone și destinații pentru `currentZone` și `destination`, trimisă lui D
- [ ] Furnizează `PassengerContext` (stage, zone, `positionConfidence`)
- [ ] Test de integrare cu aplicația: "Unde este toaleta?" deschide harta corect, offline
- [ ] Mock-ul din `App.tsx` înlocuit cu implementarea reală

## Definiția de gata pentru demo
Airplane Mode pe iPhone → model încărcat → întrebare în română → zbor stocat local → problemă de călătorie → harta se deschide → totul fără internet. Nicio poartă, oră sau regulă inventată.
