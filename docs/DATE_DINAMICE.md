# Ce vine de la backend și de la tracker, față de ce afișează aplicația

Inventar făcut din cod, la 1 noiembrie 2026. Coloana „Înainte" descrie aplicația de ieri; „Acum" ce e în cod după reparație (neverificat pe telefon fără build). Principiul: **o informație pe care serverul o spune apare la fel în card, în notificare și în ecrane**, din aceeași sursă (`useFlightStatus` + `flightData.getFlight`, `src/lib/serverState.ts`).

## Cum ajunge o informație în ecrane
1. **Citire periodică** (`flightSync.ts`): `GET /v1/flights/{număr}?date=` la 15 s cât aplicația e deschisă, la revenirea din fundal, la schimbarea biletului activ și la fiecare notificare primită.
2. **Notificare** (`notificationGate.ts`): cheile `flightId`, `event`, `gate`, `newGate`, `oldGate`, `delayMinutes`, `baggageBelt` din `content.data` (sau sub `flyq`) se aplică imediat, apoi serverul e recitit.
3. **ETA** (`arrival.ts`): `GET /v1/flights/{număr}/eta` cel mult o dată pe minut, de la 15 min înainte de plecare până la 6 h după sosirea programată; model propriu ca rezervă.
4. **Îmbinare**: `flightData.getFlight(id)` întoarce zborul cu starea serverului aplicată; același obiect cât timp nu se schimbă nimic.

## Tabel

| Informație | Sursă | Unde se afișează | Înainte | Acum | Ce rămâne |
|---|---|---|---|---|---|
| Poarta | `record.gate` + `gateStatus` (doar „confirmed"), eveniment `gate_changed` | antet, Călătorie, Bilet, Asistent, Zbor live, memento-uri, nod pe hartă | doar poarta (demo); ecranele nu se re-randau peste tot | toate ecranele, plus banner la schimbare | poarta 7 nu există pe harta interioară (4 porți): se folosește cea mai apropiată, textul arată poarta reală |
| Decolare (estimată) | `estimatedDeparture`, `departureDelayMin` | antet, bara de tab-uri, Bilet strip, Zbor, Bilet, Zbor live, Călătorie | **doar ora programată** | ora estimată; ora programată rămâne în `scheduledDepartureUtc` | — |
| Îmbarcare, închiderea porții | derivate în aplicație (decolare −40 / −20 min); serverul nu le trimite | Călătorie (cronometru), Asistent, Bilet, memento-uri | fixe | se mută cu întârzierea | sunt derivate, nu date de la furnizor; dacă backend-ul le trimite, se înlocuiesc |
| Aterizare (estimată) | `/eta` (server), `estimatedArrival`, `arrivalDelayMin`, model propriu | Zbor, Zbor live, Bilet, card | doar ETA în Zbor | în toate ecranele | — |
| Durata zborului | derivată din cele două ore | Zbor, Bilet | din programare | din estimări | — |
| Stare: anulat, deviat, aterizat, îmbarcare, poarta se închide, check-in | evenimente + `providerStatus` | **chip nou** în Zbor și Călătorie; Zbor live | nu se afișa nicăieri | chip cu text și culoare | statusul din evenimente vine doar cât aplicația e deschisă sau când citește serverul |
| Banda de bagaje | eveniment `baggage_belt_assigned` (`baggageBelt`) | chip „A aterizat · banda 2", Zbor live | nu se afișa | afișată | — |
| Ghișeele de check-in | textul notificării „Ghișeele 3, 4" | — | nu se afișa | nu se afișează | serverul nu le trimite ca dată; trebuie o cheie (`checkinDesks`) |
| Poziția avionului (lat, lon, viteză, altitudine) | `tracking` | Zbor (în zbor), Zbor live | live doar pentru zboruri adăugate din „Număr de zbor"; demo: simulare | la fel, plus trecere automată în „În zbor" când furnizorul spune „en-route" | zborul demo rămâne simulat; trecerea automată e doar pentru zboruri reale |
| Locul din avion, pasagerul, PNR | biletul (static, intenționat) | Bilet, Asistent | — | — | nu vin din backend |
| Cardul Live Activity | push de la server | ecran blocat, Dynamic Island | mai nou decât ecranele | aceleași fapte ca ecranele | la check-in serverul nu actualizează cardul (design D-28); cardul nu are minute până la închiderea porții fără o cheie nouă |

## De ce cardul părea mai actualizat
Cardul primea direct push de la server, iar ecranele citeau programarea cu care a fost construit zborul (în afară de poartă, și doar uneori). Întârzierea, ora estimată, starea și banda nu ajungeau în ecrane. Acum toate trec prin aceeași îmbinare.

## Ce are nevoie de la backend
- `gateCloseEpoch` (sau `gateCloseTime`) în `props`-ul cardului, ca să afișeze „Poarta se închide în 15 min".
- Actualizare de card la `checkin_open` cu `status: "checkin"` (cardul îl afișează deja ca „Check-in deschis").
- `checkinDesks` în `data` și în `record`.
- Confirmarea căilor: `GET /v1/flights/W69901` pentru zborul demo.
- Care zboruri cunoaște serverul azi (`AFR188`/`AF188` dau 404: probabil serverul acoperă doar zboruri care ating Craiova).
