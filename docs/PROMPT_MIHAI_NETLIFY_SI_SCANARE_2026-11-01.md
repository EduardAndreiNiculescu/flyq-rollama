# Două prompturi pentru Mihai (2026-11-01)

## Prompt 1: pagina de partajare e pe Netlify

Salut Mihai. Pagina de partajare e deployată pe Netlify: **https://flyq-share.netlify.app** (site `flyq-share`, în contul CraiovaBusinessClub).

- Pune `https://flyq-share.netlify.app` în `SHARE_BASE_URL`. Linkurile trimise familiei vor fi `https://flyq-share.netlify.app/s/<token>`.
- Netlify proxiază `/v1/public/shares/*` către `https://flyq-cra.duckdns.org` (același origin pentru browser, deci nu e nevoie de CORS). Verificat: un token inventat primește `404 {"error":"not_found"}` prin Netlify.
- Pagina nu mai cere coordonate: dacă `from`/`to` au `lat/lon = null`, își desenează singură traseul din tabelul ei de aeroporturi (aproximativ). Dacă ai coordonate reale, trimite-le, pagina le preferă. Nu ești blocat de ele.
- Există și o pagină de test fără token: `https://flyq-share.netlify.app/test` (simulare cu butoane pe etape: check-in, îmbarcare, poarta se închide, întârziat, decolează, în aer, aterizat). Nu apelează serverul.
- Te rog: `demo: true` doar pe zboruri simulate, același 404 pentru token necunoscut/expirat/revocat, `position` lipsă cât avionul nu e în aer.
- Dacă schimbi domeniul serverului (`flyq-cra.duckdns.org`), spune-ne: proxy-ul e în `web/share/_redirects` și trebuie schimbat și redeployat.
- Regula ta obișnuită: branch + PR, fără merge fără aprobarea unui om; nu pune chei sau token-uri în cod, loguri sau PR.

Răspunde cu un raport scurt: ce ai pus în `SHARE_BASE_URL`, ce ai testat cu un link real (create → deschis în browser → delete) și ce nu.

## Prompt 2: modulul de scanare a cardului de îmbarcare (plug and play)

Mihai, ai de făcut modulul de scanare în aplicația mobilă (repo `flyq-rollama`, Expo SDK 58 / React Native 0.88 / TypeScript). Scopul: să primim ceva care **merge pe telefon din prima**, fără debugging din partea noastră.

**Situația de azi:** `src/screens/ScanScreen.tsx` nu are cameră. Simulează un bilet pe ecran și, după câteva secunde, `MockBarcodeScannerService` returnează un bilet de demo. Nu cere permisiunea de cameră.

**Ce livrezi**
1. O implementare reală a interfeței existente din `src/services/types.ts`:
   ```ts
   export interface BarcodeScannerService {
     scan(): Promise<string>; // textul codului citit (PDF417 / Aztec / QR)
     cancel(): void;
   }
   ```
   plus ecranul `ScanScreen` care folosește camera reală. Folosește `expo-camera` (`CameraView` cu `barcodeScannerSettings` pentru `pdf417`, `aztec`, `qr`), instalat cu `npx expo install expo-camera` (ca să primești versiunea compatibilă cu SDK 58).
2. **Permisiunea de cameră**: la deschiderea ecranului apare dialogul sistemului (`requestPermissionsAsync`). Textul de utilizare (`NSCameraUsageDescription`) se pune prin plugin în `app.json`, în română, clar („FlyQ folosește camera ca să citească codul de pe cartea de îmbarcare.”). Dacă permisiunea e refuzată: mesaj, buton „Deschide Setările” (`Linking.openSettings()`) și butonul existent de lipire manuală (`Paste`). **Fără scan fals, fără bilet de demo automat.**
3. Ecranul: previzualizare, cadru, lanternă (`enableTorch`), un singur rezultat (după prima citire se oprește, vibrație ușoară, mesajul „Cod citit”), apoi `addTicket(code, true)` cu textul brut, exact ca azi. Parsarea o face deja `src/lib/bcbp.ts`; nu o rescrie, dar spune-ne dacă găsești coduri pe care nu le înțelege.
4. Pe simulator (fără cameră) ecranul trebuie să nu crape: mesaj „Camera nu e disponibilă” și lipirea manuală.
5. Teste (vitest) pentru partea fără cameră: starea permisiunii, resolve/cancel al serviciului cu un `CameraView` simulat, o singură citire chiar dacă vin mai multe evenimente.

**Reguli**
- Branch separat din `main`-ul aplicației și PR; **fără merge, fără push direct, fără build**. Build-ul pe iPhone îl pornesc eu când e aprobat.
- Verifică înainte de predare: `npx tsc --noEmit` și `npx vitest run` fără erori.
- Nu pune în repo UDID, team ID, nume de utilizator, căi locale sau chei (repo public).
- Citește `AGENTS.md` (Expo se schimbă între SDK-uri: ia API-ul din documentația versiunii 58, nu din memorie).
- Raport final onest: ce ai testat (și ce nu: nu ai iPhone-ul nostru), ce fișiere ai atins, ce trebuie făcut în plus la build (modul nativ nou: **are nevoie de un build nou**, nu merge în Expo Go/dev client vechi).
