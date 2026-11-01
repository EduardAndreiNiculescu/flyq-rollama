/**
 * UI texts, Romanian (default) and English. Short, imperative, for someone flying for the first time.
 */
export type Lang = 'ro' | 'en';

const ro = {
  appName: 'FlyQ',
  loadingMap: 'Se încarcă harta…',
  venueMissing: 'Harta acestui loc lipsește din aplicație.',
  arUnsupported: 'Telefonul acesta nu suportă localizarea cu camera.',

  // Status line
  statusMap: 'Harta locului',
  statusNeedsCalibration: 'Calibrează o dată locul ca să te pot găsi',
  statusLocating: 'Te caut… mișcă telefonul încet',
  statusNavigatingExact: 'Te-am găsit',
  statusNavigatingTracked: 'Te urmăresc',
  statusNavigatingEstimated: 'Poziție aproximativă',
  statusNavigatingLost: 'Ridică telefonul ca să te regăsesc',
  statusNavigatingRelocating: 'Te caut din nou… privește în jur',
  statusCalibrating: 'Calibrare',
  statusReadyAuto: 'Apasă „Găsește-mă” și privește în jur',

  // Buttons
  findMe: 'Găsește-mă cu camera',
  calibrate: 'Calibrează locul',
  recalibrate: 'Calibrează din nou',
  manualCalibration: 'Calibrare manuală (rezervă)',
  cancel: 'Anulează',
  stop: 'Oprește',
  follow: 'Urmărește-mă',
  following: 'Te urmăresc',
  topView: 'De sus',
  view3d: '3D',
  overview: 'Tot locul',
  bigCamera: 'Camera mare',
  smallCamera: 'Camera mică',
  markCamera: 'Marchează în cameră',
  undo: 'Înapoi',
  save: 'Salvează',
  saving: 'Salvez…',
  exit: 'Ieși',
  settings: 'Setări',
  close: 'Închide',
  deleteCalibration: 'Șterge calibrarea',
  deleteCalibrationConfirm:
    'Ștergi calibrarea? Va trebui să calibrezi din nou locul.',
  delete: 'Șterge',
  debugMode: 'Mod depanare',
  language: 'Limba',
  venueLabel: 'Locul',
  openSettings: 'Deschide Setări',

  // Locating
  locatingAutoTitle: 'Te caut pe hartă',
  locatingAutoBody:
    'Telefonul compară ce vede cu harta locului. Nu trebuie să marchezi nimic.',
  locatingTitle: 'Ridică telefonul și privește în jur',
  locatingBody:
    'Mișcă-l încet, ca să vadă pereții și mobila. Durează câteva secunde.',
  locatingMemoryTitle: 'Te recunosc după memoria vizuală',
  locatingMemoryBody:
    'Telefonul compară ce vede cu memoria vizuală a locului. Nu trebuie să marchezi nimic.',

  // Visual memory (what lets iPhones without LiDAR find themselves)
  visualMemory: 'Memorie vizuală',
  visualMemoryNone: 'încă nu există pe telefonul ăsta',
  visualMemoryPoints: 'puncte',
  visualMemorySource_auto: 'făcută automat (LiDAR)',
  visualMemorySource_calibration: 'din calibrarea manuală',
  visualMemorySource_import: 'primită de pe alt telefon',
  visualMemorySource_bundled: 'inclusă în aplicație',
  visualMemorySource_extended: 'completată la fața locului',
  visualMemoryHelp:
    'Telefonul cu LiDAR o salvează singur cât te plimbi, după ce te-a găsit. Trimite-o (AirDrop) telefoanelor fără LiDAR ca să te găsească și ele.',
  exportVisualMap: 'Trimite memoria vizuală',
  importVisualMap: 'Importă memoria vizuală',
  deleteVisualMap: 'Șterge memoria vizuală',
  deleteVisualMapConfirm:
    'Ștergi memoria vizuală de pe telefonul ăsta? Fără ea, un iPhone fără LiDAR te caută mai greu.',
  working: 'Lucrez…',
  memoryStatusSaving: 'Memorie vizuală: o salvez…',
  memoryStatusSaved: 'Memorie vizuală salvată',
  memoryStatusPending: 'Memorie vizuală: mai plimbă-te puțin, o salvez singur',
  memoryStatusRecorded: 'Memorie vizuală din înregistrare',
  memoryZones: 'zone',
  statusReplaying: 'Reluare: o plimbare reală',
  replayBody:
    'Pinul merge pe drumul unei plimbări reale prin terminal, înregistrată pe 31.10. Camera nu e pornită.',
  stopReplay: 'Oprește reluarea',
  demoReplay: 'Demo: reluarea unei plimbări reale',
  demoReplayHelp:
    'Pinul merge pe harta 3D exact pe drumul înregistrat în terminal, fără cameră. Pentru prezentări departe de aeroport.',

  // Recording a visual memory where the venue has no map yet
  statusRecording: 'Înregistrez memoria vizuală',
  recordingTitle: 'Înregistrez memoria vizuală',
  recordMemory: 'Înregistrează memoria vizuală (loc fără hartă)',
  recordMemoryHelp:
    'Pentru un loc care încă nu are hartă: te plimbi 3–5 minute prin toată zona, cu telefonul ridicat. Se salvează singură în telefon, din minut în minut.',
  recordings: 'Înregistrări în telefon',
  recordingInProgress: 'neterminată (salvare automată)',
  sendRecording: 'Trimite',
  stopRecording: 'Oprește',
  keepRecording: 'Continuă',
  recordingCancelTitle: 'Oprești înregistrarea?',
  recordingCancelBody:
    'Ce ai mers până la ultima salvare automată rămâne în telefon.',
  recordingAutoSaved: 'salvat automat acum',
  recordingTitleExtend: 'Completez memoria vizuală',
  extendMemory: 'Completează memoria vizuală',
  extendMemoryHelp:
    'Pornește din memoria de acum. După ce te recunoaște, mergi 3–5 minute pe unde te-a găsit greu, în ambele sensuri, la lumina de acum. Memoria nouă le cuprinde pe amândouă și o înlocuiește pe cea veche.',
  rec_REC_FIND_MEMORY:
    'Întâi te recunosc din memorie: privește de-a lungul holului, ca la înregistrare',

  // Testing one localisation method on its own (Settings)
  testLocalization: 'Probă de localizare',
  testMemoryOnly: 'Doar memoria vizuală',
  testWallsOnly: 'Doar pereții (LiDAR)',
  testHelp:
    'Telefonul încearcă doar metoda aleasă, fără să treacă pe cealaltă. „Găsește-mă” le folosește pe amândouă, pe rând.',
  statusPlaced: 'Ești unde ai ales pe hartă',
  statusPlacedWalking: 'Mergi pe traseu…',
  placeMe: 'Pune-mă pe hartă',
  placeMove: 'Mută-mă',
  placeHint: 'Atinge harta unde vrei să fii',
  placeLeave: 'Ieși',
  placedTitle: 'Ești aici',
  placedBody:
    'Alege sus un loc și îți arăt drumul. Iconițele apar pe hartă când te apropii de ele.',
  routeTo: 'Spre',
  routeWalk: 'Mergi pe traseu',
  routeWalking: 'Mergi…',
  routeCancel: 'Anulează',
  routeArrived: 'Ai ajuns:',
  routeDone: 'Gata',
  routeNotFound: 'Nu găsesc un drum până acolo',
  minuteShort: 'min',
  turnIn: 'În',
  turnStraight: 'Înainte',
  turnDestination: 'Destinația e la',
  turnArrive: 'Ai ajuns',
  turn_left: 'la stânga',
  turn_right: 'la dreapta',
  turn_slightLeft: 'ușor la stânga',
  turn_slightRight: 'ușor la dreapta',
  turn_back: 'întoarce-te',
  turn_up: 'urcă scările',
  turn_down: 'coboară scările',
  mapViewTitle: 'Harta',
  mapViewAuto: 'Automat',
  mapViewPlan: 'Desenată',
  mapView3d: 'Scanată 3D',
  mapView2d: 'Scanată 2D, de sus',
  mapViewNow: 'Acum',
  mapViewKind_plan: 'harta desenată',
  mapViewKind_3d: 'scanarea 3D',
  mapViewKind_2d: 'scanarea 2D',
  mapViewReason_drawn: 'harta desenată e implicită',
  mapViewReason_forced: 'aleasă de tine',
  mapViewReason_capable: 'telefonul o duce',
  mapViewReason_memory: 'memorie prea puțină pentru 3D',
  mapViewReason_lowPower: 'economisire baterie',
  mapViewReason_thermal: 'telefonul e încins',
  mapViewReason_only3d: 'locul are doar 3D',
  mapViewReason_only2d: 'locul are doar 2D',
  mapViewSource_bundled: 'din aplicație',
  mapViewSource_backend: 'din backend',
  mapViewSync_idle: '',
  mapViewSync_checking: 'verific backend-ul…',
  mapViewSync_downloading: 'descarc varianta nouă…',
  mapViewSync_upToDate: 'la zi cu backend-ul',
  mapViewSync_noPack: 'backend-ul nu are o hartă publicată',
  mapViewSync_offline: 'backend offline',
  mapViewSync_error: 'eroare la backend',
  mapViewHelp:
    'Automat: harta desenată, când locul o are; altfel scanarea 3D pe telefoanele cu memorie destulă și 2D pe celelalte, în economisire baterie sau când telefonul e încins. Când backend-ul are o versiune nouă, telefonul o descarcă doar pe cea pe care o arată; altfel rămâne cea din aplicație. Recunoașterea nu depinde de hartă.',
  memoryCheckLabel: 'Pereții verifică memoria (LiDAR)',
  memoryCheckHelp:
    'Probă, doar pentru jurnal: după ce te găsește memoria, LiDAR-ul compară pereții cu poziția ei; pinul nu se schimbă. Pornită, se aplică de la următorul „Găsește-mă”. Oprește-o dacă pinul sare după „Te-am găsit”.',
  sendJournal: 'Trimite jurnalul de test',
  sendJournalHelp:
    'Tot ce a făcut localizarea (metode, timpi, cifre), fără imagini sau date personale. Trimite-l după probe.',
  locatingOnlyMemoryBody:
    'Probă: doar memoria vizuală. Privește încet în jur, spre locuri pe unde s-a trecut la înregistrare.',
  locatingOnlyWallsBody:
    'Probă: doar pereții (LiDAR). Privește încet în jur; la mijlocul unui coridor lung fă câțiva pași.',
  recordingWalls: 'pereți',
  minutesShort: 'min',
  rec_REC_STARTING: 'Pornesc camera… mișcă telefonul încet',
  rec_REC_TOO_FAST: 'Mai încet',
  rec_REC_LOW_DETAIL:
    'Văd prea puține detalii. Îndreaptă camera spre pereți, ghișee și stâlpi.',
  rec_REC_LEARNING: 'Mergi încet înainte: camera învață locul',
  rec_REC_WALK:
    'Mergi încet prin toată zona, cu telefonul ridicat, spre pereți și ghișee',
  rec_REC_GOOD: 'Foarte bine! Mai treci prin colțuri, apoi apasă „Salvează”',

  // Calibration
  calibrationTitle: 'Calibrare: leagă camera de hartă',
  stepScan:
    'Plimbă-te încet prin cameră, cu telefonul ridicat, până apar punctele galbene.',
  stepMarkCamera:
    'Țintește un colț de pe podea (sau un picior de birou) cu cercul și apasă „Marchează în cameră”.',
  stepMarkMap: 'Acum atinge același punct pe hartă, jos.',
  stepMore: 'Încă un punct, departe de primul. Alege colțuri diferite.',
  stepSave: 'Gata de salvat. Mai poți adăuga puncte pentru precizie.',
  pairs: 'Perechi',
  error: 'Eroare',
  mapping: 'Harta camerei',
  mappingNotAvailable: 'nepornită',
  mappingLimited: 'insuficientă – mai mergi puțin',
  mappingExtending: 'bună',
  mappingMapped: 'foarte bună',

  // Warnings
  warn_POINTS_TOO_CLOSE:
    'Punctele sunt prea apropiate. Alege colțuri mai depărtate.',
  warn_POINTS_IN_LINE:
    'Punctele sunt aproape pe o linie. Alege unul într-o parte.',
  warn_HIGH_ERROR:
    'Eroare mare: verifică dacă ai atins același punct și pe hartă.',
  warn_SCALE_MISMATCH:
    'Distanțele nu se potrivesc cu harta. Verifică perechile.',
  warn_MAP_NOT_READY: 'Mai mergi puțin prin cameră înainte de salvare.',

  // Automatic localisation hints
  auto_AUTO_STARTING: 'Pornesc camera… mișcă telefonul încet',
  auto_AUTO_TOO_FAST: 'Mai încet',
  auto_AUTO_LOW_DETAIL:
    'Văd prea puține detalii: țintește uși, afișe, mobilă (nu podeaua, geamurile sau un perete gol)',
  auto_AUTO_HOLD_STILL: 'Ține telefonul nemișcat o clipă',
  auto_AUTO_RAISE_PHONE: 'Ridică telefonul: țintește pereții, nu podeaua',
  auto_AUTO_LOWER_PHONE: 'Coboară puțin telefonul, spre pereți și mobilă',
  auto_AUTO_STEP_BACK: 'Fă un pas înapoi, ești prea aproape',
  auto_AUTO_LOOK_AROUND: 'Privește încet în jur: pereți, uși, mobilă',
  auto_AUTO_TURN_AROUND: 'Întoarce-te încet spre stânga sau spre dreapta',
  auto_AUTO_WALK: 'Fă câțiva pași înainte, apoi privește din nou în jur',
  auto_AUTO_NOT_RECOGNIZED: 'Nu recunosc locul. Ești în zona scanată?',
  auto_AUTO_ALMOST: 'Aproape… mai ține puțin',
  auto_AUTO_LOOK_ALONG:
    'Privește de-a lungul holului, spre capete și uși, ca la o filmare',
  auto_AUTO_TURN_OTHER: 'Întoarce-te încet și privește spre celălalt capăt',

  // Notices
  notice_LOCALIZED: 'Te-am găsit!',
  notice_PLACE_NO_MAP:
    'Te poți pune singur doar pe harta desenată a terminalului.',
  notice_PLACE_BUSY: 'Oprește întâi camera, apoi pune-te pe hartă.',
  notice_AUTO_RELOCATING:
    'Am pierdut poziția. O caut din nou: privește în jur.',
  notice_AUTO_FALLBACK:
    'Nu recunosc locul după memoria vizuală. Încerc altfel: privește încet în jur.',
  notice_VISUAL_MAP_SAVED:
    'Memorie vizuală salvată. Din Setări o poți trimite telefoanelor fără LiDAR.',
  notice_VISUAL_MAP_IMPORTED:
    'Memorie vizuală importată. Acum te găsesc și fără LiDAR.',
  notice_VISUAL_MAP_SHARED: 'Memorie vizuală trimisă.',
  notice_VISUAL_MAP_NONE:
    'Încă nu există o memorie vizuală pe telefonul ăsta. Pe un iPhone cu LiDAR se face singură după ce te găsește.',
  notice_VISUAL_MAP_INVALID: 'Fișierul ales nu e o memorie vizuală FlyQ bună.',
  notice_VISUAL_MAP_WRONG_VENUE: 'Memoria vizuală e pentru alt loc.',
  notice_VISUAL_MAP_EXPORT_FAILED:
    'Nu am putut trimite memoria vizuală. Mai încearcă.',
  notice_VISUAL_MAP_IMPORT_FAILED:
    'Nu am putut deschide lista de fișiere. Mai încearcă.',
  notice_VISUAL_MAP_SAVE_FAILED:
    'Nu am putut salva memoria vizuală pe telefon.',
  notice_VISUAL_MAP_NOT_ALIGNED:
    'Fișierul e o înregistrare brută. Întâi trebuie potrivită cu harta locului, apoi se poate importa.',
  notice_RECORDING_SAVED:
    'Înregistrare salvată și verificată în telefon. Trimite-o din fereastra care s-a deschis sau din Setări.',
  notice_RECORDING_SHARED: 'Înregistrare trimisă.',
  notice_RECORDING_EXPORT_FAILED:
    'Nu am putut trimite înregistrarea. Încearcă din nou din Setări.',
  notice_RECORDING_NEEDS_LIDAR:
    'Înregistrarea memoriei vizuale cere un iPhone cu LiDAR.',
  notice_RECORDING_TOO_SHORT:
    'Mai mergi puțin înainte de salvare: cel puțin o jumătate de minut și câțiva metri.',
  notice_RECORDING_FAILED:
    'Nu am putut salva înregistrarea. Mai mergi puțin și apasă din nou „Salvează” (ultima salvare automată rămâne).',
  notice_RECORDING_NONE: 'Încă nu ai nicio înregistrare în telefon.',
  notice_REC_LOW_STORAGE:
    'Ai puțin spațiu liber pe telefon. O înregistrare poate avea zeci de MB.',
  notice_MAP_TAP_MISSED: 'Atinge chiar pe hartă (podea sau colț).',
  notice_LOCMAP_INVALID:
    'Harta de localizare nu s-a putut citi. Folosește calibrarea manuală.',
  notice_CALIBRATION_SAVED: 'Calibrare salvată. Acum te găsesc oricând.',
  notice_RELOCALIZE_SLOW:
    'Nu te găsesc încă. Întoarce-te în locurile pe unde ai calibrat și privește spre pereți și mobilă.',
  notice_NO_CALIBRATION:
    'Calibrează întâi locul (o singură dată pe telefonul ăsta).',
  notice_CAMERA_DENIED:
    'Am nevoie de cameră. Pornește-o din Setări > FlyQ > Cameră.',
  notice_AR_UNSUPPORTED: 'Telefonul acesta nu suportă localizarea cu camera.',
  notice_MODEL_NOT_READY: 'Harta încă se încarcă.',
  notice_MODEL_LOAD_FAILED: 'Harta nu s-a putut încărca.',
  notice_VENUE_NOT_FOUND: 'Harta acestui loc lipsește din aplicație.',
  notice_AUTO_UNAVAILABLE: 'Locul ăsta nu are hartă de localizare.',
  notice_JOURNAL_SHARED: 'Jurnal de test trimis.',
  notice_JOURNAL_EXPORT_FAILED:
    'Nu am putut trimite jurnalul de test. Mai încearcă din Setări.',
  notice_JOURNAL_EMPTY: 'Jurnalul de test e încă gol.',
  notice_MEMORY_EXTENDED:
    'Memorie vizuală completată și instalată. Trimite-mi și mie fișierul din fereastra care s-a deschis.',
  notice_MEMORY_EXTENSION_MISMATCH:
    'Plimbarea nu se potrivește cu harta locului, așa că n-am schimbat memoria. A rămas ca înregistrare: trimite-mi-o.',
  notice_MEMORY_EXTENSION_FAILED:
    'Nu am putut instala memoria completată. Înregistrarea a rămas în telefon.',
  notice_MEMORY_EXTENSION_SMALLER:
    'Memoria completată ar fi mai mică decât cea de acum, așa că am păstrat-o pe cea veche. Plimbarea a rămas ca înregistrare: trimite-mi-o.',
  notice_MEMORY_CORRECTED: 'Am corectat poziția după pereți.',
  notice_MEMORY_DOUBTED:
    'Pereții nu se potrivesc cu poziția din memorie (la probă nu schimb nimic).',
  notice_RECORDING_NOT_RECOGNISED:
    'Încă nu te-a recunoscut din memorie: privește de-a lungul holului.',
  notice_RESUME_LOOK_AROUND:
    'Ai ieșit din aplicație: privește puțin în jur cu camera ca să te regăsesc exact.',
  notice_REPLAY_UNAVAILABLE: 'Locul ăsta nu are o plimbare pentru demo.',
  notice_REPLAY_BUSY: 'Oprește întâi camera.',
  notice_CALIBRATION_INVALID:
    'Memoria vizuală salvată nu se mai putea folosi și am șters-o. Apasă din nou „Găsește-mă”.',
  notice_TRACKING_NOT_READY:
    'Mai mișcă telefonul încet, camera încă se orientează.',
  notice_NO_SURFACE:
    'Nu văd o suprafață sub cerc. Țintește podeaua sau un perete, mai aproape.',
  notice_PAIR_INCOMPLETE: 'Marchează punctul și în cameră, și pe hartă.',
  notice_NEED_MORE_POINTS: 'Îmi trebuie cel puțin 3 perechi de puncte.',
  notice_MAP_NOT_READY: 'Mai mergi puțin prin cameră, ca să o învăț.',
  notice_WORLDMAP_FAILED:
    'Nu am putut salva harta camerei. Mai încearcă o dată.',
  notice_SAVE_FAILED: 'Nu am putut salva calibrarea.',
  notice_TRACKING_FAILED: 'Camera a pierdut urmărirea. Mai încearcă.',
  notice_SENSOR_FAILED: 'Senzorii nu răspund. Repornește aplicația.',
  notice_AR_FAILED: 'Camera a întâmpinat o problemă. Mai încearcă.',
  notice_UNKNOWN: 'Ceva nu a mers. Mai încearcă.',

  // Backend
  backendOnline: 'Server conectat',
  backendOffline: 'Server offline',
  backendChecking: 'Caut serverul…',
  backendRetry: 'Verifică serverul acum',
  backendHelp:
    'Același Wi-Fi ca Mac-ul? HOST=0.0.0.0 în .env? iPhone: Settings > FlyQ > Local Network pornit.',
  flightGate: 'poarta',
  flightDelayed: 'întârziat',

  // Debug
  debugTitle: 'Depanare',
  calibratedAt: 'Calibrat',
  none: '–',
} as const;

export type StringKey = keyof typeof ro;

const en: Record<StringKey, string> = {
  appName: 'FlyQ',
  loadingMap: 'Loading the map…',
  venueMissing: 'The map for this place is missing from the app.',
  arUnsupported: 'This phone does not support camera localization.',
  statusMap: 'Venue map',
  statusNeedsCalibration: 'Calibrate this place once so I can find you',
  statusLocating: 'Looking for you… move the phone slowly',
  statusNavigatingExact: 'Found you',
  statusNavigatingTracked: 'Tracking you',
  statusNavigatingEstimated: 'Approximate position',
  statusNavigatingLost: 'Raise the phone so I can find you again',
  statusNavigatingRelocating: 'Looking for you again… look around',
  statusCalibrating: 'Calibration',
  statusReadyAuto: 'Tap “Find me” and look around',
  findMe: 'Find me with the camera',
  calibrate: 'Calibrate this place',
  recalibrate: 'Calibrate again',
  manualCalibration: 'Manual calibration (backup)',
  cancel: 'Cancel',
  stop: 'Stop',
  follow: 'Follow me',
  following: 'Following',
  topView: 'Top',
  view3d: '3D',
  overview: 'Whole place',
  bigCamera: 'Big camera',
  smallCamera: 'Small camera',
  markCamera: 'Mark in camera',
  undo: 'Undo',
  save: 'Save',
  saving: 'Saving…',
  exit: 'Exit',
  settings: 'Settings',
  close: 'Close',
  deleteCalibration: 'Delete calibration',
  deleteCalibrationConfirm:
    'Delete the calibration? You will have to calibrate this place again.',
  delete: 'Delete',
  debugMode: 'Debug mode',
  language: 'Language',
  venueLabel: 'Place',
  openSettings: 'Open Settings',
  locatingAutoTitle: 'Finding you on the map',
  locatingAutoBody:
    'The phone compares what it sees with the venue map. Nothing to mark.',
  locatingTitle: 'Raise the phone and look around',
  locatingBody:
    'Move it slowly so it sees the walls and furniture. It takes a few seconds.',
  locatingMemoryTitle: 'Recognising you from the visual memory',
  locatingMemoryBody:
    'The phone compares what it sees with the visual memory of this place. Nothing to mark.',
  visualMemory: 'Visual memory',
  visualMemoryNone: 'not on this phone yet',
  visualMemoryPoints: 'points',
  visualMemorySource_auto: 'made automatically (LiDAR)',
  visualMemorySource_calibration: 'from the manual calibration',
  visualMemorySource_import: 'received from another phone',
  visualMemorySource_bundled: 'included in the app',
  visualMemorySource_extended: 'extended on site',
  visualMemoryHelp:
    'The LiDAR phone saves it on its own while you walk, once it has found you. Send it (AirDrop) to phones without LiDAR so they can find you too.',
  exportVisualMap: 'Send the visual memory',
  importVisualMap: 'Import a visual memory',
  deleteVisualMap: 'Delete the visual memory',
  deleteVisualMapConfirm:
    'Delete the visual memory from this phone? Without it, an iPhone without LiDAR has a harder time finding you.',
  working: 'Working…',
  memoryStatusSaving: 'Visual memory: saving…',
  memoryStatusSaved: 'Visual memory saved',
  memoryStatusPending: 'Visual memory: walk a bit more, I will save it',
  memoryStatusRecorded: 'Visual memory from the recording',
  memoryZones: 'zones',
  statusReplaying: 'Replay: a real walk',
  replayBody:
    'The pin follows a real walk through the terminal, recorded on 31 October. The camera is off.',
  stopReplay: 'Stop the replay',
  demoReplay: 'Demo: replay a real walk',
  demoReplayHelp:
    'The pin moves on the 3D map exactly along the path recorded in the terminal, without the camera. For presentations away from the airport.',
  statusRecording: 'Recording the visual memory',
  recordingTitle: 'Recording the visual memory',
  recordMemory: 'Record the visual memory (place without a map)',
  recordMemoryHelp:
    'For a place that has no map yet: walk the whole area for 3–5 minutes, phone up. It saves itself on the phone every minute.',
  recordings: 'Recordings on this phone',
  recordingInProgress: 'unfinished (automatic save)',
  sendRecording: 'Send',
  stopRecording: 'Stop',
  keepRecording: 'Continue',
  recordingCancelTitle: 'Stop the recording?',
  recordingCancelBody:
    'What you walked up to the last automatic save stays on the phone.',
  recordingAutoSaved: 'saved automatically',
  recordingTitleExtend: 'Extending the visual memory',
  extendMemory: 'Extend the visual memory',
  extendMemoryHelp:
    'Starts from the current memory. Once it recognises you, walk 3–5 minutes where finding you was hard, both ways, in the current light. The new memory covers both and replaces the old one.',
  rec_REC_FIND_MEMORY:
    'First the memory has to recognise you: look along the hall, as during the recording',
  testLocalization: 'Localisation test',
  testMemoryOnly: 'Visual memory only',
  testWallsOnly: 'Walls only (LiDAR)',
  testHelp:
    'The phone tries only the chosen method, without switching to the other one. "Find me" uses both, taking turns.',
  statusPlaced: 'You are where you chose on the map',
  statusPlacedWalking: 'Walking the route…',
  placeMe: 'Put me on the map',
  placeMove: 'Move me',
  placeHint: 'Tap the map where you want to be',
  placeLeave: 'Leave',
  placedTitle: 'You are here',
  placedBody:
    'Choose a place at the top and I will show you the way. Icons appear on the map as you get near them.',
  routeTo: 'To',
  routeWalk: 'Walk the route',
  routeWalking: 'Walking…',
  routeCancel: 'Cancel',
  routeArrived: 'You are at',
  routeDone: 'Done',
  routeNotFound: 'No way there found',
  minuteShort: 'min',
  turnIn: 'In',
  turnStraight: 'Straight on',
  turnDestination: 'Destination in',
  turnArrive: 'You have arrived',
  turn_left: 'turn left',
  turn_right: 'turn right',
  turn_slightLeft: 'bear left',
  turn_slightRight: 'bear right',
  turn_back: 'turn around',
  turn_up: 'go up the stairs',
  turn_down: 'go down the stairs',
  mapViewTitle: 'Map',
  mapViewAuto: 'Automatic',
  mapViewPlan: 'Drawn',
  mapView3d: 'Scanned 3D',
  mapView2d: 'Scanned 2D, from above',
  mapViewNow: 'Now',
  mapViewKind_plan: 'drawn map',
  mapViewKind_3d: '3D scan',
  mapViewKind_2d: '2D scan',
  mapViewReason_drawn: 'the drawn map is the default',
  mapViewReason_forced: 'your choice',
  mapViewReason_capable: 'the phone can take it',
  mapViewReason_memory: 'too little memory for 3D',
  mapViewReason_lowPower: 'Low Power Mode',
  mapViewReason_thermal: 'the phone is hot',
  mapViewReason_only3d: 'this place has 3D only',
  mapViewReason_only2d: 'this place has 2D only',
  mapViewSource_bundled: 'from the app',
  mapViewSource_backend: 'from the backend',
  mapViewSync_idle: '',
  mapViewSync_checking: 'checking the backend…',
  mapViewSync_downloading: 'downloading the new version…',
  mapViewSync_upToDate: 'up to date with the backend',
  mapViewSync_noPack: 'the backend has no published map',
  mapViewSync_offline: 'backend offline',
  mapViewSync_error: 'backend error',
  mapViewHelp:
    'Automatic: the drawn map when the place has one; otherwise the 3D scan on phones with enough memory and 2D on the others, in Low Power Mode or when the phone is hot. When the backend has a new version, the phone downloads only the one it shows; otherwise the one in the app stays. Recognition does not depend on the map.',
  memoryCheckLabel: 'Walls check the memory (LiDAR)',
  memoryCheckHelp:
    'A test, journal only: once the memory has found you, the LiDAR compares the walls with its position; the pin does not change. Once on, it applies from the next "Find me". Turn it off if the pin jumps after "Found you".',
  sendJournal: 'Send the test journal',
  sendJournalHelp:
    'Everything the localisation did (methods, timings, numbers), no images or personal data. Send it after the tests.',
  locatingOnlyMemoryBody:
    'Test: visual memory only. Look around slowly, towards places the recording walk went through.',
  locatingOnlyWallsBody:
    'Test: walls only (LiDAR). Look around slowly; in the middle of a long corridor take a few steps.',
  recordingWalls: 'walls',
  minutesShort: 'min',
  rec_REC_STARTING: 'Starting the camera… move the phone slowly',
  rec_REC_TOO_FAST: 'Slower',
  rec_REC_LOW_DETAIL:
    'I see too little detail. Point the camera at walls, counters and pillars.',
  rec_REC_LEARNING: 'Walk forward slowly: the camera is learning the place',
  rec_REC_WALK:
    'Walk slowly through the whole area, phone up, towards walls and counters',
  rec_REC_GOOD: 'Great! Pass through the corners, then tap “Save”',
  calibrationTitle: 'Calibration: link the camera to the map',
  stepScan: 'Walk slowly around the room, phone up, until yellow dots appear.',
  stepMarkCamera:
    'Aim the circle at a floor corner (or a desk leg) and tap “Mark in camera”.',
  stepMarkMap: 'Now tap the same point on the map below.',
  stepMore: 'One more point, far from the first. Pick different corners.',
  stepSave: 'Ready to save. You can add more points for accuracy.',
  pairs: 'Pairs',
  error: 'Error',
  mapping: 'Room map',
  mappingNotAvailable: 'not started',
  mappingLimited: 'not enough – walk a bit more',
  mappingExtending: 'good',
  mappingMapped: 'very good',
  warn_POINTS_TOO_CLOSE:
    'The points are too close. Pick corners further apart.',
  warn_POINTS_IN_LINE:
    'The points are almost in a line. Pick one off to the side.',
  warn_HIGH_ERROR:
    'High error: check that you tapped the same point on the map.',
  warn_SCALE_MISMATCH: 'Distances do not match the map. Check the pairs.',
  warn_MAP_NOT_READY: 'Walk around the room a bit more before saving.',
  auto_AUTO_STARTING: 'Starting the camera… move the phone slowly',
  auto_AUTO_TOO_FAST: 'Slower',
  auto_AUTO_LOW_DETAIL:
    'Too little detail: aim at doors, signs, furniture (not the floor, windows or a bare wall)',
  auto_AUTO_HOLD_STILL: 'Hold the phone still for a moment',
  auto_AUTO_RAISE_PHONE: 'Raise the phone: aim at the walls, not the floor',
  auto_AUTO_LOWER_PHONE: 'Lower the phone a bit, towards walls and furniture',
  auto_AUTO_STEP_BACK: 'Take a step back, you are too close',
  auto_AUTO_LOOK_AROUND: 'Look around slowly: walls, doors, furniture',
  auto_AUTO_TURN_AROUND: 'Turn slowly to the left or to the right',
  auto_AUTO_WALK: 'Take a few steps forward, then look around again',
  auto_AUTO_NOT_RECOGNIZED:
    'I do not recognise this place. Are you in the scanned area?',
  auto_AUTO_ALMOST: 'Almost… hold on',
  auto_AUTO_LOOK_ALONG:
    'Look along the hall, towards its ends and doors, as if filming',
  auto_AUTO_TURN_OTHER: 'Turn slowly and look towards the other end',
  notice_LOCALIZED: 'Found you!',
  notice_PLACE_NO_MAP: 'You can only place yourself on the drawn terminal map.',
  notice_PLACE_BUSY: 'Stop the camera first, then place yourself on the map.',
  notice_AUTO_RELOCATING: 'Lost the position. Searching again: look around.',
  notice_AUTO_FALLBACK:
    'I do not recognise this place from the visual memory. Trying another way: look around slowly.',
  notice_VISUAL_MAP_SAVED:
    'Visual memory saved. Send it to phones without LiDAR from Settings.',
  notice_VISUAL_MAP_IMPORTED:
    'Visual memory imported. I can find you without LiDAR now.',
  notice_VISUAL_MAP_SHARED: 'Visual memory sent.',
  notice_VISUAL_MAP_NONE:
    'There is no visual memory on this phone yet. A LiDAR iPhone makes it on its own once it finds you.',
  notice_VISUAL_MAP_INVALID: 'That file is not a valid FlyQ visual memory.',
  notice_VISUAL_MAP_WRONG_VENUE: 'That visual memory is for another place.',
  notice_VISUAL_MAP_EXPORT_FAILED:
    'Could not send the visual memory. Try again.',
  notice_VISUAL_MAP_IMPORT_FAILED: 'Could not open the file list. Try again.',
  notice_VISUAL_MAP_SAVE_FAILED:
    'Could not save the visual memory on this phone.',
  notice_VISUAL_MAP_NOT_ALIGNED:
    'This file is a raw recording. It has to be matched with the venue map first, then it can be imported.',
  notice_RECORDING_SAVED:
    'Recording saved and checked on the phone. Send it from the window that opened or from Settings.',
  notice_RECORDING_SHARED: 'Recording sent.',
  notice_RECORDING_EXPORT_FAILED:
    'Could not send the recording. Try again from Settings.',
  notice_RECORDING_NEEDS_LIDAR:
    'Recording a visual memory needs an iPhone with LiDAR.',
  notice_RECORDING_TOO_SHORT:
    'Walk a bit more before saving: at least half a minute and a few metres.',
  notice_RECORDING_FAILED:
    'Could not save the recording. Walk a bit more and tap “Save” again (the last automatic save is kept).',
  notice_RECORDING_NONE: 'There is no recording on this phone yet.',
  notice_REC_LOW_STORAGE:
    'Little free space on the phone. A recording can take tens of MB.',
  notice_MAP_TAP_MISSED: 'Tap on the map itself (floor or a corner).',
  notice_LOCMAP_INVALID:
    'The localisation map could not be read. Use the manual calibration.',
  notice_CALIBRATION_SAVED: 'Calibration saved. I can find you any time now.',
  notice_RELOCALIZE_SLOW:
    'Still looking. Go back to where you calibrated and point the camera at walls and furniture.',
  notice_NO_CALIBRATION: 'Calibrate this place first (once on this phone).',
  notice_CAMERA_DENIED:
    'I need the camera. Turn it on in Settings > FlyQ > Camera.',
  notice_AR_UNSUPPORTED: 'This phone does not support camera localization.',
  notice_MODEL_NOT_READY: 'The map is still loading.',
  notice_MODEL_LOAD_FAILED: 'The map could not be loaded.',
  notice_VENUE_NOT_FOUND: 'The map for this place is missing from the app.',
  notice_AUTO_UNAVAILABLE: 'This place has no localisation map.',
  notice_JOURNAL_SHARED: 'Test journal sent.',
  notice_JOURNAL_EXPORT_FAILED:
    'Could not send the test journal. Try again from Settings.',
  notice_JOURNAL_EMPTY: 'The test journal is still empty.',
  notice_MEMORY_EXTENDED:
    'Visual memory extended and installed. Send me the file too, from the sheet that opened.',
  notice_MEMORY_EXTENSION_MISMATCH:
    'The walk does not match the venue map, so the memory was not changed. It stays as a recording: send it to me.',
  notice_MEMORY_EXTENSION_FAILED:
    'Could not install the extended memory. The recording is kept on the phone.',
  notice_MEMORY_EXTENSION_SMALLER:
    'The extended memory would be smaller than the current one, so the old one stays. The walk is kept as a recording: send it to me.',
  notice_MEMORY_CORRECTED: 'Position corrected from the walls.',
  notice_MEMORY_DOUBTED:
    'The walls do not match the position from the memory (test: nothing is changed).',
  notice_RECORDING_NOT_RECOGNISED:
    'The memory has not recognised you yet: look along the hall.',
  notice_RESUME_LOOK_AROUND:
    'You left the app: look around with the camera for a moment so I can find you exactly.',
  notice_REPLAY_UNAVAILABLE: 'This place has no demo walk.',
  notice_REPLAY_BUSY: 'Stop the camera first.',
  notice_CALIBRATION_INVALID:
    'The saved visual memory could no longer be used, so I deleted it. Tap “Find me” again.',
  notice_TRACKING_NOT_READY:
    'Keep moving the phone slowly, the camera is still getting its bearings.',
  notice_NO_SURFACE:
    'I cannot see a surface under the circle. Aim at the floor or a wall, closer.',
  notice_PAIR_INCOMPLETE: 'Mark the point both in the camera and on the map.',
  notice_NEED_MORE_POINTS: 'I need at least 3 point pairs.',
  notice_MAP_NOT_READY: 'Walk around the room a bit more so I can learn it.',
  notice_WORLDMAP_FAILED: 'Could not save the room map. Try once more.',
  notice_SAVE_FAILED: 'Could not save the calibration.',
  notice_TRACKING_FAILED: 'The camera lost tracking. Try again.',
  notice_SENSOR_FAILED: 'The sensors are not responding. Restart the app.',
  notice_AR_FAILED: 'The camera ran into a problem. Try again.',
  notice_UNKNOWN: 'Something went wrong. Try again.',
  backendOnline: 'Server connected',
  backendOffline: 'Server offline',
  backendChecking: 'Looking for the server…',
  backendRetry: 'Check the server now',
  backendHelp:
    'Same Wi-Fi as the Mac? HOST=0.0.0.0 in .env? iPhone: Settings > FlyQ > Local Network on.',
  flightGate: 'gate',
  flightDelayed: 'delayed',
  debugTitle: 'Debug',
  calibratedAt: 'Calibrated',
  none: '–',
};

const tables: Record<Lang, Record<StringKey, string>> = { ro, en };

export function t(lang: Lang, key: StringKey): string {
  return tables[lang][key] ?? tables.ro[key] ?? key;
}

/** Text for a notice / warning code, with a generic fallback for unknown codes. */
export function codeText(
  lang: Lang,
  prefix: 'notice_' | 'warn_' | 'auto_' | 'rec_',
  code: string,
): string | null {
  const key = `${prefix}${code}` as StringKey;
  if (key in tables.ro) {
    return t(lang, key);
  }
  return prefix === 'notice_' ? t(lang, 'notice_UNKNOWN') : null;
}
