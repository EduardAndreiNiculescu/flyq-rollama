# flyq-spatial: harta 3D + localizarea cu camera

Modul nativ (iOS, Fabric / New Architecture) folosit de aplicația FlyQ. Conține:

- **Harta 3D** (SceneKit): modelul scanat al locului, fără tavan, văzut de sus sau în 3D, cu pinul utilizatorului (disc, halou, direcția privirii).
- **Localizarea cu camera, fără nimic de configurat**: apeși „Găsește-mă”, privești câteva secunde în jur și pinul apare unde ești. Două metode care se ajută una pe alta:
  - **memoria vizuală** a locului (harta vizuală ARKit, `ARWorldMap`, aliniată la model): orice iPhone recunoaște locul doar din cameră. Prima încercare, când telefonul are una (inclusă în aplicație, înregistrată, primită prin AirDrop sau salvată singur);
  - **potrivirea automată** cu harta de localizare a locului: pereții văzuți de LiDAR sau, fără LiDAR, punctele vizuale ARKit. Prima încercare fără memorie, altfel partenerul ei: cele două se iau la rând până când una te găsește.
- **Memoria vizuală se face singură**: după ce te-a găsit prin pereți, telefonul cu LiDAR o salvează cât te plimbi. Ea se trimite ca fișier `.flyqmap` (AirDrop, Fișiere) sau intră direct în aplicație. Pentru un loc fără scanare, o înregistrare a memoriei ajunge pentru tot: harta de localizare, un model simplu și memoria (secțiunea „Un loc doar din înregistrare”).
- **Calibrarea manuală** (ultima rezervă): leagă coordonatele ARKit de coordonatele modelului prin 3+ perechi de puncte și produce tot o memorie vizuală.

Nu folosește GPS, coduri QR sau beacon-uri.

## Localizarea automată (fără puncte)

```
scanarea locului (o dată, offline)
  └─ tools/build_locmap.py: pereții, ușile, mobila (suprafețele verticale, 0,15–2,4 m)
       proiectate pe podea → grilă de 5 cm cu distanța până la cea mai apropiată suprafață
       └─ ios/Assets/<venueId>.locmap.json

pe telefon (de ~2 ori pe secundă, în fundal)
  ARKit + LiDAR: plasa camerei din jur (ARMeshAnchor) → podeaua (histograma fețelor orizontale)
  → suprafețele verticale din aceeași bandă de înălțime → puncte 2D (celule de 5 cm)
  → potrivire cu harta: toate rotațiile (pas 3°) × toate pozițiile (pas 20 cm), apoi rafinare
    pe cele mai bune vârfuri (5 cm / 0,5°, apoi 1,5 cm / 0,15°); căutarea globală folosește tot ce
    a văzut LiDAR-ul în sesiune pe o rază de 15 m (o plimbare pe un coridor rupe repetiția stâlpilor)
  → acceptat doar când potrivirea e clară: al doilea cel mai bun loc are scorul ≤ 70% din cel mai bun
    (sau ≤ 80% și două încercări la rând dau același loc)
  → ancoră ARKit „originea modelului” → pinul pe hartă la 60 fps
  → apoi, la 2 s, o rafinare locală ține harta lipită de ce vede camera (și observă dacă s-a pierdut)
```

Pe ecran apare plasa LiDAR peste imaginea camerei și un singur sfat odată: „Ridică telefonul”, „Mai încet”, „Întoarce-te încet”, „Fă câțiva pași înainte” etc. (`AutoLocalizationCoach`).

Validare (simulare 3D cu raze pe scanarea biroului, din 60 de locuri la întâmplare, cu zgomot, părți lipsă și oameni sau scaune care nu sunt în scanare): poziția corectă în 59 din 60 de cazuri după cel mult o tură completă pe loc, de obicei după 100–170°, la ~1 cm, iar o poziție greșită n-a fost acceptată niciodată. Codul Swift e verificat față de implementarea Python de referință (`tools/autoloc/`). Detalii în `tools/autoloc/README.md`.

Fără LiDAR, aceeași potrivire folosește punctele vizuale pe care ARKit le urmărește (`rawFeaturePoints`), adunate cât te rotești. În simulare (`tools/autoloc/simulate_features.py`): 49 de locuri găsite din 52 după cel mult o tură pe loc (celelalte cer câțiva pași) și niciunul acceptat greșit. Pe teren, punctele depind de textură și lumină, de aceea iPhone-urile fără LiDAR folosesc întâi memoria vizuală, dacă o au (secțiunea următoare).

## Memoria vizuală (orice iPhone)

```
iPhone cu LiDAR (o dată, cât te plimbi prin loc după „Găsește-mă”)
  localizare automată acceptată → la 12 s, apoi la 30 s: dacă poziția a fost confirmată de pereți
  în ultimele 6 s și ARKit urmărește bine
  → ARWorldMap (punctele vizuale ale locului) + ancora „originea modelului” (nimic altceva)
  → salvată pe telefon, în Application Support/FlyQ/venues/<venueId>/
  → Setări → „Trimite memoria vizuală” → FlyQ-<venueId>-<data>.flyqmap (AirDrop / Fișiere)

orice iPhone cu memoria locului (inclusă în aplicație: ios/Assets/<venueId>.flyqmap, importată sau salvată)
  „Găsește-mă” → ARKit pornește din memorie și recunoaște locul doar din cameră (sfaturi + progres)
  → nerecunoscut: potrivirea automată (pereții LiDAR după 15 s; fără LiDAR, punctele vizuale după 25 s)
  → încă nimic (LiDAR după 30 s, altfel după 45 s): din nou memoria (între timp, utilizatorul s-a
    mișcat de obicei), și tot așa
```

De ce memoria întâi și pe telefoanele cu LiDAR: ARKit recunoaște detaliile (afișe, uși, texturi) în câteva secunde, chiar acolo unde pereții seamănă între ei, de exemplu la mijlocul unui coridor lung cu stâlpi identici (vezi testul de mai jos). Pereții rămân partenerul sigur: unde locul are o formă a lui, decid în câteva secunde și n-au acceptat niciodată un loc greșit în teste.

Pentru probe, Setări → „Probă de localizare” pornește o singură metodă, fără schimbări: `startLocalization {method: 'worldMap' | 'auto', only: true}`.

Cât caută din memorie, sfaturile sunt pentru ce recunoaște ARKit: „Privește de-a lungul holului, spre capete și uși” (cum s-a mers la înregistrare), apoi „Întoarce-te spre celălalt capăt”, apoi „Fă câțiva pași”; înainte de toate „Ridică telefonul” și „Prea puține detalii” (podea, perete gol, geamuri). Mesajele Apple („Move iPhone to start”) nu mai apar. Memoria e decodată în fundal, după ce locul s-a încărcat, deci pornirea și trecerile între metode sunt imediate. Fiecare copie decodată merge la o singură sesiune ARKit (Apple nu spune că același `ARWorldMap` poate fi refolosit): după ce o căutare o ia, următoarea se decodează în fundal, după 3 s.

**Pe iPhone-urile cu LiDAR, pereții pot verifica memoria** (probă, oprită implicit: Setări → „Pereții verifică memoria (LiDAR)”). După ce ARKit recunoaște locul, aceeași sesiune (aceleași coordonate, aceleași ancore: `run` fără resetare le păstrează) începe să facă plasa LiDAR, iar la 2 s pereții sunt comparați cu poziția dată de memorie (`MemoryWallVerifier`): rafinare locală în jurul ei și, la fiecare a treia verificare, o căutare globală care notează pe aceiași pereți și poziția memoriei. O contrazicere înseamnă două căutări globale sigure, consecutive și de acord între ele, care pun utilizatorul la peste 1,5 m de poziția memoriei **și** se potrivesc cu pereții clar mai bine decât ea; o poziție care se potrivește cam la fel de bine (stâlpul următor al unui coridor care se repetă) nu contează. Simulare pe coridor (`tools/autoloc/memory_verify_test.py`, 30 s de mers după recunoaștere): o memorie corectă n-a fost contrazisă niciodată (0/37); una mutată cu 2–7 m a fost prinsă în 58 din 71 de cazuri, de obicei după 12 s (la 1,5 m, doar 4 din 20: acolo pereții nu se potrivesc clar mai bine).

Deocamdată verificarea doar notează în jurnal (`applyWallCorrections = false`): până nu vedem cum se poartă pe o sesiune reală, pinul rămâne unde l-a pus memoria; în modul depanare apare „Pereții nu se potrivesc cu poziția din memorie”. Comutatorul din Setări e ținut minte; pornit, se aplică de la următoarea căutare, iar oprit, verificările încetează pe loc. E oprit implicit pentru că repornește sesiunea recunoscută cu plasa LiDAR (`run` fără resetare, cum spune Apple), lucru neîncercat încă pe telefon; după schimbarea configurației, jurnalul notează dacă ancora originii a rămas pe loc (`verify.anchor`). Completarea memoriei face aceeași trecere, indiferent de comutator.

**Completarea memoriei** (Setări → „Completează memoria vizuală”, iPhone cu LiDAR): o înregistrare care pornește din memoria locului. Întâi aplicația așteaptă să fie recunoscut locul („Întâi te recunosc din memorie…”), apoi aceeași sesiune face plasa și plimbarea se înregistrează în coordonatele memoriei. La „Salvează”: harta ARKit nouă (memoria veche plus ce s-a văzut acum: alte trasee, altă lumină) cu ancora originii exact unde a restaurat-o ARKit, pereții plimbării și antetul memoriei de bază (loc, aliniere, `anchorFrame`, `extends`). Pereții plimbării trebuie să cadă pe harta locului (cel puțin 50% din celule la ≤ 10 cm, `RecordingCheck`); atunci fișierul devine memoria telefonului (sursa „completată la fața locului”), altfel rămâne doar ca înregistrare. În ambele cazuri se deschide fereastra de trimitere, ca fișierul să ajungă și la noi.

Reguli:
- În aceeași sesiune, fiecare salvare o extinde pe cea dinainte și trebuie să aibă aceeași aliniere (±75 cm, ±5°): dacă după o pierdere a poziției telefonul s-ar regăsi greșit, memoria deja salvată nu e stricată.
- O sesiune nouă înlocuiește memoria existentă doar după ce a strâns cel puțin 90% din punctele ei, așa că o plimbare scurtă nu strică o memorie bună. Excepții: o memorie făcută prin calibrarea manuală e înlocuită direct de cea LiDAR, iar una dintr-o înregistrare sau dintr-o completare (o plimbare făcută anume, `anchorFrame` "recording" sau sursa „extended”) nu e înlocuită automat niciodată, doar prin import, printr-o versiune mai nouă în aplicație sau dacă o ștergi; așa, într-un loc care se repetă, o potrivire greșită a pereților n-ar putea ajunge la celelalte telefoane. Pentru o memorie de la zero: Setări → „Șterge memoria vizuală”, apoi plimbarea.
- „Trimite memoria vizuală” pe telefonul cu LiDAR, cât te urmărește de cel puțin 12 s: salvează întâi una proaspătă, apoi deschide fereastra de trimitere.
- Cât timp se importă o memorie, telefonul cu LiDAR nu salvează nimic peste ea; după import, regula de 90% se aplică față de memoria importată.
- Memoria inclusă în aplicație se instalează doar dacă e mai nouă (`createdAt`) decât cea de pe telefon. Dacă utilizatorul o șterge din Setări, rămâne ștearsă (până la o versiune a aplicației cu o memorie mai nouă). Pentru a o include: copiezi fișierul primit ca `ios/Assets/<venueId>.flyqmap` (exact acest nume), apoi `pod install` și rebuild.
- Fișierul `.flyqmap`: `FLYQMAP1` | lungimea JSON-ului (UInt32, little endian) | JSON (venueId, createdAt, aliniere, sursă, număr de puncte, modelul telefonului) | ARWorldMap arhivat. La import se verifică formatul, versiunea, locul și dacă harta ARKit se poate citi și are ancora originii (`SpatialVisualMap.swift`, testat în `tools/autoloc`).
- Nu conține date personale: doar punctele vizuale ale locului și identificatorul modelului de telefon (ex. `iPhone14,3`), fără imagini.
- „Recunoscut” înseamnă urmărire ARKit normală **și** ancora originii revenită în sesiune (ARKit restaurează ancorele memoriei abia după ce a potrivit locul), deci pinul nu apare niciodată într-un sistem de coordonate care nu e al memoriei.

## Un loc fără hartă: înregistrarea memoriei vizuale (o singură vizită)

Pentru un loc unde ajungi o singură dată (aeroportul) și harta încă nu există: în aceeași vizită scanezi cu Scaniverse (pentru model) și înregistrezi memoria vizuală cu FlyQ. Harta se face după aceea, iar memoria se leagă de ea fără nimic marcat de mână.

```
iPhone cu LiDAR, la fața locului (Setări → „Înregistrează memoria vizuală (loc fără hartă)”)
  sesiune ARKit cu LiDAR, camera pe tot ecranul, plasa peste imagine, un sfat odată
  → la 60 s și când aplicația iese din prim-plan: salvare automată în telefon
  → „Salvează” (după ≥ 25 s, ≥ 8 m și harta camerei „bună”):
      ARWorldMap (ancora „originea modelului” = originea înregistrării)
      + pereții întregii plimbări (celule de 5 cm, banda 0,15–2,4 m) + podeaua + traseul
      → un fișier .flyqmap în Application Support/FlyQ/recordings/, recitit și verificat
  → fereastra de trimitere (AirDrop) se deschide singură; Setări → „Trimite” oricând

offline, după ce există harta (process_scan.py → <venueId>.locmap.json)
  tools/autoloc/align_recording.py înregistrare.flyqmap <venueId>.locmap.json -o <venueId>.flyqmap --png verificare.png
    toate rotațiile (pas 1°) × corelație FFT pe 10 cm → cei mai buni candidați
    → rafinare pe 5 cm (aceeași notare ca potrivirea din aplicație) → ambiguitate
    → memorie normală: venueId, aliniere, anchorFrame "recording"
  → ios/Assets/<venueId>.flyqmap (sau trimisă prin AirDrop) → telefoanele fără LiDAR o folosesc
```

Siguranța, pentru o singură încercare:
- nimic nu se pierde: salvările automate rămân în telefon, iar o plimbare oprită sau întreruptă (apel, aplicație închisă, baterie) devine o înregistrare separată, „neterminată”, pe care următoarea n-o poate suprascrie; se păstrează ultimele 12 înregistrări complete și toate cele neterminate;
- fișierul final e recitit imediat (antet, pereți, harta ARKit cu ancora); doar atunci apare „Înregistrare salvată și verificată”;
- o înregistrare brută nu poate fi importată ca memorie (`VISUAL_MAP_NOT_ALIGNED`), doar după aliniere;
- în aplicație, o memorie aliniată astfel pune pinul cu `aliniere × ancora⁻¹` (`anchorFrame` "recording").

Validare: `tools/autoloc/simulate_recording.py` simulează plimbări pe scanarea biroului (raze LiDAR, zgomot, părți lipsă, oameni și scaune care nu sunt în scanare), într-un sistem de coordonate necunoscut, și le aliniază: 12 din 12 corecte (6 cu tot biroul, 6 cu doar jumătate din el), eroare maximă pe traseu 2,4 cm, 0,16°.

## Un loc doar din înregistrare (fără scanare)

Când există doar înregistrarea memoriei (de exemplu coridorul concursului de la aeroport, `cra-concurs`), ea ajunge pentru un loc complet:

```
tools/recording_to_venue.py FlyQ-recording-….flyqmap ios/Assets --venue-id cra-concurs \
    --name-ro "Aeroport: coridorul concursului" --name-en "Airport: contest corridor"
  → <venueId>.locmap.json   pereții văzuți de LiDAR la înregistrare (telefoanele cu LiDAR)
  → <venueId>.flyqmap       memoria înregistrării, deja aliniată (podeaua la y = 0, anchorFrame "recording")
  → <venueId>.usdz          un model simplu din aceiași pereți (tăiați la 1,2 m) + podeaua, până la scanare
  → <venueId>.venue.json    + <venueId>-preview.png (vedere de sus, pentru verificat cu ochiul)
tools/autoloc/recording_selftest.py ios/Assets/<venueId>.flyqmap ios/Assets/<venueId>.locmap.json
  → testul pereților de-a lungul traseului înregistrat (vezi mai jos)
```

Sistemul de coordonate al locului e chiar cel al înregistrării, cu podeaua mutată la 0, deci memoria nu are nimic de potrivit. Alte plimbări prin același loc își adaugă pereții la hartă cu `--add`: completările făcute în aplicație (sunt deja în coordonatele locului) sau înregistrări noi aliniate cu `align_recording.py`. O completare reușită se poate pune direct ca memorie inclusă: `ios/Assets/<venueId>.flyqmap`. Când vine scanarea din Scaniverse, modelul se poate înlocui (`process_scan.py`), iar înregistrarea se aliniază la noua hartă cu `align_recording.py`.

Testul pe coridor (`recording_selftest.py`: 45 de locuri la 2 m de-a lungul traseului, ce vede LiDAR-ul până la 5 m, cu stâlpii care ascund ce e în spatele lor, 25% lipsă, zgomot de 2 cm și oameni care nu sunt pe hartă; câte o încercare dintr-un singur loc, după o jumătate de tură și după o tură):
- niciun loc greșit acceptat, iar după o tură întreagă poziția cea mai bună e cea corectă (la 1 cm) în 43 din 45 de locuri;
- dar coridorul se repetă (stâlpi la distanțe egale), așa că al doilea loc posibil are des un scor apropiat: din 90 de încercări, 6 sunt acceptate cu regula strictă (≤ 70%), iar după o tură 25 din 45 de locuri trec de pragul regulii cu două încercări la rând (≤ 80%); la mijloc trebuie câțiva pași;
- de aceea memoria vizuală e prima încercare pe orice telefon, iar pereții vin după.

Codul Swift dă aceleași răspunsuri ca referința Python pe aceste cazuri (`tools/autoloc/fixtures-cra-concurs.json`, rulat de `test_swift.sh`), iar memoria inclusă e citită de același cod ca în aplicație (antet, aliniere, 100% din pereții înregistrați pe harta locului).

## Jurnalul de test

Tot ce face localizarea se scrie pe telefon într-un jurnal JSONL (`SpatialJournal.swift`, Application Support/FlyQ/journal, maxim 8 fișiere de câte 8 MB): fiecare căutare (metoda cerută și cea aleasă, schimbările de metodă și după câte secunde), o linie pe secundă cât caută (urmărirea ARKit și motivul, harta camerei, câte detalii vede, cât a privit în jur, sfatul afișat, înclinarea telefonului), fiecare încercare a pereților cu cifrele ei și celulele văzute (comprimate), poziția pe hartă o dată pe secundă, verificările memoriei de către pereți, căutările „oarbe” ale pereților cât te urmărește (ar fi găsit locul doar din pereți? cât de departe de poziția folosită?), erorile și sfaturile. Fără imagini și fără date personale: coordonate în loc, timpi, cifre, modelul telefonului.

Setări → „Trimite jurnalul de test” trimite tot ca un singur fișier `FlyQ-jurnal-<data>.jsonl`. Pe calculator:

```bash
python3 tools/autoloc/journal_report.py FlyQ-jurnal-….jsonl            # fiecare căutare, pe scurt
python3 tools/autoloc/journal_report.py FlyQ-jurnal-….jsonl --details  # linie cu linie
python3 tools/autoloc/journal_report.py FlyQ-jurnal-….jsonl --replay tools/autoloc/venues/cra-concurs.locmap.json --radius 7 15 20
```

## Calibrarea manuală (rezervă)

```
scanare (Scaniverse/Scanify, .usdz)
  └─ tools/process_scan.py: taie tavanul (> 1,6 m), simplifică, comprimă textura
       └─ ios/Assets/<venueId>.usdz + <venueId>.venue.json   (intră în aplicație)

Calibrare (o dată):  ARKit mapează camera ─┐
                     3+ perechi de puncte: │ punct în cameră (raycast) ↔ același punct pe hartă (tap)
                     potrivire: rotație în jurul verticalei + translație (4 grade de libertate)
                     salvare: ARWorldMap (cu o ancoră „originea modelului”) + calibration.json

Folosire:  ARKit pornește din ARWorldMap salvat → „relocalizare” (câteva secunde)
           → poziția camerei × transformarea → pin pe hartă (60 fps), urmărire continuă
```

De ce merge fără coordonate GPS: ambele lumi (ARKit și scanarea) sunt în metri și aliniate cu gravitația (axa Y în sus), deci se leagă doar printr-o rotație orizontală și o deplasare. Le aflăm din perechile de puncte, o singură dată.

Fișierele calibrării stau în `Application Support/FlyQ/venues/<venueId>/` (`worldmap.arworldmap`, `calibration.json`), excluse din backup-ul iCloud.

## API (JavaScript)

```tsx
import { FlyQSpatialView, type FlyQSpatialViewHandle } from 'flyq-spatial';

const ref = useRef<FlyQSpatialViewHandle>(null);
<FlyQSpatialView ref={ref} venueId="office-test" debugEnabled={false} onEvent={e => …} style={{ flex: 1 }} />
ref.current?.send('startLocalization');
```

**Comenzi** (`send(name, args?)`): `sync`, `startLocalization {method?: 'auto'|'worldMap', only?: boolean}` (implicit: memoria vizuală dacă există, altfel potrivirea automată, iar cele două se iau la rând; `only` = doar metoda cerută, pentru probe), `exportJournal` (jurnalul de test în fereastra de trimitere), `stopLocalization`, `startCalibration`, `calibrationMarkCamera`, `calibrationConfirmPair`, `calibrationUndo`, `calibrationSave`, `calibrationCancel`, `deleteCalibration` (șterge memoria vizuală, oricine a făcut-o), `exportVisualMap` (fereastra de trimitere cu fișierul `.flyqmap`), `importVisualMap` (alegerea fișierului), `startRecording {extend?: boolean}` / `saveRecording` / `cancelRecording` (înregistrarea memoriei într-un loc fără hartă; `extend` = completarea memoriei locului), `exportRecording {file?}` (trimite o înregistrare; implicit ultima), `setFollow {enabled}`, `setViewMode {mode: '3d'|'top'}`, `recenter`, `overview`, `setCameraExpanded {expanded}`.

**Evenimente** (`onEvent`, tipizate în `src/events.ts`):

| Eveniment | Când |
|---|---|
| `venue` | modelul s-a încărcat (sau lipsește) |
| `state` | se schimbă modul, urmărirea ARKit, harta camerei, încrederea, memoria vizuală (`visualMap`: `createdAt`, `source` = `auto` / `calibration` / `import` / `bundled` / `extended`, `featurePoints`, `recorded`; `visualMapSaving`, `visualMapBusy`), înregistrările din telefon (`canRecord`, `canExtend`, `recordings`) etc. |
| `pose` | poziția pe hartă (x, y, z în metri, `headingDeg` = busolă față de „nordul” hărții), de max. 5 ori pe secundă |
| `calibration` | starea calibrării (perechi, eroare, avertismente, `canSave`) |
| `localized` | te-a găsit (`seconds` = cât a durat, `method` = `auto` / `worldMap`) |
| `auto` | progresul căutării (automată sau din memoria vizuală): `method`, `hint` (sfatul de afișat), `progress` 0–1, `points`, `source` (`mesh` / `features`), `coverage`, `score`, `ambiguity`, `fallbackIn`, `only` |
| `visualMapSaved` | memoria vizuală s-a salvat (`first` = prima din sesiune, `featurePoints`, `bytes`) |
| `visualMapImport` | `status`: `imported` (cu detaliile memoriei) sau `cancelled` |
| `visualMapExport` | `status`: `shared`, `cancelled` sau `failed` |
| `visualMapSaveFailed` | o salvare în fundal nu a mers (doar pentru depanare; se reîncearcă singură) |
| `recording` | progresul înregistrării: `seconds`, `distance`, `mapping`, `cells` (pereți la ultima salvare automată), `canSave`, `hint` (`REC_*`), `checkpointAgo`, `extending` (completare), `waiting` (completarea așteaptă recunoașterea) |
| `memoryExtended` | o completare a memoriei: `status` = `installed` (cu detaliile memoriei noi), `mismatch` (pereții nu cad pe harta locului; a rămas doar înregistrare) sau `failed`; `share` = cât din pereți cad pe hartă |
| `journalExport` | `status`: `shared`, `cancelled` sau `failed` |
| `recordingSaved` | înregistrarea s-a salvat și s-a verificat (`file`, `bytes`, `cells`, `featurePoints`, `seconds`, `distance`) |
| `recordingExport` | `status`: `shared`, `cancelled` sau `failed` |
| `calibrationSaved` | calibrarea s-a salvat |
| `hint` | `AUTO_RELOCATING` (localizarea automată a pierdut poziția și o caută din nou), `AUTO_FALLBACK` (memoria vizuală nu a recunoscut locul în 15 s cu LiDAR / 25 s fără, se trece la potrivirea automată), `MEMORY_CORRECTED` (pereții au corectat poziția dată de memorie), `MEMORY_DOUBTED` (la proba memoriei, pereții nu se potrivesc; nu se schimbă nimic) |
| `error` | `code` + `message` (codurile sunt traduse în aplicație, `src/i18n.ts`) |

**Moduri**: `map` (doar harta), `locating` (camera pe tot ecranul, caută locul), `navigating` (harta cu pinul + camera mică), `calibrating` (camera sus, harta jos), `recording` (camera pe tot ecranul, înregistrează memoria unui loc fără hartă).

**Încredere**: `exact` (recunoscut în ultimele 30 s), `tracked` (urmărire normală), `estimated` (ARKit limitat: mișcare bruscă, puține detalii), `lost` (pinul gri: ARKit caută din nou).

## Un loc nou (ex. aeroportul)

1. Scanează cu Scaniverse/Scanify în modul **mesh** și exportă **USDZ** (calitate medie).
2. Procesează (Python 3, `pip install usd-core meshoptimizer numpy pillow scipy`):
   ```bash
   python3 tools/process_scan.py scanare.usdz out/ --venue-id cra-terminal --name-ro "Terminalul Craiova" --name-en "Craiova terminal" --cut 1.6 --ratio 0.45 --tex 4096
   python3 tools/render_preview.py out/model.usdz out/top.png top 0 89.9   # previzualizare
   ```
3. Copiază `out/model.usdz` ca `ios/Assets/<venueId>.usdz`, `out/venue.json` ca `ios/Assets/<venueId>.venue.json` (apoi pune `"file": "<venueId>.usdz"` în `model`) și `out/locmap.json` ca `ios/Assets/<venueId>.locmap.json` (localizarea automată).
   Opțional, verifică localizarea pe scanare înainte de a merge pe teren: `python3 tools/autoloc/simulate.py scanare.usdz ios/Assets/<venueId>.locmap.json --offset <source.appliedOffset din venue.json> --trials 20`.
4. `pod install` + rebuild. Locul apare în Setări → „Locul”; cel deschis la pornire e `VENUE_ID` din `src/config.ts`.

Spații mari (terminalul): căutarea globală costă proporțional cu suprafața. Biroul are ~6.000 de celule de 20 cm, iar o căutare ia zeci de ms. Un hol de 60 × 35 m are ~50.000 de celule, deci sub o secundă într-un build Release, dar câteva secunde în Debug. Un terminal întreg, de 150 × 60 m, ar dura prea mult. Pentru aeroport, pasul următor e restrângerea căutării: pe zone (o hartă pe zonă) sau în jurul ultimei poziții cunoscute, plus încă un nivel grosier (40–80 cm) înainte de cel de 20 cm. Zonele foarte asemănătoare (porți identice) pot cere câțiva pași în plus până la acceptare.

## Probleme cunoscute / limite

- Localizarea automată cere ca locul să semene cu scanarea (pereții, ușile și mobila mare). Dacă s-a mutat mult mobila, refă scanarea și rulează din nou `process_scan.py`.
- Memoria vizuală circulă ca fișier (AirDrop, Fișiere) sau inclusă în aplicație; nu stă încă pe server. Pentru aeroport, pasul următor ar fi descărcarea ei din backend, pe zone.
- Recunoașterea din memorie merge cel mai bine cu o lumină asemănătoare, în locurile pe unde s-a plimbat telefonul cu LiDAR și cu camera îndreptată spre mobilă și pereți (nu spre podea goală).
- Harta e desenată cu SceneKit (simplu și stabil pentru prototip). Trecerea la RealityKit se poate face mai târziu fără schimbări în JavaScript.
