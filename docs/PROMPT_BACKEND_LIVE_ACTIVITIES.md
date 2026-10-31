# Prompt pentru agentul de pe FlyQ-backend: suport pentru Live Activities

Cum îl folosești: deschizi repo-ul `FlyQ-backend` în agent și lipești tot ce e sub linia `=== PROMPT ===`. Nu pune tokenuri sau chei în el.

=== PROMPT ===

# Rol și regim de lucru
Ești inginerul care adaugă **suport server pentru iOS Live Activities** în FlyQ-backend. Lucrezi doar pe lista de la „Sarcini". Respectă regulile din `CLAUDE.md` al repo-ului: lucrezi în `server/`, `content/`, `docs/backend/`, `.github/workflows/server*.yml`; nu atingi `app/`; pull request-uri mici, cu teste; **nimic secret în Git** (nici chei `.p8`, nici tokenuri; CI rulează gitleaks pe tot istoricul și pică la orice secret).

**Important: `main` se publică automat pe serverul de producție** (workflow-ul `server-deploy`). De aceea:
1. Lucrezi pe un branch (`backend/live-activities`), niciodată direct pe `main`.
2. Înainte de a deschide PR-ul, notezi în descriere cum se face rollback (ce commit se reface, ce migrare se anulează).
3. **Nu faci merge pe `main` fără aprobarea explicită a omului care te conduce**, după ce a făcut un backup al bazei de date (`scripts/` are un script de backup; vezi `RUNBOOK.md`).

# Contextul
Aplicația iPhone (FlyQ/FlyQ) vrea un card Live Activity pe ecranul blocat și în Dynamic Island, care arată starea zborului și se actualizează când se schimbă ceva (poartă, întârziere, îmbarcare, anulare, aterizare). Acum serverul trimite **doar notificări obișnuite**: `apns-push-type: alert` în `server/src/modules/push/apns.ts` (`ApnsClient.send`). Există deja:
- coloana `live_activity_token` în `push_subscriptions` (`server/src/db/schema.ts`) și acceptarea ei la `PATCH /v1/push/subscriptions/{id}` (`modules/push/routes.ts`, câmpul `liveActivityToken`);
- evenimentele de schimbare (`CHANGE_TYPES` în `modules/flights/changes.ts`: `gate_assigned`, `gate_changed`, `checkin_open`, `boarding_started`, `gate_closing_soon`, `delay_changed`, `cancelled`, `diverted`, `landed`, `baggage_belt_assigned`);
- dispeceratul (`modules/push/dispatcher.ts`: `PushDispatcher`, `sendEvent`, `attempt`) care trimite o notificare per abonament la fiecare schimbare;
- ruta de admin pentru evenimente demo: `POST /v1/admin/demo/events`, și `POST /v1/admin/push/test`.

Ce **lipsește**: trimiterea efectivă către APNs a actualizărilor de Live Activity.

# Cum funcționează Live Activities la nivel de APNs (de verificat în documentația Apple, nu din memorie)
- Cererea e un POST HTTP/2 către `/3/device/{activityPushToken}`, unde token-ul este cel **al activității** (nu cel al dispozitivului), cu antetele: `apns-push-type: liveactivity`, `apns-topic: <APNS_BUNDLE_ID>.push-type.liveactivity`, `apns-priority` (10 = imediat, 5 = economic), `apns-expiration`.
- Corpul: `{"aps":{"timestamp":<secunde UNIX>,"event":"update"|"end","content-state":{...},"stale-date":<opțional>,"dismissal-date":<doar la end>,"alert":{...opțional}}}`.
- Cheile din `content-state` trebuie să corespundă exact cu structura `ContentState` din aplicație (vezi contractul de mai jos). **Nu folosi tipul Date în `content-state`**: folosește șiruri și numere întregi.
- Un token de activitate expirat sau respins (410, `BadDeviceToken`, `Unregistered`) înseamnă că **se șterge doar `live_activity_token`**, nu se dezactivează tot abonamentul (alertele obișnuite merg mai departe).
- Apple limitează frecvența actualizărilor: trimite doar la schimbări reale, nu periodic.

# Contractul `content-state` (îl definești tu, aplicația îl respectă; pune-l ca fișier de referință)
Creează `docs/backend/live-activity-contract.json` (JSON Schema) și un fixture de exemplu, cu exact aceste chei, în camelCase:

```json
{
  "status": "scheduled | boarding | delayed | gate_closing | departed | landed | cancelled | diverted",
  "gate": "3",
  "boardingTime": "08:10",
  "departureTime": "08:40",
  "estimatedDeparture": "09:05",
  "delayMinutes": 25,
  "updatedAt": 1767000000
}
```
`gate`, `boardingTime` și `estimatedDeparture` pot fi `null`. Orele sunt ore locale ale aeroportului, ca text `HH:MM`. `updatedAt` e în secunde UNIX. Orice câmp nou se adaugă doar ca opțional.

# Sarcini (în ordine; un commit mic per sarcină)
1. **Transport:** extinde `ApnsClient`/`Notification` (`apns.ts`) ca să poată trimite `liveactivity` (antet `apns-push-type`, `apns-topic` cu sufixul `.push-type.liveactivity`, `apns-priority` configurabil), fără să schimbi comportamentul alertelor existente. Teste de transport pentru antete și cale (există deja un server HTTP/2 local de test).
2. **Constructorul de payload** (`push/live-activity.ts`, funcții pure): din starea unui zbor și un tip de eveniment construiește `content-state` conform contractului și corpul APNs. `event: "end"` cu `dismissal-date` la `landed` (de exemplu +15 minute), `cancelled`, `diverted`. Teste cu valori exacte.
3. **Dispecerat:** în `PushDispatcher`, după alerta obișnuită, dacă abonamentul are `liveActivityToken`, trimite `update` sau `end` pentru același eveniment. Livrarea se rezervă ca la alerte (fără duplicate). La răspunsuri 410/`BadDeviceToken`/`Unregistered` pentru token-ul activității: `live_activity_token = NULL`, nu dezactivezi abonamentul. Teste pentru: update, end, token respins, abonament fără token de activitate.
4. **Rută de test pentru admin:** `POST /v1/admin/push/liveactivity/test` cu `{ activityToken, environment, event, contentState }`, protejată ca celelalte rute de admin, auditată (`recordAudit`), fără a loga tokenuri. Evenimentele demo (`/v1/admin/demo/events`) trebuie să actualizeze și Live Activity-urile abonaților zborului demo.
5. **(Opțional, după ce 1–4 sunt verificate cu un telefon real)** suport pentru *push-to-start* (iOS 17.2+): câmp pentru `pushToStartToken` și `event: "start"` cu `attributes-type`, `attributes`, `content-state`. Doar dacă te cere omul explicit.
6. **OpenAPI și documentație:** actualizează `openapi.json` (verifică cu `npm run openapi:check`), `docs/backend/INTEGRATION.md` (ce trimite aplicația: `liveActivityToken` prin `PATCH`) și `RUNBOOK.md` (cum testezi pe un telefon).

# Criterii de acceptare
- `npm run check` verde (prettier, eslint, tsc, vitest cu acoperire, `openapi:check`, `content:check`, secret scan).
- Teste noi pentru fiecare sarcină; nicio modificare de comportament pentru notificările obișnuite.
- Niciun token, nicio cheie în cod, în teste (folosește valori inventate), în loguri sau în PR.
- PR-ul descrie: ce s-a schimbat, ce migrări rulează, cum se face rollback, ce **nu** s-a putut verifica fără un iPhone real.

# Ce nu poți verifica singur (spune-o în raport, nu ghici)
Nu ai un iPhone, un cont Apple sau o extensie Live Activity în aplicație. Corectitudinea față de Apple se confirmă doar la primul test real: omul trimite, de pe un telefon cu activitatea pornită, token-ul activității, iar tu îl folosești prin ruta de test de la sarcina 4. Raportează exact răspunsul APNs (`status`, `reason`), nu „funcționează".

# Format de raport la final
1. Commit-urile (hash + o linie). 2. Rezultatul `npm run check`. 3. Fișierele noi și migrările. 4. Cum se face rollback. 5. Ce a rămas neverificat. 6. Exemplul exact de corp APNs generat pentru un zbor întârziat cu 25 de minute.
