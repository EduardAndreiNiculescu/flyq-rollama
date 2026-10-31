# Mod test: zbor real + asistent real (fără să schimbi codul)

Aplicația are un ecran **Mod test** (AddTicket → „Mod test: zbor real”, sau Profil → Mod test). Din el alegi de unde vin datele.

## 1. Pornește gateway-ul pe laptop
```powershell
$env:AIRLABS_API_KEY="<cheia din docs/BACKEND_HANDOFF_PRIVATE.md>"
$env:GATEWAY_HOST="0.0.0.0"          # ca telefonul din același Wi-Fi să ajungă la el
$env:GATEWAY_TOKEN="<un token ales de tine>"   # obligatoriu când nu e doar loopback
npm run gateway
```
Pentru asistentul „Laptop” trebuie și Ollama cu modelul (`OLLAMA_URL`, `OLLAMA_MODEL`, vezi `docs/GATEWAY.md`). Pentru zbor real nu e nevoie de model.
Calea `/v1/flight/{număr}` întoarce orarul, poarta și poziția de la furnizor; bugetul de apeluri e `AIRLABS_MAX_CALLS` (implicit 25).

## 2. În aplicație
- **Adresă**: emulator Android `http://10.0.2.2:18090`; iPhone: `http://<IP-ul laptopului din Wi-Fi>:18090`. Token: cel de mai sus. „Testează conexiunea” spune dacă adresa sau tokenul sunt greșite.
- **Zbor real**: scrii un număr (ex. KL1234) → „Caută și adaugă”. Zborul devine bilet și ceasul trece pe timp real. Aeroporturile trebuie să fie în `TEST_AIRPORTS` (`src/services/live/liveFlights.ts`); altfel aplicația spune ce lipsește, nu ghicește.
- **Poziția avionului**: „Zbor real” = pozițiile de la furnizor (la 15 s, cache 60 s în gateway); fără fix apare estimarea din orar, marcată ca estimare.
- **Cine răspunde**: Mock (răspunsuri pregătite, NU modelul), Laptop (Qwen pe laptop, aceleași unelte, date live), Telefon (Qwen3-4B local, după ce modelul e descărcat).

## Ce nu e real în acest mod
- Ora de îmbarcare și închiderea porții sunt derivate (40 și 20 min înainte de decolare), nu vin de la furnizor.
- Coordonatele aeroporturilor din tabel sunt aproximative, doar pentru desen și distanțe.
- Biletul e sintetic (loc 1A, „PASAGER TEST”).
