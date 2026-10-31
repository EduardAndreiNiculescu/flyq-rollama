# Documentație: de unde începi

## Citește mai întâi
| Document | Ce găsești |
|---|---|
| `../README.md` | Ce este aplicația, starea proiectului (verificat/neverificat), cum o rulezi |
| `ARHITECTURA.md` | Vedere de ansamblu: straturi, navigare, date, build, decizii, riscuri |
| `AI_ARCHITECTURE.md` | Pipeline-ul asistentului, politica de refuz, baza de cunoștințe, măsurători reale |
| `LIVE_ACTIVITIES.md` | Cardul de pe ecranul blocat: fișiere, contractul de date, fluxul, testarea |
| `NOTIFICARI.md` | Notificările push: abonare, mediul APNs, test din laptop |
| `SHARE_FLIGHT.md` | Partajarea zborului cu familia: pagina web, contractul serverului, confidențialitate, prompt pentru backend |
| `IOS_BUILD.md` | Build pe Mac mini comandat din laptop: pași, semnare, depanare |
| `REPRODUCE.md` | Reproducerea verificărilor, cu timpii măsurați |

## Pentru backend
| Document | Ce găsești |
|---|---|
| `PROMPT_BACKEND_LIVE_ACTIVITIES.md` | Cererea inițială către backend pentru Live Activities |
| `PROMPT_BACKEND_STATUS_2026-11-01.md` | Situația curentă a aplicației și testul de sincronizare cerut lui Mihai |
| `BACKEND_CONTEXT.md`, `GATEWAY.md`, `INTEGRATION.md` | Contextul serverului FlyQ și al gateway-ului de test |

## Context istoric (decizii și rapoarte vechi)
Documentele de mai jos descriu etape anterioare (modelul 0.6B, V4, clasificatorul de intenții, preluări între colegi). Sunt păstrate pentru istoric; unde diferă de documentele de mai sus, cele de mai sus sunt cele curente.

`V4_DECISION.md`, `V4_DATA_PLAN.md`, `V4_DESKTOP_EVAL.md`, `IOS_V4_HANDOFF.md`, `IOS_06B_MODEL_HANDOFF.md`, `INTENT_CLASSIFIER.md`, `RESULTS_v2.md`, `TIER2_ROBUST_TRAINING_REPORT.md`, `EVAL.md`, `BENCHMARK.md`, `LATENCY.md`, `RAG_CORPUS.md`, `HANDOFF_CODEX_COMPOSER.md`, `HANDOFF_TASKS.md`, `FRONTEND_HANDOFF.md`, `FRONTEND_ARCHITECTURE.md` (analiza front-end-ului original al lui Nicu, înainte de integrare), `UI_DIRECTION.md`, `TEAM.md`, `PROMPTS_ECHIPE.md`, `DESCRIERE_PROIECT.md`.

## Reguli de scris
- Documentele sunt în română; codul în engleză; textele pentru utilizator în română și engleză.
- Nu se comit chei, tokenuri, parole, UDID-uri, ID-uri de echipă sau căi locale. Valorile secrete stau în `.env.local` (ignorat de git).
- Ce nu a fost verificat pe un dispozitiv real se spune explicit, nu se prezintă ca verificat.
