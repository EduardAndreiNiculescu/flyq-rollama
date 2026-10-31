# Arhitectura FlyQ

Document de ansamblu, scris din codul și din măsurătorile proiectului. Ce nu e verificat pe un dispozitiv real este marcat „neverificat". Detalii pe părți: `AI_ARCHITECTURE.md`, `LIVE_ACTIVITIES.md`, `NOTIFICARI.md`, `IOS_BUILD.md`, `REPRODUCE.md`.

## 1. Ce este

Un asistent de aeroport pentru iPhone (Expo SDK 58, React Native 0.88, TypeScript), făcut pentru Aeroportul Craiova. Pasagerul adaugă biletul, primește pașii prin aeroport, starea zborului, un asistent care răspunde offline și un card Live Activity pe ecranul blocat.

Principiul de proiectare: **faptele vin din cod și din date, nu din modelul de limbaj**. Modelul mic doar alege ce unealtă să ruleze.

## 2. Vedere de ansamblu

```
┌──────────────────────────── iPhone ─────────────────────────────┐
│  Aplicația (Expo / React Native)                                 │
│   ├─ Ecrane: Zbor · Hartă · Asistent (+ Profil, Mod test,        │
│   │            Zbor live)                                        │
│   ├─ Asistent: normalizator → limită → cale rapidă →             │
│   │            RoLlama 1B (llama.rn, on-device) → unelte         │
│   ├─ Servicii live: client FlyQ, notificări, Live Activity       │
│   └─ Date locale: bilete, bază de cunoștințe, harta SVG          │
│  Extensie de widget (ExpoWidgetsTarget): cardul Live Activity    │
└───────────────┬───────────────────────────────▲─────────────────┘
                │ HTTPS (sesiune, zbor, abonare, │ APNs (push,
                │ tokenul cardului)              │ liveactivity)
                ▼                                │
        ┌───────────────── Backend FlyQ ─────────┴───────┐
        │ Fastify, repo separat (FlyQ-backend)            │
        │ sesiuni, zboruri CRA, ETA, conținut, push       │
        └─────────────────────────────────────────────────┘

Laptop (Windows) ──SSH──▶ Mac mini (Xcode) ──▶ iPhone      [doar pentru build]
```

Harta interioară din scanare LiDAR (Denis) este un modul separat, **neintegrat**. Punctul de integrare: unealta `open_airport_map` → `NavigationHandler.openAirportMap`.

## 3. Straturile aplicației

| Strat | Cale | Rol |
|---|---|---|
| Interfață | `src/screens`, `src/components`, `src/theme`, `src/i18n` | Ecrane, design „Liquid Glass & Sky", română și engleză |
| Navigare | `src/app` | 3 tab-uri (`Flight`, `Map`, `Assistant`) într-un stack cu `AddTicket`, `Scan`, `Paste`, `Pass`, `Profile`, `Live`, `LiveFlight` |
| Nucleu | `src/core` | Reguli, router determinist, baza de cunoștințe, calcule de zbor, limita de capabilități |
| AI | `src/llm` | Promptul, parserul, gramatica GBNF, motorul RoLlama, verificarea fișierului model |
| Unelte | `src/tools` | Registrul de unelte, sanitizer, calea rapidă, compozitorul, bucla de unelte |
| Servicii live | `src/services/live` | Client FlyQ, notificări, Live Activity, estimarea de aterizare, legătura cu laptopul de test |
| Date | `src/data` | Aeroporturi, zboruri demo, harta terminalului, baza de cunoștințe UE |
| Stare | `src/store` | zustand: bilete, setări, modul de zbor, navigarea interioară |

### Navigare
- `Main` (tab-uri) este ruta implicită când există un bilet viitor, altfel `AddTicket`.
- Tabul **Zbor** arată pașii călătoriei, apoi „Informații zbor".
- **Profil** se deschide din butonul din antetul fiecărui tab.
- **Zbor live** (`LiveFlight`) se deschide prin legătura `flyq://live` (atingerea cardului); schema `flyq` e în `app.json`, iar legăturile sunt configurate în `src/app/App.tsx`.

## 4. Fluxul unei întrebări către asistent

Descris pe larg în `AI_ARCHITECTURE.md`. În scurt: urgențele primesc un răspuns fix (112); apoi limita de capabilități (cumpărat, rezervat, glume); apoi calea rapidă (loc, îmbarcare, durata securității, poartă, ore, reguli evidente); abia apoi modelul. Faptele se compun din rezultatul uneltei.

## 5. Date și surse

- **Zbor demo:** fictiv, etichetat ca atare; zborul biletului demo nu există pe server, deci pentru notificări aplicația se abonează la un zbor demo al serverului (`DEMO-gate_change-D-W69901`).
- **Zbor real:** de la serverul FlyQ (`GET /v1/flights/{număr}`), cu sesiune obținută cu cheia aplicației. Cheia se introduce în „Mod test" și nu face parte din repo.
- **Poziția avionului:** vine de la server (`tracking`); aplicația nu vorbește direct cu furnizorii de date.
- **Baza de cunoștințe:** `src/core/knowledge.ts` și `src/data/eu-knowledge.json`; căutare pe rădăcini și sinonime, cu filtru de subiect.
- **Zero secrete în repo:** cheia aplicației FlyQ, tokenul de admin, tokenurile de dispozitiv și cheia APNs nu se comit. Scripturile citesc din `.env.local` (ignorat de git; vezi `scripts/push.env.example`).

## 6. Build și infrastructură

Laptopul Windows comandă un Mac mini (Xcode) prin SSH; iPhone-ul e legat la Mac. Pașii, variabilele și capcanele: `IOS_BUILD.md`.

Puncte specifice:
- `npm run mac:build` face `git push --force` pe oglinda de build de pe Mac (un singur build odată) și rulează `scripts/mac/build-ios.sh`.
- Rezultatul e în `~/build.log` pe Mac: `BUILD+INSTALL DONE` înseamnă succes, `BUILD FAILED` eșec.
- Modelul (851 MB) **nu** e împachetat în aplicație; se copiază separat (`scripts/mac/push-model.sh`).
- Extensia de widget (`ExpoWidgetsTarget`) și App Group-ul `group.<bundle id>` trebuie să fie înregistrate în contul Apple; semnarea automată o poate face singură, dar prima dată poate cere Xcode.
- `PUSH=1` păstrează permisiunea `aps-environment`; fără ea scriptul o șterge.

## 7. Decizii importante (și de ce)

- **Modelul nu scrie fapte.** Un model de 1B inventează ore și porți; de aceea doar alege unealta.
- **Refuzurile sunt înguste.** Un „none" al modelului nu blochează o întrebare pe care routerul determinist o înțelege; refuzul dur rămâne pentru tentative de injecție și pentru cumpărări/rezervări.
- **Interogarea de reguli rămâne a pasagerului.** Textul original merge la căutare, nu o reformulare a modelului.
- **Cardul Live Activity nu inventează.** Fără poziție live, rămâne pe ora programată.
- **Bundle ID-ul rămâne `com.flightflow.craiova.dev`** deși produsul se numește FlyQ: schimbarea ar rupe semnarea, notificările de pe server și datele din aplicație.

## 8. Ce e verificat și ce nu

| Parte | Stare |
|---|---|
| Typecheck, teste, benchmark determinist | trec (`node scripts/verify.mjs`) |
| Modelul pe iPhone | se încarcă și rulează (~30–57 tokeni/s) |
| Acuratețea routării pe telefon | **nemăsurată**. Pe laptop, 70 de întrebări, doar modelul: 54 corecte (77,1%) |
| Cifra „98,2%" din benchmark-ul Python | nu se reproduce din repo; nu e acuratețe de telefon |
| Notificări obișnuite | serverul a primit 200 de la Apple la două teste (31.10) |
| Live Activity: pornire pe iPhone | observată la un build anterior |
| Live Activity: actualizări de la server, design nou, countdown, estimare de aterizare | **neverificate** |
| Harta LiDAR (Denis) | neintegrată |

## 9. Riscuri cunoscute

- `finetune/merge_and_quantize.py` produce încă GGUF-uri greșite; orice export nou trebuie reparat (`scripts/fix_gguf_rollama.py`).
- `LICENSE` e încă MIT-ul șablonului Expo; licențele RoLlama și Llama 3.2 trebuie verificate înainte de redistribuire.
- `ROUTER_DEBUG` (`src/llm/rollamaEngine.ts`) e activ în dezvoltare; se oprește înainte de demo.
- Cheia APNs a fost vizibilă într-o sesiune de chat; se revocă după teste.
