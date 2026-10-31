# Ghid: build pe Mac și test pe iPhone pentru front-end (pentru un coleg și agentul lui)

Scop: tu schimbi doar UI-ul (React Native, `src/screens`, `src/components`), apoi compilezi pe Mac-ul echipei și instalezi pe iPhone-ul lui Alex. Laptopul tău nu are nevoie de Xcode.

## 0. Ce trebuie să existe înainte (Alex face asta o singură dată)

1. **Accesul la Mac.** Alex adaugă cheia ta publică SSH pe Mac. Tu generezi cheia și îi trimiți doar fișierul `.pub`, niciodată cheia privată:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/ff_mac -C "numele-tau"
   cat ~/.ssh/ff_mac.pub        # asta îi trimiți lui Alex
   ```
   Alex, pe Mac: `echo "<cheia .pub>" >> ~/.ssh/authorized_keys` (Remote Login e deja pornit).
2. **Aceeași rețea.** Laptopul tău și Mac-ul trebuie să fie pe același Wi-Fi (Mac-ul se numește `<mac>.local`). Dacă nu îl găsești, Alex îți dă IP-ul lui.
3. **iPhone-ul lui Alex** trebuie conectat la Mac (USB sau pe același Wi-Fi), deblocat, cu aplicația deja instalată o dată și cu Developer Mode pornit.
4. **Codul.** Ai nevoie de repo-ul privat `EduardAndreiNiculescu/flightflow` (invitația o trimite Alex) și de un remote `mac`:
   ```bash
   git clone https://github.com/EduardAndreiNiculescu/flightflow.git && cd flightflow
   git remote add mac <user>@<mac>.local:flightflow.git
   npm ci
   ```

## 1. Testul de conexiune

```bash
ssh -i ~/.ssh/ff_mac <user>@<mac>.local "echo ok && xcrun devicectl list devices"
```
Trebuie să vezi `ok` și iPhone-ul lui Alex în listă, cu starea `connected`. Dacă nu apare, nu merge mai departe: iPhone-ul e blocat, deconectat sau Developer Mode e oprit.

## 2. Build + instalare pe iPhone (comanda zilnică)

Din rădăcina repo-ului, în branch-ul tău:

```bash
export MAC_HOST=<user>@<mac>.local
export MAC_DEVICE=<UDID-iPhone>     # UDID-ul iPhone-ului lui Alex
npm run mac:build
```
PowerShell: `$env:MAC_HOST="<user>@<mac>.local"; $env:MAC_DEVICE="<UDID-iPhone>"; npm run mac:build`

Ce face: împinge branch-ul tău pe Mac (înlocuiește `main` din copia lui de build), compilează în Terminal.app pe Mac și instalează pe telefon. Urmărești log-ul în terminalul tău. Reușita se vede la linia `BUILD+INSTALL DONE`. Durează câteva minute.

## 3. Reguli (important)

- **Un singur build deodată.** Copia de pe Mac e comună: un build care pornește peste altul îl strică pe amândouă. Înainte de build, scrie pe grupul echipei „build pe Mac".
- **`main` de pe Mac nu e `main` din GitHub.** E doar o copie de lucru care se suprascrie cu branch-ul pe care îl construiești. Nu pune nimic acolo pe care vrei să-l păstrezi.
- **Nu atinge** `src/llm/`, `src/tools/`, `src/core/` și `finetune/`: sunt modelul și contractul înghețat. Schimbările de acolo cer reantrenare. Rămâi în `src/screens/`, `src/components/`, `src/lib/`, `src/store/`.
- **Nu pune în commit chei sau tokene.** Cheia AirLabs și tokenul gateway stau doar în fișiere private și în variabile de mediu.
- **Nu dai `git push` pe branch-ul `integrate-frontend` fără acord.** Lucrează pe un branch al tău.
- Telefonul e al lui Alex: nu șterge aplicația, nu atinge setările lui și nu instala nimic altceva.

## 4. Verificări înainte de build (rapide, pe laptopul tău)

```bash
npm run check        # tipuri + teste; trebuie verde
```
Testul `hooks-rules` prinde cea mai frecventă cauză de crash din UI: hook-uri apelate condiționat (`a() || b()`). Hook-urile se apelează mereu, în aceeași ordine, la începutul componentei.

## 5. Dacă ceva nu merge

| Simptom | Ce faci |
|---|---|
| `Permission denied (publickey)` | cheia ta nu e pe Mac sau folosești altă cheie; adaugă `-i ~/.ssh/ff_mac` |
| `Could not resolve <mac>.local` | altă rețea; cere IP-ul și folosește `<user>@<IP>` |
| Build-ul se oprește la semnare | Mac-ul e blocat sau cheia de semnare nu e deblocată; Alex deblochează Mac-ul |
| Telefonul nu apare în `devicectl` | deblochează iPhone-ul, reconectează USB, acceptă „Trust" |
| Build-ul instalează cod vechi | confirmă în log că hash-ul commit-ului e cel al tău |
| Aplicația se deschide, dar AI-ul nu răspunde | normal dacă modelul nu e încărcat; nu e problema ta de front-end, anunță-l pe Alex |

## 6. Pentru agentul tău (copiază în prompt)

> Lucrezi pe repo-ul FlightFlow (Expo SDK 58, React Native 0.88, TypeScript). Ai voie să editezi doar `src/screens`, `src/components`, `src/lib`, `src/store`. Rulează `npm run check` după fiecare schimbare. Pentru a testa pe telefon rulezi `npm run mac:build` cu `MAC_HOST` și `MAC_DEVICE` setate, doar după ce utilizatorul a confirmat că nu rulează alt build. Nu citi, nu afișa și nu comite chei sau tokene. Nu modifica `src/llm`, `src/tools`, `src/core`, `finetune`. Nu rula comenzi pe Mac în afara scriptului `mac:build`. Dacă ceva eșuează de două ori, oprește-te și raportează eroarea exactă.
