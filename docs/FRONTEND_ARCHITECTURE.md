# Arhitectura front-end-ului AirportApp

Rădăcina analizată: `<cale-locala>`. Toate căile de mai jos sunt relative la această rădăcină, cu excepția celor care încep cu `flightflow/`, care sunt din repo-ul FlightFlow. Documentul e scris din citirea fișierelor. Nu s-a instalat nimic, nu s-a rulat aplicația și nu s-au făcut apeluri de rețea. Fișierele cu valori secrete nu sunt citate.

## 1. Ce este aplicația

Afirmația autorului (`HANDOFF.md`, secțiunea 1): o aplicație mobilă pentru pasagerii Aeroportului Internațional Craiova, care îi ghidează de la intrarea în aeroport până la aterizare. Funcțiile declarate sunt adăugarea biletului (cod BCBP), pașii din aeroport, o hartă indoor, un tracker de zbor în modul avion, un asistent „offline” și un profil. Autorul spune că toate datele sunt mock și că aplicația e făcută pentru Craiova Hackathon V2.0. Aceasta este o descriere a autorului; verificarea din cod e în secțiunile 5 și 7.

## 2. Stack și cum se pornește

| Aspect | Ce am găsit | Sursă |
|---|---|---|
| Limbaj | TypeScript, cu `strict` și `noUncheckedIndexedAccess` | `AirportApp/tsconfig.json` |
| Framework | React Native 0.88.1, React 19.3.0, React Native Community CLI. **Nu** este Expo | `AirportApp/package.json`, `AirportApp/app.json` (conține doar `name` și `displayName`) |
| Punct de intrare | `index.js` înregistrează `src/app/App.tsx` | `AirportApp/index.js` |
| Navigare | `@react-navigation/native`, `native-stack` și `bottom-tabs` (7.x) | `AirportApp/src/app/App.tsx`, `AirportApp/src/app/navigation.ts` |
| Stare | zustand 5, cu `persist` | `AirportApp/src/store/*.ts` |
| Persistență locală | `@react-native-async-storage/async-storage` v3, cu baza `airport-app` | `AirportApp/src/store/storage.ts` |
| Animații și gesturi | `react-native-reanimated` 4.7.1 (plus `react-native-worklets`), `react-native-gesture-handler` 3.4 | `AirportApp/babel.config.js`, `AirportApp/src/app/App.tsx` |
| Grafică | `react-native-svg` 15.16 pentru harta schematică a zborului; `lucide-react-native` pentru iconițe | `AirportApp/src/components/FlightRouteMap.tsx` |
| Teste | Jest cu preset-ul RN, 6 fișiere de test | `AirportApp/jest.config.js`, `AirportApp/__tests__/` |
| Node | `>= 22.11.0` | `AirportApp/package.json` (`engines`) |

Lipsesc din `package.json`: un pachet de geolocalizare, un client HTTP și orice SDK de AI. În cod nu există GPS real și nu există apeluri de rețea.

**Pornirea pe Windows** (`porneste-aplicatia.bat`, dublu-click):
1. Setează `JAVA_HOME` la un JDK 17 cu cale fixă (`C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot`) și `ANDROID_HOME` la `%LOCALAPPDATA%\Android\Sdk`.
2. Pornește emulatorul `Pixel_8_API_35`, dacă nu rulează deja.
3. Pornește Metro (`npm start`) într-o fereastră separată, dacă portul 8081 nu e ocupat.
4. Rulează `npx react-native run-android --active-arch-only --no-packager`.

Scripturile din `AirportApp/package.json` sunt `android`, `ios`, `start`, `test` și `lint`. Capcana de mediu descrisă de autor (`HANDOFF.md`, secțiunea 3): variabila `NoDefaultCurrentDirectoryInExePath` face ca `gradlew.bat` să nu fie găsit. Pe iOS nu s-a testat nimic, pentru că autorul nu are Mac.

`AirportApp/README.md` este șablonul implicit React Native („This is a new React Native project…”). README-ul cerut de brief nu e scris încă (`HANDOFF.md`, secțiunea 8, punctul 2).

## 3. Harta folderelor

| Cale | Rol |
|---|---|
| `HANDOFF.md` | Descrierea și istoricul autorului. Nu e cod. |
| `porneste-aplicatia.bat` | Launcher-ul de Windows (vezi secțiunea 2). |
| `design/` | Schițe, palete și capturi (vezi secțiunea 6). |
| `AirportApp/index.js` | Înregistrarea aplicației în `AppRegistry`. |
| `AirportApp/src/app/` | `App.tsx` (providere, stack-ul de onboarding și tab-urile), `TabBar.tsx` (bara plutitoare sau meniul lateral), `navigation.ts` (tipurile de rute), `tabBarInset.ts` (înălțimea barei). |
| `AirportApp/src/screens/` | Nouă ecrane: `AddTicketScreen`, `ScanScreen`, `PasteScreen`, `PassScreen`, `JourneyScreen`, `MapScreen`, `FlightScreen` (conține și `LandingView`, conform `HANDOFF.md`), `AssistantScreen`, `ProfileScreen`. |
| `AirportApp/src/components/` | Componente UI: `Glass.tsx`, `GlassBackground.tsx`, `Layout.tsx`, `Controls.tsx`, `AppText.tsx`, `Button.tsx`, `Badge.tsx`, `BottomSheet.tsx`, `ChatBubble.tsx`, `StatTile.tsx`, `StepItem.tsx`. `FlightRouteMap.tsx` este harta schematică a zborului (SVG). |
| `AirportApp/src/components/map/` | `MapPanel.tsx` (panoul de hartă cu instrucțiuni, folosit în Călătorie și în Hartă) și `MapPlaceholder.tsx` (locul hărții indoor, cu interfața `IndoorMapProps`). |
| `AirportApp/src/services/` | `types.ts` (interfețele), `index.ts` (singurul loc unde se alege implementarea), `mock/` (7 implementări mock). |
| `AirportApp/src/store/` | `tickets.ts` (bilete și pași, persistate), `settings.ts` (limbă, accesibilitate), `flightMode.ts` (starea zborului și abonarea la tracker), `indoorNav.ts` (ruta și poziția indoor), `addTicket.ts` (hook-ul de adăugare a biletului), `storage.ts` (baza AsyncStorage). |
| `AirportApp/src/lib/` | Logică fără UI: `bcbp.ts` (parserul BCBP), `astar.ts` (rutare), `instructions.ts`, `journey.ts` (pașii Călătoriei), `geo.ts`, `time.ts`, `tickets.ts`, `useNow.ts`. |
| `AirportApp/src/theme/` | `tokens.ts` (toate culorile, spațierile, razele, tipografia) și `responsive.ts` (breakpoint-uri și `useLayout`). |
| `AirportApp/src/i18n/` | `ro.ts` (limba implicită), `en.ts`, `index.ts` (hook-urile `useT` și `useLocalized`). |
| `AirportApp/src/data/` | Date statice: `terminal.json` (noduri, muchii și zone ale terminalului), `flights.json` (aeroporturi, zboruri, repere), `pois.json`. |
| `AirportApp/src/types/index.ts` | Tipurile de domeniu: `BoardingPass`, `Flight`, `Ticket`, `Airport`, `Landmark`, `Terminal`, `IndoorPosition`, `FlightPosition`, `FlightContext`. |
| `AirportApp/__tests__/` | Teste pentru `bcbp`, `astar`, `geo`, `instructions`, `journey` și `responsive`. |
| `AirportApp/android/`, `AirportApp/ios/` | Proiecte native generate de template-ul RN. Conțin fișierele de semnare (vezi secțiunea 9). |

## 4. Ecrane și navigare

**Stack-ul rădăcină** (`AirportApp/src/app/App.tsx`, `AirportApp/src/app/navigation.ts`):
- `AddTicket` este ecranul inițial, dacă nu există un bilet cu zbor viitor. În caz contrar, ecranul inițial este `Main` (funcția `hasUpcomingTicket` din `AirportApp/src/lib/tickets.ts`).
- `Scan` (camera simulată), `Paste` (lipirea codului), `Pass` (cardul de îmbarcare), `Main` (tab-urile).
- Până se citesc biletele din AsyncStorage, `RootNavigator` afișează doar fundalul, ca să nu sară onboarding-ul.

**Tab-urile** (`MainTabs` din `App.tsx`): `Journey` (Călătorie), `Map` (Hartă), `Flight` (Zbor), `Assistant` (Asistent), `Profile` (Profil).
- Pe telefon și tabletă în portret, `TabBar.tsx` afișează o capsulă de sticlă plutitoare jos.
- Pe ecrane `expanded` (≥ 840 dp, conform `HANDOFF.md`), `tabBarPosition` devine `left` și bara devine meniu lateral cu cardul biletului.

**Fluxurile principale:**
- Adăugarea biletului: `AddTicket` → `Scan` (mock, după 3,2 s primește `DEMO_BCBP`) sau `Paste` → `useAddTicket` (`AirportApp/src/store/addTicket.ts`) parsează codul, găsește zborul, salvează biletul și deschide `Pass`.
- Zborul: butonul de pornire setează `phase` la `inAir` (`AirportApp/src/store/flightMode.ts`). Când trackerul ajunge la progres 1, `phase` devine `landed` și `FlightScreen.tsx` afișează `LandingView`. Din Zbor se poate trece la Asistent cu `navigate('Main', { screen: 'Assistant' })`.
- Harta: primește `targetNodeId` prin parametrii rutei. Implicit este `f1_gate<poarta>` (`AirportApp/src/screens/MapScreen.tsx`, linia 27). Apăsarea lungă pe titlu deschide modul debug.
- Pașii Călătoriei sunt `arrive`, `checkin`, `security`, `passport`, `gate` și `boarding` (`AirportApp/src/screens/JourneyScreen.tsx`, `STEP_ICONS`).

## 5. Fluxul de date

Tot ce urmează e citit din cod. Acolo unde vine din `HANDOFF.md`, e spus explicit.

| Date | De unde vine astăzi | Fișier | Stare |
|---|---|---|---|
| Codul biletului | Lipit de utilizator (`PasteScreen`) sau returnat de scanner (`MockBarcodeScannerService.ts`, după 3,2 s, `DEMO_BCBP`). Parsat local de `lib/bcbp.ts`. | `AirportApp/src/services/mock/MockBarcodeScannerService.ts` | Mock la scanare; parser real |
| Zborul (`findFlight`, `getFlight`, `getAirport`, `getLandmarks`) | Fișierul `flights.json`, citit sincron | `AirportApp/src/services/mock/MockFlightDataService.ts`, `AirportApp/src/data/flights.json` | Mock (date statice) |
| Ora curentă | Ceas simulat, ancorat la `2026-10-31T06:22Z`, care merge în timp real. Profilul îl poate muta înainte. | `AirportApp/src/services/mock/MockClockService.ts` | Mock |
| Poziția în zbor | Simulare pe cerc mare, cu viteza ×45. Primele 14 s sunt estimare, apoi „GPS” simulat. Nu există GPS real. | `AirportApp/src/services/mock/MockFlightTrackerService.ts` | Mock |
| Poziția indoor | Simulare pe ruta A*, cu 1,3 m/s. Fișierul nu l-am deschis; descrierea vine din `HANDOFF.md`, secțiunea 5. | `AirportApp/src/services/mock/MockIndoorPositionService.ts` | Mock |
| Harta terminalului (noduri, muchii, zone) | `terminal.json`, prin `MockTerminalService` | `AirportApp/src/data/terminal.json`, `AirportApp/src/lib/astar.ts` | Date inventate, algoritm real |
| Răspunsurile asistentului | Expresii regulate pe întrebare și șabloane cu datele zborului, trimise token cu token | `AirportApp/src/services/mock/MockAssistantService.ts` | Mock. Nu există niciun model |
| Biletele, pașii, setările | AsyncStorage prin zustand `persist`, cu cheia `airport-app`. Se salvează inclusiv `pass.raw`, numele pasagerului și PNR-ul, în clar. | `AirportApp/src/store/tickets.ts`, `AirportApp/src/store/settings.ts`, `AirportApp/src/store/storage.ts` | Real și local |
| Rețea | Niciun apel HTTP în `AirportApp/src`. Căutarea după `fetch`, `axios`, `https://`, `WebSocket` a dat doar potriviri în README și în fișierele native. | — | Inexistent |

**Interfețele** (`AirportApp/src/services/types.ts`): `ClockService`, `FlightDataService`, `TerminalService`, `BarcodeScannerService`, `IndoorPositionService`, `FlightTrackerService` și `AssistantService`. UI-ul importă doar din `AirportApp/src/services/index.ts`, unde se alege implementarea. Interfețele `FlightDataService` și `TerminalService` sunt sincrone. Asta contează la integrare (secțiunea 8).

## 6. Sistemul de design

- `design/wireframes.html` (1111 linii, titlul „AirportApp — Schițe v2”): schițele aprobate, cu fluxul principal, stările alternative și variantele responsive. Culoarea de accent `#2E5BFF` apare de 10 ori. Comentariul din `AirportApp/src/theme/tokens.ts`, linia 1, spune că tokenii vin din acest fișier. Nu am comparat valorile una câte una.
- `design/palettes.html` (164 linii, titlul „AirportApp — Palete liquid glass”): comparație între palete. `#2E5BFF` apare de 2 ori.
- `design/screens/` conține 17 capturi PNG: `01-onboarding` până la `13-profile`, apoi `14-r-small`, `15-r-android`, `16-r-tablet-portrait` și `17-r-tablet-landscape`. Nu sunt citite de cod; sunt referință vizuală.
- Tokenii sunt scriși manual în `AirportApp/src/theme/tokens.ts`: culorile (paleta „Alb-albastru”, doar temă luminoasă), spațierile, razele, tipografia și `touchTarget`. Breakpoint-urile sunt în `AirportApp/src/theme/responsive.ts` (compact < 360, regular 360–599, medium 600–839, expanded ≥ 840, conform `HANDOFF.md`).
- Sticla (`AirportApp/src/components/Glass.tsx`) este un alb translucid fără blur. Motivul e scris în `tokens.ts`, liniile 31–33: `@react-native-community/blur` a fost refuzat din cauza vechimii lui (`HANDOFF.md`, secțiunea 4).
- Regula din `HANDOFF.md`, secțiunea 5: nicio culoare scrisă direct în componente. Nu am verificat dacă regula e respectată peste tot.
- Nu există fișier de tokeni exportat (JSON, Figma). Nu există un design system separat.

## 7. Ce e real și ce e placeholder

**Real (cod funcțional):** navigarea și onboarding-ul; parserul BCBP (`AirportApp/src/lib/bcbp.ts`); algoritmul A* (`AirportApp/src/lib/astar.ts`); pașii Călătoriei (`AirportApp/src/lib/journey.ts`); persistența locală; i18n RO/EN; layout-ul responsive; cele 6 fișiere de test.

**Mock (date sau comportament simulat):** datele de zbor, ceasul, scanerul, trackerul de zbor, poziția indoor și asistentul. „API-ul aproximat” din `HANDOFF.md` este, în cod, un fișier JSON local.

**Placeholder:** harta indoor, `AirportApp/src/components/map/MapPlaceholder.tsx`. Autorul spune că un coleg o integrează.

**Neverificat, conform `HANDOFF.md`, secțiunea 7:** asistentul pe ecran; `LandingView`; reflexul de sticlă refăcut; layout-urile compact (320 dp), medium și expanded; fluxurile Scanează și Lipește pe emulator. Testele de unitate (`__tests__/`) nu le-am rulat. Cifra de 51 de teste care trec e a autorului.

**Nu există:** GPS real, API real de zbor, server, model AI local.

## 8. Puncte de integrare cu FlightFlow

Repo-ul FlightFlow este la `<cale-locala>`. Căile de mai jos sunt relative la el.

### 8.1 Asistentul (ecranul de chat)

- Front: `AssistantService.ask(question, context: FlightContext): AsyncIterable<string>` (`AirportApp/src/services/types.ts`). `AssistantScreen.tsx` consumă stream-ul token cu token. Interfața se potrivește unui model local care emite token-uri.
- `FlightContext` din front (`AirportApp/src/types/index.ts`) conține `flight`, `ticket`, `position?`, `nowUtc`, `language`.
- FlightFlow: `PassengerContext` (`flightflow/src/core/types.ts`, liniile 11–18) conține `flightNumber?`, `airportCode?`, `journeyStage?` (`pre_airport`, `check_in`, `security`, `airside`, `boarding`, `in_flight`, `arrival`), `currentZone?`, `positionConfidence?` și `connectionAvailable` (obligatoriu). Este folosit în `flightflow/src/core/prompt.ts` și `flightflow/src/core/assistant.ts`.
- Ce trebuie schimbat: o nouă implementare `AssistantService` care convertește `FlightContext` în `PassengerContext`.
  - `journeyStage` se poate deriva din pașii Călătoriei și din `phase` (`ground`, `inAir`, `landed`, în `flightMode.ts`).
  - `currentZone` ar veni din poziția indoor, adică din zonele din `terminal.json`. Id-urile de acolo (de exemplu `f0_entrance`) nu corespund neapărat zonelor folosite de FlightFlow. Nu am determinat ce zone folosește FlightFlow.
  - `connectionAvailable` ar fi `false`, pentru că front-ul e offline.
- Navigarea: FlightFlow apelează `nav.openAirportMap({ destination, fromZone })` (`flightflow/src/core/assistant.ts`, linia 152, și `flightflow/src/tools/registry.ts`, linia 109). Front-ul nu are această metodă. Cea mai apropiată este `navigate('Main', { screen: 'Map', params: { targetNodeId } })` (`AirportApp/src/app/navigation.ts`). Trebuie un adaptor care traduce destinația în id de nod din `terminal.json`.

### 8.2 Datele de zbor

- FlightFlow: `FlightRecord` (`flightflow/src/core/types.ts`, liniile 20–36) are `gate` nullabil, `gateStatus`, `dataSource` (`demo`, `airport_feed`, `user_entered`, `airlabs`), estimări și întârzieri. Comentariul de la linia 31 spune că estimările apar lângă orar, niciodată în locul lui. AirLabs e în `flightflow/src/tracking/airlabs.ts`.
- Front: `FlightDataService` (`AirportApp/src/services/types.ts`) are `findFlight`, `getFlight`, `getAirport` și `getLandmarks`, toate **sincrone**. `Flight` (`AirportApp/src/types/index.ts`) nu are întârzieri, estimări sau `dataSource`.
- Problema principală: datele reale vin de la server, deci asincron, iar interfețele sunt sincrone. Apelurile existente ar trebui refăcute: `hasUpcomingTicket` din `App.tsx`, `useAddTicket` (`store/addTicket.ts`) și componentele din `TabBar.tsx`, `JourneyScreen.tsx` și `FlightScreen.tsx`. O variantă ar fi să se țină datele de zbor într-un store, populat asincron.
- Punctul de înlocuire rămâne `AirportApp/src/services/index.ts`.
- Regula de „API aproximată” din `HANDOFF.md` (orarul sau traseul planificat până la GPS) trebuie aliniată cu regula FlightFlow de mai sus.

### 8.3 Harta

- Harta indoor se integrează prin `IndoorMapProps` din `AirportApp/src/components/map/MapPlaceholder.tsx`: `floor`, `route`, `position`, `targetNodeId`, `showDebug`. Colegul trebuie să respecte aceste props, iar `MapPanel.tsx` nu trebuie schimbat.
- `FlightRouteMap.tsx` este o hartă separată, schematică, a zborului. Nu se confundă cu harta indoor.
- Harta indoor a colegului trebuie aliniată cu `terminal.json` (2 etaje) și cu zonele FlightFlow. Nu am determinat ce format de hartă folosește colegul.

### 8.4 Stack-ul

- Front-ul folosește React Native CLI fără Expo, cu rutare prin `@react-navigation`.
- FlightFlow declară în `flightflow/AGENTS.md` că aplicația e Expo, cu Expo Router și rute în `src/app/`. Front-ul are `src/app/App.tsx` ca fișier de shell, nu ca rută. Cele două convenții nu sunt compatibile direct.
- Ambele proiecte sunt TypeScript. Nu am comparat versiunile de TypeScript și de React Native, pentru că nu am citit `package.json` din FlightFlow.

## 9. Riscuri și întrebări deschise

1. **Două shell-uri de aplicație.** `AirportApp/src/app/App.tsx` (React Navigation, RN CLI) și `App.tsx`-ul din FlightFlow (calea exactă nu am verificat), cu convențiile din `flightflow/AGENTS.md` (Expo, Expo Router). Trebuie ales unul.
2. **Secret hardcodat găsit.** `AirportApp/android/app/build.gradle`, liniile 90–93 (bloc `signingConfigs`): `storeFile`, `storePassword`, `keyAlias` și `keyPassword` sunt scrise direct în fișier. Valorile nu sunt copiate aici. Fișierul `AirportApp/android/app/debug.keystore` este în repo. Linia 103 semnează build-ul de **release** cu `signingConfigs.debug`, iar comentariul de la linia 101 recunoaște asta. Nu am citit `AirportApp/android/app/debug.keystore`.
3. **Date personale în clar.** `AirportApp/src/store/tickets.ts` salvează `pass.raw`, numele pasagerului și PNR-ul în AsyncStorage, fără criptare.
4. **Interfețe sincrone pentru date asincrone.** Vezi secțiunea 8.2. Este cea mai mare schimbare de arhitectură.
5. **Asistentul nu are model.** Nu există nicio referință la Qwen sau la un model local în front. `MockAssistantService.ts` este singura implementare.
6. **Harta este placeholder.** Nu există un contract de date pentru colegul care o integrează, în afară de `IndoorMapProps`.
7. **Testare incompletă.** Asistentul, `LandingView` și layout-urile compact, medium și tabletă nu sunt verificate (`HANDOFF.md`, secțiunea 7). Nu am rulat testele.
8. **README-ul nu e scris.** `AirportApp/README.md` este șablonul RN.
9. **Snapshot fără git.** Folderul de la `Downloads` nu are `.git`. `HANDOFF.md` vorbește de `E:\1.HACKATRON`, care are istoric git, folderul `boarding-pass-test/` și `cercetare-navigatie-indoor-PDR.md`. Niciunul dintre acestea nu există aici. Nu am determinat dacă cele două copii sunt identice.
10. **Launcher cu căi fixe.** `porneste-aplicatia.bat` are căi hardcodate pentru JDK 17 și pentru emulatorul `Pixel_8_API_35`. Funcționează pe mașina autorului.
11. **iOS netestat.** `AirportApp/ios/` există (Podfile, AppDelegate.swift), dar nu a fost compilat.
12. **Componente duplicate.** Nu am găsit componente duplicate în `AirportApp/src/components/`. Există două hărți cu roluri diferite: `FlightRouteMap.tsx` (zbor) și `map/MapPanel.tsx` cu `MapPlaceholder.tsx` (indoor).
