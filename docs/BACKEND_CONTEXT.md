# Backend FlightFlow – context pentru cine îl construiește

Stare: la 2026-10-29. Tot ce scrie aici despre cod a fost verificat în repo; ce nu există e marcat **LIPSEȘTE**.

## 1. Rolul backendului

Aplicația FlightFlow (React Native, Qwen3-4B local) funcționează **complet offline**. Backendul e opțional și adaugă un singur lucru: **poziția live a aeronavei** (OpenSky) și un ETA estimat. El nu rulează modelul AI și nu e necesar pentru întrebările despre proceduri, bagaje, documente sau orarul programat.

```
iPhone (RN + Qwen local) ──HTTPS──► Backend FlightFlow ──OAuth2──► OpenSky
        ▲ offline: folosește ultimul snapshot datat            (secretul stă DOAR aici)
```

Regula de aur: **aplicația nu vorbește niciodată cu OpenSky și nu vede niciun secret.**

## 2. Ce există deja în repo

| Fișier | Ce face | Testat |
|---|---|---|
| `server/openskyClient.ts` | Client OpenSky: token OAuth2 `client_credentials` cu cache și single-flight, `getStateByIcao24`, retry o dată la 401, mapare 429 (cu `x-rate-limit-retry-after-seconds`), 403, timeout 8 s, `fromEnv()` | da (fetch simulat) |
| `src/tracking/opensky.ts` | `decodeState`, `parseStatesResponse` (validează vectorul de 17 câmpuri, nu transformă `null` în 0) | da |
| `src/tracking/eta.ts` | `roughEta` (distanță marele cerc, progres spre aeroport; **refuză** dacă lipsesc date, poziția e veche, e pe sol, nu se apropie) | da |
| `src/tracking/result.ts` | Tipul `TrackingResult` și `parseTrackingResult` (validare la runtime) | da |
| `src/tracking/context.ts` | `trackingFacts`: textul de context dat modelului | da |

Teste: `npx vitest run` (33 de teste trec la ultima rulare). `npx tsc --noEmit` e curat.

## 3. Ce LIPSEȘTE (de construit)

1. **Serverul HTTP** (nu s-a ales framework; alege unul simplu, ex. Fastify/Express/Hono).
2. **Identitatea zborului**: maparea `flightKey` (număr zbor + dată) → `icao24`. Nu avem nicio sursă de orar. Pentru MVP/demo: un tabel configurat manual (`flightKey → icao24`), marcat `identity.status = "probable"`/`"confirmed"` doar dacă omul l-a confirmat. **Nu deduce destinația din OpenSky.**
3. **Coordonatele aeroportului țintă** pentru ETA: neverificate, deci nu sunt în cod. Se citesc dintr-un registru autorizat/versionat (ICAO + lat/lon + sursă + dată verificare).
4. **Autentificare utilizator, rate limiting per utilizator, cache comun** (vezi §5).
5. **Calibrarea ETA** pe sosiri reale. Până atunci `calibrated: false` și UI-ul trebuie să spună „estimare".

## 4. Contractul API

`GET /v1/flights/{flightKey}/tracking` — antet `Authorization: Bearer <token de sesiune FlightFlow>` (distinct de tokenul OpenSky).

Răspuns = `TrackingResult` din `src/tracking/result.ts`, `schemaVersion: 1`:

```jsonc
// kind: "observation"
{ "kind":"observation","schemaVersion":1,"flightKey":"…",
  "identity":{"status":"confirmed|probable","evidence":["…"]},
  "observation":{ "icao24":"abc123","callsign":null,"observedAtSec":1000,"lastContactSec":1000,
                  "lat":44.0,"lon":23.0,"groundSpeedMps":220,"trueTrackDeg":90,"baroAltitudeM":9000,
                  "verticalRateMps":0,"onGround":false,"positionSource":0,"provider":"opensky" },
  "providerTimeSec":1, "receivedAtSec":2, "freshness":"live|delayed" }

// kind: "unavailable"  (reason: unresolved_flight | ambiguous_match | no_coverage |
//                       stale_position | rate_limited | provider_error)
{ "kind":"unavailable","schemaVersion":1,"reason":"no_coverage","checkedAtSec":1,"retryAfterSec":30 }
```

Reguli de semantică (din documentația OpenSky):
- Vectorul de stare e un tuplu indexat: `time_position`=idx 3, `last_contact`=4, `lon`=5, `lat`=6, `baro_altitude`=7, `on_ground`=8, `velocity`=9 (m/s față de sol), `true_track`=10. Folosește `time_position` pentru prospețimea poziției, **nu** `last_contact`.
- Aeronava lipsă din răspuns / `states: null` = „fără observație", **nu** „zbor anulat" sau „aterizat". `on_ground` nu înseamnă „aterizat" singur.
- `icao24` e transponderul aeronavei, **nu** zborul comercial; aeronava se poate schimba.
- OpenSky nu dă orare, întârzieri, porți sau statusul oficial.
- Nu trimite la OpenSky date personale (PNR, nume, documente). Interogarea se face doar după `icao24`.

## 5. Securitate și operare

- **Secrete:** `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` din variabile de mediu / manager de secrete. Niciodată în cod, teste, git, loguri sau răspunsuri. `.gitignore` exclude deja `.env*`, `API.json`.
- **⚠ Secretul OpenSky din arhiva primită a circulat prin chat și fișiere: trebuie rotit înainte de orice folosire.** Contul din arhivă e pe alt email decât al proprietarului proiectului: confirmă că ai dreptul să-l folosești. Nu a fost folosit în niciun apel.
- **Termeni OpenSky:** pagina oficială indică utilizare pentru cercetare/necomercial; confirmă că distribuția FlightFlow e permisă.
- **Cote:** documentația indica 4.000 credite/zi/categorie (cont standard) și 400 (anonim); sunt valori de revalidat, nu SLA. Citește limita reală din antetele `X-Rate-Limit-*`. Cache comun pe `icao24`, TTL 60–120 s, single-flight pentru cereri simultane; **nu apela OpenSky la fiecare întrebare a utilizatorului**; poll adaptiv doar pentru zboruri active.
- **Endpoint:** acceptă doar `flightKey` rezolvat pe server; nu proxy-ui URL-uri arbitrare; validează `icao24` (`^[0-9a-f]{6}$`).
- **Loguri:** fără corpul răspunsului OAuth, fără `Authorization`, fără date de rezervare. Retenție limitată pentru observații.
- TLS, autorizare pe resursă (utilizatorul vede doar zborul lui), limitare per utilizator.

## 6. Cum folosește aplicația răspunsul

1. `parseTrackingResult(payload)` (nu cast TypeScript).
2. Dacă `observation`: `roughEta(obs, aeroport, nowSec, maxAgeSec, routeFactor)` pe client sau pe server.
3. `trackingFacts(result, eta, nowSec)` produce blocul de text pentru Qwen (alături de `flightFacts`). Modelul explică; **nu decide** poziția, ETA sau statusul.
4. Offline: ultimul snapshot se afișează cu ora lui și eticheta „vechi"; ETA „live" se oprește după prag.
5. Dacă `kind:"unavailable"`, nu se păstrează ETA-ul vechi ca și cum ar fi nou.

## 7. Ordinea de lucru recomandată

1. Server minim cu `GET /health` și configurare din env; secretul rotit.
2. Endpointul `/tracking` care apelează `OpenSkyClient.getStateByIcao24`, cu tabel manual `flightKey→icao24`.
3. Cache + single-flight + rate limit per utilizator + autentificare.
4. Teste de integrare cu `fetch` simulat (nu apeluri live în CI): 429, 401, `states:null`, poziție veche, schimbare de aeronavă.
5. Un singur test live manual, cu credențiale noi, pe o aeronavă cunoscută.
6. Abia apoi: identitate din sursă de orar autorizată, coordonate aeroport verificate, calibrare ETA.

## 8. Criterii de acceptare

- Niciun secret în repo/loguri/răspunsuri (verificat cu căutare în istoricul git).
- Aplicația primește doar `TrackingResult` valid; răspunsurile invalide sunt respinse.
- Zero statusuri inferate: nicio „întârziere", „anulare", „poartă" sau „aterizat" din date OpenSky.
- Comportament definit pentru 401, 403, 429, timeout, `states:null`, poziție veche, identitate ambiguă.
- `npx tsc --noEmit` și `npx vitest run` trec; raportează ieșirea reală.

## 10. AirLabs (sursa de orar, identitate și status)

Documentație: https://airlabs.co/docs/ (base URL `https://airlabs.co/api/v9/ENDPOINT`). Cheia API se trimite ca parametru `api_key`. **Cheia NU e în acest document**: vezi `docs/BACKEND_HANDOFF_PRIVATE.md` (în afara git). **Cheia nu a fost testată** cu niciun apel; prima verificare se face din backend.

### Ce rezolvă (golurile din §3)
AirLabs poate umple exact ce lipsea față de OpenSky: maparea număr de zbor → aeronavă (`hex` = icao24), aeroporturi de plecare/sosire, orar programat și estimat, poartă/terminal, status și întârzieri, plus poziție live.

| Endpoint | Folosire în FlightFlow | Parametri documentați |
|---|---|---|
| `/flight` | Detalii zbor după număr: identitate, orar, poartă, status, întârzieri, poziție | `flight_iata` sau `flight_icao` |
| `/flights` | Poziții live; filtrare după `hex`, `flight_iata`, `dep_iata`, `arr_iata`, `bbox` | `_fields`, `_view`, `zoom` |
| `/schedules`, `/delays` | Programe pe aeroport, întârzieri | (nedocumentate pe pagina principală; citește `/docs/schedules`, `/docs/delays`) |
| `/airports` | Coordonate aeroport pentru ETA | (câmpuri neverificate; citește `/docs/airports`) |

Câmpuri din `/flight` (conform documentației): identificatori (`hex`, `flight_iata`, `flight_icao`, `reg_number`, `airline_iata`), plecare (`dep_iata`, `dep_icao`, `dep_terminal`, `dep_gate`, `dep_time`, `dep_estimated`, variante `_ts`/`_utc`), sosire (`arr_iata`, `arr_terminal`, `arr_gate`, `arr_baggage`, `arr_time`, `arr_estimated`), `status` (`scheduled`, `en-route`, `landed`), `duration` (min), `dep_delayed`, `arr_delayed` (min), poziție (`lat`, `lng`, `alt` în metri, `dir`, `speed`, `v_speed`, `updated` = UNIX al ultimului semnal). `delayed` e marcat deprecated.

### Atenție (din documentație sau neclar)
1. **Un singur zbor, fără dată**: `/flight` întoarce "cel mai apropiat" zbor live/programat/aterizat pentru codul dat și nu documentează un parametru de dată. Același număr rulează zilnic: verifică `dep_time`/`dep_time_utc` față de data aleasă de utilizator înainte să marchezi identitatea `confirmed`.
2. **Acoperirea variază** după zbor; câmpurile pot lipsi. Tratează absența ca "necunoscut", nu ca 0 sau "fără întârziere".
3. **Plan gratuit**: doar unele câmpuri sunt marcate ca disponibile (printre ele `lat`, `lng`, `dir`, `flight_iata`, `dep_iata`, `dep_time`, `arr_iata`, `arr_time`). Pagina nu spune clar dacă `dep_gate`, `*_estimated`, `status`, `*_delayed` sunt restricționate; **verifică pe un răspuns real**. Cotele numerice nu sunt pe pagina de documentație (doar erorile `minute_limit_exceeded`, `hour_limit_exceeded`, `month_limit_exceeded`): citește-le din contul AirLabs.
4. **Unități ambigue**: `speed`/`v_speed` apar ca "km" (probabil km/h, **neverificat**); `alt` e în metri. OpenSky dă viteza în m/s. Nu amesteca fără conversie testată.
5. **Cheia e în query string** (`?api_key=`): redactează URL-urile din loguri, proxy-uri, APM și mesaje de eroare. Există și o semnătură temporară (`api_id:timestamp:md5(...)`, valabilă 3 min), utilă dacă nu vrei cheia în URL.
6. **Termeni de utilizare**: nu sunt pe pagina de documentație; confirmă licența pentru acest produs.
7. Erori documentate: `unknown_api_key`, `expired_api_key`, `unknown_method`, `wrong_params`, `not_found`, `minute/hour/month_limit_exceeded`, `internal_error`.

### Cum se combină cu OpenSky
- **AirLabs** = identitate (număr zbor + dată → `hex`), orar, poartă, status, întârzieri. Sunt date de la un furnizor terț: afișează-le cu sursa și ora (`updated`), **nu** ca "status oficial al aeroportului".
- **OpenSky** = poziție ADS-B și ETA calculat de noi; cheamă-l după `hex` primit de la AirLabs. Dacă `hex` din AirLabs și `icao24` din OpenSky diferă, identitatea devine `probable`/`ambiguous_match`.
- Normalizează AirLabs în `FlightRecord` (`src/core/types.ts`): `dataSource: "airport_feed"` doar dacă proveniența justifică; altfel adaugă o valoare nouă (ex. `"airlabs"`) și actualizează prompt-ul/validatorul ca modelul să spună "conform AirLabs, la ora X".
- Poarta: `gateStatus: "confirmed"` doar dacă `dep_gate` vine în răspuns și e proaspăt; altfel `unconfirmed`. Modelul primește `UNKNOWN` și nu o inventează.
- De construit: `server/airlabsClient.ts` (cu `fetch` injectat, timeout, validare la runtime ca la `parseStatesResponse`, redactare URL), teste cu răspunsuri simulate, cache cu TTL, apoi un test live manual.

## 9. Întrebări deschise pentru proprietarul proiectului

1. Unde se hostează backendul și cine administrează secretele?
2. Ce sursă oficială de orar/identitate a zborului avem (companie, aeroport Craiova)?
3. Cine confirmă dreptul de utilizare OpenSky pentru acest produs?
4. Ce aeroporturi țintă (coordonate verificate) sunt în scopul demo-ului?
