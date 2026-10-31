# FlightFlow – offline on-device AI copilot (Craiova Airport Hackathon 2026)

Qwen3-4B (GGUF Q4_K_M) running on the iPhone through `llama.rn` (llama.cpp + Metal). No inference server. Stack: Expo SDK 58, RN 0.88, `llama.rn` 0.13.0-rc.8 (pinned; 0.12.9 does not compile on RN 0.88 iOS: it uses the removed RCTCxxBridge).

## Status (honest)

| State | Items |
|---|---|
| Done, unit-tested on Windows | Flight maths and ETA with refusal guards; typo-tolerant multi-intent router; domain spell-corrector (routing/retrieval only); lexical KB retrieval; deterministic flight-answer templates; answer guard (rejects invented numbers, gates, live-status claims) and clarification questions, both wired into `FlightFlowAssistant.ask`; synonym-expanded retrieval; tool registry, argument validation and tool-calling loop; AirLabs client + parser and OpenSky decoder/client (simulated responses only); eval/compare/tool runners (tested against a fake server); OpenAI-compatible eval endpoint parser |
| Written, never run on a device | Chat UI, streaming, stop, model download/validation (`App.tsx`, `src/llm/`) |
| Written, not wired / not finished | Tool loop is not called from `App.tsx` (the app uses `FlightFlowAssistant.ask`); `NavigationHandler` is a console mock; no `eas.json`; no HTTP server in `server/` (only the two clients) |
| Not started | SQLite FTS, voice, download progress/resume, real map, AirLabs-to-hex mapping, cache/rate limit/auth |

Tests: `npx vitest run` → **267 passed in 14 files** (run at the time of writing; counts change as files are added).

## What is NOT verified

- No run on an iPhone, no Airplane Mode test, no Metal inference.
- No benchmark numbers: `docs/BENCHMARK.md` is an empty template.
- No live AirLabs or OpenSky call: response shapes are assumed from docs and simulated in tests.
- Fine-tuning: `finetune/out/status.json` last showed step 254/284 of the v2 run; adapter not yet compared to base (`docs/EVAL.md` procedure not run). The only file in `eval/results/` has 153 rows but just 15 with non-empty text – not a usable result.
- Spell-correction numbers in `docs/EVAL.md` use synthetic typos, not real passenger text; the common-word lexicon is built from project corpora only.
- Knowledge base: 68 passages (EN/RO), **28 with `verifiedOn` set, 40 with `verifiedOn: null`**. The 28 are 14 bilingual EU entries a person re-read on 2026-10-29 (`src/data/eu-knowledge.json`, `checked: true`); the 40 are the built-in seed entries (18) and 11 EU entries (22) not yet checked. No Craiova-airport-specific facts are verified.

## Architecture

`question → router (intents, multi-intent) → spell correction (routing/retrieval only; the model sees the original text) → retrieval from the offline KB → tools / deterministic flight code → LLM (Qwen3-4B) → answer guard → safe fallback`.
`src/core` pure TS, no native deps · `src/tools` registry + loop · `src/tracking` AirLabs/OpenSky parsing, ETA · `server/` API clients (keys from env only) · `src/llm` llama.rn engine + provisioning · `eval/` · `finetune/` · `docs/`.

## Commands

```bash
npm run check                       # tsc --noEmit + vitest
npx tsx eval/run-eval.ts --model qwen3:4b          # needs Ollama + model
npx tsx eval/run-compare.ts --models base,adapter --sets v2,qs51   # needs python finetune/chat_server.py (GPU)
npx tsx eval/run-tools.ts --models base,adapter
npx tsx eval/noise-test.ts --seed 7                # typo robustness, no model
npx tsx eval/build-lexicon.ts                      # regenerate src/data/common-words.json
npx tsx finetune/make_dataset_v2.ts                # dataset generator (v2)
python -I finetune/validate_dataset.py finetune/data/*.jsonl
python finetune/train_qlora.py --help              # QLoRA training (8 GB VRAM laptop GPU)
```
Details: `docs/EVAL.md`, `docs/INTEGRATION.md`.

## Build for iPhone

The app uses native code (`llama.rn`): Expo Go will not work, and there is no Metal in the Simulator. Set `ios.bundleIdentifier` in `app.json` if it clashes with your team. Use a Release build (Debug is far slower).

**Option 1 – Mac with Xcode**
```bash
npm install
npx expo prebuild --platform ios
npx expo run:ios --device --configuration Release
```
Set your Team in Xcode (Signing & Capabilities) via the official sign-in.

**Option 2 – EAS cloud (no Mac)**: `eas.json` does not exist yet (open task in `docs/TEAM.md`). Plan: `npx eas-cli@latest login`, `eas device:create`, an `eas.json` with a `preview` profile, then `eas build --platform ios --profile preview`. Not tried.

First launch: tap **Download model** on Wi-Fi (~2.5 GB). Size and GGUF header are validated, then it loads.

## Demo script
1. Open FlightFlow; wait for "Loading model on device…".
2. Enable Airplane Mode.
3. Ask in Romanian: "Ce înseamnă ultimul apel?"
4. "Cât mai durează până aterizează DEMO123?" (deterministic code; data labelled demo).
5. "Mi-a dispărut bagajul, ce fac?" and "Am uitat pașaportul, pot arăta o poză?"
6. Each reply shows TTFT and tok/s in the bubble. Do not claim any figure before it is measured.
