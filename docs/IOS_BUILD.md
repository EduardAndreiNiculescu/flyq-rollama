# Build iOS cu Mac mini ca server (laptopul Windows comandă)

Laptopul rămâne locul de lucru; Mac mini-ul doar compilează (Xcode) și instalează pe iPhone. Cont Apple Developer plătit, iPhone legat la Mac (USB sau aceeași rețea). Expo SDK 58, React Native 0.88, `llama.rn`.

Măsurat: un build **incremental** durează ~5 min 25 s. Un build curat (`CLEAN=1`, React Native din surse, extensia de widget) **nu a fost măsurat** și durează mai mult.

## 1. O singură dată, pe Mac (cu monitor sau Screen Sharing)
1. Actualizează macOS. Instalează **Xcode** din App Store, deschide-l o dată, acceptă licența.
2. Xcode > Settings > **Accounts**: adaugă Apple ID-ul plătit. Settings > Locations: alege Command Line Tools.
3. System Settings > General > Sharing: **Remote Login** ON (SSH) și **Screen Sharing** ON.
4. iPhone: cablu USB, **Trust**, Settings > Privacy & Security > **Developer Mode** ON (se repornește).
5. Terminal: `git init --bare --initial-branch=main ~/flightflow.git`

(Directorul de pe Mac se numește `flightflow` din motive istorice; produsul se numește FlyQ. Nu-l redenumi fără să schimbi `MAC_DIR` și remote-ul `mac`.)

## 2. O singură dată, pe laptop (PowerShell)
```powershell
ssh-keygen -t ed25519
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh USER@MACMINI.local "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
cd <folderul proiectului>
git remote add mac USER@MACMINI.local:flightflow.git
git push mac HEAD:main
$env:MAC_HOST="USER@MACMINI.local"
ssh $env:MAC_HOST "git clone ~/flightflow.git ~/flightflow"
npm run mac:bootstrap     # verifică Xcode, Node, CocoaPods, SSH; afișează iPhone-ul (ia numele sau UDID-ul)
```
Variabile pe laptop: `MAC_HOST` (user@host), `MAC_DIR` (implicit `~/flightflow`), `MAC_DEVICE` (nume sau UDID din `xcrun devicectl list devices`).

## 3. La fiecare build
```powershell
$env:MAC_DEVICE="<nume sau UDID>"
$env:PUSH="1"             # păstrează permisiunea de notificări (obligatoriu pentru push și Live Activity)
npm run mac:build         # git push --force pe oglinda de pe Mac + build-ios.sh pe Mac
```
`CLEAN=1` regenerează `ios/` de la zero. Folosește-l la prima introducere a unei extensii, a unei scheme sau a unui nume nou; evită-l după ce ai făcut modificări în Xcode (semnare, App Groups).

Ce face `scripts/mac/build-ios.sh`:
- `expo prebuild --platform ios` (incremental);
- verifică permisiunile aplicației: `increased-memory-limit` și `extended-virtual-addressing` (le adaugă pluginul `llama.rn` doar în producție); **refuză** să compileze dacă lipsesc. Verifică doar fișierul aplicației, nu pe cel al extensiei de widget;
- șterge `aps-environment` dacă nu e `PUSH=1` (pluginul `expo-notifications` îl readaugă la fiecare prebuild);
- `xcodebuild` Release cu semnare automată, instalare cu `devicectl` și pornire.

**Oglinda se suprascrie:** un singur build odată, de pe un singur laptop.

Rezultat în `~/build.log` de pe Mac:
- `BUILD+INSTALL DONE` = succes; `BUILD-FINISHED` = scriptul a terminat; `BUILD FAILED` = eșec.
- Verifică și ora fișierului: un log vechi poate afișa succesul unui build anterior.
- Dacă ultima linie e „Unable to launch … device was not, or could not be, unlocked”, instalarea a reușit, dar telefonul era blocat: deblochează-l și deschide aplicația.

### Semnare
- Prin SSH: dacă apare `errSecInternalComponent`, pe Mac setează `MAC_KEYCHAIN_PASSWORD` în mediu (nu în git); scriptul deblochează keychain-ul. Scriptul rulează în Terminal.app (sesiunea grafică).
- **Extensia de widget** (`<bundle id>.ExpoWidgetsTarget`) și **App Group-ul** `group.<bundle id>`: dacă build-ul pică cu „Provisioning profile … doesn't match the entitlements file's value for the com.apple.security.application-groups entitlement", deschide `ios/FlyQ.xcworkspace` în Xcode și, pe **ambele** targeturi (FlyQ și ExpoWidgetsTarget), în *Signing & Capabilities*: aceeași echipă, *Automatically manage signing*, App Group-ul `group.<bundle id>` bifat (se creează cu **+** dacă lipsește). Apoi relansează build-ul fără `CLEAN=1`.
- Un App Group al altei aplicații din cont nu se refolosește.

## 4. Modelul pe telefon
Modelul (RoLlama 1B, 851.469.152 de octeți) **nu e împachetat** în aplicație: Metro cade la 812 MB. Se copiază separat, după ce a fost reparat și verificat (vezi `AI_ARCHITECTURE.md`, secțiunea 8):
```powershell
scripts/mac/push-model.sh <UDID> <fișier.gguf>
```
Copiază în `Documents/models/rollama-1b-dpo-q4.gguf` din containerul aplicației. Aplicația verifică mărimea exactă și antetul GGUF.

## 5. Depanare pe telefon
- Consolă: `xcrun devicectl device process launch --device <UDID> --terminate-existing <bundle id> > ~/ff-console.log`. În release, `console.error` din JS ajunge în consola nativă; `console.log` nu.
- Rapoarte de crash: `xcrun devicectl device info files --device <UDID> --domain-type systemCrashLogs`.

## 6. Windows
`npm ci` pică (postinstall-ul `llama.rn` extrage cu `tar` din Git Bash și ia `C:\...` drept nume de server). Folosește `npm ci --ignore-scripts`. Verificare locală: `node scripts/verify.mjs` (typecheck, teste, benchmark determinist).

## Neverificat
- Un build curat complet cu extensia de widget, de la zero, fără intervenție în Xcode.
- Versiunea minimă de Xcode pentru SDK 58 / RN 0.88 (documentația Expo nu o spune).
