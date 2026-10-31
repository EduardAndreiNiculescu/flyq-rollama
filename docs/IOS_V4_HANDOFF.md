# FlightFlow iOS V4 — compilare pornită de pe Windows

## Windows PowerShell

```powershell
git clone --branch composer-codex https://github.com/EduardAndreiNiculescu/flightflow.git
cd flightflow
npm ci
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile production
```

Deschide pe iPhone linkul primit la `device:create` pentru înregistrarea telefonului. La primul build, EAS cere contul Apple Developer pentru semnare. Profilul `production` din `eas.json` activează entitlements pentru `llama.rn` și produce un IPA cu distribuție internă. Compilarea rulează pe macOS în cloudul EAS, pornită de pe Windows. Deschide pe iPhone linkul EAS al buildului pentru instalare.

După instalare, în Mod test apasă **Descarcă (Wi-Fi, 2,5 GB)**, apoi **Încarcă**. Verifică textul `+ adaptor v4`. Adaptorul V4 este inclus în build și se copiază automat în `Documents/models/` la prima încărcare.

**Actualizare peste V3:** identificatorul rămâne `com.flightflow.craiova.dev`. Dacă V3 și V4 sunt semnate de aceeași echipă Apple și profilul nou include telefonul, instalarea V4 actualizează aplicația și păstrează datele. Fișierul V3 poate rămâne pe telefon, dar aplicația V4 caută numai adaptorul V4. Dacă iOS refuză actualizarea din cauza semnăturii, verifică echipa Apple înainte de a dezinstala V3; dezinstalarea poate șterge datele locale.

## Varianta cu Mac conectat prin USB

Ramura `composer-codex` conține aplicația cu Response Composer, fast path și adaptorul V4. Configurația implicită a modului cu unelte este contractul V4. Aplicația caută `ff-adapter-v4-f16.gguf` în `Documents/models/` și afișează „adaptor v4” după încărcare.

Adaptorul final este în repo la `assets/models/ff-adapter-v4-f16.gguf` (66.095.200 octeți, SHA-256 `1ef18e2e2fb6eebc784c66f84a00569e0274c92584de3ed0ba2f23607bea8ae8`). Modelul de bază Qwen3-4B Q4_K_M (2,5 GB) se descarcă separat; nu este în Git.

### Compilare locală pe Mac

```bash
git clone --branch composer-codex https://github.com/EduardAndreiNiculescu/flightflow.git
cd flightflow
xcrun devicectl list devices
bash scripts/mac/build-ios.sh <UDID-ul-din-listă>
```

Buildul folosește un certificat Apple Development și necesită Xcode, Node și CocoaPods. Scriptul face `npm ci`, generează proiectul iOS, verifică entitlements, compilează Release și instalează aplicația. Rulează într-un Terminal al sesiunii grafice, cu keychain deblocat. Dacă identificarea echipei nu reușește, setează `APPLE_TEAM_ID` înainte de build.

Adaptorul se instalează automat din build. Copierea manuală rămâne opțională:

```bash
bash scripts/mac/push-model.sh <UDID-ul-din-listă> assets/models/ff-adapter-v4-f16.gguf
```

Pentru modelul de bază, deschide aplicația pe iPhone și folosește „Descarcă (Wi-Fi, 2,5 GB)” din Mod test. Alternativ, descarcă fișierul `Qwen3-4B-Q4_K_M.gguf` indicat în `src/llm/modelProvision.ts`, verifică SHA-256 `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5`, apoi copiază-l cu același script:

```bash
bash scripts/mac/push-model.sh <UDID-ul-din-listă> /cale/către/Qwen3-4B-Q4_K_M.gguf
```

În Mod test, încarcă modelul și verifică textul `+ adaptor v4`. Modelul de bază de 2,5 GB nu este inclus în build. Benchmarkul PC din `docs/V4_DESKTOP_EVAL.md` nu este benchmark iPhone.
