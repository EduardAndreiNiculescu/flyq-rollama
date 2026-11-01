# Harta 3D a terminalului (modulul lui Denis), integrare

Ramura: `feat/denis-map`. Punct de întoarcere: tag-ul `pre-denis-map-integration` (starea de dinainte, 1 nov. 2026, 04:25). Ramura de lucru `feat/rename-flyq-and-relax-guard` e neatinsă, deci un build de demo se poate face oricând din ea.

## Ce s-a adus
- `packages/flyq-spatial/`: modulul nativ (Swift + un fișier Objective-C++, componentă Fabric), fără scripturile Python și fără memoriile vizuale (`.flyqmap`, ~290 MB).
  - **Cu el:** harta desenată, etichetele, traseele, scanările 3D/2D, `plan.json`, `venue.json`, `locmap.json`, iconițele.
  - **Legarea:** `"flyq-spatial": "file:./packages/flyq-spatial"` în `package.json`. Autolinking-ul Expo îl vede (verificat cu `expo-modules-autolinking`).
- `src/flyq/`: ecranul hărții (`MapScreen`, carusel, setări, panouri), fără schimbări de comportament, cu trei excepții: URL-ul serverului e `https://flyq-cra.duckdns.org`; cheia vine din aplicație sau din build (`EXPO_PUBLIC_FLYQ_KEY`), nu din repo; ecranul primește `initialRoute`.
- `src/screens/FlyQMapScreen.tsx`: ruta `FlyQMap`, la care se ajunge din **Profil → „Harta 3D a terminalului (beta)”** sau din asistent.
- Harta veche (`Main → Map`, `terminal.json`) rămâne neschimbată.

## Ce am adăugat noi
- **Ghid haptic** pentru persoane cu deficiențe de vedere (`src/flyq/lib/hapticGuide.ts`, evenimentul nativ `guide` din `FlyQSpatialHostView.swift`):
  - pe traseu: un tic ușor la ~2 s;
  - ușor în stânga: 1 lovitură, ușor în dreapta: 2 lovituri; cu cât ești mai abătut, cu atât pauza e mai scurtă și loviturile mai ferme;
  - în spatele tău (>135°): vibrație de avertizare rapidă;
  - sosire: tipar de succes; anunț VoiceOver la 20 / 10 / 5 m și la sosire.
  - Pornit automat când rulează un screen reader; comutator „Ghid haptic” sub cardul traseului.
- **Asistentul:** „Unde e salonul VIP / barul lui Coco / cabinetul medical / toaletele / informațiile / securitatea / cafeneaua / magazinul / ieșirea” deschide harta 3D cu traseu spre loc (câmpul `mapLabel` din `places.json`). Barul lui Coco are descriere: „chiar în dreapta cum intri”. Nou: „Self check-in”, văzut pe indicatoarele din terminal.

## Neverificat (nu există Mac aici)
- **Build-ul nativ.** Nu s-a rulat `pod install` / compilare. Codul Swift nou (`emitGuide`) e citit atent, dar necompilat. Dacă pod-ul strică build-ul, se revine pe ramura de lucru.
- **Memoriile vizuale (`.flyqmap`) nu sunt incluse.** „Găsește-mă cu camera” nu are cu ce să recunoască locul până nu se adaugă cele 3 zone din aplicație (`1223`, `1428`, `1507`, ~96 MB) sau nu vin din backend (`MemoryZoneSync` nu e scris încă). „Test” (atingi harta, apoi traseul) merge fără ele.
- **Direcția ghidului haptic** (semnul unghiului) e calculată pe formula pozei din modul; trebuie încercată mersul real: întors spre stânga față de traseu, ghidul trebuie să dea 1 lovitură.
- Cheia aplicației în `~/.flyq-build-env` pe Mac, ca la restul aplicației.

## Materialele din Drive (descărcate în `Downloads/flyq-drive`)
- 19 filmări (IMG_0501–0519, cea mai lungă 4:40), 4 poze (0520–0523) și 5 scanări Scaniverse `.usdz` (originale).
- Pozele arată indicatoarele reale: „Control de securitate”, „Informații”, „VIP / Echipaj”, „Self check-in”, ghișeele numerotate până la 10.
- Filmările sunt cu holul gol: bune pentru fundal de prezentare și pentru verificarea etichetelor; pozițiile pinilor se potrivesc însă doar cu o plimbare înregistrată cu aplicația (memoriile vizuale).
