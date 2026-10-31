# FlyQ 0.6B — Codex handoff

## Stare verificată

- Branch: `codex/06b-router`
- Gemini V2 integrat: `5a4702b`
- Safety RAG integrat: `72485f6`
- Suita TypeScript: `619/619` teste trecute
- TypeScript: `tsc --noEmit` trecut

## Rezultate măsurate

### Router + fallback

Raport: `eval/results/hybrid-2026-10-30T21-34-37-273Z.json`

- 64/64 cazuri trecute
- acuratețe hibridă: 100%
- router direct: 55/64 (coverage 85,9%)
- acuratețe router pe execuții: 55/55 (100%)
- clarificări: 9
- fallback model: 0 pe setul actual
- latență mediană router: 0,104 ms

### Router 0.6B V2

- tool accuracy: 87,07%
- exact decision accuracy: 82,31%
- JSON validity: 99,32%
- thinking leaks: 0
- English: 92,00%
- Romanian: 81,94%

V2 este baseline măsurat și nu este acceptat pentru shipping; pragul standalone este 90%.

## Artefact intermediar observat în worktree-ul Gemini

Gemini a produs local o evaluare Char-CNN, încă necomisă:

- FP32: accuracy 90,27%, 15 false executions, mediană 1,038 ms;
- ONNX INT8: accuracy 89,30%, 4 false executions, mediană 0,322 ms, 0,477 MB.

Aceste cifre nu sunt încă livrabile de release. Pentru integrare este necesar un
commit curat și o verificare care arată că gating-ul reduce false executions la
zero înainte de execuția oricărui tool.

## Cerințe pentru următoarea rundă Gemini

1. Îmbunătățește separat cazurile RO de status/tracking și multi-intent.
2. Păstrează output-ul JSON compact și `/no_think`.
3. Rulează evaluarea completă pe setul ținut separat, nu doar pe train/val.
4. Nu converti în GGUF și nu publica modelul până când tool accuracy nu depășește 90%.
5. Raportează separat RO, EN, `none`, injection și `rules_absent`.

## RAG safety

Benchmarkul RAG este `finetune/rag/report.json`. Statusul este acceptat numai când:

- Recall@3 >= 95%;
- citation errors = 0;
- wrong jurisdiction = 0;
- refusal pentru injection, unanswerable și jurisdiction ambiguă >= 95%.

Latența iPhone rămâne nemăsurată până la profilare pe hardware Apple.
