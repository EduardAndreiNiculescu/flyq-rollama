# Live Activity (cardul de pe ecranul blocat și din Dynamic Island)

Starea la 31.10.2026. Ce e verificat și ce nu e marcat în fiecare secțiune.

## 1. Ce este

Un card care arată zborul pasagerului fără să deschidă aplicația: numărul zborului, ruta, starea, poarta, orele și un progres. Se actualizează de pe server prin push (`apns-push-type: liveactivity`). Cât aplicația e deschisă, ea își reîmprospătează singură cardul cu estimarea de aterizare.

Implementare: pachetul `expo-widgets` (SDK 58). Pluginul generează extensia de widget (`ExpoWidgetsTarget`); aspectul se scrie în JS, fără SwiftUI de mână.

## 2. Fișiere

| Fișier | Rol |
|---|---|
| `app.json` | pluginul `["expo-widgets", { "enablePushNotifications": true }]`; schema `flyq` |
| `src/services/live/flightActivity.tsx` | **aspectul** cardului (banner, Dynamic Island) și tipul `FlightActivityProps` |
| `src/services/live/liveActivity.ts` | pornire, reîmprospătare o dată pe minut (doar cu aplicația deschisă), oprire, `ACTIVITY_URL` |
| `src/services/live/arrival.ts` | estimarea de aterizare din poziția live |
| `src/services/live/push.ts` | `patchLiveActivityToken`: trimite serverului tokenul cardului |
| `src/screens/LiveFlightScreen.tsx` | ecranul deschis la atingerea cardului (`flyq://live`) |
| `src/screens/LiveScreen.tsx` | butoanele de test („Pornește cardul", „Oprește cardul") și afișarea tokenurilor |
| `scripts/push.mts` | comenzi de laptop: evenimente demo și `card` (stare directă) |

Regulă pentru `flightActivity.tsx`: componenta rulează în extensie, deci **fără hooks, fără importuri folosite în corp, fără valori din scope-ul modulului**; doar componente `@expo/ui/swift-ui`.

## 3. Contractul de date (`props`)

Serverul trimite `content-state` în formatul `expo-widgets`:

```json
{ "name": "FlyQFlight", "props": "<JSON.stringify(starea)>" }
```

`props` este un **text** JSON, nu un obiect. Cheile:

| Cheie | Tip | Obligatorie | Rol |
|---|---|---|---|
| `status` | text | da | `scheduled`, `boarding`, `delayed`, `gate_closing`, `departed`, `landed`, `cancelled`, `diverted` |
| `gate` | text sau null | nu | poarta |
| `boardingTime` | "HH:MM" | nu | ora îmbarcării, ora Craiovei |
| `departureTime` | "HH:MM" | da | ora programată |
| `estimatedDeparture` | "HH:MM" | nu | ora estimată |
| `delayMinutes` | număr | da | întârzierea |
| `updatedAt` | secunde UNIX | da | momentul actualizării |
| `flightNumber`, `from`, `to` | text | nu | antetul și ruta |
| `arrivalTime` | "HH:MM" | nu | ora estimată la destinație |
| `arrivalEpoch` | secunde UNIX | nu | cu el, cardul numără singur „Aterizare în …" |
| `boardingEpoch`, `departureEpoch` | secunde UNIX | nu | cu `boardingEpoch`, countdown până la îmbarcare |
| `progress` | 0..1 | nu | bara de progres în zbor |

Chei noi se adaugă **doar opționale**. Cheile necunoscute sunt ignorate de card. Contractul oficial al serverului este în repo-ul backend (`docs/backend/live-activity-contract.json`).

## 4. Fluxul

1. **Abonare:** Profil → Mod test → „Activează notificările" (`registerForFlight`). Serverul răspunde cu `subscriptionId` și `ownerToken`, păstrat în SecureStore.
2. **Pornire card:** „Pornește cardul Live Activity" → `startFlightActivity`. Dacă avionul e deja în aer (poziție live), cardul pornește cu estimarea.
3. **Tokenul cardului:** `activity.addPushTokenListener` și `getPushToken` dau tokenul **cardului**; aplicația îl trimite cu `PATCH /v1/push/subscriptions/{id}` (`{ "liveActivityToken": "<hex>" }`, header `X-Owner-Token`). Fiecare card nou are alt token. Mod test îl afișează.
4. **Actualizări:** serverul trimite `update` la poartă, îmbarcare, întârziere, închiderea porții; `end` la aterizare, anulare sau deviere.
5. **Atingere:** cardul pornește cu legătura `flyq://live`, care deschide ecranul „Zbor live".
6. **Oprire:** „Oprește cardul" → `end('immediate')` și `PATCH` cu `null`.

**Tokenul dispozitivului nu merge pe topicul `liveactivity`.** Apple răspunde `DeviceTokenNotForTopic`. Pe ruta de test a serverului se folosește tokenul cardului.

## 5. Estimarea de aterizare

`liveArrival` cere serverului poziția live (`fetchFlight`) și folosește modelul `roughEta` din `src/tracking/eta.ts` (viteză la sol și distanță). Rezultat: ora de aterizare, progresul pe traseu, kilometrii rămași.
- Nu e calibrată (`calibrated: false`); cardul nu o prezintă ca ora oficială.
- Fără poziție live (la sol, date vechi, server fără tracking pentru zbor) nu se inventează nimic: rămâne ora programată.
- Coordonatele aeroporturilor: registrul verificat (`src/core/airports.ts`), cu rezervă din `src/data/flights.json`.
- Reîmprospătarea merge doar cât aplicația e deschisă (timerele JS se opresc în fundal). Pentru fundal, serverul trebuie să trimită `arrivalEpoch`/`arrivalTime`/`progress`.
- Serverul are și un ETA mai bun (`GET /v1/flights/{n}/eta`, cu vânt); aplicația nu îl folosește încă.

## 6. Testare

Comenzi (laptop, `.env.local` cu `FLYQ_ADMIN_TOKEN` și `ACTIVITY_TOKEN`; vezi `scripts/push.env.example`):

```bash
npx tsx scripts/push.mts event gate_changed --gate 7 --old 3
npx tsx scripts/push.mts event delay_changed --delay 25
npx tsx scripts/push.mts card --status boarding --gate 7 --boarding 08:35
npx tsx scripts/push.mts card end --status departed
npx tsx scripts/push.mts demo
```

Evenimentele (`event …`) merg pe zborul demo la care e abonat telefonul și actualizează și cardul din tokenul salvat la server. `card …` setează starea direct pe ruta de test a serverului. Dacă ruta de test cere `contentState` într-o altă formă decât cea trimisă de script, serverul răspunde cu o eroare 4xx.

## 7. Build

- Prima dată apar un target nou (`<bundle id>.ExpoWidgetsTarget`) și un App Group (`group.<bundle id>`). Dacă semnarea automată pică cu „doesn't match the entitlements … application-groups", se deschide `ios/FlyQ.xcworkspace` în Xcode și se bifează grupul pe **ambele** targeturi (aplicația și extensia), cu aceeași echipă.
- `scripts/mac/build-ios.sh` verifică permisiunile aplicației, nu ale extensiei.
- Schema `flyq` și extensia cer un build nou; la prima introducere, `CLEAN=1`.
- `Settings → FlyQ → Live Activities` trebuie să fie pornit pe telefon.

## 8. Ce nu e verificat
- Actualizările de la server cu formatul împachetat final, pe un iPhone real.
- Designul nou (negru, poartă în insignă galbenă, countdown), pe ecran.
- `Text` cu `timerInterval`, simbolurile SF folosite și `activityBackgroundTint` în extensie.
- Ecranul „Zbor live" și legătura `flyq://live`.
- Estimarea de aterizare pe un zbor real în aer.

## 9. Limite și decizii
- iOS nu permite ca atingerea unui card să nu deschidă aplicația; putem alege doar ecranul. Butoane pe card care nu deschid aplicația cer App Intents (nefăcute).
- Cardul pornește pentru plecări din Craiova. Pentru sosiri nu pornește încă.
- Închiderea cardului o face serverul la `landed`/`cancelled`/`diverted`; aplicația nu îl închide la decolare. Serverul trebuie să mute `stale-date` la ora estimată de sosire.
