# V4: decizia, cu toate mÄƒsurÄƒtorile

Data: vineri 2026-10-30, ~00:45. Demo È™i pitch: duminicÄƒ 2026-11-01.

## Decizie
**Pornim V4 acum.** Nu mai colectÄƒm date Ã®nainte de a Ã®ncepe: ce lipsea ca sÄƒ decidem s-a mÄƒsurat. Primul pas e contractul Ã®ngheÈ›at (prompt static compact), apoi generatorul de date, apoi un pilot de 1.000 de rÃ¢nduri. Antrenarea completÄƒ porneÈ™te cÃ¢nd pilotul trece de poarta G2 de mai jos.

## Ce s-a mÄƒsurat (tot)
| Context | Rezultat | EÈ™antion |
|---|---|---|
| Laptop, v3, 5 seeduri | alegerea primei unelte **90%** (Wilson 87â€“93%) | 439 scorate |
| Laptop, v3, tracking | **37%** (22â€“56%) | 27 |
| Laptop, v3, remaining / gate / map | 82% / 85% / 85% | 28 / 26 / 48 |
| Laptop, v3, cod de zbor inventat Ã®n rÄƒspuns | **4%** (3â€“6%), Ã®nainte ca rezultatele uneltelor sÄƒ conÈ›inÄƒ `flightNumber` | 500 |
| Laptop, setÄƒri de telefon (T 0,7, penalizare 1,5), seed 26 | **88%** (78/89) | 89 |
| Laptop, fiÈ™ierul oficial GGUF + acelaÈ™i adaptor, seed 26 | **87%** (77/89) | 89 |
| Telefon, Ã®nainte de reparaÈ›ii, seed 26 | **54%** (48/89), 16 eÈ™ecuri de execuÈ›ie | 89 |
| Telefon, dupÄƒ reparaÈ›ii, aceleaÈ™i 34 de Ã®ntrebÄƒri comparabile | **74%** (25/34), Wilson 57â€“85% | 34 |
| Laptop, aceleaÈ™i 34 | 88% (30/34), Wilson 73â€“95% | 34 |
| Promptul de pe telefon faÈ›Äƒ de formatul de antrenare | **identic octet cu octet** (6.520 caractere) | 1 prompt decodat din log |
| Prompturi pe telefon la primul pas | 1.581â€“1.865 tokeni, limita e 2.048 | 42 prompturi din log |
| VitezÄƒ pe telefon | procesare prompt ~97 tok/s, generare ~7 tok/s, latenÈ›Äƒ medianÄƒ ~24 s | 40 + 100 Ã®ntrebÄƒri |

## Ce rÄƒmÃ¢ne dupÄƒ ce scoatem erorile de mÄƒsurare
Decalajul de pe telefon (54% faÈ›Äƒ de 88%) era Ã®n mare parte din mÄƒsurare È™i din runtime, nu din model:
- conversaÈ›ia se pÄƒstra Ã®ntre Ã®ntrebÄƒri Ã®n benchmark (reparat),
- GPU-ul pica la prompturi lungi È™i apoi rÄƒspundea gol (reparat),
- fiÈ™ierul modelului e echivalent (87% faÈ›Äƒ de 88% pe laptop),
- formatul promptului e identic.

Ce rÄƒmÃ¢ne **este de model È™i de prompt**, deci exact ce rezolvÄƒ V4:
1. **Prompt prea mare.** 1.591 de tokeni Ã®n prompt-ul de azi faÈ›Äƒ de **682** Ã®ntr-un candidat compact static (mÄƒsurat cu tokenizatorul Qwen3). La ~97 tok/s pe telefon, diferenÈ›a de 909 de tokeni Ã®nseamnÄƒ **~9,4 s mai puÈ›in** pe fiecare apel de model, È™i face loc pentru documentele de la `search_knowledge` (cele 3 eÈ™ecuri la reguli, ipoteza: depÄƒÈ™ire de context, Ã®ncÄƒ netestatÄƒ).
2. **Tracking 37%** pe laptop. Cea mai slabÄƒ categorie; V4 adaugÄƒ ~100â€“150 de rÃ¢nduri dedicate.
3. **Coduri inventate (4%) È™i refuzuri-papagal** (25Ã— â€žNu pot face asta acumâ€¦", 25Ã— â€žNu am aceastÄƒ informaÈ›ie offlineâ€¦"). V4: rezultate cu `flightNumber`, â‰¥10 formulÄƒri de refuz per limbÄƒ È™i categorie.
4. **Decizia de apel de unealtÄƒ Ã®n conversaÈ›ie** (re-apel obligatoriu), pe care v3 n-a vÄƒzut-o.

## De ce nu mai aÈ™teptÄƒm
- Contractul (promptul) se schimbÄƒ oricum, iar orice schimbare de prompt cere reantrenare. Cu cÃ¢t o facem mai tÃ¢rziu, cu atÃ¢t mai puÈ›in timp rÄƒmÃ¢ne.
- Testul cu context 4096 È™i benchmark-ul mare de 100 de Ã®ntrebÄƒri ar confirma o parte din ce È™tim; niciunul nu poate schimba direcÈ›ia: promptul mare È™i tracking-ul slab rÄƒmÃ¢n probleme oricum.
- **Plasa de siguranÈ›Äƒ existÄƒ:** v3 cu promptul de azi funcÈ›ioneazÄƒ (74% pe telefon pe Ã®ntrebÄƒrile comparabile, 88% pe laptop). DacÄƒ V4 nu trece pragurile, rÄƒmÃ¢ne v3. Deci riscul de a Ã®ncerca e timpul, nu calitatea.

## Calendar (estimÄƒri din ritmul de azi, nu garanÈ›ii)
| Moment | Ce | PoartÄƒ |
|---|---|---|
| Vineri 01:00â€“03:30 | Contract: prompt static compact, `modelToolSpecs`, rezultate cu `flightNumber`, eroare â€žniciun zbor selectat", test golden (hash) | **G1:** `npm run check` verde + hash Ã®ngheÈ›at |
| Vineri 03:30â€“07:00 | Generator V4 (din v3): prompt static, rÃ¢nduri de tracking, refuzuri variate, regim telefon, perechi de graniÈ›Äƒ; verificatori | datele trec toÈ›i verificatorii |
| Vineri ~08:00 | Pilot 1.000 de rÃ¢nduri (~45 min antrenare) â†’ LoRA â†’ GGUF â†’ Ollama â†’ dev | **G2:** nu mai rÄƒu decÃ¢t v3 pe setul dev, 0 CJK, nicio scÄƒdere pe o categorie |
| Vineri ~10:00 | Antrenare completÄƒ (~3,4 h) | â€” |
| Vineri ~14:00â€“16:00 | Evaluare pe sigilat, comparaÈ›ie pereche cu v3 | **G3:** bate v3 pe S1 È™i S2, fÄƒrÄƒ acÈ›iuni dÄƒunÄƒtoare |
| Vineri seara / sÃ¢mbÄƒtÄƒ dimineaÈ›Äƒ | Decizie, build iOS, benchmark pe telefon cu V4 | Ã®ngheÈ›area modelului sÃ¢mbÄƒtÄƒ ora 12:00 cel tÃ¢rziu |

DacÄƒ pilotul picÄƒ G2: rÄƒmÃ¢nem pe v3, cu `nCtx` 4096 dacÄƒ testul pe reguli aratÄƒ cÄƒ ajutÄƒ.

## Ce e deja fÄƒcut
- MeasurÄƒtoarea de buget de tokeni: `scripts/v4-budget.ts` (candidatul compact are 682 de tokeni, cel de azi 1.591).
- Planul complet: `<cale-locala>` È™i `docs/V4_DATA_PLAN.md`.
- ReparaÈ›iile de runtime pe telefon (GPU, conversaÈ›ie izolatÄƒ Ã®n benchmark).

## Ce nu se face
- Nu se antreneazÄƒ Ã®nainte de G1 (contractul Ã®ngheÈ›at) È™i de G2 (pilot).
- Nu se schimbÄƒ promptul Ã®n aplicaÈ›ia de pe telefon pÃ¢nÄƒ nu existÄƒ adaptorul V4: v3 a fost antrenat pe promptul vechi.

