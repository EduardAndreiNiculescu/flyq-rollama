# Arhitectura AI

Descrie ce face codul **astăzi**, nu ce a fost planificat. Cifrele sunt cele măsurate; ce nu a fost măsurat e spus explicit.

## 1. Principiu

Modelul (RoLlama 3.2 1B, SFT + DPO, GGUF Q4_0, ~812 MB, prin `llama.rn`) primește o singură instrucțiune fixă și răspunde cu **un singur JSON**: `{"name": <unealtă>, "arguments": {...}}`. Nu scrie text pentru pasager. Fiecare fapt dintr-un răspuns (ore, poartă, timp rămas, reguli) vine dintr-o unealtă determinată din cod sau din baza de cunoștințe.

Promptul de instrucțiune (`src/llm/rollama.ts`, `ROLLAMA_INSTRUCTION`) este cel de la antrenare, caracter cu caracter. **Orice schimbare cere reantrenare.** Din acest motiv numele „FlightFlow" a rămas în prompt, deși produsul se numește FlyQ.

## 2. Fluxul unei întrebări

```
întrebare
  1. urgență?            urgentSafetyAnswer          → răspuns fix cu 112
  2. limită de capabilități
                         capabilityBoundary           → refuz scurt (cumpărat, rezervat, check-in,
                                                         glume, vreme, ghicitori)
  3. cale rapidă         tryFastPath                  → fără model:
                           - loc din bilet ("Ce loc am?")
                           - durata securității (răspuns onest, fără cifre)
                           - ora îmbarcării din bilet
                           - poartă, decolare, aterizare, durata zborului, timp rămas
                           - reguli evidente (lichide, powerbank, pisică etc.)
  4. hartă               "Unde e toaleta?"            → open_airport_map direct, cu destinația
                                                         găsită de router (fără model)
  5. router RoLlama      RollamaEngine                → JSON de unealtă, gramatică GBNF
  6. sanitizer           sanitizeToolCall             → numărul zborului din textul pasagerului,
                                                         interogarea de reguli = textul pasagerului,
                                                         poziția live doar dacă a fost cerută
  7. unelte              registry.ts                  → get_flight_details, get_gate,
                                                         get_time_remaining, get_live_tracking,
                                                         search_knowledge, open_airport_map
  8. compozitor          composeAnswer / answerFromTool → propoziția din rezultatul uneltei
```

Fișiere: `src/tools/loop.ts` (bucla), `src/tools/fastPath.ts`, `src/tools/seat.ts`, `src/tools/sanitizer.ts`, `src/tools/composer.ts`, `src/llm/rollamaEngine.ts`, `src/core/router.ts`, `src/core/capability.ts`, `src/core/tier1.ts`, `src/core/knowledge.ts`.

## 3. Normalizatorul

`normalizePassengerQuery` (`src/llm/rollama.ts`) scoate vocativele și etichetele de la capete („ba", „boss", „vere"), reduce literele repetate din tastarea grăbită, nu atinge tokenurile cu cifre (numere de zbor) și păstrează negațiile. Textul original merge mai departe la sanitizer și la căutarea de reguli.

## 4. Decodarea constrânsă

`ROLLAMA_GRAMMAR` (GBNF) permite doar `{"name":<una din cele 7 unelte>,"arguments":{…chei cunoscute…}}`. JSON invalid și nume de unelte inventate sunt imposibile prin construcție. **Neverificat pe dispozitiv:** comportamentul gramaticii în `llama.rn` pe iPhone.

## 5. Politica de refuz (cât de „paranoic" e)

Refuzurile au fost înăsprite prea mult la început și au fost restrânse:

| Situație | Comportament |
|---|---|
| Urgență (medical, foc) | răspuns fix, 112 |
| Cumpărat, rezervat, taxi, check-in făcut de aplicație, glume, vreme, ghicitori | refuz scurt, înainte de model |
| Tentativă de injecție („ignoră instrucțiunile", „system prompt", „prompt") | refuz dur |
| Salut, mulțumiri, „cine ești / ce poți face" | răspuns prietenos al asistentului |
| Model spune „none" dar routerul determinist a găsit o unealtă plauzibilă | rulează unealta routerului |
| Model spune „none" și nu există candidat | mesaj de ajutor, nu refuz |
| JSON invalid sau unealtă blocată | mesaj de ajutor |

Reparații concrete care au redus refuzurile:
- Filtrul de subiect al căutării de reguli (`assessKnowledgeSafety`) folosea cuvinte întregi („lichid"), deci respingea „lichide", „bagajul", „documente"; acum folosește rădăcini.
- Cuvinte obișnuite din lista de ghicitori a benchmark-ului („scaun", „mașina", „accident", „cât de des") sunt ignorate la rulare (în modul `strict` rămân, pentru echivalența cu benchmark-ul Python).
- Expresii obișnuite („reguli", „sistem", „uita") nu mai sunt considerate injecție.

## 6. Baza de cunoștințe

`src/core/knowledge.ts` + `src/data/eu-knowledge.json` (29 de intrări bilingve: lichide, bagaj, documente, minori, animale, mobilitate redusă, drepturile pasagerilor etc.). Căutare lexicală cu grupuri de sinonime RO/EN și greșeli de scriere. Intrările au `verifiedOn`; cele neverificate sunt marcate în răspuns („Regulile se pot schimba: confirmă la companie").

**Limită:** ce nu e în bază nu se răspunde (wifi, încărcare telefon, terminal). Răspunsul e onest („Nu am această informație offline"), nu inventat.

## 7. Măsurători

| Ce | Rezultat | Cum |
|---|---|---|
| Încărcare model pe iPhone 15 | ~0,9 s | măsurat pe telefon |
| Viteză | ~30–57 tokeni/s, primul token ~0,1 s | măsurat pe telefon |
| Routarea doar de model, pe laptop | 69 JSON valide din 70; **54 corecte (77,1%)** | llama.cpp prin Ollama, 70 de întrebări stratificate |
| Reguli deterministe pe 1000 de întrebări de stres | 611 decise, toate corecte | **regulile au fost scrise uitându-se la acel set**; cifra nu se generalizează |
| „98,2%" din benchmark-ul Python | **nu se reproduce** din repo | nu este acuratețe de telefon |
| Routarea pe telefon | **nemăsurată** | de făcut |
| Teste | 696 trec (`node scripts/verify.mjs`) | rulat local |

## 8. Fișierul model

- Mărime exactă așteptată: 851.469.152 octeți, antet GGUF verificat de aplicație.
- Hash cunoscut bun: `a7689c17e6d249be241d14969e7bcc2b82863a9d1000f98edc898cfbdf66e9d7`.
- GGUF-ul original era stricat în trei feluri (norme `f16` → SIGABRT la încărcare, matrici Q/K nepermutate → zgomot, setări RoPE lipsă). `scripts/fix_gguf_rollama.py` le repară. `finetune/merge_and_quantize.py` **încă produce GGUF-uri greșite**.
- Modelul nu e în repo și nu e împachetat în aplicație (Metro cade la 812 MB). Se copiază cu `scripts/mac/push-model.sh` în `Documents/models/` din aplicație.

## 9. Depanare

- `ROUTER_DEBUG = true` (`src/llm/rollamaEngine.ts`): în răspunsuri apare linia `[dev: JSON => decizie]`, iar `console.error('[RL] …')` scrie în consola nativă. Se oprește înainte de demo.
- Consolă pe telefon: `xcrun devicectl device process launch --device <UDID> --terminate-existing <bundle id> > ~/ff-console.log`.
- O linie `cale:model` sub un răspuns înseamnă că nici calea rapidă, nici routerul determinist nu l-au rezolvat.

## 10. De făcut
- Măsurarea routării pe telefon.
- Intrări noi în baza de cunoștințe pentru întrebări frecvente fără răspuns (wifi, încărcare, terminal, „pierd zborul", briceag).
- Verificarea licențelor modelului și un link public pentru organizatori.
