# V4: evaluare locală cu Ollama (2026-10-30)

Modele instalate local: `ff-base:latest` și `ff-adapter-v4:latest`. Testele au folosit Ollama `0.33.3`, contractul V4, temperatura `0.2` și șablonul Qwen3 cu gândirea dezactivată. Nu sunt măsurători pe iPhone și nu verifică date de zbor reale.

## Alegerea primei unelte

Comandă, în PowerShell:

```powershell
$env:FF_BACKEND='ollama-raw'; $env:FF_CONTRACT='v4'
npx tsx eval/run-tools.ts --base http://127.0.0.1:11434 --models ff-base:latest,ff-adapter-v4:latest --cases tool-cases-v4.json
```

| Măsură, 64 de întrebări | Model de bază | Adaptor V4 |
|---|---:|---:|
| Alegerea uneltei și argumentele au trecut | 18/64 | 61/64 |
| Argumente invalide / unealtă necunoscută | 2 | 0 |
| Unealtă interzisă apelată | 1 | 0 |
| Mediană primul apel de model, laptop | 348 ms | 429 ms |
| Percentila 90, primul apel, laptop | 783 ms | 582 ms |

Cele trei cazuri V4 ratate: `n51` (a ales `search_knowledge` pentru „I'm hungry, where can I eat?” în loc de hartă), `n57` (a căutat inutil pentru „Care e capitala Franței?”) și `n64` (a refuzat cererea de a pretinde că zborul nu întârzie, fără să consulte zborul). Refuzul din `n64` nu a inventat un status; este un eșec al rubricii privind apelul obligatoriu, nu o minciună în răspuns.

Scriptul salvează și textul brut plus argumentele apelurilor în `eval/results/tools-*.json` pentru a verifica fiecare caz. Scorul acoperă numai **prima** decizie a modelului, nu calitatea răspunsului final. Timpii sunt influențați de încărcarea locală a modelului și nu estimează latența telefonului.

## Conversații complete

```powershell
$env:FF_BACKEND='ollama-raw'; $env:FF_CONTRACT='v4'
npx tsx eval/run-multi.ts --base http://127.0.0.1:11434 --models ff-adapter-v4:latest
```

V4 a trecut **31/35 de replici** și **8/12 conversații** integral, cu uneltele aplicației și trei zboruri fictive fixe. Cele patru replici ratate:

- `m03_baggage_chain#3`: a răspuns din istoric, fără să caute din nou termenul reclamației; răspunsul a omis termenul de șapte zile menționat anterior pentru bagaj deteriorat.
- `m07_offtopic_then_back#1`: a căutat inutil capitala Franței, apoi a spus că nu are informația offline.
- `m08_powerbank_followups#2`: la „How many of them?” nu a căutat; baza offline nu are încă o regulă verificată despre numărul de powerbank-uri și răspunsul a refuzat să ghicească.
- `m11_map_sequence#2`: la „Dar o farmacie?” a ales cunoștințele, nu harta. În acest test, deschiderea hărții era dezactivată, astfel că și prima replică din scenariu a informat utilizatorul că nu poate deschide harta.

Aceste teste arată un câștig mare la selecția uneltelor față de modelul de bază, dar și slăbiciuni la urmărirea contextului și la alegerea hărții. Următorul pas de validare rămâne benchmark-ul pe iPhone, urmat de testarea cu modulul real de hartă.
