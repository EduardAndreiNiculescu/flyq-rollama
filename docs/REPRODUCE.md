# Reproducere: de la `git clone` la aplicația care rulează

Document pentru organizatori. Fiecare cifră de mai jos e marcată **MĂSURAT** (rulat pe o clonă nouă a acestui repo, cu mașina și data din tabel) sau **NEMĂSURAT** (estimare sau neverificat). Nu există cifre inventate.

## 1. Ce se reproduce fără nimic în plus (Windows, macOS sau Linux)

Cerințe: Node 20+ (testat cu Node 24.18), npm, git. Fără chei, fără rețea după instalare, fără model.

```bash
git clone https://github.com/EduardAndreiNiculescu/flightflow-rollama.git
cd flightflow-rollama
npm ci --ignore-scripts      # vezi nota despre Windows mai jos
node scripts/verify.mjs      # typecheck + teste + benchmark determinist; scrie verify-report.json
```

| Pas | Timp (MĂSURAT) |
|---|---|
| `git clone` (11 MB) | 2 s |
| `npm ci --ignore-scripts` | 20 s |
| `npm run typecheck` | 4 s |
| `npm test` (670 de teste trecute, 1 sărit) | 2,4 s |
| benchmark determinist, 1000 de întrebări | 1,1 s |
| **Total `verify`** | **8 s** (pe clona nouă) |

Mașina de măsurare: Windows 11, AMD Ryzen AI 9 HX 370, 24 de nuclee, 63 GB RAM, Node 24.18, rețea de eveniment (Wi-Fi). Data: 2026-10-31. Pe alte mașini timpii diferă; `verify-report.json` păstrează mediul și timpii pentru comparație.

**Windows:** `npm ci` (fără `--ignore-scripts`) **eșuează** pe Windows dacă `tar` din Git Bash e primul în PATH. Scriptul de postinstall al `llama.rn` extrage arhive cu `tar`, care citește `C:\...` ca nume de server (`Cannot connect to C`). Pe Windows folosește `--ignore-scripts` pentru verificări. Pe macOS `npm ci` normal merge și aduce artefactele native necesare compilării iOS.

## 2. Compilarea și rularea pe iPhone

Cerințe: Mac cu Apple Silicon, Xcode (testat cu Xcode 27.1 pe macOS 27.2, Mac mini M4, 16 GB RAM), cont Apple Developer, iPhone cu Developer Mode.

```bash
export MAC_HOST=<user>@<mac>.local      # sau rulează scripts/mac/build-ios.sh direct pe Mac
export MAC_DEVICE=<UDID-iPhone>         # din: xcrun devicectl list devices
npm run mac:build                       # prebuild, compilare Release, instalare pe telefon
```

| Pas | Timp |
|---|---|
| Build incremental (ultimul build real, Mac mini M4) | **5 min 25 s MĂSURAT** |
| Build curat de la zero (`CLEAN=1`, React Native din surse) | **NEMĂSURAT** (mai lung; nu l-am cronometrat) |
| Copierea modelului pe telefon (812 MB) | **NEMĂSURAT** |

Notificări iOS: **dezactivate** în acest build. Cer un profil de semnare cu capabilitatea Push (cont Apple conectat în Xcode); scriptul scoate permisiunea `aps-environment` cât timp nu e activă (`PUSH=1` o păstrează).

## 3. Modelul AI (RoLlama)

Modelul **nu e în repo** (851.333.600 de octeți). Aplicația îl caută în `Documents/models/rollama-1b-dpo-q4.gguf` și îi verifică mărimea exactă și antetul GGUF. Proprietarii proiectului îți dau linkul de descărcare:

```bash
MODEL_URL=<link> node scripts/fetch-model.mjs models      # verifică mărimea și SHA-256
scripts/mac/push-model.sh <UDID-iPhone> models/rollama-1b-dpo-q4.gguf
```

SHA-256 așteptat: `16f11f48099052f614a2c02941c767ed811e474d3c029ba56c0c4479daed24a0`.

## 4. Fidelitate: ce e verificat și ce nu

### Straturile deterministe (frontend + reguli) — MĂSURAT, reproductibil
`scripts/bench-tier1.ts` rulează cele 1000 de întrebări de stres (`eval/stress_1000.json`) prin normalizator, limita de capabilități și calea rapidă din **codul TypeScript al aplicației**:

| Rezultat | Valoare |
|---|---|
| Întrebări decise de reguli, fără model | 112 din 1000 (11,2%) |
| Decizii ale regulilor corecte / greșite | 111 / 1 (precizie 99,1%) |
| Rămase pentru modelul RoLlama | 888 (88,8%) |
| Latența regulilor (mediană, nu e latență de model) | 0,005 ms |

### Ce NU se poate reproduce din acest repo și nu e verificat de noi aici
- **„98,2% (982/1000), mediană 0,1 ms"** (raportat de un benchmark Python). Rulează cu GPU, modelul de bază, adaptorul DPO și o implementare Python a regulilor; nimic din acestea nu e în repo. **Cifrele nu se aplică aplicației de pe telefon.** Acolo regulile decid 11,2%, nu 61%, deci cele mai multe întrebări trec prin model. În benchmark-ul Python, 61% din întrebări erau rezolvate de reguli, iar mediana de 0,1 ms vine de la ele, nu de la model.
- **Acuratețea și latența modelului RoLlama pe iPhone: NEMĂSURATE.** Pe laptop, doar pentru partea de model, p95 era ~806 ms (GPU), nu valoare de telefon.
- **GGUF-ul în llama.cpp: NEVALIDAT.** Antetul e valid, tokenizerul complet, dar metadatele nu conțin `llama.rope.freq_base` și șablonul de chat; nu am confirmat comportamentul într-o rulare reală. Decodarea constrânsă (gramatică JSON) e scrisă, dar neverificată pe dispozitiv.

### Backend (FlyQ)
- Clientul (sesiune cu cheia aplicației, zbor cu token) e testat **doar cu apeluri simulate**. Nu a fost rulat pe serverul real din acest repo.
- Fără cheie FlyQ, aplicația rulează cu zborul demo și răspunsurile locale (sursa „Mock"/„Gateway laptop" în Mod test). Cheia o introduci în Mod test → „Sursa zborurilor"; nu e și nu va fi în repo.
- Zborurile demo și panoul aeroportului din FlyQ **nu sunt conectate**.

### Frontend
- Ecranele din versiunea „Liquid Glass & Sky" sunt portate și trec typecheck-ul și testele. **Aspectul pe iPhone după port: neverificat vizual de noi.**

## 5. Ce trebuie să știe cine rulează benchmark-ul de timp
1. `verify` măsoară doar ce e determinist și local. Nu e un benchmark al asistentului AI.
2. Un benchmark corect al AI-ului cere modelul pe iPhone; scripturile `scripts/device.ts` și `finetune/` sunt făcute pentru laptopul nostru și cer pașii din secțiunea 2–3.
3. Licența din `LICENSE` este cea a șablonului Expo (MIT); proprietarii trebuie să o înlocuiască.
