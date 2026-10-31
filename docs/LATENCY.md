# Latență: ce am făcut, ce urmează, ce NU am măsurat încă

Stare la 2026-10-30. **Nicio cifră de latență de pe iPhone nu e măsurată în acest document.** Telefonul nu a fost disponibil. Tot ce scrie „câștig" e o estimare marcată ca atare.

Evaluarea locală Ollama a modelului V4 este documentată separat în [V4_DESKTOP_EVAL.md](V4_DESKTOP_EVAL.md): 61/64 alegeri corecte ale primei unelte și 31/35 replici trecute în conversații complete. Acești timpi de laptop nu prezic timpii pe iPhone.

## Unde se duce timpul (de verificat pe telefon)
Un răspuns cu unelte = pas 1 (modelul alege unealta, ~28 tokeni) + unealta + pas 2 (modelul scrie răspunsul, ~100 tokeni la ritmul telefonului). Trei costuri separate:
- **prefill**: citirea promptului (contractul V4 are ~682 tokeni);
- **decode**: generarea tokenilor (aici e partea lungă);
- **unelte**: calcul local (ms) sau rețea (live).

`runToolLoop` întoarce `timing: { toolMs, modelMs[] }`. Pentru fiecare apel de model, `modelMs` conține timpul total, timpul până la primul token și timpul de după primul token. Ultimele două sunt aproximări ale prefill-ului și decode-ului; includ și alte costuri ale motorului. Ceasul este injectabil în teste. Măsurătoarea pe iPhone, pe aceleași întrebări cu și fără optimizări, lipsește încă.

Benchmark-ul de pe telefon păstrează separat `path` (`fast`, `composed`, `model`), uneltele apelate și `timing`. Rezumatul CLI numără fiecare cale și calculează medianele pentru timp de unealtă și apeluri de model. La întrebările de pe calea rapidă, modelul este încărcat doar dacă răspunsul nu poate fi compus din unealtă.

## Făcut (verificat doar cu teste pe laptop)
**Response Composer** (`src/tools/composer.ts`, în `runToolLoop`): la întrebări clare despre decolare, aterizare, durată, întârziere, poartă și timp rămas, răspunsul se construiește din rezultatul uneltei, deci **al doilea apel de model nu mai are loc**. Modelul încă alege unealta din limbajul pasagerului.
- Cade pe model (null) când: sunt mai multe intenții într-o întrebare, mai multe unelte, unealta a eșuat, zborul e anulat/deviat, lipsesc datele.
- Nu inventează: fără estimare de la furnizor spune „nu am o estimare"; poarta neconfirmată rămâne neconfirmată.
- Textele compuse sunt scutite de garda pentru text liber. Scriptul de review verifică separat că nicio cifră, oră sau cod din răspuns nu lipsește din rezultatul uneltei.
- `path: 'fast' | 'composed' | 'model'` distinge calea fără model, cea fără al doilea apel și răspunsul modelului. Dev Mode afișează `cale:rapid`, `cale:compus` sau `cale:model`.
- Fast path-ul din `src/tools/fastPath.ts` folosește doar întrebări clare despre poartă, decolare, aterizare, timp rămas și durată, când există zbor selectat. Este oprit implicit în `runToolLoop` și activat în fluxul de pe telefon. Întrebările cu negații, mai multe intenții sau instrucțiuni suspecte merg la model.
- Extinderea formulărilor clare a crescut acoperirea locală fără model de la 16 la 30 din 138 întrebări de bază și de la 8 la 28 din 400 de variante cu greșeli/argou (`generateBench(400, 7)`), cu 0 unelte alese greșit în ambele seturi. Testul verifică și alte două semințe generate. Sunt întrebări sintetice, nu trafic real sau latență de pe iPhone.
- `FF_COMPOSE=0` oprește composerul la gateway, pentru comparația A/B pe aceleași întrebări.
- `FF_FAST=1` activează separat fast path-ul în gateway pentru comparații locale; implicit rămâne oprit acolo.
- Cererile clare de ajutor în urgență primesc imediat indicația de a apela [112 în UE](https://digital-strategy.ec.europa.eu/en/policies/112) și de a cere ajutor personalului aeroportului, fără model sau rețea. Întrebările generale despre reguli și ieșiri de urgență rămân în fluxul obișnuit.
- Ultima verificare locală: `npm run check`, 595/595 teste verzi.

Raportul `composer-review.ts` (întrebările de benchmark × 6 situații de zbor), înainte → după îmbunătățirea clasificatorului:

| Categorie | Toate situațiile, înainte | Toate situațiile, după | Situații eligibile, după (fără zborul anulat) |
|---|---:|---:|---:|
| Aterizare | 155/204 (76%) | 155/204 (76%) | 155/170 (91%) |
| Decolare | 150/186 (81%) | 150/186 (81%) | 150/155 (97%) |
| Întârziere | 130/168 (77%) | 130/168 (77%) | 130/140 (93%) |
| Durată | 65/120 (54%) | 100/120 (83%) | 100/100 (100%) |
| Poartă | 210/210 (100%) | 145/210 (69%) | 145/175 (83%) |
| Timp rămas | 198/198 (100%) | 115/198 (58%) | 115/165 (70%) |

Scăderea din ultimele două rânduri este intenționată: zborul anulat și întrebările neclare ori cu mai multe intenții revin la model, inclusiv când acesta a ales o unealtă de poartă sau timp rămas. Raportul final a găsit **0** răspunsuri cu cifre, ore sau coduri fără suport în unealtă.

**Estimare (nu măsurată):** dacă pasul 2 e cea mai mare parte din timpul unui răspuns de zbor, un răspuns compus elimină aproape tot timpul lui. Câștigul real îl dă telefonul.

## Ce NU știm încă (riscuri)
- Câte din întrebările reale intră pe calea rapidă sau compusă. Benchmark-ul de mai sus este generat din întrebări de test, nu trafic real.
- Compusul sună mai rigid decât modelul. Calitatea limbii în română se compară pe aceleași întrebări (A/B, `FF_COMPOSE=0` față de implicit).
- Router-ul de intenție din composer e pe cuvinte-cheie; întrebările cu două intenții merg la model, deliberat.

## Sugestiile ChatGPT: ce am reținut și ce am lăsat
| Idee | Decizie | Motiv |
|---|---|---|
| Fast path / router semantic | Făcut pentru o listă strictă de întrebări; de măsurat pe telefon | Dev Mode arată calea, ca să se vadă cine a decis |
| Răspuns compus fără al doilea apel | **Făcut** | cel mai mare câștig așteptat |
| Prefix / KV cache (`saveSession`) | Următorul, după măsurătoare | contractul V4 e static; contează doar dacă prefill-ul e mare. Cheia cache-ului = hash(model, adaptor, contract) |
| Output structurat minim | Deja în mare parte: V4 emite un apel scurt | |
| Progressive answer / „Verific…" | UI-ul are `ThinkingSteps`; de legat la `onTool` | cost mic |
| Tool Firewall + cache de rezultate | Validarea există (`validateArgs`, `maxSteps`); cache pe rezultate proaspete nu e făcut | |
| Cuantizare / Metal tuning | După măsurătoare; doar dacă decode-ul e problema | KV q8_0 (−135 MiB) e deja măsurat la memorie, nu la calitate |
| LoRA V5 | **Nu acum** | V4 are rezultate valide pe laptop; întâi trebuie măsurată calitatea și latența pe telefon |
| Speculative decoding, al doilea model | **Nu** | memorie și risc de lentoare pe telefon |

## Pasul următor (când telefonul e liber)
1. `device.ts` bench cu `path` și cu timpii pe etape; 20 de întrebări de zbor, cu composer și fără (`reset` + `FF_COMPOSE`).
2. Scriem aici cifrele reale (mediana pe întrebările de zbor, înainte/după).
3. Abia apoi decidem prefix cache.

Nu s-a atins: contractul înghețat, adaptorul, uneltele de hartă (în așteptare).
