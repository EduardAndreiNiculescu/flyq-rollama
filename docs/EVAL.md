# Evaluare: baza Qwen3-4B vs. adaptorul fine-tuned

Toate sunt evaluări pe desktop (GPU-ul laptopului), **nu** inferență pe iPhone. Scorurile sunt proxy-uri grosiere (regex, suprapunere de cuvinte, verificarea numerelor): bune ca să compari două modele pe aceleași intrări, nu dovadă de calitate. Citește răspunsurile brute pentru orice decizie importantă.

## 1. Pornește serverul (după ce antrenarea s-a terminat și VRAM-ul e liber)

```bash
python finetune/chat_server.py --adapter finetune/out/adapter_v2 --port 18081
```

Expune `GET /v1/models` și `POST /v1/chat/completions` (compatibil OpenAI, cu `tools`). Modelul `base` rulează cu adaptorul dezactivat, `adapter` cu el activ. Cererile se procesează pe rând.

## 2. Rulează comparațiile

```bash
npx tsx eval/run-compare.ts --models base,adapter --sets v2,qs51
npx tsx eval/run-tools.ts   --models base,adapter
```

| Set | Fișier | Ce măsoară |
|---|---|---|
| `v2` | `finetune/data/v2/test.jsonl` (182 de exemple, scenarii nevăzute la antrenare) | Fapte corecte din context, refuz onest, anti-injecție, ancorare în documente, navigație. Plus **numere care nu apar în context** (proxy pentru halucinație) și limba răspunsului. |
| `qs51` | `eval/questions.json` (51 de întrebări scrise de mână) | Regex `mustAny`/`mustNot` + numere nesusținute, cu promptul real al aplicației (router, date de zbor, documente recuperate). |
| tools | `eval/tool-cases.json` (50 de cazuri) | Alege modelul unealta corectă, cu argumente valide? Se abține la salut, off-topic, injecție? |

Pentru o rulare rapidă de verificare: `--limit 20`. Rezultatele brute se salvează în `eval/results/` (ignorat de git).

## 3. Cum citești rezultatele
- Contează **diferența** dintre `base` și `adapter` pe aceleași cazuri, nu valoarea absolută.
- Dacă adaptorul nu depășește baza pe `qs51` și pe `tools`, nu îl folosim; rămânem pe baza cu prompt + retrieval + tool-uri.
- Dacă adaptorul câștigă pe `v2` dar pierde pe `qs51`, probabil a memorat șabloanele setului sintetic (setul `v2` e generat din șabloane). `qs51` și întrebările reale de la echipa de conținut sunt mai de încredere.
- Nu raporta o îmbunătățire fără ambele comparații. Zero numere inventate în rapoarte.

## 4. Fără GPU
Logica de scor și runnerele sunt testate cu un server fals: `npm test` (`tests/eval.test.ts`, `tests/tool-eval.test.ts`). Parserul de apeluri de tool-uri: `python -I finetune/test_openai_compat.py`.

## 5. Robustețea la greșeli de scris (fără model)

```bash
npx tsx eval/noise-test.ts --seed 7      # acord router/căutare cu textul curat, brut vs. corectat
npx tsx eval/build-lexicon.ts            # regenerează src/data/common-words.json (cuvinte care nu se corectează)
```

`src/core/spell.ts` repară cuvintele greșite doar când un singur cuvânt din lexiconul domeniului e la o greșeală plauzibilă distanță (litere transpuse, lipsă, dublate, tastă vecină). Corecția se folosește doar pentru rutare și căutare; modelul vede textul original.

Măsurat pe 101 întrebări curate (51 de evaluare + 50 de tool-uri), câte ~6 variante cu greșeli injectate, 4 seed-uri:

| | fără corecție | cu corecție |
|---|---|---|
| acord router cu textul curat | 83,9–85,5% | 93,0–94,5% |
| căutare top-1 identică cu textul curat | 60,4–65,5% | 86,2–87,8% |
| întrebări curate modificate greșit | - | 0 din 101 |

Limite: greșelile sunt sintetice (4 tipuri, litere de la a doua încolo), nu scrise de oameni; întrebările de test sunt și ele cele pe care s-a reglat routerul; lista de cuvinte comune vine din corpusurile proiectului, deci vocabularul în afara lor e neprotejat. Pe cuvinte reale scrise greșit de pasageri rezultatul poate fi mai slab: testați cu întrebările reale de la echipa de conținut.

## 6. Distilare și Arhitectură Hibridă Qwen3-0.6B (V4 / Offline iPhone 15)

Modelul student `Qwen3-0.6B` a fost antrenat prin distilare completion-only (`logits_to_keep=True`, gradient checkpointing) pentru selecția strictă a uneltelor și fallback conversațional fără halucinații.

### 6.1. Antrenare și Resurse
- **Set de date:** 7.230 train, 396 val, 256 test (zero leakage, zero CJK, argumente validate).
- **Pași:** 250 / 250 pași (`train_loss`: 0.6753, `eval_loss`: 0.4991).
- **VRAM maxim:** 1.39 GB (RTX 4070 Laptop GPU), ~1.7s per pas.
- **Conversie:** LoRA fuzionat în float16 (`merged_250`, 1.19 GB) și convertit în GGUF (`flightflow-0.6b-f16.gguf`).

### 6.2. Rezultate Benchmark Hibrid (`eval/run-hybrid.ts`)
- **Număr cazuri:** 64 cazuri de test (`eval/tool-cases-v4.json`).
- **Execuție directă FastPath / Router:** 55 / 64 (85.9% acoperire fără model).
- **Latență mediană Router:** 0.150 ms pe PC.
- **Acuratețe Router direct:** 55 / 55 (100.0%, zero unelte interzise).
- **Clarificări sigure:** 9 / 64. Pentru acest set toate sunt cazuri fără unealtă obligatorie.
- **Fallback pe Model 0.6B:** 0 / 64 în această rulare; nu există o latență sau acuratețe de fallback de raportat aici.
- **Acuratețe Totală Hibridă:** **64 / 64 (100.0%)**.

Aceasta este o evaluare de rutare/tool selection, nu un benchmark al răspunsului
liber al modelului. Măsurarea separată a modelului `flightflow-0.6b` cu toate
uneltele expuse a fost 57 / 64 (89.1%), cu un tool apelat când nu trebuia și
zero argumente invalide; ea nu trebuie confundată cu scorul hibrid.

### 6.3. Niveluri Model în Aplicație (`LiveScreen.tsx`)
1. **Fără AI:** Router pur + FastPath + Response Composer (0 MB RAM model, ~0.07 ms latență).
2. **0.6B:** Model student distilat (1.19 GB F16 / ~400 MB Q4, selecție rapidă a uneltelor).
3. **1.7B:** Model intermediar Qwen3-1.7B.
4. **4B:** Modelul complet de bază Qwen3-4B Q4_K_M (2.5 GB).
