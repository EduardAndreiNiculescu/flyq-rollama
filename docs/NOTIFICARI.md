# Notificări push

Aplicația nu trimite notificări singură. Ea cere permisiunea, citește tokenul APNs al telefonului și îl înregistrează la serverul FlyQ; serverul trimite alertele prin APNs. Live Activity (cardul) e descris în `LIVE_ACTIVITIES.md`.

## 1. Fluxul

1. **Permisiune și token:** `deviceToken()` (`src/services/live/push.ts`) cere permisiunea și citește tokenul APNs nativ (hex).
2. **Abonare:** `registerForFlight` face `POST /v1/push/subscriptions` cu header `X-FlyQ-App-Key` și corpul strict `{ deviceToken, environment, flightId, locale }`. Fără `bundleId`.
3. **Răspuns:** `subscriptionId` și `ownerToken`. `ownerToken` se păstrează în SecureStore (cheia `flyq.push.owner`) și e singurul mod de a modifica sau șterge abonamentul (`PATCH`/`DELETE /v1/push/subscriptions/{id}` cu `X-Owner-Token`).
4. **Trimitere:** serverul trimite alertele la schimbările zborului: poartă anunțată și schimbată, check-in, îmbarcare, închiderea porții, întârziere, anulare, deviere, aterizare, banda de bagaje.
5. **Afișare în aplicație:** `initNotifications` face ca notificările să apară și când aplicația e deschisă (iOS le ascunde implicit).

## 2. Zboruri demo
Zborul biletului demo e fictiv și serverul nu-l are (404). Pentru bilete demo, aplicația se abonează la zborul demo al serverului, `DEMO-gate_change-D-W69901`, la care adminul poate trimite evenimente.

## 3. Mediul APNs
`pushEnvironment()` returnează `sandbox`: aplicația e instalată din Xcode (semnare de dezvoltare). Un build TestFlight ar avea nevoie de `production`. O valoare greșită dă `BadDeviceToken`.

## 4. Semnare
Profilul de semnare trebuie să includă Push Notifications. Pluginul `expo-notifications` adaugă `aps-environment` la fiecare `prebuild`; `scripts/mac/build-ios.sh` îl șterge dacă nu e `PUSH=1`. Build-urile cu notificări se fac cu `PUSH=1`.

## 5. Test din laptop
`scripts/push.mts` (citește `FLYQ_ADMIN_TOKEN` și `DEVICE_TOKEN` din `.env.local`, ignorat de git):

```bash
npx tsx scripts/push.mts test "Titlu" "Mesaj"
npx tsx scripts/push.mts event gate_changed --gate 3 --old 2
npx tsx scripts/push.mts event delay_changed --delay 25
npx tsx scripts/push.mts demo
```

`test` ajunge direct la telefon. `event` declanșează un eveniment demo pentru zborul la care e abonat telefonul. Tokenul de admin îl are cine administrează serverul; nu se pune în Git sau în chat.

## 6. Diagnostic
- Mod test → „Testează cheia FlyQ" arată codul de eroare al serverului (`APP_KEY_INVALID`, `APP_KEY_MISSING`, `FLIGHT_NOT_FOUND`…), nu doar „401".
- `422 FEATURE_DISABLED`: serverul are push-ul oprit; aplicația îl raportează ca „server push oprit", nu ca eroare.
- `BadDeviceToken`: mediu greșit (`sandbox`/`production`) sau token inventat.

## 7. Stare verificată
- Serverul FlyQ a trimis două notificări de test către telefon și a primit `outcome: "sent", status: 200` de la Apple (31.10.2026).
- **Neconfirmat de noi:** apariția bannerului pe ecran la fiecare test.
- Alerte locale programate din orarul biletului (îmbarcare, închiderea porții), fără server: **nu sunt implementate**; ar fi varianta cea mai sigură pentru demo.

## 8. Securitate
- Tokenurile (dispozitiv, card, admin) și cheia aplicației nu se comit și nu se pun în loguri sau chat.
- Cheia APNs `.p8` a fost vizibilă într-o sesiune de chat: se revocă și se înlocuiește după teste. Configurarea serverului (`PUSH_ENABLED`, `APNS_*`) e a echipei de backend.
