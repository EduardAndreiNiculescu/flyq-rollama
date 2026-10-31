# Prompt pentru Mihai: situația curentă și testul de sincronizare (1 noiembrie 2026)

Lipești tot ce e sub linia `=== PROMPT ===` în agentul din `FlyQ-backend`. Nu conține chei sau tokenuri.

=== PROMPT ===

# Situația curentă a aplicației iPhone (ce s-a schimbat de la ultimul raport)

Aplicația citește acum **doar de la serverul vostru**: sursa de zboruri implicită e `https://flyq-cra.duckdns.org` (nu mai e gateway-ul de laptop) și afișează ce spuneți voi. Dacă serverul nu spune ceva, aplicația nu inventează.

1. **Sincronizare a zborului activ.** La 15 secunde (aplicația deschisă), la revenirea din fundal și la fiecare notificare primită, aplicația face `GET /v1/flights/{număr}?date=YYYY-MM-DD` (număr fără spații; data = data locală la plecare) și afișează poarta (doar dacă `gateStatus` este `confirmed`), `estimatedDeparture`, `estimatedArrival`, `departureDelayMin`, `arrivalDelayMin` și `providerStatus`. Când poarta sau întârzierea se schimbă, apare un banner „Poarta s-a schimbat: 2 → 3".
   - Pentru biletul **demo** aplicația cere zborul demo al serverului: numărul `W69901` (din `DEMO-gate_change-D-W69901`), cu data de azi.
2. **ETA de la server.** De la 15 minute înainte de plecare până la 6 ore după sosirea programată, aplicația cere cel mult o dată pe minut `GET /v1/flights/{număr}/eta?date=YYYY-MM-DD`. Folosește `eta.etaUtc` doar dacă `eta.kind` este `actual`, `provider_estimate` sau `position_estimate` (nu `scheduled`); folosește `positionModel.distanceM` pentru bara de progres și `positionModel.windSource` ca atribuire Open-Meteo, afișată pe ecran. Dacă `/eta` nu răspunde sau nu are estimare, aplicația cade pe un model propriu din poziția de la `tracking`.
3. **Notificări locale** programate pe telefon din orar (îmbarcare în 15 min, îmbarcare, poarta se închide în 10 min), mutate cu întârzierea citită de la server. Nu depind de voi.
4. **Token-ul cardului Live Activity.** Aplicația îl trimite cu `PATCH /v1/push/subscriptions/{id}` (`{ "liveActivityToken": "<hex>" }`, `X-Owner-Token`). Dacă abonamentul lipsește sau serverul îl răspunde cu 401/403/404, aplicația se abonează din nou (`POST /v1/push/subscriptions`) și reîncearcă o dată. Tokenul **dispozitivului** nu merge pe topicul `liveactivity` (Apple: `DeviceTokenNotForTopic`); trebuie tokenul **cardului**, salvat de voi în `live_activity_token`.
5. **Partajarea zborului cu familia:** pagina web și butonul din aplicație sunt gata (`docs/SHARE_FLIGHT.md` din repo-ul aplicației). Lipsesc endpoint-urile din backend.

# Ce vă cer (în ordine)

## A. Testul de sincronizare (primul, înainte de orice altceva)
Scopul: dovada că **o schimbare făcută de voi ajunge în aplicație**. Scrie un test automat (fără rețea, fixture-uri, `ManualClock`) și rulează apoi scenariul pe server, apoi raportează rezultatele exacte.

1. **Test automat:** după `POST /v1/admin/demo/events` cu `{ "flightId": "DEMO-gate_change-D-W69901", "event": "gate_changed", "data": { "gate": "7", "oldGate": "3" } }`, un `GET /v1/flights/W69901?date=<azi>` trebuie să întoarcă `record.gate = "7"` și `record.gateStatus = "confirmed"`. La fel pentru `delay_changed` (`data: { "delayMinutes": 25 }`) → `record.departureDelayMin = 25` și o `estimatedDeparture` cu 25 de minute după ora programată. Dacă `GET /v1/flights/W69901` nu servește zborul demo (404), **spune-mi**: aplicația are nevoie de o cale prin care biletul demo să citească starea zborului demo; propune una (de ex. `GET /v1/flights/DEMO-gate_change-D-W69901`).
2. **Payload-ul notificării:** pune în `data` al notificării APNs cheile `flightId`, `event` și, la schimbarea porții, `gate` (poarta nouă) și `oldGate`; la întârziere, `delayMinutes`. Aplicația citește `data.gate`/`data.newGate` imediat și apoi reciteste serverul. Dacă nu poți adăuga `data`, spune-mi cum arată exact titlul și textul pentru `gate_changed` (le citesc ca rezervă).
3. **Scenariu manual de acceptare** (îl rulăm împreună, telefonul cu aplicația deschisă pe zborul demo): (a) `gate_changed` 3→7 → în ≤ 15 s apare bannerul și poarta 7 în antet, în ecranul Zbor și în răspunsurile asistentului; (b) `delay_changed` 25 → banner „Întârziere: 25 min" și memento-urile locale se mută; (c) cardul Live Activity se actualizează în aceeași secundă (tokenul cardului e la voi). Raportează pentru fiecare pas: ce ai trimis, răspunsul serverului, ce a răspuns Apple (`outcome`, `status`, `reason`).

## B. Live Activity: chei și durată de viață
- Împachetat `content-state`: `{ "name": "FlyQFlight", "props": "<JSON ca text>" }`. Chei opționale pe care aplicația le citește: `arrivalEpoch` (secunde UNIX), `arrivalTime` ("HH:MM", ora destinației), `progress` (0..1), `etaKind`, `boardingEpoch`, `departureEpoch`, plus `flightNumber`, `from`, `to`.
- Cardul trăiește **în zbor**: aplicația nu îl mai închide la decolare. `stale-date` = ora estimată de sosire + 30 min (nu ora de decolare + 1 oră) și `end` doar la `landed`, `cancelled` sau `diverted`.
- Trimite `arrivalEpoch`, `arrivalTime` și `progress` doar când avionul e în aer și ai o poziție proaspătă. Fără ele cardul rămâne pe ora programată.

## C. Partajarea zborului
Implementează `POST /v1/shares`, `DELETE /v1/shares/{id}`, `GET /v1/public/shares/{token}` și `GET /s/{token}` conform `docs/SHARE_FLIGHT.md`, **pe o ramură separată și un PR separat** (nu amesteca cu A și B). Există o implementare de referință fără dependențe, `scripts/share-dev-server.mjs`, și un test de contract, `tests/share-contract.test.ts` (în repo-ul aplicației): rulează-le ca să vezi exact forma cerută. Pagina `web/share/index.html` se servește de la `/s/{token}`; ea cere `/v1/public/shares/{token}` pe același domeniu.

# Reguli
- `main` se publică automat pe producție: ramură + PR, **fără merge fără aprobarea omului**, backup la baza de date înainte (RUNBOOK), rollback scris în PR.
- Respectă `CLAUDE.md` și `server/CLAUDE.md` (doar `server/`, `content/`, `docs/backend/`, `.github/`; cod în engleză, documente în română, texte pentru utilizator `{ro,en}`; `now` injectat; teste fără rețea).
- Fără tokenuri sau chei în Git, în teste, în loguri sau în PR. Tokenul cardului și cel al dispozitivului mi le dai pe privat.

# Raport
1. Rezultatul testului A (automat și manual), cu răspunsurile exacte ale serverului și ale Apple.
2. Răspunsul la întrebarea despre `GET /v1/flights/W69901` pentru zborul demo.
3. Forma exactă a `data` din notificări.
4. Starea PR #21 (Live Activities) și a celui pentru partajare.
5. Ce nu ai putut verifica fără un zbor real în aer.
