# Partajarea zborului cu familia

Un link către o pagină web care arată **zborul** pasagerului (poziția avionului, starea, poarta, ora estimată de aterizare), fără cont și fără aplicație. Pagina nu arată nimic despre persoană.

Stare (1.11.2026): pagina, publicarea pe Netlify (configurată, nepublicată) și butonul din aplicație sunt scrise; **endpoint-urile serverului nu există încă** (se adaugă în repo-ul `FlyQ-backend`). Până atunci, butonul răspunde „Serverul FlyQ nu are încă partajarea de zbor", iar pagina funcționează în mod demo.

## 1. Piese

| Piesă | Cale | Stare |
|---|---|---|
| Pagina web (un singur fișier, MapLibre + OpenFreeMap) | `web/share/index.html` | scrisă; verificată în browser **doar în mod demo** (`?demo=1`, desktop și 375 px) |
| Butonul „Trimite familiei" / „Oprește partajarea" | `src/screens/LiveFlightScreen.tsx` | scris; neverificat pe iPhone |
| Client pentru server | `src/services/live/share.ts` | scris; fără teste de rețea |
| Endpoint-uri server | repo `FlyQ-backend` | **de făcut** (secțiunea 3) |

## 2. Confidențialitate (reguli, nu opțiuni)

- **Acord explicit:** nu se creează nimic fără atingerea butonului și confirmarea din dialog, care spune ce se partajează.
- **Se arată:** numărul zborului, ruta, starea, poarta, orele, ETA, poziția avionului (lat, lon, direcție, altitudine, viteză), momentul actualizării.
- **Nu se arată și nu se trimite niciodată:** numele pasagerului, locul, codul de rezervare (PNR), codul de bare, identificatorul utilizatorului, tokenurile de dispozitiv, tokenul de abonare, `icao24` în afară de ce cere harta.
- **Token:** minimum 128 de biți dintr-un generator criptografic (22 de caractere base64url), tratat ca secret: nu apare în loguri, în analytics sau în adrese către terți.
- **Expirare:** pe server, propunere aterizare + 3 ore; **revocare** imediată (`DELETE`). Un token necunoscut, expirat sau revocat primește **același** răspuns (404).
- **Antete pe pagină și pe API:** `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`, `Referrer-Policy: strict-origin-when-cross-origin` (nu `no-referrer`: politica tile-urilor OSM cere Referer), `X-Content-Type-Options: nosniff`.
- **Limitare:** pe IP (de ex. 60/min) și pe token.
- **Fără date despre privitori** în afară de contoarele de limitare.
- GDPR: datele de zbor ale unei persoane sunt date personale în contextul unui link trimis; baza legală este acordul persoanei care partajează. Textul juridic final îl validează echipa; nu a fost verificat de noi.

## 3. Contractul serverului (de implementat în FlyQ-backend)

### `POST /v1/shares` (sesiune FlyQ: `Authorization: Bearer ses_…`)
Corp: `{ "flightNumber": "W69901", "date": "2026-10-31" }` (data locală la plecare).
Răspuns `201`: `{ "shareId": "<id intern>", "url": "https://<host>/s/<token>", "expiresAt": "<ISO>" }`.
Erori: `401`, `404` (zbor necunoscut), `429`.

### `DELETE /v1/shares/{shareId}` (aceeași sesiune)
`204` (sau `404` dacă nu mai există). Linkul încetează să funcționeze imediat.

### `GET /v1/public/shares/{token}` (fără autentificare, CORS permis doar dacă pagina e pe alt domeniu)
`200` cu corpul de mai jos; `404` pentru token necunoscut, expirat sau revocat; `429` la abuz.

```json
{
  "flightNumber": "W69901",
  "from": { "code": "CRA", "city": "Craiova", "lat": 44.3181, "lon": 23.8886 },
  "to":   { "code": "LTN", "city": "Londra Luton", "lat": 51.8747, "lon": -0.3683 },
  "status": "scheduled | boarding | delayed | gate_closing | in_air | departed | landed | cancelled | diverted",
  "gate": "3",
  "scheduledDeparture": "2026-10-31T08:40:00+02:00",
  "scheduledArrival": "2026-10-31T10:05:00+00:00",
  "estimatedDeparture": "2026-10-31T09:05:00+02:00",
  "estimatedArrival": "2026-10-31T10:20:00+00:00",
  "eta": { "epoch": 1793437500, "kind": "position_estimate" },
  "progress": 0.42,
  "position": { "lat": 48.2, "lon": 12.1, "headingDeg": 295, "altitudeM": 10600, "groundSpeedMps": 230, "observedAtSec": 1793430000 },
  "updatedAt": 1793430020,
  "attribution": "Weather data by Open-Meteo.com (CC BY 4.0)"
}
```
Reguli: `position` este `null` când nu există poziție proaspătă; `eta` lipsește când nu există estimare (pagina arată atunci ora programată); `attribution` apare dacă ETA folosește vântul (licența Open-Meteo). Valorile vin din aceleași surse ca `GET /v1/flights/{n}` și `/eta`, cu **cache de ~15 s pe zbor**, deci numărul de privitori nu schimbă costul către furnizori.

### `GET /s/{token}`
Servește `web/share/index.html` (același domeniu: fără CORS). Pagina cere `/v1/public/shares/{token}`.

## 4. Pagina

- Hartă: MapLibre GL 4.7.1 cu stilul OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`), fără cheie; atribuirea apare automat în hartă. Pentru lansare comercială, verifică condițiile OpenFreeMap; nu se folosește `tile.openstreetmap.org` direct.
- Linia zborului: cerc mare cu 96 de puncte; porțiunea parcursă plină, restul punctat; avion rotit după direcția din date.
- Card: zbor, rută, stare colorată, bară de progres, poartă, aterizare (countdown local, ora estimată).
- Interogare la 20 s, oprită când fila e ascunsă; la `404`/`410` arată „Partajarea s-a încheiat".
- Mod demo: `?demo=1` (zbor simulat CRA→LTN, fără rețea către server). Limba: `?lang=ro|en`.
- Datele se scriu cu `textContent`, nu `innerHTML`.

## 5. Prompt pentru agentul din FlyQ-backend

```text
Rol: adaugi partajarea zborului cu familia în FlyQ-backend. Respectă CLAUDE.md și server/CLAUDE.md (doar server/, content/, docs/backend/, .github/; cod în engleză, documente în română, texte pentru utilizator {ro,en}; now injectat; teste fără rețea; nimic secret în Git). `main` se publică automat pe producție: lucrezi pe o ramură nouă, cu PR, NU faci merge fără aprobarea omului, fă backup la baza de date înainte (RUNBOOK) și scrie rollback-ul în PR.

Pas 1: citește `docs/SHARE_FLIGHT.md` din repo-ul aplicației (contractul exact, confidențialitatea, corpul `GET /v1/public/shares/{token}`), apoi propune un plan scurt și așteaptă aprobarea înainte de cod.

Implementează: POST /v1/shares, DELETE /v1/shares/{id}, GET /v1/public/shares/{token}, GET /s/{token} (servește pagina statică web/share/index.html), cu migrare pentru tabelul `shares` (id, token_hash, flight_key, flight_date, created_at, expires_at, revoked_at; păstrezi DOAR hash-ul tokenului, nu tokenul). Token 128+ biți CSPRNG, comparare constant-time. Expirare = aterizare + 3 ore (sau 48 h dacă aterizarea nu e cunoscută). Același 404 pentru necunoscut/expirat/revocat. Limitare pe IP și pe token; antetele din docs/SHARE_FLIGHT.md §2. Răspunsul public refolosește aceeași căutare și același cache ca /v1/flights/{n} și /eta (o singură cerere către furnizor la ~15 s pe zbor); NU include niciodată nume, loc, PNR, user id, tokenuri.
Teste: crearea/ștergerea, expirare, revocare, token greșit = 404 identic, rate limit, câmpurile interzise absente din răspuns, canar: tokenul nu apare în loguri. Actualizează INTEGRATION.md, RUNBOOK.md (oprire de urgență prin variabilă de mediu, ex. SHARE_ENABLED=false), DECISIONS.md, STATUS.md și openapi:export.
Raport: planul aprobat, commit-uri, rezultatul `npm run check`, costul estimat în cereri către furnizori pe zbor, rollback, ce nu s-a putut verifica fără un zbor real.
```

## 6. Ce nu e verificat
- Pagina cu date reale de la server (nu există endpoint).
- Butonul și foaia de partajare pe iPhone.
- Comportamentul MapLibre pe telefoane vechi și cu rețea slabă.
- Condițiile de utilizare OpenFreeMap pentru o lansare comercială.
- Textul juridic (GDPR) al partajării.

## 7. Netlify (site în picioare pentru rude)

Pagina e statică, deci se publică pe Netlify fără build. În repo există: `web/share/index.html` (pagina), `web/share/_redirects` și `web/share/_headers` (proxy și antete), `netlify.toml` (directorul de publicare). **Nu am putut publica eu**: cere contul tău Netlify.

**Varianta rapidă (trage și lasă):** deschide `https://app.netlify.com/drop` și trage folderul `web/share` (cu `_redirects` și `_headers` în el). Primești o adresă `https://<nume>.netlify.app`. Poți schimba numele din Site configuration → Change site name.

**Varianta cu modificări automate:** Netlify → Add new site → Import from Git → repo-ul `flyq-rollama` (după ce ai împins pe GitHub), Build command gol, Publish directory `web/share` (e deja în `netlify.toml`). Fiecare push pe `main` republică site-ul; pagina e un singur fișier HTML, deci se modifică direct în `web/share/index.html`.

**Cum funcționează:** browserul rudei deschide `https://<site>/s/<token>`; Netlify servește `index.html`; pagina cere `/v1/public/shares/<token>` pe același domeniu, iar Netlify retrimite cererea către `https://flyq-cra.duckdns.org/v1/public/shares/<token>` (regula din `_redirects`). Pentru browser e același domeniu, deci **backend-ul nu are nevoie de CORS**.

**Test fără backend:** `https://<site>/?demo=1` arată un zbor simulat (CRA → LTN). Dacă harta apare și avionul se mișcă, site-ul e în picioare.

## 8. Cum trebuie configurat backend-ul pentru rude

1. **Endpoint-urile** din secțiunea 3 (`POST /v1/shares`, `DELETE /v1/shares/{id}`, `GET /v1/public/shares/{token}`). `GET /v1/public/shares/*` trebuie să fie **public**: fără `X-FlyQ-App-Key`, fără sesiune. Acum o rută necunoscută răspunde `401` (de aceea aplicația a primit 401 la „Trimite familiei"): rutele `/v1/shares` nu există încă, iar `/v1/public/*` trebuie scoasă din autentificare.
2. **Adresa din link:** variabilă de mediu `SHARE_BASE_URL=https://<site>.netlify.app`; `url` din răspunsul lui `POST /v1/shares` = `${SHARE_BASE_URL}/s/${token}`, ca rudele să deschidă pagina de pe Netlify, nu serverul.
3. **Limitarea pe IP:** cererile ajung la backend prin Netlify, deci IP-ul vizibil e al Netlify. Limitează după `X-Nf-Client-Connection-Ip` sau primul IP din `X-Forwarded-For`, nu după IP-ul conexiunii, altfel toate rudele împart aceeași limită.
4. **Antete pe răspunsul public:** `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `X-Content-Type-Options: nosniff`.
5. **Încrederea în proxy:** Fastify trebuie să aibă `trustProxy` doar dacă citești IP-ul din antet, și doar pentru antetele Netlify.
6. **Test de acceptare:** `curl -i https://<site>/v1/public/shares/<token>` întoarce `200` cu corpul din secțiunea 3, iar după `DELETE` întoarce `404`. Dacă întoarce `401`, ruta e încă în spatele autentificării.
