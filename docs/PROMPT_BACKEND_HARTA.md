# Prompt pentru Mihai (backend): toată harta terminalului în backend

Branch + PR, **fără merge fără aprobarea unui om** (`main` se deployează automat). Nicio cheie, token sau valoare din `.env` în cod, loguri sau PR. Teste fără rețea; `npm run openapi:export`.

**Context.** Aplicația (iOS, Expo SDK 58 + modulul nativ `flyq-spatial` al lui Denis) are acum în ea harta desenată, scanările 3D/2D și **3 din cele 9 memorii vizuale** (`1223`, `1428`, `1507`, ~96 MB). Celelalte 6 (`1213`, `1240`, `1455`, `1458`, `1501`, `1511`, ~190 MB) trebuie să vină din backend, la prima pornire, plus orice actualizare a hărții fără build nou. Specificația completă e în repo-ul lui Denis, ramura `deniskyu-localizare` (https://github.com/deniskyu/flyq/tree/deniskyu-localizare): `docs/INTEGRARE-EXPO.md`, secțiunea **P.5**, și `PREDARE.md`.

**Ce vreau în backend**
1. **Pachetul locului `cra-terminal` complet.** Cu `make_pack.py --memory` din repo-ul lui Denis (`app/modules/flyq-spatial/tools/terminal/`), din folderul `app/modules/flyq-spatial/ios/Assets/`:
   - harta desenată `cra-terminal.plan.json` (0,15 MB), scanarea 3D `cra-terminal.lite.usdz` (4,1 MB), scanarea 2D `cra-terminal.map.jpg` (0,25 MB), `cra-terminal.locmap.json`, `cra-terminal.venue.json`, iconițele `poi-*.png`;
   - **toate cele 9 memorii vizuale** `.flyqmap` (~290 MB), fiecare cu `sha256`, `size`, `createdAt`.
   Fișierele sursă mari le primești de la Denis (nu sunt în git-ul aplicației; 3 dintre ele sunt în repo-ul `flyq-rollama`, în `packages/flyq-spatial/ios/Assets/`).
2. **Manifestul:** `GET /v1/venues/{venueId}/manifest` capătă un câmp nou, doar adăugat (deci `/v1` rămâne compatibil):
   ```json
   "memoryZones": [{"id": "1213", "sha256": "…", "size": 35861234, "createdAt": "2026-10-31T12:13:15Z"}]
   ```
3. **Ruta nouă:** `GET /v1/venues/{venueId}/packs/{version}/memory/{zoneId}`:
   - fișierul `.flyqmap`, `application/octet-stream`, cu `X-FlyQ-App-Key`;
   - `ETag` = sha256 și suport `Range`, ca o descărcare întreruptă să continue;
   - 404 identic pentru zonă sau versiune necunoscută; fără date personale și fără loguri cu conținut;
   - limită de rată rezonabilă (sunt fișiere mari).
4. **Servirea:** ține fișierele pe disc/volum, nu în memorie. Verifică dimensiunea volumului (~300 MB pentru pachet, plus versiuni vechi) și dacă proxy-ul din față (Caddy/Netlify) nu are limită de corp sau de timp la răspuns.
5. **Teste cu fișiere false** (fără rețea): manifest cu `memoryZones`, descărcare completă cu sha256 corect, `Range`, `ETag` / `If-None-Match` → 304, 401 fără cheie, 404 la zonă necunoscută.
6. **Verificare reală** (în PR, cu rezultat, fără să afișezi cheia): `curl` cu `X-FlyQ-App-Key` descarcă o zonă și `shasum -a 256` se potrivește cu manifestul; `curl -I` arată `ETag` și `Accept-Ranges: bytes`.

**Ce NU face (încă):** descărcarea pe telefon e cod nativ (`MemoryZoneSync` în modul), pe care îl scriem noi după ce rutele există. Până atunci aplicația merge cu cele 3 zone din ea.

**Raport:** ce ai pus în PR, ce ai testat cu adevărat și ce nu (spune explicit dacă n-ai încărcat încă fișierele reale), ce volum ocupă pachetul pe server și dacă rutele răspund 200 / 206 prin proxy.
