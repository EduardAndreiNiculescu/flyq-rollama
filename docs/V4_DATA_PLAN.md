# V4: ce trebuie să conțină datele (din măsurători, nu din presupuneri)

Sursa: 5 seeduri × 100 de întrebări pe laptop cu v3 (500 de întrebări, `scripts/analyze-bench.ts`) și cele patru rulări eșuate pe telefon. Planul complet de antrenare e în `<cale-locala>`. **Nu se antrenează nimic până nu spune utilizatorul.**

## Ce arată măsurătorile (laptop, v3, 500 de întrebări)
| Categorie | Corect | Wilson 95% | De făcut în V4 |
|---|---|---|---|
| tracking ("unde e avionul?") | 10/27 = 37% | 22–56% | Cea mai slabă. 9× nu apelează nimic, 8× apelează `get_flight_details`. Rânduri noi: ~100–150, cu formulări RO/EN, argot, majuscule. |
| remaining ("cât mai e?") | 23/28 = 82% | 64–92% | Mai multe perechi `get_time_remaining` față de `get_live_tracking`. |
| map | 41/48 = 85% | 73–93% | 6× a ales `search_knowledge` în loc de `open_airport_map` ("unde e farmacia?"). Mai multe destinații, inclusiv servicii (bancomat, fumat, încărcare). |
| gate | 22/26 = 85% | 66–94% | Confuzii cu zborul; vezi codurile inventate. |
| rules, delay, arrival, departure, duration, chat, offtopic, injection | 92–100% | — | Păstrăm; fără supra-antrenare. |

- **Cod de zbor inventat în răspuns:** 21/500 = 4% (Wilson 3–6%), mai ales la întrebări despre poartă și terminal ("RO1259", "TK5445"). Azi rezultatele uneltelor conțin `flightNumber` (fix din această zi), deci V4 trebuie antrenat pe rezultate **cu** `flightNumber`, iar răspunsurile trebuie să-l copieze exact.
- **Răspunsuri-papagal:** 25× "Nu pot face asta acum. Verifică panourile...", 25× "Nu am această informație offline...". V4 are nevoie de ≥10 formulări distincte de refuz per limbă și categorie.

## Ce trebuie rezolvat înainte de date (schimbă ce vede modelul)
1. Eroarea distinctă "niciun zbor selectat" față de "zbor negăsit" (A19 din plan).
2. Prompt static compact (~760 de tokeni față de ~1.563). Pe telefon, prompturile de ~1450 de tokeni au declanșat căderea GPU (vezi mai jos), deci reducerea ajută și runtime-ul, nu doar modelul.
3. Rezultatele uneltelor cu formatul final (au `flightNumber`; restul se îngheață după corecturile D10).

## Regimul telefonului (netrenat în v3)
- Offline: `get_live_tracking` întoarce "NOT AVAILABLE"; zborul e demo, fără poartă și fără estimare. Plan: ~70% din rândurile de zbor în acest regim.
- Eșantionare reală pe telefon: temperatură 0,7 și penalizare 1,5 la toate apelurile. În curs: rulare pe laptop cu aceleași setări, pe seed 26, pentru comparație.

## Telefon: de ce nu avem încă un benchmark valid
Logul consolei (capturat de pe Mac) arată `ggml_metal_synchronize: error: command buffer 0 failed with status 5` urmat de `backend is in error state ... recreate the backend to recover`. De atunci toate apelurile întorc gol. Fix în `src/llm/llamaEngine.ts` (batch mic, recreare automată); verificarea e în curs. Până atunci, **nicio cifră de pe telefon nu se folosește pentru V4.**

## Reguli care rămân din plan
Split pe slot, test sigilat scris de autori orbi, filtru de scurgere, verificatori care refuză să scrie fișierul, selecția checkpointului pe dev. Fără antrenare până la comanda utilizatorului.
