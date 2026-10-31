# Handoff: AirportApp (Craiova Hackathon V2.0)

## Prompt de dat agentului nou

> Continui dezvoltarea aplicației mobile **AirportApp** din `E:\1.HACKATRON`, pentru Craiova Hackathon V2.0 (30 oct – 1 nov 2026). Citește întâi `E:\1.HACKATRON\HANDOFF.md` în întregime: are contextul, deciziile luate cu utilizatorul (care au prioritate față de brief-ul inițial), capcanele de mediu de pe Windows și lista de pași rămași. Comunică cu utilizatorul în română, simplu și pe scurt; utilizatorul preferă să rulezi tu comenzile în locul lui. Începe cu secțiunea „Ce a rămas de făcut”, în ordine. După fiecare schimbare rulează `npx tsc --noEmit` și `npx jest` în `AirportApp/`, verifică pe emulator cu o captură `adb` și fă commit-uri mici, cu mesaje în română.

---

## 1. Ce este proiectul

O aplicație pentru pasagerii Aeroportului Internațional Craiova, care te duce de la intrarea în aeroport până la aterizare:

- **Adaugă bilet**: scanare simulată, cod BCBP lipit sau bilet demo. Parserul BCBP e în TypeScript, după standardul IATA.
- **Călătorie**: pașii prin aeroport (check-in, securitate, pașapoarte, poartă, îmbarcare) și timpul până la închiderea porții.
- **Hartă indoor**: deocamdată **placeholder**. Harta o integrează un coleg; ruta A*, poziția simulată și instrucțiunile funcționează deja.
- **Zbor (mod avion)**: tracker cu poziție din GPS sau estimată din orar, plus hartă schematică.
- **Asistent offline**: chat cu răspunsuri mock, afișate token cu token.
- **Profil**: limbă RO/EN, bilete, remindere, accesibilitate, ceas demo, ștergerea datelor.

Toate datele sunt **mock**. Zborul demo e W6 3541, Craiova (CRA) → Londra Luton (LTN), pe 31.10.2026, decolare 10:40 EET, aterizare 11:50 GMT, poarta 3, locul 14C. Codul BCBP demo e `DEMO_BCBP` din `src/lib/bcbp.ts`.

## 2. Decizii ale utilizatorului (au prioritate față de brief-ul inițial)

- **Fără Mac**: Windows 11, deci testăm **doar pe emulatorul Android**. Nu rula `pod install` și nu promite verificări pe iOS. Codul rămâne cross-platform.
- **React Native Community CLI, fără Expo**, cu TypeScript strict.
- **Scoase din scope**: verificarea bagajului (cub 3D, dovadă cu hash) și mesajul automat pe WhatsApp. Nu le readăuga.
- **Stil**: liquid glass (iOS 26), paleta **„Alb-albastru”** (accent `#2E5BFF`, fundal `#EEF3FF`, pete `#8DB6FF` / `#C3B5FF` / `#A8E6FF`, text `#0B1430`).
- **Doar temă luminoasă**, fără dark mode, nici în modul avion: acolo se schimbă doar fundalul, în varianta „sky”.
- **Ultra responsive**: telefoane vechi și noi, tablete. Breakpoint-urile sunt compact < 360, regular 360–599, medium 600–839 (două coloane) și expanded ≥ 840 (meniu lateral). Ele trăiesc în `src/theme/responsive.ts`.
- **Tab-uri**: Călătorie · Hartă · Zbor · Asistent · Profil.
- **Zborul**: datele vin dintr-o „API aproximată” (orarul sau traseul planificat). Când apare GPS, se folosește GPS-ul. Poziția e orientativă: când e estimată, cifrele au „~” și pe hartă apare o zonă estimată.
- **Asistentul** răspunde și înainte de decolare, la întrebări despre zborul tău („Ce loc am?”).
- **Harta** trebuia inițial să fie „măcar puțin 3D”. Utilizatorul a cerut apoi un **placeholder**, pentru că harta o integrează un coleg. Nu desena tu harta.

## 3. Mediul de lucru (Windows) și capcane

- **Versiuni**: Node 24.22.1, npm 11.19.1, JDK 17 (Microsoft), cu `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot`. JDK 24 e instalat, dar nu e folosit.
- **Android SDK**: în `%LOCALAPPDATA%\Android\Sdk`, cu `ANDROID_HOME` setat și `platform-tools` + `emulator` în PATH-ul de utilizator. Sunt instalate Platform 35/36/37.0, Build-Tools 36/37, NDK 27.1.12297006.
- **Emulator**: AVD `Pixel_8_API_35` (1080×2400, fereastră de 411×914 dp). Accelerarea WHPX e activă.
- **Variabila `NoDefaultCurrentDirectoryInExePath=1`** e setată în shell-ul agentului. Din cauza ei, `react-native run-android` dă eroarea „gradlew.bat is not recognized”. **Fix**: în PowerShell, rulează `Remove-Item Env:NoDefaultCurrentDirectoryInExePath` în același proces, înainte de build. Utilizatorul nu are problema asta.
- **Git Bash** nu poate rula `run-android`, tot din cauza `gradlew.bat`. Pentru build folosește **PowerShell**. Bash merge pentru adb, jest și tsc.
- **`python3`** blochează shell-ul (alias din Microsoft Store). Nu-l folosi; editează cu tool-ul Edit sau cu `node -e`.
- **`sdkmanager --licenses`** acceptă licențele doar cu `yes |` din Git Bash; din PowerShell sau cmd nu merge.
- **Primul build** a durat ~20 de minute. Build-urile incrementale cu `--active-arch-only` durează ~45 de secunde.
- **Dublu-click pentru utilizator**: `E:\1.HACKATRON\porneste-aplicatia.bat` pornește emulatorul, Metro (port 8081) și build-ul. E testat.

### Comenzi utile (din Git Bash)
```bash
cd /e/1.HACKATRON/AirportApp && npx tsc --noEmit && npx jest
A="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
"$A" exec-out screencap -p > /tmp/s.png          # captură (fișierul se citește cu Read)
"$A" shell input tap X Y                          # coordonate în pixeli de dispozitiv (1080×2400)
"$A" shell am force-stop com.airportapp; "$A" shell monkey -p com.airportapp -c android.intent.category.LAUNCHER 1
curl -s localhost:8081/status                     # Metro rulează?
```
Build complet, din PowerShell:
```powershell
Remove-Item Env:NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue; Set-Location E:\1.HACKATRON; cmd /c "echo.| porneste-aplicatia.bat"
```
**Atenție**: utilizatorul poate folosi emulatorul în același timp cu tine, iar tap-urile tale se pot încurca. Dacă ecranul se schimbă singur, oprește-te și întreabă.

## 4. Stack (versiuni verificate pentru RN 0.88)

| Pachet | Versiune | Note |
|---|---|---|
| react-native | 0.88.1 (React 19.3) | New Architecture activă, minSdk 24, compileSdk 37 |
| @react-navigation/native, native-stack, bottom-tabs | 7.5.1 / 7.21.0 | bottom-tabs suportă `tabBarPosition: 'left'` (folosit pe tabletă) |
| react-native-screens / safe-area-context | 4.30.1 / 5.11.0 | |
| react-native-svg | 15.16.0 | |
| react-native-gesture-handler | 3.4.0 | **API nou cu hook-uri** (`usePanGesture`, `useSimultaneousGestures`, `GestureDetector`) |
| react-native-reanimated + react-native-worklets | 4.7.1 + 0.13.1 | pluginul `react-native-worklets/plugin` e în `babel.config.js` |
| zustand | 5.0.16 | persistă prin `createJSONStorage` |
| @react-native-async-storage/async-storage | 3.1.1 | **v3**: `createAsyncStorage('airport-app')` (vezi `src/store/storage.ts`) |
| lucide-react-native | 1.63.0 | iconițe |

Am **refuzat** `@react-native-community/blur`, pentru că ultima versiune e din aug. 2024, de dinainte de RN 0.80. Sticla e „frosted” (alb translucid, fără blur), iar setarea „Reduce transparența” o face opacă.

Diferențe în tipurile din RN 0.88: `StatusBar` nu mai acceptă `backgroundColor` și `translucent` (Android rulează edge-to-edge), `StyleSheet.absoluteFillObject` nu mai există, iar referința la ScrollView se tipizează cu `ComponentRef<typeof ScrollView>`.

## 5. Structura codului (`AirportApp/src/`)

```
app/         App.tsx (providere, stack-ul de onboarding + tab-uri), TabBar.tsx (capsulă plutitoare sau meniu lateral),
             navigation.ts (tipuri de rute), tabBarInset.ts
screens/     AddTicket, Scan, Paste, Pass, Journey, Map, Flight (include LandingView), Assistant, Profile
components/  Glass, GlassBackground, AppText, Button, Badge, Controls (Chip, Toggle, Segmented, IconTile, ProgressBar),
             Layout (Screen, ScreenHeader, RoundButton, ListRow, EmptyState), StepItem, ChatBubble, StatTile,
             BottomSheet, FlightRouteMap, map/MapPanel, map/MapPlaceholder
theme/       tokens.ts (TOATE culorile, spațieri, raze, tipografie), responsive.ts (useLayout, sizeClassFor, typeFor)
store/       tickets (persist), settings (persist), flightMode (abonarea la tracker), indoorNav (ruta + poziția,
             sesiune unică), addTicket (hook useAddTicket), storage
services/    types.ts (interfețe), mock/*, index.ts = SINGURUL loc unde se aleg implementările
lib/         bcbp, astar, instructions, journey, geo, time, tickets, useNow
data/        terminal.json (2 etaje, 46 de noduri, muchii unidirecționale la securitate și pașapoarte, zone),
             flights.json (aeroporturi, zbor, repere cu „fun facts”), pois.json
i18n/        ro.ts (implicit, sursa cheilor), en.ts (aceleași chei, verificate de TS), index.ts (useT, useLocalized)
types/       tipurile de domeniu
__tests__/   bcbp, astar, instructions, journey, geo, responsive (51 de teste, toate trec)
```

### Convenții (respectă-le)
- **Fără culori scrise direct în componente.** Totul vine din `theme/tokens.ts`. Verificare: `grep -rnE "'#[0-9A-Fa-f]{3,6}'|rgba\(" src --include=*.tsx`.
- **Toate textele trec prin i18n.** Adaugi cheia în `ro.ts` **și** în `en.ts`. Parametrii se scriu `{nume}`.
- **UI-ul folosește doar interfețele din `services/`.** Implementările mock se schimbă doar în `services/index.ts`.
- **Comentariile sunt în română** și explică „de ce”. Stilul e cel din fișierele existente.
- **Accesibilitate**: `accessibilityLabel` pe butoane și iconițe, ținte de atingere de minimum 44–48, text mărit permis (`AppText` limitează doar cifrele mari).
- **Animații** cu Reanimated (`entering`, `layout`).
- **Ceasul demo** (`MockClockService`) pornește la 08:22 ora Craiovei, în ziua zborului. Profil → „+30 min” îl mută înainte, ca să apară bannerul roșu „sub 30 min”.
- **Trackerul mock** e accelerat ×45 (zborul durează ~4 minute reale). Primele 14 secunde nu există GPS, deci se afișează estimarea; aterizarea pornește `LandingView`.
- **Poziția indoor mock** merge cu 1,3 m/s pe ruta A* și face pauză la securitate, pașapoarte și scară. σ crește pe segmentele drepte și scade la viraje. Debug-ul se deschide cu apăsare lungă pe titlul „Hartă” și are butoanele „Simulează deviere” și viteză ×2/×4/×8.

## 6. Istoric (git, în `E:\1.HACKATRON`)

- `c8cf668`: Etapa 1, schițele v1.
- `d5a67b4`: Etapa 1 v2, schițe liquid glass, `design/palettes.html`, cadre responsive.
- `548f52f`: Etapa 2, proiectul RN și bibliotecile.
- `058ae83`: `.gitattributes` (LF pentru `gradlew`, CRLF pentru `.bat`).
- `6464b15`: Etapa 3, toate ecranele, cu harta ca placeholder.

Schițele aprobate sunt în `design/wireframes.html`, cu PNG-urile în `design/screens/`. Folderul `boarding-pass-test/` e un prototip Expo separat, ignorat de git; nu-l atinge. `cercetare-navigatie-indoor-PDR.md` e cercetarea utilizatorului despre PDR; e necomisă și e a lui.

## 7. Ce e verificat și ce nu

**Verificat pe emulator (Pixel 8, regular):** Adaugă bilet, Bilet demo, Boarding pass, Călătorie (banner și timeline), Hartă (placeholder, instrucțiuni live, selector de etaj), Zbor la sol, Zbor în aer (estimare → GPS, „Zbori deasupra”), Profil.

**Neverificat încă:**
1. **Asistentul**: răspunsul afișat token cu token, pe ecran (logica e testată indirect).
2. **Aterizarea** (`LandingView`), după ~4 minute de zbor.
3. **Reflexul de sticlă refăcut** (gradient SVG în `Glass.tsx`). Verifică să nu mai apară linia la jumătatea cardurilor și să nu scadă performanța.
4. **Layout-urile compact (320 dp), medium și expanded**: n-au fost văzute pe niciun emulator.
5. **Fluxurile Scanează și Lipește codul**, apăsate pe emulator.

## 8. Ce a rămas de făcut (în ordine)

1. **Verificarea vizuală a punctelor din secțiunea 7.** Ca să creezi emulatoarele, din Git Bash, cu `JAVA_HOME` setat:
   ```bash
   AM="$LOCALAPPDATA/Android/Sdk/cmdline-tools/latest/bin/avdmanager.bat"
   echo no | "$AM" create avd -n Tablet_API_35 -k "system-images;android-35;google_apis;x86_64" -d pixel_tablet
   "$AM" list device -c   # alege un dispozitiv mic din listă (id neverificat) pentru telefonul compact
   ```
   O alternativă mai rapidă: pe emulatorul existent, `adb shell wm size 1600x2560` și `adb shell wm density 320` simulează o tabletă, iar `adb shell wm size reset` și `wm density reset` revin la normal. Testează și rotirea, plus textul mărit (`adb shell settings put system font_scale 1.6`). Repară ce găsești.
2. **README.md** (în `E:\1.HACKATRON` sau `AirportApp/`), cerut explicit de brief, cu:
   - cerințele de sistem;
   - comenzile de pornire pe Android și pe iOS, cu mențiunea că iOS cere macOS și n-a fost testat;
   - structura folderelor;
   - **cum se înlocuiește un serviciu mock cu unul real**, cu un exemplu concret cu `IndoorPositionService`: o clasă nouă care implementează interfața din `services/types.ts`, apoi o linie schimbată în `services/index.ts`;
   - unde sunt schițele;
   - cum integrează colegul harta: înlocuiește `MapPlaceholder`, care primește props-urile `IndoorMapProps`.
3. **Raportul final** pentru utilizator: lista ecranelor, comenzile exacte de pornire și problemele de compatibilitate întâlnite (secțiunile 3 și 4 de mai sus).
4. **Opțional, doar dacă cere utilizatorul**: o versiune web (`react-native-web`), ca demo pentru juriu. A fost discutată și amânată.

## 9. Despre utilizator

- Scrie în română, informal și scurt. Nu are Mac.
- Vrea să rulezi tu comenzile, nu să-i dai instrucțiuni de terminal. Când se poate, dă-i un `.bat` pe care îl pornește cu dublu-click.
- Explică-i simplu, fără jargon. A cerut odată explicitul „ca la un începător”.
- Ia singur deciziile de design și de scope. Dacă un pas depinde de o alegere de-a lui, întreabă-l.
