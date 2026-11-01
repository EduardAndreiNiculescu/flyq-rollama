# FlyQ: documentația completă a aplicației

Stare la **1 noiembrie 2026** (ziua prezentării). Tot ce nu a fost verificat pe un dispozitiv real este marcat explicit cu **[neverificat]**. Documentul nu conține chei, tokenuri, UDID-uri sau căi locale; acestea nu se pun niciodată în repo.

## Cuprins
1. [Ce este FlyQ](#1-ce-este-flyq)
2. [Călătoria utilizatorului, pas cu pas](#2-călătoria-utilizatorului-pas-cu-pas)
3. [Arhitectura pe straturi](#3-arhitectura-pe-straturi)
4. [Ecranele](#4-ecranele)
5. [Asistentul AI](#5-asistentul-ai)
6. [Biletul: scanare, lipire, număr de zbor](#6-biletul-scanare-lipire-număr-de-zbor)
7. [Datele de zbor și backend-ul](#7-datele-de-zbor-și-backend-ul)
8. [Notificări, înregistrare automată și Live Activity](#8-notificări-înregistrare-automată-și-live-activity)
9. [Partajarea zborului cu familia](#9-partajarea-zborului-cu-familia)
10. [Harta](#10-harta)
11. [Accesibilitate](#11-accesibilitate)
12. [Confidențialitate și securitate](#12-confidențialitate-și-securitate)
13. [Structura repo-ului](#13-structura-repo-ului)
14. [Build, instalare, ramuri](#14-build-instalare-ramuri)
15. [Teste și verificări](#15-teste-și-verificări)
16. [Stare: verificat, neverificat, probleme cunoscute](#16-stare-verificat-neverificat-probleme-cunoscute)
17. [Echipă și repo-uri](#17-echipă-și-repo-uri)
18. [Glosar](#18-glosar)

---

## 1. Ce este FlyQ

Un însoțitor de aeroport pentru iPhone, făcut pentru Craiova Airport Hackathon 2026. Îl ajută pe pasager de la intrarea în terminal până la aterizare:

- află unde trebuie să fie și când (poartă, îmbarcare, timp rămas);
- primește notificări și un card pe ecranul blocat când se schimbă ceva (poartă, întârziere, anulare);
- găsește locurile din terminal pe o hartă 3D, cu traseu și indicații;
- întreabă un asistent offline despre reguli și despre zborul lui;
- își poate lăsa familia să urmărească avionul pe o pagină web.

**Principiul care ține totul în picioare:** modelul de limbaj de pe telefon *nu scrie fapte*. El înțelege întrebarea; faptele (ore, poartă, reguli) vin din cod determinist, din datele serverului sau dintr-o bază de cunoștințe locală. Unde nu există date, aplicația o spune, nu inventează.

**Tehnologii:** Expo SDK 58, React Native 0.88, TypeScript, React Navigation, Zustand; `llama.rn` (llama.cpp + Metal) pentru model; `expo-widgets` (Live Activity); `expo-camera`, `expo-notifications`, `expo-haptics`, `expo-sensors`, `expo-location`; modulul nativ SceneKit/ARKit `flyq-spatial` (Swift) pentru harta 3D.

## 2. Călătoria utilizatorului, pas cu pas

1. **Adaugă biletul:** scanează codul de pe cartea de îmbarcare (cameră reală), îl lipește, scrie numărul zborului sau alege biletul demo.
2. **Zbor:** vede cardul cu timpul până la îmbarcare, poarta și starea zborului. Pașii prin aeroport (sosire, check-in, securitate, pașapoarte la non-Schengen, poartă, îmbarcare) se deblochează în timp.
3. **Notificări:** la prima adăugare de bilet, aplicația cere permisiunea și se abonează singură la backend; cardul Live Activity pornește pentru un zbor care pleacă în sub 24 h.
4. **Hartă:** caută un loc (toalete, ieșire, cafenea), pornește traseul, urmează indicațiile; cu telefonul în mână, pașii și busola mută pinul.
5. **Asistent:** pune întrebări sau atinge sugestiile care se schimbă după etapa călătoriei.
6. **În avion:** ecranul de zbor live cu poziția avionului și estimarea de aterizare.
7. **Familia:** „Trimite familiei" dă un link de urmărire.

## 3. Arhitectura pe straturi

```
UI (screens, components)          React Native, tema Aegean Horizon (src/theme/tokens.ts)
  │
store (Zustand, persistat)        tickets, settings, live, flightStatus, flightMode, indoorNav
  │
services (src/services)           contracte (types.ts) + implementări: mock/ și live/
  │        ├─ live/gatewayClient  sesiune, zbor, ETA către backend
  │        ├─ live/flightSync     sondare 15 s + la foreground + la notificare
  │        ├─ live/push, autoRegister  abonare push, token APNs, token Live Activity
  │        └─ live/liveActivity   cardul de pe ecranul blocat
  │
core (src/core)                   logica pură a asistentului: router, KB, locuri, capabilități
  │
llm (src/llm)                     RoLlamaEngine (llama.rn), gramatică GBNF
  │
native                            llama.rn · expo-widgets · packages/flyq-spatial (Swift)
```

Reguli: logica de decizie (`core/`, `lib/`) e pură și testată fără React; serviciile ascund de UI de unde vin datele (mock sau backend); un fapt afișat vine întotdeauna dintr-un serviciu, nu din text scris în ecran.

## 4. Ecranele

Trei taburi: **Zbor · Hartă · Asistent**. Profilul se deschide din antet.

| Ecran | Fișier | Ce face |
|---|---|---|
| Adaugă bilet | `AddTicketScreen` | Cele patru căi de a adăuga un zbor |
| Scanare | `ScanScreen` | Cameră reală (`expo-camera`), cere permisiunea, o singură citire PDF417/Aztec/QR, lanternă, refuz → Setări + lipire |
| Lipire cod | `PasteScreen` | Lipești textul BCBP; validare pe loc |
| Număr de zbor | `FlightNumberScreen` | Zbor real de la backend, cu data opțională; conversii de format (GFA006, AFR188, W4 3772 etc.) |
| Zbor | `FlightScreen`, `JourneyScreen` | Cardul principal, pașii prin aeroport (cu pași blocați până la ora lor), „Informații zbor", starea de la server, bannerul schimbărilor |
| Pass | `PassScreen` | Cartea de îmbarcare cu date de pe bilet |
| Zbor live | `LiveFlightScreen` (`flyq://live`) | Ecranul deschis din cardul Live Activity: countdown, poartă, ore, estimare de aterizare |
| Hartă (tab) | `FlyQMapScreen` → `src/flyq/screens/MapScreen` | Harta 3D a lui Denis (vezi §10) |
| Harta veche | `MapScreen` (în Profil → „Harta veche") | Schema 2D cu `terminal.json`; păstrată ca rezervă |
| Asistent | `AssistantScreen` | Chat, sugestii rotative, carduri cu fapte |
| Profil / Mod test | `ProfileScreen`, `LiveScreen` | Limbă, bilete, remindere; sursa zborurilor, notificări, card, diagnostic AI |

Stări speciale: zborul **anulat** nu are încă un ecran dedicat **[neimplementat]**.

## 5. Asistentul AI

### 5.1 Pipeline (`src/tools/loop.ts`)
```
întrebare
 → urgențe (medical, foc → răspuns fix cu 112)
 → limită de capabilități (nu cumpără, nu rezervă, nu face taxi, nu răspunde la cultură generală)
 → „unde e…?" din catalogul de locuri (fără model)         src/core/places.ts
 → cale rapidă: loc, oră îmbarcare, durata securității, nivel 1
 → router (candidați de unelte) + model care ALEGE dintre candidați, cu gramatică JSON (GBNF)
 → sanitizer (numărul de zbor din text, nu din model; poziția live doar dacă s-a cerut)
 → unelte deterministe
 → compozitor: răspunsul se construiește din rezultatul uneltei
```
Uneltele: `get_flight_details`, `get_gate`, `get_time_remaining`, `get_live_tracking`, `search_knowledge`, `open_airport_map`, plus `find_place` (catalogul de locuri).

### 5.2 Ce face efectiv modelul
RoLlama 3.2 1B (SFT + DPO, Q4_0, ~850 MB) alege unealta dintre candidații routerului, atunci când regulile nu sunt sigure (parafraze, întrebări fără cuvinte-cheie). Nu scrie răspunsuri. Fișierul stă pe telefon în `Documents/models/rollama-1b-dpo-q4.gguf` (nu e inclus în aplicație; se copiază cu cablu sau Finder). Fără el asistentul nu pornește, dar restul aplicației merge. Honest: pe majoritatea întrebărilor frecvente răspund regulile, nu modelul. Ideile de mărire a rolului lui (răspuns generat din fapte, context între mesaje, măsurarea ponderii) sunt în `docs/TODO.md`.

### 5.3 Baza de cunoștințe
`src/core/knowledge.ts` + `src/data/eu-knowledge.json`: reguli UE (lichide, bagaj, animale, documente, drepturile pasagerilor, mobilitate redusă, baterii, telefon în zbor, turbulență). Căutare cu rădăcini românești, plurale, sinonime; la egalitate câștigă cuvântul-cheie rar sau exact. Fiecare intrare are sursă și marcaj `checked`/`mayBeOutdated`. Destinațiile din afara UE primesc „verifică mae.ro", nu regulile UE.

**Lichidele:** regula generală e 100 ml; unele aeroporturi cu scannere CT noi permit până la 2 litri, în funcție de aeroport. Pentru Craiova nu avem confirmare; răspunsul spune asta și nu pretinde altceva.

### 5.4 „Unde e…?"
Catalogul `src/data/places.json` (toalete, ATM, VIP, bar Coco, cabinet medical, informații, securitate, self check-in, ieșire, parcare etc.), potrivire pe aliasuri fără diacritice, variante deterministe de răspuns, fără poziții inventate. Locurile care au `mapLabel` deschid harta 3D cu traseu spre ele. Plugin: `registerPlaces(...)` (vezi `docs/LOCURI_SI_HARTA.md`).

### 5.5 Sugestiile ghidate
`src/lib/suggestions.ts`: 37 de întrebări, etichetate pe etapă (devreme, înainte de îmbarcare, îmbarcare, urcare, croazieră, coborâre). Chip-ul pus dispare și e înlocuit; lista nu rămâne goală. Fiecare întrebare e testată prin același traseu ca pe telefon (`tests/suggestions.test.ts`).

### 5.6 Diagnostic
În Mod test: caseta de diagnostic arată pe ce cale a mers o întrebare (reguli, router, model) și ce a răspuns modelul. Folosește-o când un răspuns pare greșit.

## 6. Biletul: scanare, lipire, număr de zbor

- **Parser BCBP** (`src/lib/bcbp.ts`): IATA M1; validează aeroporturi, companie, număr, dată (ziua din an), loc. Nu înțelege: QR care nu e BCBP, loc nealocat, spații la început, bilete cu mai multe segmente (doar primul) **[limitări cunoscute]**.
- **Scanare** (`src/services/camera/CameraBarcodeScannerService.ts`, de Mihai): `expo-camera`, permisiune în română prin `app.json`, o singură citire.
- **Zbor negăsit în orarul din aplicație:** `src/services/live/realTicket.ts` îl caută pe server după **număr și zi** (nimic despre pasager nu pleacă), încearcă variantele numărului, verifică ziua biletului față de ziua zborului și salvează biletul cu datele de pe bilet (nume, loc, PNR). Erori separate: fără internet, cheie respinsă, furnizor, zbor negăsit, altă zi, aeroport necunoscut.
- **Aeroporturi:** tabel de mână (nume românești) + ~5.500 de aeroporturi IATA din OpenFlights (`src/data/airports-world.json`, ODbL) pentru ora locală, distanță și Schengen.

## 7. Datele de zbor și backend-ul

Backend: serverul echipei (repo `FlyQ-backend`, de Mihai). Adresa de producție e în `src/services/live/gatewayClient.ts`. Autentificare cu cheia aplicației (`X-FlyQ-App-Key`), apoi sesiune.

- **Zbor:** `GET /v1/flights/{număr}` cu `?date=`; răspunde `FlightRecord` (ore programate/estimate, poartă și `gateStatus`, `dataSource`, întârzieri).
- **ETA:** `GET /v1/flights/{număr}/eta` (cel mult o cerere pe minut); aplicația are și un model local de rezervă (`roughEta`).
- **Starea de pe server** se pune ca strat peste datele locale (`flightStatus`, `serverState`): poarta, întârzierea, starea. Bannerul `FlightChangeBanner` arată schimbările; `FlightStatusChip` arată starea.
- **Sincronizare** (`flightSync`): la 15 s, la revenirea în foreground și la primirea unei notificări.
- **Demo:** fără cheie sau cu un bilet demo, aplicația folosește date simulate, etichetate ca atare.
- **Ce vrem de la backend:** vezi `docs/PROMPT_BACKEND_*.md` (zboruri din orice aeroport, abonare după număr și dată, upsert pe token, mediu `production`, `demo: true` doar la simulări, starea anulat).

## 8. Notificări, înregistrare automată și Live Activity

- **Înregistrare automată** (`src/services/live/autoRegister.ts`): la adăugarea unui bilet, la deschiderea aplicației, la revenirea în foreground și la un token nou, aplicația cere permisiunea (o singură dată), ia tokenul APNs și face `POST /v1/push/subscriptions` pentru zborul biletului activ. Dedublat pe zbor și limbă. Nu e nimic de lipit manual.
- **Cheia aplicației** vine din ce a introdus utilizatorul sau din build (`EXPO_PUBLIC_FLYQ_KEY`, pusă în `~/.flyq-build-env` pe Mac, niciodată în git). Atenție: o cheie din aplicație poate fi extrasă din binar; pentru producție se recomandă un token per instalare (App Attest).
- **Notificări locale** (`localReminders`, `reminderPlan`): remindere programate pe telefon (îmbarcare, poarta se închide).
- **Live Activity** (`liveActivity.ts`, `flightActivity.tsx`): cardul de pe ecranul blocat și din Dynamic Island, fără hook-uri sau importuri în componentă (cerința `expo-widgets`). Pornește automat pentru un zbor care pleacă în sub 24 h, cât aplicația e deschisă (regulă iOS). Tokenul activității (diferit de al dispozitivului) pleacă la server prin `PATCH`. Cât aplicația e deschisă, cardul se reîmprospătează la un minut cu estimarea de aterizare.
- **Mediul APNs:** `sandbox` pentru build-urile din Xcode; `production` pentru TestFlight/App Store **[de schimbat la distribuire]**.
- Detalii: `docs/NOTIFICARI.md`, `docs/LIVE_ACTIVITIES.md`.

## 9. Partajarea zborului cu familia

- Butonul „Trimite familiei" cere serverului un link (`POST /v1/shares`) și deschide foaia de partajare iOS.
- **Pagina publică:** `web/share/index.html` (static, MapLibre 5 + OpenFreeMap), servită pe **https://flyq-share.netlify.app**. Cere `GET /v1/public/shares/{token}`; Netlify proxiază către server (`_redirects`), deci fără CORS.
- Pagina desenează globul cu traseul. Dacă serverul trimite `lat/lon = null`, ia coordonatele aeroporturilor din tabelul ei. Marchează `demo: true` cu o bandă.
- **`/test`** (și `/testing`): simulare fără token și fără server, cu butoane pe etape (check-in, îmbarcare, poarta se închide, întârziat, decolează, în aer, aterizat, auto).
- **Confidențialitate:** tokenul are ≥128 de biți; același 404 pentru token necunoscut, expirat sau revocat; nimic despre pasager în răspuns; pagină `noindex`.
- Detalii: `docs/SHARE_FLIGHT.md`. Netlify: `netlify.toml` are un build no-op, ca să nu ruleze scriptul de build al aplicației.

## 10. Harta

Sunt două hărți.

### 10.1 Harta 3D a terminalului (nouă, tabul „Hartă")
Modulul `packages/flyq-spatial/` (Denis; repo `deniskyu/flyq`, ramura `deniskyu-localizare`). Componentă nativă Fabric, Swift + un fișier Objective-C++, doar iOS.

- **Ce desenează:** planul terminalului (pereți, sticlă, ghișee, scări, plante), etichete cu iconițe (La Coco, VIP, cabinet medical, toalete, informații, securitate, magazine, cafenea, trei ieșiri), traseul cu indicații („În 12 m, la dreapta"), pinul tău cu direcția.
- **Trei variante ale hărții:** desenată (implicită), scanare 3D (`.usdz`), scanare 2D de sus. Se alege automat după memorie, economisire baterie și temperatură, sau din Setări.
- **Localizare:** cu camera (memorii vizuale ARKit `.flyqmap`; 3 zone incluse în aplicație: holul de check-in, informațiile, capătul aripii; celelalte 6 vor veni din backend **[nescris pe partea nativă: MemoryZoneSync]**), cu LiDAR (potrivire pe pereți), sau fără cameră (modul „Test").
- **Interfața** (`src/flyq/screens/MapScreen.tsx`): bară de căutare (filtrează caruselul de locuri; Enter pornește traseul spre primul rezultat; roata din bară deschide Setările), carusel cu distanțe, două butoane rotunde jos-dreapta (busolă: te centrează și rotește harta după telefon, apăsare lungă = nord în sus; 2D/3D), panou de jos tras (în tema albă), buton „Mută-mă" și buton **„Scanează codul QR de la intrare (simulat)"**.
- **QR simulat:** pune utilizatorul la afișul intrării principale din plan, cu fața spre hol. Scanarea reală a QR cu camera nu e scrisă în aplicație; codurile QR de la intrări deschid momentan pagina web a hărții (backend B10).
- **Urmărire:** camera te urmărește strâns și se întoarce singură pe tine la 3 s după atingere; harta se rotește după orientare.
- **Iconițe:** mari de la distanță, mici de aproape, nu dispar la zoom.
- **Pașii și busola (PDR)** (`src/flyq/lib/pdr.ts`): cu pinul pus pe hartă, acceleratorul numără pașii (detector de vârfuri, pas de 0,7 m), busola dă direcția (filtrată, minus `northDeg` al hărții), giroscopul oprește numărarea când telefonul e scuturat. Comenzile native: `setPose`, `setHeading`. Cere permisiunile de locație (busolă) și mișcare. **[neverificat pe telefon]** `northDeg` nu e măsurat, deci harta poate fi rotită față de realitate.
- **Comenzi native** (JS → Swift, `SpatialCommand`): `routeTo`, `clearRoute`, `walkRoute`, `setPlaceMode`, `setPose`, `setHeading`, `setFollow`, `setHeadingUp`, `setViewMode`, `recenter`, `overview`, `startLocalization`, `setBackend`, `setMapView` și altele (lista în `packages/flyq-spatial/README.md`).
- **Integrarea:** dependență `file:./packages/flyq-spatial`; regula `ios/` din `.gitignore` are o excepție pentru modul. Backendul și cheia vin din aplicație. Detalii și neverificat: `docs/HARTA_3D_INTEGRARE.md`.
- **Asistentul** deschide harta pe un loc: „unde e salonul VIP" → `FlyQMap` cu `routeTo` (câmpul `mapLabel` din `places.json`).

### 10.2 Harta veche
Schema din `src/data/terminal.json` și `pois.json`, cu A* (`src/lib/astar.ts`). Rămâne în Profil → „Harta veche".

## 11. Accesibilitate

- **Ghid haptic** pentru persoane cu deficiențe de vedere (`src/flyq/lib/hapticGuide.ts`; eveniment nativ `guide` din `FlyQSpatialHostView.swift`): pe traseu un tic ușor la ~2 s; abatere spre stânga = 1 lovitură, spre dreapta = 2; cu cât ești mai abătut, cu atât pauza e mai scurtă și loviturile mai ferme; în spate = vibrație de avertizare rapidă; sosire = tipar de succes; anunțuri VoiceOver la 20, 10, 5 m și la sosire. Pornit automat cu un screen reader; comutator sub cardul traseului.
- **Direcția** vine din camera ARKit sau din busola telefonului (PDR). **[neverificat pe teren]**
- Texte alternative pe butoane și pe imagini, `accessibilityRole`, mărimi de țintă ≥44 pt, respectarea „reduce motion".

## 12. Confidențialitate și securitate

- La server pleacă doar numărul zborului, data și tokenurile de notificare. Numele, PNR-ul, locul și codul brut al biletului rămân pe telefon.
- Camera nu trimite imagini; harta vizuală e locală.
- **Secrete:** cheia aplicației, tokenul de admin, tokenurile dispozitivelor și Live Activity nu se pun în cod, git, loguri sau chat. Tokenul de admin al serverului nu intră niciodată într-o aplicație. Dacă un secret ajunge într-un chat, se schimbă.
- Repo-ul e public: înainte de push se caută UDID-uri, ID de echipă, IP-uri locale, căi și numele utilizatorului.
- Pagina de partajare: vezi §9.

## 13. Structura repo-ului

```
src/app                 App.tsx, navigare, navRef, TabBar
src/screens             ecranele aplicației
src/components          componentele UI (Glass, Button, StepItem, FlightStatusChip, ...)
src/core                logica pură a asistentului (router, KB, locuri, capabilități, urgențe)
src/llm                 RoLlamaEngine, gramatica GBNF
src/tools               bucla de unelte, sanitizer, compozitor
src/services            contracte, mock/, live/ (backend, push, Live Activity, sync)
src/store               Zustand persistat
src/lib                 bcbp, journey, suggestions, geo, time, globeHtml
src/flyq                ecranul și logica hărții 3D (Denis), pdr, hapticGuide
src/data                zboruri demo, locuri, cunoștințe, aeroporturi
packages/flyq-spatial   modulul nativ al hărții (Swift)
web/share               pagina de partajare + /test
scripts                 mac/ (build), share-dev-server, verify
tests                   vitest (peste 1.000 de teste)
docs                    documentația (vezi INDEX.md)
finetune                antrenarea și exportul modelului
```

## 14. Build, instalare, ramuri

**Cerințe:** Node ≥ 22; Expo SDK 58; Mac cu Xcode pentru iOS; iPhone real pentru cameră, notificări, Live Activity.

**Comenzi locale:**
```bash
npm install --ignore-scripts   # pe Windows (postinstall-ul llama.rn cere un tar compatibil; build-ul real e pe Mac)
npx tsc --noEmit               # tipuri
npx vitest run                 # teste
```

**Build iOS** (Mac mini, comandat din PC): `scripts/mac/remote.mjs build` sincronizează codul prin git pe Mac și rulează `scripts/mac/build-ios.sh` într-un Terminal. Variabile: `MAC_HOST`, `MAC_DEVICE` (UDID), `PUSH=1` (păstrează capabilitatea de notificări). Detalii: `docs/IOS_BUILD.md`, `docs/GHID_BUILD_MAC_FRONTEND.md`.

- **Semnare:** build-urile trebuie pornite din sesiunea grafică (Terminal), nu prin SSH simplu: fără keychain, `codesign` dă `errSecInternalComponent`.
- **Cheia aplicației** în build: `~/.flyq-build-env` pe Mac cu `export EXPO_PUBLIC_FLYQ_KEY=...`.
- **Spațiu pe disc:** `npm ci` și Xcode au nevoie de câțiva GB liberi; „no space left on device" a oprit build-uri.
- **Un singur build odată** pe Mac; un `npm ci` întrerupt lasă `node_modules` pe jumătate șters (se repară cu ștergerea folderului).
- **Aplicație nouă pe alt telefon:** dispozitivul trebuie înregistrat în profilul de semnare (signing automat), cu Developer Mode pornit.
- **Modelul AI** se copiază separat în `Documents/models/` (nu intră în build).

**Ramuri:** `main` (GitHub, public, `EduardAndreiNiculescu/flyq-rollama`) conține tot, inclusiv modulul hărții. `feat/denis-map` e istoria integrării. Tag-ul `pre-denis-map-integration` e punctul de întoarcere dinainte de modulul hărții.

## 15. Teste și verificări

- **vitest:** peste 1.080 de teste (logică: asistent, KB, locuri, sugestii, bilete reale, journey, pdr, haptic, share, GGUF). `npx tsc --noEmit` curat.
- Nu se simulează modelul real în teste: rutele modelului sunt verificate cu un model simulat; comportamentul RoLlama real se vede pe telefon cu caseta de diagnostic.
- `node scripts/verify.mjs`: verificări de fișiere și contracte.
- Pagina de partajare: contract testat contra serverului de dezvoltare (`scripts/share-dev-server.mjs`, `--bare` pentru coordonate null).

## 16. Stare: verificat, neverificat, probleme cunoscute

**Verificat (pe telefon sau în teste):** rutarea și răspunsurile asistentului din reguli, sugestii, locuri, bilete reale cu server simulat, aeroporturi din lume, pașii blocați din Călătorie, pagina de partajare (browser) și `/test`, deploy-ul pe Netlify, build iOS al aplicației de bază cu cameră, glob, tema luminoasă și harta 3D (încărcare, etichete, traseu, bară de căutare, butoane).

**Neverificat:**
- Senzorii (pași, busolă, giroscop) pe telefon cu build-ul final; direcția față de plan (`northDeg`).
- Ghidul haptic la mers real.
- Localizarea cu camera (memorii vizuale) în terminal.
- Înregistrarea push automată cap-coadă cu serverul real; Live Activity pornit singur.
- Zbor anulat: nu are ecran dedicat; cardul și notificarea nu sunt testate.
- Modelul real răspunde la întrebările de demo prin rutarea așteptată.

**Probleme cunoscute:** AFR188 dă 404 de la server; „sticlă de apă de 500 ml", „întârziere de 5 ore" și „am pierdut zborul" nu au răspuns bun; lipsesc din KB wifi, încărcare, schimb valutar; globul cere internet (fără el apare harta desenată); QR scanat cu camera nu e scris; 6 din 9 memorii vizuale nu sunt încă în backend.

## 17. Echipă și repo-uri

- **Alex** (Nicu): aplicația Expo, asistentul, integrarea.
- **Mihai:** backend `FlyQ-backend` (zboruri, ETA, push, partajare, harta web prin QR), modulul de scanare, pagina Netlify către server. Lucrează pe branch + PR; nu se face merge fără aprobarea unui om (`main` al backend-ului se deployează automat).
- **Denis:** harta 3D și localizarea (`deniskyu/flyq`), scanarea LiDAR, filmările și pozele din terminal.
- Repo aplicație: https://github.com/EduardAndreiNiculescu/flyq-rollama · Pagina de partajare: https://flyq-share.netlify.app.

## 18. Glosar

- **BCBP:** formatul IATA al codului de pe cartea de îmbarcare (PDF417/Aztec/QR).
- **Live Activity:** card pe ecranul blocat și în Dynamic Island, actualizat prin push.
- **APNs:** serviciul de notificări Apple; `sandbox` vs `production`.
- **RoLlama:** Llama 3.2 adaptat pentru română (modelul 1B de pe telefon).
- **GBNF:** gramatică care constrânge ieșirea modelului la JSON valid cu uneltele permise.
- **PDR:** pedestrian dead reckoning, poziție din pași și busolă.
- **Memorie vizuală (`.flyqmap`):** hartă ARKit a unei zone din terminal, folosită pentru localizare cu camera.
- **`northDeg`:** unghiul dintre nordul real și „nordul" hărții desenate; deocamdată 0.
