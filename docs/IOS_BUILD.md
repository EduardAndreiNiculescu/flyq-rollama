# Build iOS cu Mac mini ca server (laptopul Windows comandă)

Laptopul rămâne locul de lucru; Mac mini-ul doar compilează (Xcode) și instalează pe iPhone. Cont Apple Developer plătit, iPhone legat la Mac (USB sau aceeași rețea). Expo SDK 58, `llama.rn` 0.12.9.

## 1. O singură dată, pe Mac (cu monitor sau Screen Sharing)
1. Actualizează macOS. Instalează **Xcode** din App Store, deschide-l o dată, acceptă licența.
2. Xcode > Settings > **Accounts**: adaugă Apple ID-ul plătit. Settings > Locations: alege Command Line Tools.
3. System Settings > General > Sharing: **Remote Login** ON (SSH) și **Screen Sharing** ON.
4. iPhone: cablu USB, **Trust**, Settings > Privacy & Security > **Developer Mode** ON (se repornește).
5. Terminal: `git init --bare --initial-branch=main ~/flightflow.git`

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
npm run mac:build         # git push + pe Mac: npm ci, expo prebuild (NODE_ENV=production), verifică entitlements, compilare Release, instalare
```
- Scriptul **refuză să compileze** dacă `.entitlements` nu are `increased-memory-limit` și `extended-virtual-addressing` (le adaugă pluginul `llama.rn` doar în producție).
- Semnare prin SSH: dacă apare `errSecInternalComponent`, pe Mac setează `MAC_KEYCHAIN_PASSWORD` în mediu (nu în git); scriptul deblochează keychain-ul.
- Prima compilare a lui llama.cpp e lungă; cele următoare sunt incrementale.

## 4. Modelul pe telefon fără Wi-Fi
Pe Mac, pune GGUF-ul în `~/models/` (descărcat de acolo, 2,5 GB), apoi de pe laptop:
```powershell
npm run mac:model -- ~/models/Qwen3-4B-Q4_K_M.gguf
```
Copiază în `Documents/models/` din aplicație (`xcrun devicectl device copy to`). Același lucru pentru adaptorul LoRA.

## De verificat la prima rulare (neverificat de noi)
- `npx expo run:ios --help` pe Mac: flagul `--no-bundler` (scriptul îl folosește doar dacă există).
- Versiunea minimă de Xcode pentru SDK 58 / RN 0.88 (documentația Expo nu o spune).
- Că `devicectl device copy to` acceptă `appDataContainer` pentru acest build.
- Că aplicația nu a fost deja instalată cu alt bundle id (`com.flightflow.craiova.dev`, setat în `app.json`).
