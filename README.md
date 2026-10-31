# FlyQ — asistent de aeroport care rulează offline pe iPhone

Proiect pentru Craiova Airport Hackathon 2026. Aplicația îl însoțește pe pasager de la intrarea în aeroport până la aterizare. Un model de limbaj mic rulează **direct pe telefon** (fără server de inferență) și înțelege întrebările în română de zi cu zi, cu greșeli și argou. Faptele despre zbor (ore, poartă, întârzieri, timp rămas) și regulile de călătorie vin din cod determinist și dintr-o bază de cunoștințe locală, nu din modelul de limbaj.

> **English, in short.** FlyQ is an offline airport companion for iPhone (Expo / React Native). A 1B-parameter Llama 3.2 model (RoLlama, SFT + DPO) runs on-device through llama.rn and only *routes* the passenger's question to one of seven tools; every fact comes from deterministic code or a local knowledge base. A FlyQ backend client provides flights, a LiDAR-scanned indoor map module is in development, and iOS push is prepared but not enabled. See "Starea proiectului" for what is verified and what is not.

## Ce face aplicația

Cinci taburi: **Călătorie · Zbor · Hartă · Asistent · Profil**.

- **Biletul:** se adaugă prin cod de bord lipit (format IATA BCBP), scanare simulată sau bilet demo. Zborul demo este fictiv și e etichetat ca atare.
- **Călătorie:** pașii prin aeroport (check-in, securitate, pașapoarte, poartă, îmbarcare) și timpul rămas până la închiderea porții.
- **Zbor:** starea zborului, orele programate și estimate, poziția avionului în aer (când există date).
- **Asistent (Flo):** chat în română sau engleză, 100% offline pe telefon. Pasagerul întreabă „am voie cu lichide?", „la ce oră decolăm?", „ce poartă am?", iar răspunsul este construit din date verificate, cu avertismentele cuvenite („după orar", „estimare a furnizorului").
- **Hartă:** vezi mai jos, modulul hărții interactive.
- **Profil, Mod test:** limbă, bilete, remindere, accesibilitate; „Mod test" conține sursa zborurilor, notificările și opțiunile de dezvoltare.

## Modulul AI

Principiul: **modelul nu scrie fapte**. Modelul alege doar unealta potrivită, iar codul scrie răspunsul.

```
întrebarea pasagerului
  → normalizator (scoate fillerul, repară tastarea grăbită; păstrează numere de zbor și negații)
  → limită de capabilități (refuză: cumpărat, rezervat, taxi, cultură generală)
  → cale rapidă (reguli pentru întrebări evidente, fără model)
  → router RoLlama on-device: un singur JSON {"name": unealtă, "arguments": {...}}
       decodare constrânsă cu gramatică GBNF: doar cele 7 unelte permise (scrisă, încă neverificată pe dispozitiv)
  → sanitizer (numărul de zbor se extrage din textul pasagerului, nu din model; interogarea de reguli rămâne cea originală;
       poziția live nu rulează dacă pasagerul nu a cerut-o)
  → unelte deterministe: get_flight_details, get_gate, get_time_remaining, get_live_tracking, search_knowledge, open_airport_map
  → compozitor: propoziția se construiește din rezultatul uneltei (ore copiate, nimic calculat de model)
```

- **Modelul:** RoLlama 3.2 1B (Llama 3.2 adaptat pentru română), fine-tuning SFT + DPO, cuantizat Q4_0 (~812 MB), rulat prin `llama.rn` (llama.cpp + Metal). Detalii despre fișier, reparații și verificări: `docs/REPRODUCE.md`.
- **Baza de cunoștințe:** `src/core/knowledge.ts` și `src/data/`, căutare cu tolerare de greșeli și rădăcini românești (bagaj, lichide, animale, documente, drepturile pasagerilor).
- **Siguranță:** urgențele (medical, foc) primesc un răspuns fix cu 112; regulile nu pot fi ocolite de un mesaj care imită o instrucțiune.

## Modulul hărții interactive (Denis) — în dezvoltare

Harta interioară a aeroportului este realizată din **scanare LiDAR** de către Denis și va permite vizualizarea punctelor de interes (toalete, restaurante, case de schimb, porți, securitate) și **ghidarea pasagerului** către ele.

Starea actuală: tabul „Hartă" are un înlocuitor (`MapPlaceholder`); **modulul LiDAR nu este integrat în acest repo**. Punctul de integrare este deja definit:
- asistentul poate cere harta prin unealta `open_airport_map`, care apelează `NavigationHandler.openAirportMap({ destination, fromZone })` (`src/core/assistant.ts`, `src/core/types.ts`);
- întrebări ca „unde e toaleta?" sau „unde pot schimba bani?" ajung deja la această unealtă; modulul hărții primește destinația și face ghidarea;
- backend-ul FlyQ are un endpoint pentru pachetele de hartă (`/v1/venues`), pe care modulul îl poate folosi.

## Backend FlyQ

Serverul echipei (repo separat, `FlyQ-backend`) oferă sesiuni, zboruri de la aeroportul Craiova, ETA calculat pe server, pachete de conținut și notificări push. Aplicația are un client pentru **sesiune și zbor** (`src/services/live/gatewayClient.ts`). Cheia aplicației FlyQ nu face parte din repo: se introduce în „Mod test → Sursa zborurilor". Fără cheie, aplicația rulează cu zborul demo.

## Starea proiectului (verificat și neverificat)

| Parte | Stare |
|---|---|
| Frontend (5 taburi, design Liquid Glass & Sky), teste | integrat; typecheck și 675 de teste trec; compilat și instalat pe iPhone |
| Model pe iPhone | **se încarcă și rulează**: o măsurătoare pe iPhone 15 a arătat ~30,7 tokeni/s, primul token în 0,1 s |
| Calitatea routării pe telefon | **în verificare**. Pe laptop (llama.cpp prin Ollama), pe 70 de întrebări stratificate, doar modelul: 69 JSON valide, 54 corecte (77,1%) |
| Reguli deterministe | pe setul de 1000 de întrebări de stres decid 611 (61,1%), toate corecte; **regulile au fost scrise uitându-se la acel set**, deci cifra nu spune cum se comportă pe întrebări noi |
| „98,2% acuratețe" din benchmark-ul Python | **nu se reproduce din repo** (cere GPU, adaptor și implementarea Python) și nu e acuratețea de pe telefon |
| Backend FlyQ | client testat doar cu apeluri simulate; zboruri demo și panoul CRA neconectate |
| Notificări iOS | cod scris, **dezactivate în build** (profilul de semnare nu include Push) |
| Hartă LiDAR (Denis) | în dezvoltare, neintegrată |

## Cum compilezi și rulezi

Pașii exacți, cu timpii măsurați: **`docs/REPRODUCE.md`**.

```bash
git clone https://github.com/EduardAndreiNiculescu/flyq-rollama.git && cd flyq-rollama
npm ci --ignore-scripts      # pe Windows; pe macOS poți rula `npm ci` fără opțiune
node scripts/verify.mjs      # typecheck + teste + benchmark determinist (~8 s)
```

**iPhone (cere un Mac cu Xcode și un cont Apple Developer):** `npm run mac:build` (vezi `docs/REPRODUCE.md`, secțiunea 2).

**Modelul** nu e în repo (851.469.152 de octeți). Se obține de la proprietarii proiectului și se verifică:

```bash
MODEL_URL=<link> node scripts/fetch-model.mjs models
scripts/mac/push-model.sh <UDID-iPhone> models/rollama-1b-dpo-q4.gguf
```

Dacă pornești de la un GGUF produs de `finetune/merge_and_quantize.py`, el trebuie reparat înainte de folosire (`python scripts/fix_gguf_rollama.py in.gguf out.gguf`): exportatorul scrie normele în `f16` (aplicația se închide la încărcare), nu permută matricile Q/K și nu scrie setările RoPE (modelul răspunde cu zgomot).

## Structura repo-ului

| Cale | Conținut |
|---|---|
| `src/screens`, `src/components`, `src/theme`, `src/i18n` | interfața |
| `src/core` | reguli, router, bază de cunoștințe, calcule de zbor |
| `src/llm` | modelul RoLlama: prompt, router, motor llama.rn, verificarea fișierului |
| `src/tools` | uneltele, sanitizer, cale rapidă, compozitor, bucla de unelte |
| `src/services/live` | client FlyQ, legătura cu laptopul de test, notificări |
| `finetune/` | scripturi de antrenare și evaluare (date și modele nu sunt în repo) |
| `scripts/` | verificare, benchmark-uri, repararea GGUF, build pe Mac |
| `docs/` | documentație, `REPRODUCE.md` |

## Licență

`LICENSE` este încă cel din șablonul Expo (MIT); proprietarii proiectului îl vor înlocui. Modelul de bază și RoLlama au licențele lor, care trebuie verificate înainte de redistribuire.
