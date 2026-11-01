# Prompt pentru Mihai (backend FlyQ): partea de web și tracking

Lucrează pe un branch separat și deschide PR; **nu face merge fără aprobarea unui om** (`main` se deployează automat în producție). Nu pune secrete, token-uri sau chei în cod, loguri sau PR.

Contextul: pagina de partajare (`web/share/index.html` din repo-ul aplicației, pe Netlify) cere `GET /v1/public/shares/{token}` și desenează traseul. Pagina știe acum să deseneze și când `from.lat/lon` și `to.lat/lon` sunt `null` (are un tabel propriu de aeroporturi, aproximativ), deci nu mai e nevoie de coordonate verificate ca să meargă. Contractul rămâne cel din `docs/SHARE_FLIGHT.md`.

## 1. Răspunsul publicului (`GET /v1/public/shares/{token}`)
1. Păstrează exact formele: `from`/`to` `{code, city, lat, lon}` (lat/lon pot fi `null`; dacă ai coordonatele reale ale aeroporturilor, trimite-le, pagina le preferă), `status`, `gate`, `scheduledDeparture/Arrival`, `estimatedDeparture/Arrival`, `eta.epoch`, `progress`, `position {lat, lon, headingDeg}`, `updatedAt`.
2. `demo: true` doar pentru zboruri simulate; pentru zboruri reale **lipsește sau e `false`**. Pagina afișează banda DEMO pe baza lui.
3. Același 404 pentru token necunoscut, expirat sau revocat (nicio diferență în corp/timp). Rate limit pe `X-Nf-Client-Connection-Ip`. Nimic despre pasager în răspuns.
4. `position` lipsește (nu `null` pe câmpuri) cât timp avionul nu e în aer; pagina atunci arată doar traseul.

## 2. Zboruri cunoscute (blochează testele noastre)
- `AFR188`/`AF188` dau 404 la `/v1/flights/{n}`. Spune-mi **ce zboruri servește serverul** (listă sau un endpoint de test), ca să știm dacă e furnizorul sau formatul. Aplicația încearcă deja ambele forme (IATA și ICAO).
- Cu data opțională `?date=AAAA-LL-ZZ` pentru zboruri din alte zile.
- Aeroporturile pot fi din toată lumea (aplicația are acum tabel mondial pentru UI); trimite `departureAirport`/`arrivalAirport` ca IATA din 3 litere.

## 3. Poarta (gate) și starea zborului
- Pentru zboruri de oriunde, trimite `gate` și `gateStatus: "confirmed"` când furnizorul îl dă; `unconfirmed` sau `null` altfel. Aplicația arată poarta doar dacă e `confirmed`.
- `gateCloseEpoch` (momentul închiderii porții, dacă îl ai) și actualizarea cardului de check-in (desk-uri) când se schimbă.

## 4. Ce să-mi răspunzi
Un raport scurt: ce ai schimbat, ce ai testat cu adevărat (și ce nu), lista zborurilor cunoscute, și dacă ai trimis `demo` doar la simulări.
