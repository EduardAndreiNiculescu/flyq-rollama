import ARKit
import AVFoundation
import SceneKit
import UIKit
import UniformTypeIdentifiers
import simd

/// The native FlyQ spatial view: the 3D venue map with the user's pin, plus the camera-based
/// localisation, with nothing to set up:
/// - the venue's "visual memory" (ARKit world map + alignment: bundled, recorded, imported or saved
///   here) when the phone has one: ARKit recognises the spot from the camera alone, any iPhone;
/// - automatic matching against the venue's localisation map (SpatialRegistration.swift): the live
///   LiDAR mesh, or ARKit feature points without LiDAR. First choice without a memory, and the
///   memory's partner otherwise (the two take turns until one finds the user). Once a LiDAR phone
///   is found this way it saves the visual memory for the others;
/// - manual fallback: a one-time calibration (point pairs) that also produces a visual memory.
///
/// Talks to React Native only through:
/// - `applyVenueId(_:)`, `applyDebugEnabled(_:)` (props),
/// - `dispatchCommand(_:argsJson:)` (commands, JSON arguments),
/// - `onEvent(name, jsonPayload)` (events).
/// The Objective-C++ Fabric wrapper finds this class at runtime by its Objective-C name.
@objc(FlyQSpatialHostView)
public final class FlyQSpatialHostView: UIView {
  @objc public var onEvent: ((String, String) -> Void)?

  private enum Mode: String {
    /// Map only, camera off.
    case map
    /// Camera full screen, waiting for ARKit to recognise the place.
    case locating
    /// Map with the live pin; camera keeps running (small preview).
    case navigating
    /// Camera on top, map below: pairing points to align ARKit with the model.
    case calibrating
    /// Camera full screen: recording a visual memory where the venue has no map yet.
    case recording
  }

  private var mode: Mode = .map
  private let mapView = SpatialMapView(frame: .zero)
  private let cameraContainer = UIView()
  private var cameraView: SpatialCameraView?

  private var venueId = VenueStore.defaultVenueId
  private var store = VenueStore(venueId: VenueStore.defaultVenueId)
  private var manifest: VenueManifest?
  private var modelLoaded = false
  private var modelLoading = false
  private var loadGeneration = 0
  private var venueLoadScheduled = false

  private var calibration: CalibrationRecord? {
    didSet { memoryDidChange() }
  }
  /// The venue memory decoded once in the background (a recorded one is tens of MB): every memory
  /// search reuses it, so "Find me" and the switches between methods start at once.
  private var decodedMemory: (key: String, map: ARWorldMap)?
  private var decodingMemoryKey: String?
  /// Since when ARKit tracking has been limited (nil while normal): a blink is not shown.
  private var limitedSince: CFTimeInterval?
  private var lastPinConfidence: PinConfidence?
  // Test journal (SpatialJournal): throttles for the periodic lines.
  private var lastJournalTick: CFTimeInterval = 0
  private var lastJournalPose: CFTimeInterval = 0
  private var memoryDecodeStarted: CFTimeInterval = 0
  // LiDAR checks of a position given by the visual memory, and blind wall searches while
  // navigating (journal only: how often the walls alone would find the user, and where).
  private var memoryVerifier = MemoryWallVerifier()
  private var lastMemoryCheck: CFTimeInterval = 0
  private var memoryChecks = 0
  private var lastBlindCheck: CFTimeInterval = 0
  /// How long the last global wall search took (a large venue's map makes it heavier): the blind
  /// checks, journal only, keep to about a tenth of the time.
  private var lastGlobalMatchSeconds: Double = 0
  // Extending the venue memory: a recording that starts from it, in its coordinates.
  private var recordingBase: CalibrationRecord?
  private var recordingWaitingForMemory = false
  /// Global wall searches use what the LiDAR saw this far around the phone during the session: a
  /// walk along a corridor breaks the repetition of its pillars (tools/autoloc/recording_walk_test.py).
  /// The 2 s checks look only at the last metres (fresh geometry, no drift). Without LiDAR (ARKit
  /// feature points, noisier with distance) the global search keeps the short radius.
  static let globalScanRadiusLiDAR: Float = 15
  static let localScanRadius: Float = 7.5
  private var globalScanRadius: Float {
    return SpatialCameraView.supportsMesh ? FlyQSpatialHostView.globalScanRadiusLiDAR : FlyQSpatialHostView.localScanRadius
  }
  /// The walls check a position given by the memory (LiDAR, journal only). Off unless turned on
  /// in Settings (remembered): it re-runs the recognised ARKit session with meshing, which has not
  /// been tried on a phone yet. Turning it off stops the checks at once; turning it on applies
  /// from the next search.
  private var memoryWallCheck = UserDefaults.standard.bool(forKey: FlyQSpatialHostView.memoryWallCheckKey)
  private static let memoryWallCheckKey = "FlyQSpatial.memoryWallCheck"
  // The map view (SpatialMapViewPolicy.swift): the light 3D model or the 2D picture from above,
  // chosen from what the phone can afford (or Settings), bundled and refreshed from the backend.
  private var mapPreference = MapViewPreference(
    rawValue: UserDefaults.standard.string(forKey: FlyQSpatialHostView.mapPreferenceKey) ?? "auto") ?? .auto
  private static let mapPreferenceKey = "FlyQSpatial.mapViewPreference"
  private struct ShownMap {
    let kind: MapViewKind
    /// "bundled" (inside the app) or "backend" (downloaded, maybe on an earlier day).
    let source: String
    let sha256: String?
    let sizeBytes: Int?
    let version: Int?
    let reason: String
  }
  private var shownMap: ShownMap?
  /// Drawn maps that did not read (left out of the choice, so the map falls back to a scan).
  private var brokenPlans = Set<String>()
  /// The language of the map's labels ("ro" or "en"): the app's (setLanguage), until then the phone's.
  private var labelLanguage = (Locale.preferredLanguages.first ?? "en").hasPrefix("ro") ? "ro" : "en"
  // A position chosen on the drawn map (the demo without the camera) and walking routes.
  private var placeMode = false
  private var simPos: SIMD3<Float>?
  private var simHeading: Float = 0
  private var navGrid: PlanNavGrid?
  private var planLabelsById: [String: VenuePlan.Label] = [:]
  /// Where a route goes: a label's id, or `exitGroup` (the nearest exit).
  private var routeTarget: String?
  /// The label the route actually ends at (for the exits, the nearest one).
  private var routeGoalId: String?
  /// The route as computed, and as shown: the shown one starts at the pin as the user walks it.
  private var routeLine = RouteLine(points: [])
  private var routeShown = RouteLine(points: [])
  private var lastRouteDraw: CFTimeInterval = 0
  private var lastRouteEmit: CFTimeInterval = 0
  private var lastGuideEmit: CFTimeInterval = 0
  /// All exits are one place in the carousel ("Ieșire"): a route to it goes to the nearest exit (Denis).
  static let exitGroup = "kind:exit"
  /// Further than this from the route (metres), the user has left it: a new route from where they are.
  private static let offRoute: Double = 2.5
  private var flights: [PlanFlight] = []
  private var routeFrom: SIMD2<Double>?
  private var routeArrived = false
  private var lastRouteCheck: CFTimeInterval = 0
  private var walkTimer: Timer?
  private var walkLine = RouteLine(points: [])
  private var walkDone: Double = 0
  private var walkElevation: Float = 0
  private var walkLabel: String?
  private var walkLastTick: CFTimeInterval = 0
  private var walkLastDraw: CFTimeInterval = 0
  /// A brisk walk for the demo (m/s); the time shown for a route uses an ordinary pace.
  private static let walkSpeed: Double = 2.2
  private static let pace: Double = 1.3
  /// The drawn map's points of interest, redrawn when the language changes.
  private var planLabels: [VenuePlan.Label] = []
  private var planFloorY: Float = 0
  private var mapBackend: MapViewSync.Backend?
  private let mapSync = MapViewSync()
  /// Bumped at every venue load: answers from the backend for an older venue are dropped.
  private var mapSyncGeneration = 0
  /// "idle", "checking", "downloading", "upToDate", "noPack", "offline", "error".
  private var mapSyncStatus = "idle"
  private var mapSyncError: String?
  private var mapSyncAt: Date?
  private var mapSyncRunning = false
  /// Whether a clear contradiction from the walls also moves the pin. Off until the journal of a
  /// real session has shown how the check behaves there: until then it is only written down.
  static let applyWallCorrections = false
  /// After the walls corrected a memory, this session never saves a memory of its own.
  private var autoSaveBlocked = false
  /// The memory search in flight started from the decoded copy (an `invalidWorldMap` then retries
  /// once from the file instead of deleting the memory).
  private var runUsesCachedMemory = false
  private var cachedMemoryRetried = false
  /// A memory saved during a walls session is decoded once the session ends (not every 30 s).
  private var memoryDecodeDeferred = false
  // Memory zones: a large venue ships several visual memories (recordings aligned to the map).
  private struct ZoneFile {
    let id: String
    let url: URL
    let createdAt: String?
    let path: [SIMD2<Double>]
  }
  private enum MemoryCandidate {
    /// The memory on the phone (bundled primary, imported, recorded or extended); `zoneId` when it
    /// is one of the venue's zones.
    case installed(zoneId: String?)
    case zone(ZoneFile)
  }
  private var memoryZones: [ZoneFile] = []
  /// What a search tries, in order; kept across the switches to the walls and back.
  private var memoryCandidates: [MemoryCandidate] = []
  private var memoryCandidateIndex = 0
  private var memoryAttemptStartedAt: Date?
  /// The memory the running memory session uses (its alignment places the pin).
  private var activeMemory: CalibrationRecord?
  private var activeMemoryId: String?
  /// The active memory is the one on the phone (its own decode cache; an unreadable one is deleted).
  private var activeMemoryInstalled = false
  /// A zone decoded in the background for the next attempt (one copy per ARKit run).
  private var prefetchedZone: (id: String, record: CalibrationRecord, map: ARWorldMap)?
  private var prefetchingZoneId: String?
  /// Seconds one zone gets before the next one is tried (several zones only).
  static let zoneAttemptSeconds: Double = 8
  /// Back from the background while navigating: since when the camera has to find the place again.
  private var resumedAt: Date?
  /// After this long without recognising the place again, a new search starts.
  static let resumeSearchAfter: Double = 12
  private var lastPositionSaved: CFTimeInterval = 0
  // Demo: a real walk (a recording's path, venue coordinates) played back on the map.
  private struct ReplayFile: Decodable {
    /// [seconds, x, z] along the walk.
    let points: [[Double]]
  }
  private var replayTimer: Timer?
  private var replayPoints: [(t: Double, x: Float, z: Float)] = []
  private var replayStartedAt: CFTimeInterval = 0
  private var debugEnabled = false
  private var cameraExpanded = false
  /// Screen space covered by the React Native overlays (top bar, bottom panel), in points.
  private var overlayTop: CGFloat = 0
  private var overlayBottom: CGFloat = 0

  // Calibration in progress.
  private var pairs: [(ar: SIMD3<Double>, model: SIMD3<Double>)] = []
  private var pendingCameraPoint: SIMD3<Double>?
  private var pendingMapPoint: SIMD3<Double>?
  private var savingCalibration = false

  // Localisation.
  private var localizedAt: Date?
  /// Last time the live geometry confirmed the automatic alignment (match or tracking check).
  private var geometryConfirmedAt: Date?
  private var locateStartedAt: Date?
  private var slowHintSent = false
  private var lastHeading: Float?
  private var lastPoseEmit: CFTimeInterval = 0
  private var lastPose: SIMD3<Float>?
  private var lastTrackingReason: String?
  private var lastStateJSON = ""
  private var lastCalibrationJSON = ""
  private var lastAutoJSON = ""

  // Automatic localisation.
  private var locMap: LocalizationMap?
  private var matcher: SpatialMatcher?
  private var locMapLoading = false
  private var locMapGeneration = 0
  private let judge = AutoLocalizationJudge()
  private let matchQueue = DispatchQueue(label: "ro.flyq.spatial.match", qos: .userInitiated)
  private var autoTimer: Timer?
  /// Bumped whenever automatic localisation stops or restarts: late background results are dropped.
  private var autoGeneration = 0
  /// Generation of the attempt running in the background (nil = none). One at a time.
  private var inFlightGeneration: Int?
  private var autoBusy: Bool {
    return inFlightGeneration != nil
  }
  private var autoStartedAt: Date?
  private var lastAutoAttempt: CFTimeInterval = 0
  private var autoAttempts = 0
  private var coverage = LookCoverage()
  private var lastVerdict: AutoVerdict?
  private var lastMatch: RegistrationResult?
  private var lastScan: LiveScan?
  private var lastHint: AutoHint?
  /// "auto" | "worldMap" | "calibration" while the camera gives a position.
  private var method: String?
  /// AR -> model used when there is no origin anchor yet (automatic localisation).
  private var activeAlignment: YawAlignment?
  private var trackingLost = false
  private var trackingBadStreak = 0
  private var lastTrackCheck: CFTimeInterval = 0
  private var lastCameraTransform: simd_float4x4?

  // Visual memory (ARKit world map + alignment, shared between phones). All reads and writes of
  // the saved memory go through `storeQueue`, so nothing ever sees a half-written memory.
  private let storeQueue = DispatchQueue(label: "ro.flyq.spatial.store", qos: .userInitiated)
  /// Bumped on the main thread whenever a change to the saved memory is queued (save, import,
  /// delete, bundled install): async work started earlier then never undoes what came after.
  private var memoryGeneration = 0
  private var visualMapSaving = false
  private var visualMapImporting = false
  private var visualMapExporting = false
  /// Run when the save in flight ends (e.g. an export waiting for the freshest memory).
  private var visualMapSaveWaiters: [(Bool) -> Void] = []
  private var nextVisualMapSave: CFTimeInterval = 0
  private var acceptedAt: CFTimeInterval = 0
  private var visualMapSavesThisSession = 0
  /// Alignment of this session's last saved memory: later saves must agree with it.
  private var sessionSavedAlignment: YawAlignment?
  /// Identifies the save in flight (a watchdog ends a save ARKit never answers).
  private var visualMapSaveToken = 0
  /// Kept alive while the document picker is on screen.
  private var pickerDelegate: VisualMapPickerDelegate?

  // Recording a visual memory where the venue has no map yet.
  private var recordingToken = 0
  private var recordingStartedAt: Date?
  private var recordingCreatedAt = ""
  private var recordingPath: [SIMD3<Float>] = []
  private var recordingDistance: Double = 0
  private var recordingCells = 0
  private var recordingSaving = false
  private var recordingCheckpointing = false
  private var pendingFinalSave = false
  private var lastCheckpoint: CFTimeInterval = 0
  private var lastCheckpointAt: Date?
  private var lastRecordingEmit: CFTimeInterval = 0
  private var lastRecordingJSON = ""
  /// Recordings on the phone, newest first.
  private var recordings: [RecordingFiles.Saved] = []
  private var resignObserver: NSObjectProtocol?
  /// A checkpoint of the walk is written this often (and when the app goes to the background).
  private static let checkpointInterval: Double = 60
  /// A memory-based search switches to automatic matching after this long (with LiDAR the walls
  /// are a strong second opinion, so they get their turn sooner)...
  private static let worldMapFallbackSeconds: Double = 25
  private static let worldMapFallbackSecondsLiDAR: Double = 15
  /// ...and an automatic search gives the memory another chance after this long (the user has
  /// usually moved meanwhile). With LiDAR the walls decide within seconds where the place has a
  /// shape of its own; where it repeats itself (a long corridor with identical pillars) the
  /// memory recognises the details.
  private static let memoryRetrySeconds: Double = 45
  private static let memoryRetrySecondsLiDAR: Double = 30
  /// The "trying another way" notice is shown once per search the user started.
  private var fallbackNotified = false
  /// A search that sticks to one method (Settings > test the visual memory / the walls): no
  /// switching, so that method is what gets tested.
  private var singleMethodSearch = false

  private var worldMapFallbackAfter: Double {
    return SpatialCameraView.supportsMesh ? FlyQSpatialHostView.worldMapFallbackSecondsLiDAR
      : FlyQSpatialHostView.worldMapFallbackSeconds
  }

  private var memoryRetryAfter: Double {
    return SpatialCameraView.supportsMesh ? FlyQSpatialHostView.memoryRetrySecondsLiDAR
      : FlyQSpatialHostView.memoryRetrySeconds
  }
  /// First memory save this long after the automatic match (the walk has to confirm it first).
  private static let visualMapFirstSaveDelay: Double = 12
  /// Below this many feature points a world map is not worth sharing.
  private static let visualMapMinFeaturePoints = 300

  // MARK: - Lifecycle

  public override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  public required init?(coder: NSCoder) {
    return nil
  }

  deinit {
    autoTimer?.invalidate()
    replayTimer?.invalidate()
    if let observer = resignObserver {
      NotificationCenter.default.removeObserver(observer)
    }
  }

  private func setup() {
    backgroundColor = SpatialColors.background
    clipsToBounds = true

    mapView.frame = bounds
    addSubview(mapView)
    mapView.onRefollowed = { [weak self] in self?.emitState(force: true) }
    mapView.onUserMovedCamera = { [weak self] in
      self?.emitState(force: true)
    }

    cameraContainer.frame = .zero
    cameraContainer.alpha = 0
    cameraContainer.clipsToBounds = true
    cameraContainer.backgroundColor = .black
    cameraContainer.layer.borderColor = UIColor.white.cgColor
    cameraContainer.layer.borderWidth = 0
    addSubview(cameraContainer)
    let tap = UITapGestureRecognizer(target: self, action: #selector(handleCameraTap))
    cameraContainer.addGestureRecognizer(tap)
    resignObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
    ) { [weak self] _ in
      DispatchQueue.main.async { [weak self] in
        self?.handleWillResignActive()
      }
    }
    preservePartialRecording()
    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
    journal("app", ["device": SpatialDevice.model, "lidar": SpatialCameraView.supportsMesh,
                    "ar": SpatialCameraView.isSupported, "ios": UIDevice.current.systemVersion,
                    "version": SpatialJSON.orNull(version)])
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    layoutForMode(animated: false)
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      // Leaving the screen: never keep the camera running in the background.
      if mode != .map {
        stopCamera(nextMode: .map)
      }
    } else if manifest == nil && !modelLoading {
      scheduleVenueLoad()
    }
  }

  // MARK: - Objective-C API (used by the Fabric wrapper)

  @objc(applyVenueId:)
  public func applyVenueId(_ value: String) {
    let clean = VenueStore.sanitize(value)
    if clean == venueId && (manifest != nil || modelLoading || venueLoadScheduled) {
      return
    }
    venueId = clean
    scheduleVenueLoad()
  }

  @objc(applyDebugEnabled:)
  public func applyDebugEnabled(_ enabled: Bool) {
    debugEnabled = enabled
    cameraView?.setShowsFeaturePoints(enabled || mode == .calibrating)
  }

  @objc(dispatchCommand:argsJson:)
  public func dispatchCommand(_ command: String, argsJson: String) {
    handle(command: command, args: SpatialJSON.decode(argsJson))
  }

  /// Called when React Native drops the view for good.
  @objc public func invalidateSpatial() {
    stopAutoTimer()
    autoGeneration += 1
    cameraView?.pause()
    mapView.shutdown()
    onEvent = nil
  }

  // MARK: - Commands

  private func handle(command: String, args: [String: Any]) {
    switch command {
    case "sync":
      emitVenue()
      emitState(force: true)
      emitCalibration(force: true)
      emitAuto(force: true)
    case "startLocalization":
      clearPlace()
      startLocalization(preferred: args["method"] as? String, only: (args["only"] as? Bool) ?? false)
    case "stopLocalization":
      stopCamera(nextMode: .map)
    case "startCalibration":
      startCalibration()
    case "calibrationMarkCamera":
      markCameraPoint()
    case "calibrationConfirmPair":
      confirmPair()
    case "calibrationUndo":
      undoCalibrationStep()
    case "calibrationSave":
      saveCalibration()
    case "calibrationCancel":
      stopCamera(nextMode: .map)
    case "deleteCalibration":
      deleteCalibration()
    case "exportVisualMap":
      exportVisualMap()
    case "importVisualMap":
      importVisualMap()
    case "startRecording":
      startRecording(extend: (args["extend"] as? Bool) ?? false)
    case "saveRecording":
      saveRecording()
    case "cancelRecording":
      if mode == .recording {
        stopCamera(nextMode: .map)
      }
    case "exportRecording":
      exportRecording(file: args["file"] as? String)
    case "exportJournal":
      exportJournal()
    case "startReplay":
      startReplay()
    case "stopReplay":
      stopReplay()
    case "setMemoryCheck":
      memoryWallCheck = (args["enabled"] as? Bool) ?? false
      UserDefaults.standard.set(memoryWallCheck, forKey: FlyQSpatialHostView.memoryWallCheckKey)
      journal("setting.memoryCheck", ["enabled": memoryWallCheck])
      emitState(force: true)
    case "setBackend":
      setBackend(url: args["url"] as? String, appKey: args["appKey"] as? String)
    case "setMapView":
      let preference = MapViewPreference(rawValue: (args["preference"] as? String) ?? "auto") ?? .auto
      if preference != mapPreference {
        mapPreference = preference
        UserDefaults.standard.set(preference.rawValue, forKey: FlyQSpatialHostView.mapPreferenceKey)
        journal("setting.mapView", ["preference": preference.rawValue])
        if let m = manifest {
          showBestMapView(manifest: m)
          syncMapViews(force: false)
        }
      }
      emitState(force: true)
    case "setLanguage":
      if let lang = args["lang"] as? String, lang == "ro" || lang == "en", lang != labelLanguage {
        labelLanguage = lang
        showPlanLabels()
      }
    case "setPlaceMode":
      setPlaceMode((args["enabled"] as? Bool) ?? !placeMode)
    case "clearPlace":
      clearPlace()
    case "routeTo":
      if let id = args["id"] as? String { routeTo(id) }
    case "clearRoute":
      clearRoute()
    case "walkRoute":
      walkRoute()
    case "focusLabel":
      if let id = args["id"] as? String, let g = routeGoals(id).first { mapView.focus(x: Float(g.at.x), z: Float(g.at.y)) }
      emitState(force: true)
    case "setPose":
      // The phone's own sensors (compass + steps, see src/flyq/lib/pdr.ts) say where the user is: the pin follows without the camera
      if let x = (args["x"] as? NSNumber)?.floatValue, let z = (args["z"] as? NSNumber)?.floatValue {
        setExternalPose(x: x, z: z, headingDeg: (args["headingDeg"] as? NSNumber)?.doubleValue)
      }
    case "setHeading":
      // Only the direction changed (compass): the pin turns, the haptic guide uses it
      if let d = (args["headingDeg"] as? NSNumber)?.doubleValue { setExternalHeading(d) }
    case "setFollow":
      let enabled = (args["enabled"] as? Bool) ?? true
      mapView.setFollow(enabled)
      emitState(force: true)
    case "setViewMode":
      let top = (args["mode"] as? String) == "top"
      mapView.setViewMode(top ? .top : .perspective, animated: true)
      emitState(force: true)
    case "recenter":
      mapView.recenter()
      emitState(force: true)
    case "overview":
      mapView.showOverview(animated: true)
      emitState(force: true)
    case "setCameraExpanded":
      cameraExpanded = (args["expanded"] as? Bool) ?? !cameraExpanded
      layoutForMode(animated: true)
      emitState(force: true)
    case "setOverlayInsets":
      let top = CGFloat((args["top"] as? NSNumber)?.doubleValue ?? 0)
      let bottom = CGFloat((args["bottom"] as? NSNumber)?.doubleValue ?? 0)
      let newTop = top.isFinite ? max(0, top) : 0
      let newBottom = bottom.isFinite ? max(0, bottom) : 0
      if abs(newTop - overlayTop) > 0.5 || abs(newBottom - overlayBottom) > 0.5 {
        overlayTop = newTop
        overlayBottom = newBottom
        layoutForMode(animated: true)
      }
    default:
      emitError("UNKNOWN_COMMAND", "Unknown command: \(command)")
    }
  }

  // MARK: - Venue

  private func scheduleVenueLoad() {
    guard !venueLoadScheduled else { return }
    venueLoadScheduled = true
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.venueLoadScheduled = false
      self.loadVenue()
    }
  }

  private func loadVenue() {
    if mode != .map {
      stopCamera(nextMode: .map)
    }
    resetCalibrationDraft()
    stopReplay()
    store = VenueStore(venueId: venueId)
    memoryCandidates = []
    prefetchedZone = nil
    prefetchingZoneId = nil
    activeMemory = nil
    activeMemoryId = nil
    let storeRef = store
    calibration = storeQueue.sync { storeRef.loadCalibration() }
    installBundledVisualMap()
    backfillVisualMapSize()
    manifest = nil
    modelLoaded = false
    mapView.setPin(position: nil, headingRadians: nil, confidence: .lost)

    switch store.loadManifest() {
    case .failure(let error):
      memoryZones = []
      emitError("VENUE_NOT_FOUND", error.localizedDescription)
      emitVenue()
      emitState(force: true)
    case .success(let found):
      manifest = found.manifest
      memoryZones = loadMemoryZones(found.manifest)
      mapSyncGeneration += 1
      mapSyncStatus = "idle"
      mapSyncError = nil
      mapSyncAt = nil
      mapSyncRunning = false
      shownMap = nil
      if !showBestMapView(manifest: found.manifest) {
        loadModel(url: found.modelURL, manifest: found.manifest)
      }
      syncMapViews(force: true)
      loadLocalizationMap()
    }
    journal("venue", ["found": manifest != nil, "locmap": store.localizationMapURL() != nil,
                      "memory": SpatialJSON.orNull(calibration.map { journalMemory($0) })])
  }

  /// The localisation map is optional: without it only the manual calibration is offered.
  private func loadLocalizationMap() {
    locMapGeneration += 1
    let generation = locMapGeneration
    locMap = nil
    matcher = nil
    guard let url = store.localizationMapURL() else {
      locMapLoading = false
      return
    }
    locMapLoading = true
    let expectedVenue = venueId
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let (loaded, failure) = AutoLocalizationWork.loadMatcher(url: url, venueId: expectedVenue)
      DispatchQueue.main.async { [weak self] in
        guard let self = self, generation == self.locMapGeneration else { return }
        self.locMapLoading = false
        if let pair = loaded {
          self.locMap = pair.0
          self.matcher = pair.1
        } else {
          if let message = failure {
            self.emitError("LOCMAP_INVALID", message)
          }
          // A search started while the map was loading cannot go on without it.
          if self.method == "auto" && self.mode == .locating {
            if self.hasVisualMemory {
              self.singleMethodSearch = false
              self.startWorldMapLocalization()
            } else {
              self.stopCamera(nextMode: .map)
            }
          }
        }
        self.emitState(force: true)
        self.emitAuto(force: true)
      }
    }
  }

  // MARK: - Map view (3D model or 2D picture)

  /// Every view this phone could show now, best source first: one downloaded from the backend,
  /// else the one inside the app.
  private func availableMapViews(manifest: VenueManifest) -> [MapViewKind: (entry: MapViewEntry, url: URL, source: String, version: Int?)] {
    var out: [MapViewKind: (entry: MapViewEntry, url: URL, source: String, version: Int?)] = [:]
    for (kind, bundled) in manifest.viewEntries() {
      if let url = store.bundledFile(named: bundled.file) {
        out[kind] = (bundled.entry, url, "bundled", nil)
      }
    }
    if let cache = MapViewSync.loadCache(store: store) {
      for view in cache.views.values {
        guard let entry = view.entry, entry.placeable, let url = MapViewSync.fileURL(store: store, view: view) else { continue }
        if entry.kind == .plan, let bundled = out[.plan], bundled.source == "bundled",
           !MapViewPolicy.backendPlanWins(bundledRevision: VenuePlan.revision(at: bundled.url),
                                          backendRevision: VenuePlan.revision(at: url)) {
          continue                      // the app's own drawing is newer
        }
        out[entry.kind] = (entry, url, "backend", view.version)
      }
    }
    return out.filter { !($0.key == .plan && brokenPlans.contains($0.value.url.path)) }
  }

  private func mapViewChoice(_ views: [MapViewKind: MapViewEntry]) -> MapViewChoice? {
    return MapViewPolicy.choose(preference: mapPreference, profile: DeviceProfile.current(),
                                hasPlan: views[.plan] != nil, has3d: views[.model3d] != nil,
                                has2d: views[.image2d] != nil, minMemoryMB: views[.model3d]?.minMemoryMB)
  }

  /// Shows the view the policy picks among those on the phone. False when there is none (the
  /// caller falls back to the manifest's model).
  @discardableResult
  private func showBestMapView(manifest: VenueManifest) -> Bool {
    let views = availableMapViews(manifest: manifest)
    guard let choice = mapViewChoice(views.mapValues { $0.entry }), let pick = views[choice.kind] else { return false }
    if let shown = shownMap, shown.kind == choice.kind, shown.sha256 != nil, shown.sha256 == pick.entry.sha256,
       modelLoaded || modelLoading {
      shownMap = ShownMap(kind: shown.kind, source: shown.source, sha256: shown.sha256, sizeBytes: shown.sizeBytes,
                          version: shown.version, reason: choice.reason)
      return true
    }
    showMapView(kind: choice.kind, entry: pick.entry, url: pick.url, source: pick.source, version: pick.version,
                reason: choice.reason, manifest: manifest)
    return true
  }

  private func showMapView(kind: MapViewKind, entry: MapViewEntry, url: URL, source: String, version: Int?,
                           reason: String, manifest: VenueManifest) {
    shownMap = ShownMap(kind: kind, source: source, sha256: entry.sha256, sizeBytes: entry.sizeBytes,
                        version: version, reason: reason)
    journal("mapView", ["kind": kind.rawValue, "source": source, "reason": reason,
                        "bytes": SpatialJSON.orNull(entry.sizeBytes), "version": SpatialJSON.orNull(version)])
    switch kind {
    case .plan:
      loadPlan(url: url, manifest: manifest)
    case .model3d:
      loadModel(url: url, manifest: manifest)
    case .image2d:
      loadFlatMap(url: url, entry: entry, manifest: manifest)
    }
  }

  private func setBackend(url: String?, appKey: String?) {
    guard let url = url?.trimmingCharacters(in: .whitespacesAndNewlines), !url.isEmpty,
          let key = appKey, !key.isEmpty
    else {
      mapBackend = nil
      return
    }
    let next = MapViewSync.Backend(baseURL: url, appKey: key)
    let changed = next != mapBackend
    mapBackend = next
    // A new address, a sync that never ran or failed, or one older than 10 minutes.
    let stale = mapSyncAt.map { Date().timeIntervalSince($0) > 600 } ?? true
    if changed || stale || mapSyncStatus == "offline" || mapSyncStatus == "error" {
      syncMapViews(force: true)
    }
  }

  /// Asks the backend for the venue's newest views and downloads the one this phone shows, if it is
  /// not already here. Never takes the map away: failures only show in Settings.
  private func syncMapViews(force: Bool) {
    guard let backend = mapBackend, let manifest = manifest, !mapSyncRunning else { return }
    if !force, mapSyncStatus == "noPack" { return }
    let generation = mapSyncGeneration
    let venue = venueId
    let storeRef = store
    mapSyncRunning = true
    mapSyncStatus = "checking"
    emitState(force: true)
    mapSync.fetchManifest(backend: backend, venueId: venue) { [weak self] result in
      guard let self = self, generation == self.mapSyncGeneration else { return }
      switch result {
      case .noPack:
        self.finishMapSync(status: "noPack", error: nil)
      case .failed(let code):
        self.finishMapSync(status: code.hasPrefix("NETWORK") ? "offline" : "error", error: code)
      case .views(let version, let remote):
        // The backend's numbers (the 3D view's memory need) decide, with the views it has.
        var entries = self.availableMapViews(manifest: manifest).mapValues { $0.entry }
        for (kind, view) in remote {
          if let entry = view.entry { entries[kind] = entry }
        }
        guard let choice = self.mapViewChoice(entries), let view = remote[choice.kind] else {
          self.finishMapSync(status: "upToDate", error: nil)
          return
        }
        if let shown = self.shownMap, shown.kind == choice.kind, shown.sha256 == view.sha256 {
          self.finishMapSync(status: "upToDate", error: nil)
          return
        }
        self.mapSyncStatus = "downloading"
        self.emitState(force: true)
        self.mapSync.ensure(view: view, version: version, backend: backend, store: storeRef) { [weak self] outcome in
          guard let self = self, generation == self.mapSyncGeneration, let current = self.manifest else { return }
          switch outcome {
          case .success:
            self.finishMapSync(status: "upToDate", error: nil)
            self.showBestMapView(manifest: current)
          case .failure(let error):
            let code = (error as? MapViewSync.SyncError)?.code ?? "\(error)"
            self.finishMapSync(status: code.hasPrefix("NETWORK") ? "offline" : "error", error: code)
          }
        }
      }
    }
  }

  private func finishMapSync(status: String, error: String?) {
    mapSyncRunning = false
    mapSyncStatus = status
    mapSyncError = error
    mapSyncAt = Date()
    journal("mapView.sync", ["status": status, "error": SpatialJSON.orNull(error)])
    emitState(force: true)
  }

  private func loadFlatMap(url: URL, entry: MapViewEntry, manifest: VenueManifest) {
    loadGeneration += 1
    let generation = loadGeneration
    modelLoading = true
    emitVenue()
    emitState(force: true)
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      // Decoded here, not on the first frame (a few MB of pixels).
      let file = UIImage(contentsOfFile: url.path)
      let image: UIImage?
      if #available(iOS 15.0, *) {
        image = file?.preparingForDisplay() ?? file
      } else {
        image = file
      }
      DispatchQueue.main.async { [weak self] in
        guard let self = self, generation == self.loadGeneration else { return }
        self.modelLoading = false
        if let image = image, let mpp = entry.metersPerPixel, let origin = entry.origin, let pixels = entry.pixels,
           origin.count == 2, pixels.count == 2 {
          self.clearPlace()
          self.mapView.setRoute(nil)
          self.mapView.attachFlatMap(
            image: image,
            origin: SIMD2<Float>(Float(origin[0]), Float(origin[1])),
            metersPerPixel: Float(mpp),
            pixels: SIMD2<Int>(pixels[0], pixels[1]),
            floorY: Float(manifest.floorY ?? 0),
            boundsMin: manifest.boundsMin,
            boundsMax: manifest.boundsMax
          )
          self.modelLoaded = true
        } else {
          self.modelLoaded = false
          self.emitError("MODEL_LOAD_FAILED", "The 2D map could not be read.")
        }
        self.emitVenue()
        self.emitState(force: true)
      }
    }
  }

  /// The drawn map: read and built off the main thread (a few hundred shapes), then shown. A plan that
  /// does not read falls back to the scans (it is left out of the choice until the next start).
  private func loadPlan(url: URL, manifest: VenueManifest) {
    loadGeneration += 1
    let generation = loadGeneration
    modelLoading = true
    emitVenue()
    emitState(force: true)
    let venue = venueId
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let plan = VenuePlan.load(url: url, venueId: venue)
      let built = plan.flatMap { PlanSceneBuilder.build($0) }
      let grid = plan?.nav.flatMap { PlanNavGrid($0) }
      let ups = (plan?.stairs ?? []).filter { $0.level != nil }.compactMap { PlanFlight($0) }
      DispatchQueue.main.async { [weak self] in
        guard let self = self, generation == self.loadGeneration else { return }
        self.modelLoading = false
        if let built = built {
          self.clearPlace()
          self.mapView.attachPlan(built)
          self.planLabels = built.labels
          self.planFloorY = built.floorY
          self.navGrid = grid
          self.flights = ups
          self.planLabelsById = built.labels.reduce(into: [:]) { $0[$1.id] = $1 }
          self.mapView.onLabelTap = { [weak self] id in self?.routeTo(id) }
          self.showPlanLabels()
          self.modelLoaded = true
          self.emitVenue()
          self.emitState(force: true)
          return
        }
        self.brokenPlans.insert(url.path)
        self.journal("mapView.planFailed", ["file": url.lastPathComponent])
        self.modelLoaded = false
        if !self.showBestMapView(manifest: manifest) {
          self.emitError("MODEL_LOAD_FAILED", "The drawn map could not be read.")
        }
        self.emitVenue()
        self.emitState(force: true)
      }
    }
  }

  // MARK: - A position chosen on the map, routes and walks (drawn map)

  /// "Put me on the map": the next tap on the map is where the user is (no camera needed). Only
  /// with the drawn map and the camera off.
  private func setPlaceMode(_ enabled: Bool) {
    if enabled {
      guard mapView.drawnMap else {
        emitError("PLACE_NO_MAP", "The drawn map is not shown.")
        return
      }
      guard mode == .map, method == nil else {
        emitError("PLACE_BUSY", "Stop the camera first.")
        return
      }
      stopReplay()
    }
    placeMode = enabled
    mapView.onMapTap = enabled ? { [weak self] point in self?.placeTapped(point) } : nil
    emitState(force: true)
  }

  private func placeTapped(_ point: SIMD3<Float>) {
    // always on the ground floor, even where the upper floor is above: only the route to the security
    // check takes the user up the stairs (Denis)
    let lift: Float = 0
    setPlaceMode(false)
    guard let from = simPos else {
      simPos = SIMD3<Float>(point.x, lift, point.z)
      walkElevation = lift
      mapView.setPin(position: simPos, headingRadians: simHeading, confidence: .exact, elevation: lift)
      mapView.setFollow(true)
      if mapView.viewMode == .top {
        mapView.setViewMode(.perspective, animated: true)
      }
      journal("place", ["x": SpatialJSON.number(point.x, digits: 2), "z": SpatialJSON.number(point.z, digits: 2)])
      // the app (pedestrian dead reckoning) needs to know where the user was put
      emit("pose", ["x": SpatialJSON.number(point.x, digits: 2), "y": 0, "z": SpatialJSON.number(point.z, digits: 2), "headingDeg": NSNull(), "confidence": "exact"])
      if routeTarget != nil { computeRoute() }
      emitState(force: true)
      return
    }
    // already on the map: walk there, around the walls (and down the stairs, coming from upstairs)
    let a = SIMD2<Double>(Double(from.x), Double(from.z))
    let b = SIMD2<Double>(Double(point.x), Double(point.z))
    let line = navGrid?.route(from: a, fromH: Double(from.y), to: b, toH: Double(lift), flights: flights)
      ?? RouteLine(points: [a, b], heights: [Double(from.y), Double(lift)])
    startWalk(along: line, toLabel: nil)
  }

  /// Compass heading (degrees clockwise from the map's north) in the pin's convention (radians, counter-clockwise around +Y)
  private func externalRadians(_ degrees: Double) -> Float { return Float(-degrees * Double.pi / 180) }

  private func setExternalHeading(_ degrees: Double) {
    simHeading = externalRadians(degrees)
    lastHeading = simHeading
    guard let p = simPos, walkTimer == nil else { return }
    mapView.setPin(position: p, headingRadians: simHeading, confidence: .tracked, elevation: 0)
  }

  /// A position from outside (pedestrian dead reckoning): the same as choosing it on the map, but repeatedly, and following the route.
  private func setExternalPose(x: Float, z: Float, headingDeg: Double?) {
    guard walkTimer == nil else { return }
    if let d = headingDeg { simHeading = externalRadians(d) }
    lastHeading = simHeading
    let first = simPos == nil
    simPos = SIMD3<Float>(x, 0, z)
    walkElevation = 0
    mapView.setPin(position: simPos, headingRadians: simHeading, confidence: .tracked, elevation: 0)
    if first {
      mapView.setFollow(true)
      if mapView.viewMode == .top { mapView.setViewMode(.perspective, animated: true) }
      if routeTarget != nil { computeRoute() }
      emitState(force: true)
    } else if routeTarget != nil {
      followRoute(SIMD2<Double>(Double(x), Double(z)))
    }
  }

  /// Where the user is now (x, z): the chosen position, else the camera's pin.
  private func currentXZ() -> SIMD2<Double>? {
    if let p = simPos { return SIMD2<Double>(Double(p.x), Double(p.z)) }
    if mode == .navigating || replayTimer != nil, let q = mapView.pinXZ { return SIMD2<Double>(Double(q.x), Double(q.y)) }
    return nil
  }

  /// A route to a point of interest (from the carousel or a tap on its badge). Without a position yet,
  /// the map shows where it is and the route follows once the user is on the map.
  private func routeTo(_ id: String) {
    // the exits are one place: the route goes to the nearest one
    let target = planLabelsById[id]?.kind == "exit" ? FlyQSpatialHostView.exitGroup : id
    guard let first = routeGoals(target).first else { return }
    if walkTimer != nil { stopWalk(arrived: false) }
    routeTarget = target
    routeGoalId = nil
    routeArrived = false
    journal("route", ["to": target])
    if currentXZ() == nil {
      routeLine = RouteLine(points: [])
      routeShown = routeLine
      mapView.setRoute(nil)
      mapView.focus(x: Float(first.at.x), z: Float(first.at.y))
      emitState(force: true)
      return
    }
    computeRoute()
    mapView.setFollow(true)
  }

  /// Where a route to `target` may end: the label's approach (or the label), at its height; for the
  /// exits' group, every exit.
  private func routeGoals(_ target: String) -> [(id: String, at: SIMD2<Double>, h: Double)] {
    let labels = target == FlyQSpatialHostView.exitGroup
      ? planLabels.filter { $0.kind == "exit" }
      : planLabelsById[target].map { [$0] } ?? []
    return labels.map { (id: $0.id, at: $0.goal, h: $0.level != nil ? ($0.y ?? 0) : 0) }
  }

  private func computeRoute() {
    guard let target = routeTarget, let from = currentXZ() else { return }
    let fromH = Double(simPos?.y ?? 0)
    let best = navGrid?.nearest(from: from, fromH: fromH, goals: routeGoals(target), flights: flights)
    routeGoalId = best?.id
    routeLine = best?.line ?? RouteLine(points: [])
    routeShown = routeLine
    routeFrom = from
    lastRouteDraw = CACurrentMediaTime()
    mapView.setRoute(routeLine.isEmpty ? nil : PlanRouteNodes.make(routeLine, floorY: planFloorY))
    emitState(force: true)
  }

  /// The camera's position moves along, like a map app: the route always starts at the pin (redrawn
  /// ten times a second), it is done near the place, and when the user leaves it (any direction) a new
  /// one starts from where they are.
  private func followRoute(_ here: SIMD2<Double>) {
    guard routeTarget != nil, !routeArrived else { return }
    let now = CACurrentMediaTime()
    if let id = routeGoalId, let label = planLabelsById[id], simd_len(here - label.goal) < 3 {
      routeArrived = true
      routeLine = RouteLine(points: [])
      routeShown = routeLine
      mapView.setRoute(nil)
      emitState(force: true)
      return
    }
    if let hit = routeLine.project(here), hit.distance < FlyQSpatialHostView.offRoute {
      guard now - lastRouteDraw > 0.1 else { return }
      lastRouteDraw = now
      routeShown = routeLine.attached(at: here, height: 0, along: hit.along)
      mapView.setRoute(routeShown.isEmpty ? nil : PlanRouteNodes.make(routeShown, floorY: planFloorY))
      if now - lastRouteEmit > 1 {
        lastRouteEmit = now
        emitState(force: false)        // the distance left
      }
      if now - lastGuideEmit > 0.4 {
        lastGuideEmit = now
        emitGuide(from: here)
      }
      return
    }
    guard now - lastRouteCheck > 1 else { return }
    lastRouteCheck = now
    computeRoute()
  }

  /// For the haptic guide (people who cannot follow the map): how far the phone points from the way to go, and the metres left. The way is
  /// the route about three metres ahead; angles are clockwise from the map's north (-Z), like the pose's heading.
  private func emitGuide(from here: SIMD2<Double>) {
    guard let heading = lastHeading, !routeShown.isEmpty,
          let ahead = routeShown.at(min(3.0, routeShown.length)) else { return }
    let d = ahead.p - here
    guard simd_len(d) > 0.3 else { return }
    let wanted = atan2(d.x, -d.y) * 180 / Double.pi
    let mine = -Double(heading) * 180 / Double.pi
    var turn = (wanted - mine).truncatingRemainder(dividingBy: 360)
    if turn > 180 { turn -= 360 } else if turn < -180 { turn += 360 }
    emit("guide", ["turnDeg": SpatialJSON.number(turn, digits: 0), "metersLeft": SpatialJSON.number(routeShown.length, digits: 1)])
  }

  private func clearRoute() {
    if walkTimer != nil { stopWalk(arrived: false) }
    routeTarget = nil
    routeGoalId = nil
    routeLine = RouteLine(points: [])
    routeShown = routeLine
    routeFrom = nil
    routeArrived = false
    mapView.setRoute(nil)
    emitState(force: true)
  }

  /// The demo walks the route shown (only with a position chosen on the map).
  private func walkRoute() {
    guard simPos != nil, !routeLine.isEmpty else { return }
    startWalk(along: routeLine, toLabel: routeTarget)
  }

  private func startWalk(along line: RouteLine, toLabel: String?) {
    guard !line.isEmpty else { return }
    walkTimer?.invalidate()
    walkLine = line
    walkDone = 0
    walkLabel = toLabel
    walkLastTick = CACurrentMediaTime()
    walkLastDraw = 0
    mapView.setRoute(PlanRouteNodes.make(line, floorY: planFloorY))
    mapView.setFollow(true)
    mapView.walkHeadingUp = true
    let timer = Timer(timeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
      DispatchQueue.main.async { [weak self] in self?.walkTick() }
    }
    RunLoop.main.add(timer, forMode: .common)
    walkTimer = timer
    emitState(force: true)
  }

  private func walkTick() {
    guard walkTimer != nil else { return }
    let now = CACurrentMediaTime()
    walkDone += FlyQSpatialHostView.walkSpeed * min(0.1, now - walkLastTick)
    walkLastTick = now
    let total = walkLine.length
    guard let at = walkLine.at(min(walkDone, total)) else {
      stopWalk(arrived: false)
      return
    }
    walkElevation = Float(at.h)
    simPos = SIMD3<Float>(Float(at.p.x), walkElevation, Float(at.p.y))
    simHeading = atan2(Float(-at.dir.x), Float(-at.dir.y))
    mapView.setPin(position: simPos, headingRadians: simHeading, confidence: .exact, elevation: walkElevation)
    if now - walkLastDraw > 0.1 {
      walkLastDraw = now
      let rest = walkLine.rest(after: walkDone)      // starts at the pin
      mapView.setRoute(rest.isEmpty ? nil : PlanRouteNodes.make(rest, floorY: planFloorY))
      if now - lastRouteEmit > 0.5 {
        lastRouteEmit = now
        emitState(force: false)
      }
    }
    if walkDone >= total {
      stopWalk(arrived: true)
    }
  }

  private func stopWalk(arrived: Bool) {
    walkTimer?.invalidate()
    walkTimer = nil
    mapView.walkHeadingUp = false
    if arrived, let id = walkLabel, id == routeTarget {
      routeArrived = true
      routeLine = RouteLine(points: [])
      routeShown = routeLine
      mapView.setRoute(nil)
    } else if arrived {
      mapView.setRoute(nil)
      if routeTarget != nil { computeRoute() }
    }
    walkLabel = nil
    if let p = simPos {
      emit("pose", ["x": SpatialJSON.number(p.x, digits: 2), "y": 0, "z": SpatialJSON.number(p.z, digits: 2), "headingDeg": NSNull(), "confidence": "exact"])
    }
    emitState(force: true)
  }

  /// Back to the map without a position.
  private func clearPlace() {
    if walkTimer != nil { stopWalk(arrived: false) }
    let had = simPos != nil
    simPos = nil
    if placeMode {
      placeMode = false
      mapView.onMapTap = nil
    }
    routeTarget = nil
    routeGoalId = nil
    routeLine = RouteLine(points: [])
    routeShown = routeLine
    routeFrom = nil
    routeArrived = false
    mapView.setRoute(nil)
    if had {
      mapView.setPin(position: nil, headingRadians: nil, confidence: .lost)
      mapView.setFollow(false)
    }
    emitState(force: true)
  }

  private func routePayload() -> Any {
    guard let id = routeTarget, !routeGoals(id).isEmpty else { return NSNull() }
    let walking = walkTimer != nil
    let meters = walking ? walkLine.rest(after: walkDone).length : routeShown.length
    var payload: [String: Any] = [
      "to": id,
      "meters": Int(meters.rounded()),
      "seconds": Int((meters / FlyQSpatialHostView.pace).rounded()),
      "arrived": routeArrived,
      "found": routeArrived || !routeLine.isEmpty || walking,
    ]
    // the next turn ("În 12 m, la dreapta"), on what is left to walk
    let line = walking ? walkLine : routeShown
    if !routeArrived, !line.isEmpty {
      let next = RouteLine.next(line.maneuvers(), done: walking ? walkDone : 0, total: line.length)
      payload["next"] = ["kind": next.kind, "meters": Int(next.meters.rounded())] as [String: Any]
    }
    return payload
  }

  /// The carousel's places: every label, the exits as one ("Ieșire", the nearest one).
  private func placesPayload() -> [[String: Any]] {
    guard mapView.drawnMap else { return [] }
    var out: [[String: Any]] = []
    var exitShown = false
    for l in planLabels {
      if l.kind == "exit" {
        if exitShown { continue }
        exitShown = true
      }
      let info = PlanLabelKind.info(l.kind)
      out.append(["id": l.kind == "exit" ? FlyQSpatialHostView.exitGroup : l.id, "kind": l.kind,
                  "name": ["ro": l.title("ro"), "en": l.title("en")], "color": l.color ?? info.color])
    }
    return out
  }

  private func nearbyPayload() -> [[String: Any]] {
    guard mapView.drawnMap, let here = currentXZ() else { return [] }
    var nearest: [String: Double] = [:]
    for l in planLabels {
      let id = l.kind == "exit" ? FlyQSpatialHostView.exitGroup : l.id
      nearest[id] = min(nearest[id] ?? .infinity, simd_len(here - SIMD2<Double>(l.at[0], l.at[1])))
    }
    return nearest.sorted { $0.value < $1.value }.prefix(8).map { ["id": $0.key, "meters": Int($0.value.rounded())] }
  }

  private func showPlanLabels() {
    guard mapView.drawnMap else { return }
    mapView.setLabels(PlanLabelNodes.make(planLabels, floorY: planFloorY, lang: labelLanguage) { [weak self] kind in
      self?.labelGlyph(kind)
    })
  }

  /// The bundled picture of a kind of point of interest (`poi-<kind>.png`), read once.
  private var labelGlyphs: [String: UIImage] = [:]
  private func labelGlyph(_ kind: String) -> UIImage? {
    if let cached = labelGlyphs[kind] { return cached }
    guard let url = store.bundledFile(named: "poi-\(kind).png"), let image = UIImage(contentsOfFile: url.path) else {
      return nil
    }
    labelGlyphs[kind] = image
    return image
  }

  private func mapViewPayload() -> Any {
    guard let shown = shownMap else { return NSNull() }
    let available = manifest.map { availableMapViews(manifest: $0).keys.map { $0.rawValue }.sorted() } ?? []
    return [
      "available": available,
      "kind": shown.kind.rawValue,
      "source": shown.source,
      "reason": shown.reason,
      "preference": mapPreference.rawValue,
      "bytes": SpatialJSON.orNull(shown.sizeBytes),
      "version": SpatialJSON.orNull(shown.version),
      "sync": mapSyncStatus,
      "syncError": SpatialJSON.orNull(mapSyncError),
      "backend": mapBackend != nil,
    ] as [String: Any]
  }

  private func devicePayload() -> [String: Any] {
    let profile = DeviceProfile.current()
    return ["memoryMB": profile.memoryMB, "lowPower": profile.lowPower, "thermal": profile.thermal]
  }

  private func loadModel(url: URL, manifest: VenueManifest) {
    loadGeneration += 1
    let generation = loadGeneration
    modelLoading = true
    emitVenue()
    emitState(force: true)
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let result: Result<SCNScene, Error>
      do {
        result = .success(try SCNScene(url: url, options: nil))
      } catch {
        result = .failure(error)
      }
      DispatchQueue.main.async { [weak self] in
        guard let self = self, generation == self.loadGeneration else { return }
        self.modelLoading = false
        switch result {
        case .success(let scene):
          self.clearPlace()
          self.mapView.attachModel(
            scene: scene,
            floorY: Float(manifest.floorY ?? 0),
            boundsMin: manifest.boundsMin,
            boundsMax: manifest.boundsMax
          )
          self.modelLoaded = true
        case .failure(let error):
          self.modelLoaded = false
          self.emitError("MODEL_LOAD_FAILED", error.localizedDescription)
        }
        self.emitVenue()
        self.emitState(force: true)
      }
    }
  }

  // MARK: - Camera permission

  private func withCamera(_ action: @escaping () -> Void) {
    // The camera and a demo replay never share the pin.
    stopReplay()
    guard SpatialCameraView.isSupported else {
      emitError("AR_UNSUPPORTED", "ARKit world tracking is not supported on this device.")
      return
    }
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      action()
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
        DispatchQueue.main.async { [weak self] in
          if granted {
            action()
          } else {
            self?.emitError("CAMERA_DENIED", "Camera access was denied.")
            self?.emitState(force: true)
          }
        }
      }
    case .denied, .restricted:
      emitError("CAMERA_DENIED", "Camera access is off for FlyQ (Settings > FlyQ > Camera).")
      emitState(force: true)
    @unknown default:
      emitError("CAMERA_DENIED", "Camera access unavailable.")
    }
  }

  private func cameraPermission() -> String {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      return "granted"
    case .notDetermined:
      return "undetermined"
    case .denied:
      return "denied"
    case .restricted:
      return "restricted"
    @unknown default:
      return "unknown"
    }
  }

  private func ensureCameraView() -> SpatialCameraView {
    if let existing = cameraView {
      return existing
    }
    let view = SpatialCameraView(frame: cameraContainer.bounds)
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    cameraContainer.addSubview(view)
    view.onFrameUpdate = { [weak self] transform in
      self?.handleCameraFrame(transform)
    }
    view.onStatusChange = { [weak self] in
      self?.handleCameraStatusChange()
    }
    view.onFailure = { [weak self] error in
      self?.handleCameraFailure(error)
    }
    view.onRelocalized = { [weak self] in
      self?.handleRelocalized()
    }
    view.onResumed = { [weak self] in
      self?.handleCameraResumed()
    }
    cameraView = view
    return view
  }

  private func stopCamera(nextMode: Mode) {
    if mode != .map || method != nil {
      journal("stop", ["next": nextMode.rawValue, "localized": localizedAt != nil])
    }
    method = nil
    singleMethodSearch = false
    cachedMemoryRetried = false
    memoryCandidates = []
    resumedAt = nil
    if memoryDecodeDeferred {
      memoryDecodeDeferred = false
      DispatchQueue.main.async { [weak self] in
        self?.memoryDidChange()
      }
    }
    activeAlignment = nil
    trackingLost = false
    stopAutoLocalization()
    cameraView?.pause()
    cameraView?.setReticleVisible(false)
    cameraView?.showMarkers(confirmed: [], pending: nil)
    mapView.onMapTap = nil
    mapView.onMapTapMissed = nil
    mapView.setCalibrationMarkers(confirmed: [], pending: nil)
    mapView.setPinConfidence(.lost)
    if mode == .calibrating {
      resetCalibrationDraft()
    }
    let wasRecording = mode == .recording
    if wasRecording {
      // Results still in flight are written to disk but no longer drive the screen.
      recordingToken += 1
      recordingStartedAt = nil
      pendingFinalSave = false
      recordingBase = nil
      recordingWaitingForMemory = false
    }
    mode = nextMode
    localizedAt = nil
    cameraExpanded = false
    if nextMode == .map {
      mapView.setFollow(false)
    }
    layoutForMode(animated: true)
    emitState(force: true)
    emitCalibration(force: true)
    if wasRecording {
      emitRecording(force: true)
      preservePartialRecording()
    }
  }

  // MARK: - Localisation

  /// Automatic matching against the localisation map is possible (LiDAR walls, or ARKit's
  /// feature points on iPhones without LiDAR).
  private var autoAvailable: Bool {
    return SpatialCameraView.isSupported && (matcher != nil || locMapLoading)
  }

  /// The visual memory first whenever there is one: ARKit recognises the spot in a few seconds,
  /// even where the walls look alike. The walls (LiDAR) or the feature points take over if it
  /// does not, and the two keep taking turns until one of them finds the user.
  /// A visual memory to search with: the phone's own, or zones shipped with the venue.
  private var hasVisualMemory: Bool {
    return calibration != nil || !memoryZones.isEmpty
  }

  private func preferredMethod(_ requested: String?) -> String? {
    if requested == "auto" && autoAvailable { return "auto" }
    if requested == "worldMap" && hasVisualMemory { return "worldMap" }
    if hasVisualMemory { return "worldMap" }
    if autoAvailable { return "auto" }
    return nil
  }

  /// `only`: stick to the requested method (no switching), to test it on its own.
  private func startLocalization(preferred: String?, only: Bool = false) {
    guard modelLoaded else {
      emitError("MODEL_NOT_READY", "The map is still loading.")
      return
    }
    stopReplay()
    fallbackNotified = false
    singleMethodSearch = false
    resumedAt = nil
    memoryCandidates = buildMemoryCandidates()
    memoryCandidateIndex = 0
    journal("search.start", ["requested": SpatialJSON.orNull(preferred), "only": only,
                             "hasMemory": calibration != nil, "zones": memoryZones.count,
                             "autoAvailable": autoAvailable, "lidar": SpatialCameraView.supportsMesh])
    if only {
      switch preferred {
      case "worldMap"?:
        guard hasVisualMemory else {
          emitError("VISUAL_MAP_NONE", "There is no visual memory for this place on this phone.")
          return
        }
        singleMethodSearch = true
        startWorldMapLocalization()
        return
      case "auto"?:
        guard autoAvailable else {
          emitError("AUTO_UNAVAILABLE", "This place has no localisation map.")
          return
        }
        singleMethodSearch = true
        startAutoLocalization()
        return
      default:
        break
      }
    }
    switch preferredMethod(preferred) {
    case "auto"?:
      startAutoLocalization()
    case "worldMap"?:
      startWorldMapLocalization()
    default:
      emitError("NO_CALIBRATION", "This place has no localisation map and has not been calibrated on this phone yet.")
    }
  }

  private func startWorldMapLocalization() {
    if memoryCandidates.isEmpty {
      memoryCandidates = buildMemoryCandidates()
      memoryCandidateIndex = 0
    }
    guard let taken = takeMemoryCandidate(reason: "start") else {
      emitError("NO_CALIBRATION", "This place has not been calibrated on this phone yet.")
      emitState(force: true)
      return
    }
    let record = taken.record
    let worldMap = taken.map
    let recordVenue = record.venueId
    withCamera { [weak self] in
      guard let self = self, recordVenue == self.venueId else { return }
      let camera = self.ensureCameraView()
      self.clearCalibrationUI()
      self.method = "worldMap"
      self.activeAlignment = nil
      self.trackingLost = false
      self.stopAutoLocalization()
      self.mode = .locating
      self.localizedAt = nil
      self.locateStartedAt = Date()
      self.slowHintSent = false
      self.cameraExpanded = false
      self.lastHeading = nil
      camera.setReticleVisible(false)
      camera.setShowsFeaturePoints(self.debugEnabled)
      camera.run(mode: .relocalizing, worldMap: worldMap)
      camera.setMeshOverlay(visible: false)
      self.method = "worldMap"
      self.autoStartedAt = Date()
      self.coverage.reset()
      self.lastHint = nil
      self.lastVerdict = nil
      self.lastMatch = nil
      self.lastScan = nil
      self.lastCameraTransform = nil
      self.startAutoTimer()
      self.layoutForMode(animated: true)
      self.emitState(force: true)
      self.emitAuto(force: true)
    }
  }

  // MARK: - Memory zones

  /// The bundled zones the manifest lists (missing files are left out).
  private func loadMemoryZones(_ manifest: VenueManifest) -> [ZoneFile] {
    return (manifest.memoryZones ?? []).compactMap { zone in
      guard let url = store.bundledFile(named: zone.file) else { return nil }
      let flat = zone.path ?? []
      var path: [SIMD2<Double>] = []
      var i = 0
      while i + 1 < flat.count {
        if flat[i].isFinite && flat[i + 1].isFinite {
          path.append(SIMD2<Double>(flat[i], flat[i + 1]))
        }
        i += 2
      }
      return ZoneFile(id: zone.id, url: url, createdAt: zone.createdAt, path: path)
    }
  }

  private static func lastPositionKey(_ venue: String) -> String {
    return "FlyQSpatial.lastPosition.\(venue)"
  }

  private static func lastZoneKey(_ venue: String) -> String {
    return "FlyQSpatial.lastZone.\(venue)"
  }

  /// Model x, z where the pin last was in this venue (kept on the phone only).
  private func lastSavedPosition() -> SIMD2<Double>? {
    guard let a = UserDefaults.standard.array(forKey: FlyQSpatialHostView.lastPositionKey(venueId)) as? [Double],
          a.count == 2, a[0].isFinite, a[1].isFinite
    else { return nil }
    return SIMD2<Double>(a[0], a[1])
  }

  /// The memories a new search tries, in order: the zones whose walk passed closest to where the
  /// pin last was come first (MemoryZonePlanner). The phone's own memory takes the place of the
  /// zone it was installed from, or leads when it is a memory of its own (recorded, extended).
  private func buildMemoryCandidates() -> [MemoryCandidate] {
    var list: [MemoryCandidate] = []
    var installedPlaced = false
    if !memoryZones.isEmpty {
      let planned = memoryZones.map { MemoryZonePlanner.Zone(id: $0.id, path: $0.path) }
      let order = MemoryZonePlanner.order(
        planned, lastPosition: lastSavedPosition(),
        lastZone: UserDefaults.standard.string(forKey: FlyQSpatialHostView.lastZoneKey(venueId)))
      for i in order {
        let zone = memoryZones[i]
        if let record = calibration, let at = zone.createdAt, record.createdAt == at {
          list.append(.installed(zoneId: zone.id))
          installedPlaced = true
        } else {
          list.append(.zone(zone))
        }
      }
    }
    if calibration != nil && !installedPlaced {
      list.insert(.installed(zoneId: nil), at: 0)
    }
    return list
  }

  /// Decodes the candidate in turn (skipping the ones that cannot be read) and makes it the active
  /// memory. Nil when none is left.
  private func takeMemoryCandidate(reason: String) -> (record: CalibrationRecord, map: ARWorldMap)? {
    while !memoryCandidates.isEmpty {
      let index = memoryCandidateIndex % memoryCandidates.count
      memoryCandidateIndex = index
      switch memoryCandidates[index] {
      case .installed(let zoneId):
        guard let record = calibration else {
          memoryCandidates.remove(at: index)
          continue
        }
        guard let taken = takeDecodedMemory(record) else {
          memoryCandidates.remove(at: index)
          forgetVisualMemory(byUser: false)
          emitError("CALIBRATION_INVALID", "The saved visual memory could not be read.")
          continue
        }
        runUsesCachedMemory = taken.prefetched
        activateMemory(record, id: zoneId ?? "installed", installed: true, index: index, reason: reason)
        return (record, taken.map)
      case .zone(let zone):
        guard let taken = takeZone(zone) else {
          journal("memory.zone.invalid", ["id": zone.id, "reason": "unreadable"])
          memoryCandidates.remove(at: index)
          continue
        }
        runUsesCachedMemory = false
        activateMemory(taken.record, id: zone.id, installed: false, index: index, reason: reason)
        return (taken.record, taken.map)
      }
    }
    return nil
  }

  private func activateMemory(_ record: CalibrationRecord, id: String, installed: Bool, index: Int, reason: String) {
    activeMemory = record
    activeMemoryId = id
    activeMemoryInstalled = installed
    memoryAttemptStartedAt = Date()
    journal("memory.zone", ["id": id, "index": index, "of": memoryCandidates.count, "reason": reason])
    prefetchNextZone()
  }

  /// One decoded copy of a zone for one ARKit run: the one decoded in advance, else read now.
  private func takeZone(_ zone: ZoneFile) -> (record: CalibrationRecord, map: ARWorldMap)? {
    if let ready = prefetchedZone, ready.id == zone.id {
      prefetchedZone = nil
      return (ready.record, ready.map)
    }
    guard let loaded = VisualMapImport.loadZone(url: zone.url, venueId: venueId),
          let map = WorldMapCodec.decode(loaded.worldMap)
    else { return nil }
    return (loaded.record, map)
  }

  /// Decodes the zone after the current one in the background, so switching to it is immediate.
  private func prefetchNextZone() {
    guard memoryCandidates.count > 1 else { return }
    let next = (memoryCandidateIndex + 1) % memoryCandidates.count
    guard case .zone(let zone) = memoryCandidates[next], prefetchedZone?.id != zone.id,
          prefetchingZoneId != zone.id
    else { return }
    prefetchingZoneId = zone.id
    let venue = venueId
    let url = zone.url
    let id = zone.id
    DispatchQueue.global(qos: .utility).async { [weak self] in
      let loaded = VisualMapImport.loadZone(url: url, venueId: venue)
      let map = loaded.flatMap { WorldMapCodec.decode($0.worldMap) }
      DispatchQueue.main.async { [weak self] in
        guard let self = self, self.prefetchingZoneId == id else { return }
        self.prefetchingZoneId = nil
        guard let loaded = loaded, let map = map, venue == self.venueId else { return }
        self.prefetchedZone = (id, loaded.record, map)
      }
    }
  }

  /// Several zones: the next one replaces the current one in the running search. The search keeps
  /// its timers, so the switch to the walls still comes on time.
  private func advanceMemoryZone() {
    guard let camera = cameraView, method == "worldMap", mode == .locating, memoryCandidates.count > 1 else {
      return
    }
    memoryCandidateIndex = (memoryCandidateIndex + 1) % memoryCandidates.count
    guard let taken = takeMemoryCandidate(reason: "next") else { return }
    camera.run(mode: .relocalizing, worldMap: taken.map)
    camera.setMeshOverlay(visible: false)
    lastCameraTransform = nil
    emitAuto(force: true)
  }

  /// Back from the background (or another interruption) while navigating: nothing followed the
  /// phone meanwhile (iOS stops the camera, and the gyroscope alone gives no position). ARKit looks
  /// for the place again; the pin shows as approximate until it does, the user is asked to look
  /// around, and a new search starts when that takes too long.
  private func handleCameraResumed() {
    guard mode == .navigating, method != nil else { return }
    resumedAt = Date()
    journal("resume", ["method": SpatialJSON.orNull(method)])
    emit("hint", ["code": "RESUME_LOOK_AROUND"])
    startAutoTimer()
    emitState(force: true)
  }

  // MARK: - Demo replay

  /// `<venueId>.replay.json` shipped with the venue (a recorded walk), if any.
  private func replayURL() -> URL? {
    return store.bundledFile(named: "\(venueId).replay.json")
  }

  /// Plays a real walk back on the map: the pin follows the recorded path at the walking speed of
  /// the recording (no camera). For demos away from the venue; the UI says it is a replay.
  private func startReplay() {
    guard modelLoaded, mode == .map, method == nil else {
      emitError("REPLAY_BUSY", "Stop the camera first.")
      return
    }
    guard let url = replayURL(), let data = try? Data(contentsOf: url),
          let file = try? JSONDecoder().decode(ReplayFile.self, from: data)
    else {
      emitError("REPLAY_UNAVAILABLE", "This place has no demo walk.")
      return
    }
    var points: [(t: Double, x: Float, z: Float)] = []
    for p in file.points where p.count >= 3 && p[0].isFinite && p[1].isFinite && p[2].isFinite {
      if let last = points.last, p[0] <= last.t { continue }
      points.append((p[0], Float(p[1]), Float(p[2])))
    }
    guard points.count >= 2 else {
      emitError("REPLAY_UNAVAILABLE", "This place has no demo walk.")
      return
    }
    replayTimer?.invalidate()
    replayPoints = points
    replayStartedAt = CACurrentMediaTime()
    mapView.setFollow(true)
    if mapView.viewMode == .top {
      mapView.setViewMode(.perspective, animated: true)
    }
    let timer = Timer(timeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
      DispatchQueue.main.async { [weak self] in
        self?.replayTick()
      }
    }
    RunLoop.main.add(timer, forMode: .common)
    replayTimer = timer
    journal("replay.start", ["points": points.count, "seconds": SpatialJSON.number(points[points.count - 1].t, digits: 0)])
    replayTick()
    emitState(force: true)
  }

  private func replayTick() {
    guard replayTimer != nil, let first = replayPoints.first, let last = replayPoints.last else { return }
    let t = first.t + (CACurrentMediaTime() - replayStartedAt)
    if t >= last.t {
      stopReplay()
      return
    }
    var i = 0
    while i + 1 < replayPoints.count && replayPoints[i + 1].t <= t {
      i += 1
    }
    let a = replayPoints[i]
    let b = replayPoints[min(i + 1, replayPoints.count - 1)]
    let span = b.t - a.t
    let f = span > 1e-6 ? Float((t - a.t) / span) : 0
    let x = a.x + (b.x - a.x) * f
    let z = a.z + (b.z - a.z) * f
    // Heading: where the walk goes over the next couple of metres (the pin's arrow points along -Z).
    var j = i + 1
    while j + 1 < replayPoints.count {
      let q = replayPoints[j]
      if (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z) >= 2.0 { break }
      j += 1
    }
    let ahead = replayPoints[min(j, replayPoints.count - 1)]
    let dx = ahead.x - x
    let dz = ahead.z - z
    let heading: Float? = dx * dx + dz * dz > 0.01 ? atan2(-dx, -dz) : nil
    mapView.setPin(position: SIMD3<Float>(x, 0, z), headingRadians: heading, confidence: .exact)
  }

  private func stopReplay() {
    guard replayTimer != nil || !replayPoints.isEmpty else { return }
    replayTimer?.invalidate()
    replayTimer = nil
    replayPoints = []
    if mode == .map && method == nil {
      mapView.setPin(position: nil, headingRadians: nil, confidence: .lost)
    }
    journal("replay.stop")
    emitState(force: true)
  }

  // MARK: - Decoded memory cache

  /// A decoded copy of the venue memory for one ARKit run. Every copy goes to a single session
  /// (Apple does not document handing the same ARWorldMap object to several runs, and the decode
  /// is what every run did before the copy was kept): the copy decoded in the background when it
  /// is this memory, else the file read now; then the next copy is decoded in the background.
  private func takeDecodedMemory(_ record: CalibrationRecord) -> (map: ARWorldMap, prefetched: Bool)? {
    let key = FlyQSpatialHostView.memoryKey(record)
    var taken: (map: ARWorldMap, prefetched: Bool)?
    if let cached = decodedMemory, cached.key == key {
      taken = (cached.map, true)
    } else {
      // Not decoded yet (a search right after the memory changed): read it now.
      let storeRef = store
      taken = storeQueue.sync(execute: { storeRef.loadWorldMapData() })
        .flatMap { WorldMapCodec.decode($0) }
        .map { (map: $0, prefetched: false) }
    }
    decodedMemory = nil
    if taken != nil {
      // A few seconds later: not while the session starts.
      DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
        self?.memoryDidChange()
      }
    }
    return taken
  }

  private static func memoryKey(_ record: CalibrationRecord) -> String {
    return "\(record.venueId)|\(record.createdAt)|\(record.featurePoints ?? -1)|\(record.source ?? "")"
  }

  /// The saved memory changed (venue loaded, installed, imported, saved, deleted): drop the
  /// decoded copy if it is not this one and decode the new one in the background.
  private func memoryDidChange() {
    guard let record = calibration else {
      decodedMemory = nil
      decodingMemoryKey = nil
      return
    }
    let key = FlyQSpatialHostView.memoryKey(record)
    if decodedMemory?.key != key {
      decodedMemory = nil
    }
    if method == "auto" && mode == .navigating {
      // A LiDAR phone saving its memory while walking: decode when the session ends.
      memoryDecodeDeferred = true
      return
    }
    guard decodedMemory == nil, decodingMemoryKey != key else { return }
    decodingMemoryKey = key
    memoryDecodeStarted = CACurrentMediaTime()
    let storeRef = store
    storeQueue.async { [weak self] in
      let data = storeRef.loadWorldMapData()
      DispatchQueue.global(qos: .utility).async { [weak self] in
        let map = data.flatMap { WorldMapCodec.decode($0) }
        DispatchQueue.main.async { [weak self] in
          guard let self = self, self.decodingMemoryKey == key else { return }
          self.decodingMemoryKey = nil
          guard let map = map, storeRef === self.store, let current = self.calibration,
                FlyQSpatialHostView.memoryKey(current) == key
          else {
            self.journal("memory.decode", ["ok": map != nil, "current": false])
            return
          }
          if self.decodedMemory?.key == key {
            return  // a search decoded it meanwhile: keep one copy
          }
          self.decodedMemory = (key, map)
          self.journal("memory.decode", [
            "ok": true, "seconds": SpatialJSON.number(CACurrentMediaTime() - self.memoryDecodeStarted, digits: 2),
            "memory": self.journalMemory(current),
          ])
        }
      }
    }
  }

  // MARK: - Automatic localisation

  private func clearCalibrationUI() {
    resetCalibrationDraft()
    mapView.onMapTap = nil
    mapView.onMapTapMissed = nil
    mapView.setCalibrationMarkers(confirmed: [], pending: nil)
    cameraView?.showMarkers(confirmed: [], pending: nil)
    cameraView?.setReticleVisible(false)
  }

  private func startAutoLocalization() {
    withCamera { [weak self] in
      guard let self = self, self.modelLoaded else { return }
      let camera = self.ensureCameraView()
      self.clearCalibrationUI()
      self.stopAutoTimer()
      self.autoGeneration += 1
      self.mode = .locating
      self.method = "auto"
      self.activeAlignment = nil
      self.trackingLost = false
      self.trackingBadStreak = 0
      self.localizedAt = nil
      self.locateStartedAt = Date()
      self.autoStartedAt = Date()
      self.slowHintSent = false
      self.cameraExpanded = false
      self.lastHeading = nil
      self.autoAttempts = 0
      self.lastAutoAttempt = 0
      self.visualMapSavesThisSession = 0
      self.nextVisualMapSave = 0
      self.sessionSavedAlignment = nil
      self.autoSaveBlocked = false
      self.geometryConfirmedAt = nil
      self.lastVerdict = nil
      self.lastMatch = nil
      self.lastScan = nil
      self.lastHint = nil
      self.lastCameraTransform = nil
      self.judge.reset()
      self.coverage.reset()
      self.mapView.setPin(position: nil, headingRadians: nil, confidence: .lost)
      camera.setReticleVisible(false)
      camera.setShowsFeaturePoints(self.debugEnabled)
      camera.run(mode: .scanning, worldMap: nil)
      camera.setMeshOverlay(visible: true)
      self.startAutoTimer()
      self.layoutForMode(animated: true)
      self.emitState(force: true)
      self.emitAuto(force: true)
    }
  }

  private func stopAutoLocalization() {
    stopAutoTimer()
    autoGeneration += 1
    inFlightGeneration = nil
    autoStartedAt = nil
    lastHint = nil
    lastVerdict = nil
    cameraView?.setMeshOverlay(visible: false)
    emitAuto(force: true)
  }

  private func startAutoTimer() {
    stopAutoTimer()
    let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
      // Hop explicitly to the main queue (the timer already fires there): keeps the view's
      // main-actor methods out of the timer's nonisolated block.
      DispatchQueue.main.async { [weak self] in
        self?.autoTick()
      }
    }
    RunLoop.main.add(timer, forMode: .common)
    autoTimer = timer
  }

  private func stopAutoTimer() {
    autoTimer?.invalidate()
    autoTimer = nil
  }

  /// Runs twice a second while the automatic method (or a guided memory search) is in use.
  private func autoTick() {
    guard let camera = cameraView, camera.isRunning else { return }
    journalTick(camera)
    if let since = resumedAt, mode == .navigating {
      let waited = Date().timeIntervalSince(since)
      if camera.trackingState == "normal" && waited >= 1 {
        // ARKit matched the place again (it relocalises against the session after an interruption).
        resumedAt = nil
        journal("resume.found", ["after": SpatialJSON.number(waited, digits: 1)])
        if method == "worldMap" && !(memoryWallCheck && camera.meshing) {
          stopAutoTimer()
        }
        emitState(force: true)
      } else if waited >= FlyQSpatialHostView.resumeSearchAfter {
        resumedAt = nil
        journal("resume.search", ["after": SpatialJSON.number(waited, digits: 1)])
        startLocalization(preferred: nil)
        return
      }
    }
    if method == "worldMap" {
      if mode == .locating {
        // The memory may not cover this spot (or the light changed): try the automatic matching.
        let elapsed = autoStartedAt.map { Date().timeIntervalSince($0) } ?? 0
        let fallbackDue = elapsed > worldMapFallbackAfter && autoAvailable && !camera.relocalized
          && !singleMethodSearch
        // Several zones: the one tried did not recognise the place in time, the next one gets a go.
        if !fallbackDue && !camera.relocalized && memoryCandidates.count > 1,
           let started = memoryAttemptStartedAt,
           Date().timeIntervalSince(started) >= FlyQSpatialHostView.zoneAttemptSeconds {
          advanceMemoryZone()
          return
        }
        if fallbackDue {
          if !fallbackNotified {
            fallbackNotified = true
            emit("hint", ["code": "AUTO_FALLBACK"])
          }
          journal("search.switch", ["from": "worldMap", "to": "auto", "after": SpatialJSON.number(elapsed, digits: 1)])
          startAutoLocalization()
          return
        }
        refreshAutoHint()
        emitAuto(force: false)
      } else if mode == .navigating && memoryWallCheck && camera.meshing && !autoBusy
                  && camera.trackingState == "normal" && CACurrentMediaTime() - lastMemoryCheck >= 2.0 {
        // Every third check is a global search (is the memory's place the only one that fits?).
        runMatch(memoryChecks % 3 == 2 ? .verifyGlobal : .verifyLocal)
      }
      return
    }
    guard method == "auto" else { return }
    let now = CACurrentMediaTime()
    // A visual memory on the phone and still nothing: back to the memory (the user has usually
    // moved meanwhile), unless the automatic match is about to be confirmed.
    if mode == .locating && !trackingLost && hasVisualMemory && !autoBusy && !singleMethodSearch,
       let started = autoStartedAt, Date().timeIntervalSince(started) > memoryRetryAfter,
       lastVerdict != .confirming && lastVerdict != .accept {
      journal("search.switch", ["from": "auto", "to": "worldMap",
                                "after": SpatialJSON.number(Date().timeIntervalSince(started), digits: 1),
                                "attempts": autoAttempts, "verdict": SpatialJSON.orNull(lastVerdict?.rawValue)])
      // The zone tried before the walls did not recognise the place: go on with the next one.
      if memoryCandidates.count > 1 {
        memoryCandidateIndex = (memoryCandidateIndex + 1) % memoryCandidates.count
      }
      startWorldMapLocalization()
      return
    }
    if mode == .locating || trackingLost {
      if !autoBusy && camera.trackingState == "normal" && now - lastAutoAttempt >= 0.8 {
        runAutoAttempt(global: true)
      }
    } else if mode == .navigating {
      if !autoBusy && camera.trackingState == "normal" && now - lastTrackCheck >= 2.0 {
        runAutoAttempt(global: false)
      } else if SpatialCameraView.supportsMesh && !autoBusy && camera.trackingState == "normal"
                  && now - lastBlindCheck >= max(6.0, 10 * lastGlobalMatchSeconds) && now - lastTrackCheck >= 0.5 {
        runMatch(.blind)
      }
      maybeSaveVisualMap()
    }
    refreshAutoHint()
    emitAuto(force: false)
  }

  /// What a wall match is for.
  private enum MatchPurpose {
    /// Global search while locating (or after the position was lost).
    case search
    /// Local refinement while navigating with the walls.
    case track
    /// Global search while navigating, only written to the journal.
    case blind
    /// Memory session on LiDAR: local refinement around the memory's pose / global search.
    case verifyLocal
    case verifyGlobal

    var isGlobal: Bool {
      return self == .search || self == .blind || self == .verifyGlobal
    }
  }

  private func runAutoAttempt(global: Bool) {
    runMatch(global ? .search : .track)
  }

  /// Copies the live geometry here (main thread), matches it in the background.
  private func runMatch(_ purpose: MatchPurpose) {
    let radius = purpose.isGlobal ? globalScanRadius : FlyQSpatialHostView.localScanRadius
    guard let camera = cameraView, let matcher = matcher, let map = locMap,
          let snapshot = camera.captureSnapshot(meshRadius: radius + 4)
    else { return }
    // The alignment in use: the start of a local refinement, the reference of a check.
    let current: YawAlignment? = purpose == .search ? nil : currentAlignment()
    if purpose != .search && current == nil { return }
    let local = !purpose.isGlobal
    let reference = current.map { (yaw: $0.yaw, tx: $0.translation.x, tz: $0.translation.z) }
    let start = local ? reference : nil
    let scoreMemory = purpose == .verifyGlobal
    let generation = autoGeneration
    inFlightGeneration = generation
    let now = CACurrentMediaTime()
    switch purpose {
    case .search:
      lastAutoAttempt = now
    case .track:
      lastTrackCheck = now
    case .blind:
      lastBlindCheck = now
    case .verifyLocal, .verifyGlobal:
      lastMemoryCheck = now
      memoryChecks += 1
    }
    matchQueue.async { [weak self] in
      let began = CACurrentMediaTime()
      let scan = LiveScanBuilder.build(snapshot, bandMin: map.bandMin, bandMax: map.bandMax,
                                       maxAbsNormalY: map.maxAbsNormalY, radius: radius + 0.5)
      let result = AutoLocalizationWork.match(scan: scan, start: start, matcher: matcher)
      let seconds = CACurrentMediaTime() - began
      // The memory's own pose, refined on exactly these walls: comparable with the best match.
      let memoryFit = scoreMemory ? AutoLocalizationWork.match(scan: scan, start: reference, matcher: matcher) : nil
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        if self.inFlightGeneration == generation {
          self.inFlightGeneration = nil
        }
        if purpose.isGlobal && purpose != .verifyGlobal {
          self.lastGlobalMatchSeconds = seconds
        }
        guard generation == self.autoGeneration else { return }
        switch purpose {
        case .search, .track:
          self.handleAutoResult(scan: scan, result: result, global: purpose == .search, map: map)
        case .blind:
          self.handleBlindResult(scan: scan, result: result, reference: current)
        case .verifyLocal, .verifyGlobal:
          self.handleMemoryCheck(scan: scan, result: result, memoryFit: memoryFit, global: purpose == .verifyGlobal,
                                 memory: current, map: map)
        }
      }
    }
  }

  /// After meshing started on a recognised memory session: does the memory's origin anchor stay put?
  /// (Journal only; the pin falls back to the memory's alignment if the anchor ever went missing.)
  private func watchOriginAnchor(from before: simd_float4x4?, checks: [Double]) {
    let generation = autoGeneration
    for delay in checks {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
        guard let self = self, generation == self.autoGeneration, self.method == "worldMap",
              let camera = self.cameraView
        else { return }
        let now = camera.originAnchorTransform()
        var line: [String: Any] = ["after": delay, "present": now != nil]
        if let a = before, let b = now {
          let d = a.columns.3 - b.columns.3
          line["moved"] = SpatialJSON.number(Double((d.x * d.x + d.y * d.y + d.z * d.z).squareRoot()), digits: 3)
        }
        self.journal("verify.anchor", line)
      }
    }
  }

  /// Journal only: would the walls alone have found the user here, and where?
  private func handleBlindResult(scan: LiveScan?, result: RegistrationResult?, reference: YawAlignment?) {
    guard mode == .navigating else { return }
    var line: [String: Any] = [:]
    if let r = result, let scan = scan, let ref = reference {
      let walls = r.apply(x: Double(scan.camera.x), z: Double(scan.camera.y))
      let here = ref.apply(SIMD3<Double>(Double(scan.camera.x), 0, Double(scan.camera.y)))
      line["offset"] = SpatialJSON.number(hypot(walls.x - here.x, walls.z - here.z), digits: 2)
      line["turnDeg"] = SpatialJSON.number(AutoLocalizationJudge.angleDiff(r.yaw, ref.yaw) * 180 / Double.pi, digits: 1)
      line["wouldAccept"] = r.pointCount >= judge.policy.minPoints && r.score >= judge.policy.minScore
        && r.inliers >= judge.policy.minInliers && r.ambiguity <= judge.policy.strongAmbiguity
    }
    journalWalls("blind", scan: scan, result: result, verdict: nil, cells: false, extra: line)
  }

  /// Memory session on LiDAR: do the walls agree with where the memory puts the user? Only a
  /// clear contradiction (MemoryWallVerifier) hands the position over to the walls.
  private func handleMemoryCheck(scan: LiveScan?, result: RegistrationResult?, memoryFit: RegistrationResult?,
                                 global: Bool, memory: YawAlignment?, map: LocalizationMap) {
    guard method == "worldMap", mode == .navigating, let memory = memory else { return }
    let verdict: MemoryWallVerifier.Verdict
    if global {
      verdict = memoryVerifier.global(result, memoryFit: memoryFit,
                                      memory: (yaw: memory.yaw, tx: memory.translation.x, tz: memory.translation.z),
                                      camera: scan?.camera ?? SIMD2<Float>(0, 0))
    } else {
      verdict = memoryVerifier.local(result)
    }
    var extra: [String: Any] = ["global": global, "agreements": memoryVerifier.agreements,
                                "poorFits": memoryVerifier.poorFits, "contradictions": memoryVerifier.contradictions]
    if let fit = memoryFit {
      extra["memoryScore"] = SpatialJSON.number(fit.score, digits: 3)
      extra["memoryInliers"] = SpatialJSON.number(fit.inliers, digits: 3)
    }
    if let r = result, let scan = scan {
      let walls = r.apply(x: Double(scan.camera.x), z: Double(scan.camera.y))
      let here = memory.apply(SIMD3<Double>(Double(scan.camera.x), 0, Double(scan.camera.y)))
      extra["offset"] = SpatialJSON.number(hypot(walls.x - here.x, walls.z - here.z), digits: 2)
    }
    journalWalls("verify", scan: scan, result: result, verdict: verdict.rawValue, cells: global, extra: extra)
    if verdict == .agrees {
      localizedAt = Date()
    }
    guard verdict == .contradicted, let fix = memoryVerifier.correction, let scan = scan else { return }
    if !FlyQSpatialHostView.applyWallCorrections || singleMethodSearch {
      // Written down only (and shown in debug mode): the pin stays where the memory put it.
      journal("verify.doubt", ["yaw": SpatialJSON.number(fix.yaw, digits: 4), "tx": SpatialJSON.number(fix.tx, digits: 3),
                               "tz": SpatialJSON.number(fix.tz, digits: 3)])
      if debugEnabled {
        emit("hint", ["code": "MEMORY_DOUBTED"])
      }
      memoryVerifier.reset()
      return
    }
    applyWallCorrection(fix, scan: scan, map: map)
  }

  /// The walls are sure the memory put the user in the wrong place: from now on the walls lead
  /// (same session, nothing restarts).
  private func applyWallCorrection(_ r: RegistrationResult, scan: LiveScan, map: LocalizationMap) {
    journal("verify.correct", ["yaw": SpatialJSON.number(r.yaw, digits: 4), "tx": SpatialJSON.number(r.tx, digits: 3),
                               "tz": SpatialJSON.number(r.tz, digits: 3)])
    method = "auto"
    judge.reset()
    memoryVerifier.reset()
    lastVerdict = .accept
    lastMatch = r
    // A session that started from the memory and was corrected never saves a memory of its own.
    autoSaveBlocked = true
    acceptAutoMatch(r, floorAR: scan.floorY, map: map)
    // After "localized", so this is the notice the user reads.
    emit("hint", ["code": "MEMORY_CORRECTED"])
  }

  private func handleAutoResult(scan: LiveScan?, result: RegistrationResult?, global: Bool, map: LocalizationMap) {
    // Only while the automatic method is still the one in use (and, for global searches, still
    // searching): never apply a late result to a calibration or world-map session.
    guard method == "auto", !global || mode == .locating || trackingLost else { return }
    lastScan = scan ?? lastScan
    if global {
      autoAttempts += 1
      let verdict = judge.judge(result, camera: scan?.camera ?? SIMD2<Float>(0, 0))
      lastVerdict = verdict
      lastMatch = result
      journalWalls("walls", scan: scan, result: result, verdict: verdict.rawValue)
      if verdict == .accept, let r = result, let scan = scan {
        acceptAutoMatch(r, floorAR: scan.floorY, map: map)
      }
    } else {
      journalWalls("check", scan: scan, result: result, verdict: nil, cells: false)
      handleTrackingResult(result, scan: scan)
    }
    refreshAutoHint()
    emitAuto(force: true)
  }

  private func acceptAutoMatch(_ r: RegistrationResult, floorAR: Float, map: LocalizationMap) {
    guard let camera = cameraView else { return }
    let alignment = YawAlignment(yaw: r.yaw, translation: SIMD3<Double>(r.tx, Double(map.floorY - floorAR), r.tz))
    activeAlignment = alignment
    camera.setOriginAnchor(modelToAR: alignment.matrixFloat.inverse)
    camera.adoptCurrentSessionAsLocalized()
    camera.setMeshOverlay(visible: false)
    let wasLost = trackingLost
    trackingLost = false
    trackingBadStreak = 0
    lastTrackCheck = CACurrentMediaTime()
    acceptedAt = CACurrentMediaTime()
    localizedAt = Date()
    geometryConfirmedAt = Date()
    if mode == .locating {
      mode = .navigating
      mapView.setFollow(true)
      if mapView.viewMode == .top {
        mapView.setViewMode(.perspective, animated: true)
      }
      layoutForMode(animated: true)
    }
    var payload: [String: Any] = [
      "at": SpatialTime.iso8601(),
      "method": "auto",
      "score": SpatialJSON.number(r.score, digits: 2),
      "ambiguity": SpatialJSON.number(r.ambiguity, digits: 2),
      "relocalized": wasLost,
    ]
    if let started = autoStartedAt {
      payload["seconds"] = SpatialJSON.number(Date().timeIntervalSince(started), digits: 1)
    }
    if let started = locateStartedAt {
      payload["searchSeconds"] = SpatialJSON.number(Date().timeIntervalSince(started), digits: 1)
    }
    emit("localized", payload)
    journal("localized", payload)
    emitState(force: true)
  }

  /// While navigating: keep the alignment glued to the live geometry, notice when it is lost.
  private func handleTrackingResult(_ result: RegistrationResult?, scan: LiveScan?) {
    guard mode == .navigating, method == "auto" else { return }
    let policy = judge.policy
    guard let r = result, let scan = scan, r.pointCount >= policy.trackMinPoints,
          let current = currentAlignment()
    else { return }
    if r.score >= policy.trackMinScore && r.inliers >= policy.trackMinInliers {
      trackingBadStreak = 0
      localizedAt = Date()
      geometryConfirmedAt = Date()
      let before = current.apply(SIMD3<Double>(Double(scan.camera.x), 0, Double(scan.camera.y)))
      let after = r.apply(x: Double(scan.camera.x), z: Double(scan.camera.y))
      let jump = hypot(after.x - before.x, after.z - before.z)
      let turn = AutoLocalizationJudge.angleDiff(r.yaw, current.yaw)
      if jump <= policy.trackMaxJump && turn <= policy.trackMaxTurn && (jump > 0.03 || turn > 0.005) {
        let refined = YawAlignment(yaw: r.yaw, translation: SIMD3<Double>(r.tx, current.translation.y, r.tz))
        activeAlignment = refined
        cameraView?.setOriginAnchor(modelToAR: refined.matrixFloat.inverse)
      }
    } else if r.score < policy.trackLostScore {
      trackingBadStreak += 1
      if trackingBadStreak >= policy.trackLostStreak && !trackingLost {
        trackingLost = true
        geometryConfirmedAt = nil
        judge.reset()
        lastVerdict = nil
        lastMatch = nil
        coverage.reset()
        autoStartedAt = Date()
        autoAttempts = 0
        lastAutoAttempt = 0
        cameraView?.setMeshOverlay(visible: true)
        mapView.setPinConfidence(.estimated)
        emit("hint", ["code": "AUTO_RELOCATING"])
        emitState(force: true)
      }
    }
  }

  /// The AR -> model transform currently in use (origin anchor first: ARKit keeps it corrected).
  private func currentAlignment() -> YawAlignment? {
    guard let m = modelFromAR() else { return nil }
    let yaw = atan2(Double(m.columns.2.x), Double(m.columns.0.x))
    let t = m.columns.3
    guard yaw.isFinite, t.x.isFinite, t.y.isFinite, t.z.isFinite else { return nil }
    return YawAlignment(yaw: yaw, translation: SIMD3<Double>(Double(t.x), Double(t.y), Double(t.z)))
  }

  private func refreshAutoHint() {
    guard let camera = cameraView else {
      lastHint = nil
      return
    }
    let elapsed = autoStartedAt.map { Date().timeIntervalSince($0) } ?? 0
    if method == "worldMap" && mode == .locating {
      var forwardY: Float?
      if let t = lastCameraTransform {
        let f = t.columns.2
        let length = (f.x * f.x + f.y * f.y + f.z * f.z).squareRoot()
        if length > 1e-6 { forwardY = -f.y / length }
      }
      lastHint = AutoLocalizationCoach.relocalizationHint(trackingState: camera.trackingState,
                                                          trackingReason: camera.trackingReason,
                                                          forwardY: forwardY, coverage: coverage.fraction,
                                                          elapsed: elapsed, featureLevel: camera.knownFeatureLevel)
      return
    }
    guard method == "auto", mode == .locating || trackingLost else {
      lastHint = nil
      return
    }
    lastHint = AutoLocalizationCoach.hint(AutoLocalizationCoach.Input(
      trackingState: camera.trackingState,
      trackingReason: camera.trackingReason,
      scan: lastScan,
      verdict: lastVerdict,
      coverage: coverage.fraction,
      elapsed: elapsed
    ))
  }

  private func handleRelocalized() {
    if mode == .recording {
      handleRecordingRelocalized()
      return
    }
    guard mode == .locating || mode == .navigating, method != "auto" else { return }
    localizedAt = Date()
    if method == "worldMap" {
      lastHint = nil
      if SpatialCameraView.supportsMesh && matcher != nil && memoryWallCheck {
        // LiDAR: the same session starts meshing, and the walls check what the memory says
        // (handleMemoryCheck). Out of the ARKit callback first.
        memoryVerifier.reset()
        memoryChecks = 0
        lastMemoryCheck = CACurrentMediaTime()
        DispatchQueue.main.async { [weak self] in
          guard let self = self, self.method == "worldMap", self.mode == .navigating,
                let camera = self.cameraView
          else { return }
          let before = camera.originAnchorTransform()
          let meshing = camera.enableMeshing()
          self.journal("verify.start", ["meshing": meshing, "anchor": before != nil])
          if !meshing {
            self.stopAutoTimer()
            return
          }
          self.watchOriginAnchor(from: before, checks: [1, 3, 6])
        }
      } else {
        stopAutoTimer()
      }
    }
    if mode == .locating {
      mode = .navigating
      mapView.setFollow(true)
      if mapView.viewMode == .top {
        mapView.setViewMode(.perspective, animated: true)
      }
      layoutForMode(animated: true)
    }
    var payload: [String: Any] = ["at": SpatialTime.iso8601(), "method": "worldMap"]
    if let id = activeMemoryId {
      payload["zone"] = id
      UserDefaults.standard.set(id, forKey: FlyQSpatialHostView.lastZoneKey(venueId))
    }
    if let started = locateStartedAt {
      payload["seconds"] = SpatialJSON.number(Date().timeIntervalSince(started), digits: 1)
    }
    if let started = autoStartedAt {
      payload["memorySeconds"] = SpatialJSON.number(Date().timeIntervalSince(started), digits: 1)
    }
    emit("localized", payload)
    journal("localized", payload)
    emitState(force: true)
    emitAuto(force: true)
  }

  /// AR world -> model. Prefers the anchor restored from the world map (ARKit keeps refining it),
  /// falls back to the saved transform.
  private func modelFromAR() -> simd_float4x4? {
    if let anchor = cameraView?.originAnchorTransform() {
      // An aligned recording: its anchor marks the recording's origin, the alignment goes on top.
      if method == "worldMap", let record = activeMemory ?? calibration, record.anchorFrame == "recording",
         let alignment = record.alignment {
        return alignment.matrixFloat * anchor.inverse
      }
      return anchor.inverse
    }
    if let alignment = activeAlignment {
      return alignment.matrixFloat
    }
    if method == "auto" {
      return nil
    }
    return (activeMemory ?? calibration)?.alignment?.matrixFloat
  }

  private func currentConfidence() -> PinConfidence {
    guard let camera = cameraView, camera.isRunning, camera.relocalized else { return .lost }
    if method == "auto" && trackingLost {
      return camera.trackingState == "normal" ? .estimated : .lost
    }
    if camera.trackingState == "normal" {
      if let at = localizedAt, Date().timeIntervalSince(at) < 30 {
        return .exact
      }
      return .tracked
    }
    if camera.trackingState == "limited" {
      if camera.trackingReason == "relocalizing" || camera.trackingReason == "interrupted" {
        return .lost
      }
      // A blink of limited tracking (a quick turn, the camera view resizing right after the fix)
      // is not worth an orange pin.
      let brief = limitedSince.map { CACurrentMediaTime() - $0 < 1.5 } ?? false
      guard brief else { return .estimated }
      if let at = localizedAt, Date().timeIntervalSince(at) < 30 {
        return .exact
      }
      return .tracked
    }
    return .lost
  }

  private func handleCameraFrame(_ transform: simd_float4x4) {
    lastCameraTransform = transform
    let coverageTracking = method == "worldMap"
      ? (cameraView?.trackingState ?? "notAvailable") != "notAvailable"
      : cameraView?.trackingState == "normal"
    if method == "auto" || method == "worldMap", coverageTracking {
      let f = transform.columns.2
      let horizontal = (Double(f.x) * Double(f.x) + Double(f.z) * Double(f.z)).squareRoot()
      if horizontal > 0.3 {
        coverage.add(forward: SIMD2<Float>(-f.x, -f.z))
      }
    }
    switch mode {
    case .locating:
      if method == "auto" || method == "worldMap" {
        // Guided: AutoLocalizationCoach gives the hints.
        break
      }
      if let started = locateStartedAt, !slowHintSent, Date().timeIntervalSince(started) > 15 {
        slowHintSent = true
        emit("hint", ["code": "RELOCALIZE_SLOW"])
      }
    case .navigating:
      updatePin(cameraTransform: transform)
    case .recording:
      recordFrame(transform)
    case .calibrating, .map:
      // Calibration state is re-emitted on tracking / mapping changes (handleCameraStatusChange).
      break
    }
  }

  private func updatePin(cameraTransform transform: simd_float4x4) {
    let confidence = currentConfidence()
    guard confidence != .lost, let toModel = modelFromAR() else {
      mapView.setPinConfidence(.lost)
      return
    }
    let p = transform.columns.3
    let position4 = toModel * SIMD4<Float>(p.x, p.y, p.z, 1)
    let position = SIMD3<Float>(position4.x, position4.y, position4.z)
    let f = transform.columns.2
    let forward4 = toModel * SIMD4<Float>(-f.x, -f.y, -f.z, 0)
    let flat = sqrt(forward4.x * forward4.x + forward4.z * forward4.z)
    if flat > 0.15 {
      // The pin's arrow points along its local -Z; rotate it by this angle around +Y.
      lastHeading = atan2(-forward4.x, -forward4.z)
    }
    mapView.setPin(position: position, headingRadians: lastHeading, confidence: confidence)
    lastPose = position
    if routeTarget != nil && simPos == nil {
      followRoute(SIMD2<Double>(Double(position.x), Double(position.z)))
    }
    if confidence == .exact || confidence == .tracked, CACurrentMediaTime() - lastPositionSaved >= 5 {
      lastPositionSaved = CACurrentMediaTime()
      UserDefaults.standard.set([Double(position.x), Double(position.z)],
                                forKey: FlyQSpatialHostView.lastPositionKey(venueId))
    }
    if confidence != lastPinConfidence {
      // The status line follows the pin (e.g. "approximate" only after the blink is over).
      lastPinConfidence = confidence
      emitState(force: false)
    }
    if CACurrentMediaTime() - lastJournalPose >= 1 {
      lastJournalPose = CACurrentMediaTime()
      journal("pose", [
        "x": SpatialJSON.number(position.x, digits: 2), "z": SpatialJSON.number(position.z, digits: 2),
        "heading": SpatialJSON.orNull(lastHeading.map { SpatialJSON.number(Double($0) * 180 / Double.pi, digits: 0) }),
        "confidence": confidence.rawValue, "tracking": cameraView?.trackingState ?? "-",
        "reason": SpatialJSON.orNull(cameraView?.trackingReason),
      ])
    }

    let now = CACurrentMediaTime()
    if now - lastPoseEmit >= 0.2 {
      lastPoseEmit = now
      var payload: [String: Any] = [
        "x": SpatialJSON.number(position.x, digits: 2),
        "y": SpatialJSON.number(position.y, digits: 2),
        "z": SpatialJSON.number(position.z, digits: 2),
        "confidence": confidence.rawValue,
      ]
      if let heading = lastHeading {
        // Clockwise bearing from the map's "north" (model -Z), like a compass. `heading` itself is
        // a counter-clockwise rotation around +Y, hence the minus sign.
        var degrees = (-Double(heading) * 180 / Double.pi).truncatingRemainder(dividingBy: 360)
        if degrees < 0 { degrees += 360 }
        payload["headingDeg"] = SpatialJSON.number(degrees, digits: 0)
      } else {
        payload["headingDeg"] = NSNull()
      }
      emit("pose", payload)
    }
  }

  private func handleCameraStatusChange() {
    if cameraView?.trackingState == "limited" {
      if limitedSince == nil {
        limitedSince = CACurrentMediaTime()
      }
    } else {
      limitedSince = nil
    }
    if mode == .navigating, let camera = cameraView {
      // Back to normal tracking after ARKit had to relocalise again: the position is fresh.
      if camera.trackingState == "normal" && lastTrackingReason == "relocalizing" {
        localizedAt = Date()
      }
      lastTrackingReason = camera.trackingReason
      if currentConfidence() == .lost {
        mapView.setPinConfidence(.lost)
      }
    }
    emitState(force: false)
    if mode == .calibrating {
      emitCalibration(force: false)
    }
    if mode == .recording {
      emitRecording(force: false)
    }
  }

  private func handleCameraFailure(_ error: Error) {
    var code = "AR_FAILED"
    if let arError = error as? ARError {
      switch arError.code {
      case .cameraUnauthorized:
        code = "CAMERA_DENIED"
      case .invalidWorldMap:
        if method == "worldMap", !activeMemoryInstalled, let id = activeMemoryId, mode == .locating {
          // A zone shipped with the app that ARKit refused: skip it for this search.
          journal("memory.zone.invalid", ["id": id])
          memoryCandidates.removeAll { candidate in
            if case .zone(let zone) = candidate { return zone.id == id }
            return false
          }
          if !memoryCandidates.isEmpty {
            memoryCandidateIndex = memoryCandidateIndex % memoryCandidates.count
            DispatchQueue.main.async { [weak self] in
              guard let self = self, self.method == "worldMap" else { return }
              self.startWorldMapLocalization()
            }
            return
          }
          code = "AR_FAILED"
          break
        }
        if mode == .recording {
          // Extending the memory: ARKit did not take it this time. The venue keeps its memory.
          journal("memory.invalid", ["recording": true])
          code = "AR_FAILED"
          break
        }
        if method == "worldMap" && activeMemoryInstalled && runUsesCachedMemory && !cachedMemoryRetried {
          // The copy decoded in the background: read the memory from its file once before giving
          // up on it (after this ARKit callback).
          cachedMemoryRetried = true
          decodedMemory = nil
          journal("memory.retryFromFile")
          DispatchQueue.main.async { [weak self] in
            guard let self = self, self.method == "worldMap" else { return }
            self.startWorldMapLocalization()
          }
          return
        }
        code = "CALIBRATION_INVALID"
        forgetVisualMemory(byUser: false)
      case .worldTrackingFailed:
        code = "TRACKING_FAILED"
      case .sensorUnavailable, .sensorFailed:
        code = "SENSOR_FAILED"
      case .unsupportedConfiguration:
        code = "AR_UNSUPPORTED"
      default:
        code = "AR_FAILED"
      }
    }
    emitError(code, error.localizedDescription)
    if mode != .map {
      stopCamera(nextMode: .map)
    }
  }

  @objc private func handleCameraTap() {
    guard mode == .navigating else { return }
    cameraExpanded.toggle()
    layoutForMode(animated: true)
    emitState(force: true)
  }

  // MARK: - Calibration

  private func resetCalibrationDraft() {
    pairs.removeAll()
    pendingCameraPoint = nil
    pendingMapPoint = nil
    savingCalibration = false
  }

  private func startCalibration() {
    guard modelLoaded else {
      emitError("MODEL_NOT_READY", "The map is still loading.")
      return
    }
    withCamera { [weak self] in
      guard let self = self else { return }
      self.method = nil
      self.activeAlignment = nil
      self.trackingLost = false
      self.stopAutoLocalization()
      let camera = self.ensureCameraView()
      self.resetCalibrationDraft()
      self.mode = .calibrating
      self.localizedAt = nil
      self.cameraExpanded = false
      camera.setReticleVisible(true)
      camera.setShowsFeaturePoints(true)
      camera.run(mode: .mapping, worldMap: nil)
      self.mapView.setPin(position: nil, headingRadians: nil, confidence: .lost)
      self.mapView.setFollow(false)
      self.mapView.setViewMode(.top, animated: true)
      self.mapView.showOverview(animated: true)
      self.mapView.onMapTap = { [weak self] point in
        self?.handleMapTap(point)
      }
      self.mapView.onMapTapMissed = { [weak self] in
        self?.emitError("MAP_TAP_MISSED", "Tap on the map itself (floor or a corner of the room).")
      }
      self.layoutForMode(animated: true)
      self.refreshCalibration()
      self.emitState(force: true)
    }
  }

  private func handleMapTap(_ point: SIMD3<Float>) {
    guard mode == .calibrating, !savingCalibration else { return }
    pendingMapPoint = SIMD3<Double>(Double(point.x), Double(point.y), Double(point.z))
    if pendingCameraPoint != nil {
      confirmPair()
    } else {
      refreshCalibration()
    }
  }

  private func markCameraPoint() {
    guard mode == .calibrating, let camera = cameraView, !savingCalibration else { return }
    guard camera.trackingState == "normal" else {
      emitError("TRACKING_NOT_READY", "Move the phone slowly until tracking is ready.")
      return
    }
    guard let point = camera.raycastCenter() else {
      emitError("NO_SURFACE", "No surface under the crosshair. Aim at the floor or a wall, a bit closer.")
      return
    }
    pendingCameraPoint = SIMD3<Double>(Double(point.x), Double(point.y), Double(point.z))
    if pendingMapPoint != nil {
      confirmPair()
    } else {
      refreshCalibration()
    }
  }

  private func confirmPair() {
    guard mode == .calibrating else { return }
    guard let ar = pendingCameraPoint, let model = pendingMapPoint else {
      emitError("PAIR_INCOMPLETE", "Mark the point both in the camera and on the map.")
      return
    }
    pairs.append((ar: ar, model: model))
    if pairs.count > 12 {
      pairs.removeFirst()
    }
    pendingCameraPoint = nil
    pendingMapPoint = nil
    refreshCalibration()
  }

  private func undoCalibrationStep() {
    guard mode == .calibrating, !savingCalibration else { return }
    if pendingCameraPoint != nil || pendingMapPoint != nil {
      pendingCameraPoint = nil
      pendingMapPoint = nil
    } else if !pairs.isEmpty {
      pairs.removeLast()
    }
    refreshCalibration()
  }

  private func currentFit() -> YawAlignment? {
    guard pairs.count >= 2 else { return nil }
    return YawAlignment.solve(ar: pairs.map { $0.ar }, model: pairs.map { $0.model })
  }

  private func refreshCalibration() {
    let toFloat: (SIMD3<Double>) -> SIMD3<Float> = { SIMD3<Float>(Float($0.x), Float($0.y), Float($0.z)) }
    mapView.setCalibrationMarkers(
      confirmed: pairs.map { toFloat($0.model) },
      pending: pendingMapPoint.map(toFloat)
    )
    cameraView?.showMarkers(
      confirmed: pairs.map { toFloat($0.ar) },
      pending: pendingCameraPoint.map(toFloat)
    )
    emitCalibration(force: true)
  }

  private func calibrationPayload() -> [String: Any] {
    let ar = pairs.map { $0.ar }
    let model = pairs.map { $0.model }
    let fit = currentFit()
    let mapping = cameraView?.mappingStatus ?? "notAvailable"
    let tracking = cameraView?.trackingState ?? "notAvailable"
    var residuals: [Double] = []
    if let fit = fit {
      residuals = fit.residuals(ar: ar, model: model)
    }
    var pairList: [[String: Any]] = []
    for (index, pair) in pairs.enumerated() {
      var item: [String: Any] = [
        "ar": SpatialJSON.vector(pair.ar, digits: 2),
        "model": SpatialJSON.vector(pair.model, digits: 2),
      ]
      item["error"] = index < residuals.count ? SpatialJSON.number(residuals[index], digits: 2) : NSNull()
      pairList.append(item)
    }
    let rms = YawAlignment.rms(residuals)
    let spread = YawAlignment.horizontalSpread(ar)
    let thickness = YawAlignment.horizontalThickness(ar)
    var scale: Double?
    if let fit = fit {
      scale = YawAlignment.scaleEstimate(ar: ar, model: model, yaw: fit.yaw)
    }
    let mapReady = mapping == "mapped" || mapping == "extending"

    var warnings: [String] = []
    if pairs.count >= 2 && spread < 2.0 { warnings.append("POINTS_TOO_CLOSE") }
    if pairs.count >= 3 && thickness < 0.5 { warnings.append("POINTS_IN_LINE") }
    if let rms = rms, rms > 0.5 { warnings.append("HIGH_ERROR") }
    if let scale = scale, abs(scale - 1) > 0.1 { warnings.append("SCALE_MISMATCH") }
    if !mapReady { warnings.append("MAP_NOT_READY") }

    let canSave = mode == .calibrating && pairs.count >= 3 && fit != nil && mapReady && !savingCalibration
    var payload: [String: Any] = [
      "active": mode == .calibrating,
      "pairs": pairList,
      "pairCount": pairs.count,
      "hasPendingCamera": pendingCameraPoint != nil,
      "hasPendingMap": pendingMapPoint != nil,
      "mapping": mapping,
      "tracking": tracking,
      "saving": savingCalibration,
      "canSave": canSave,
      "warnings": warnings,
      "spread": SpatialJSON.number(spread, digits: 1),
    ]
    payload["rmsError"] = SpatialJSON.orNull(rms.map { SpatialJSON.number($0, digits: 2) })
    payload["scale"] = SpatialJSON.orNull(scale.map { SpatialJSON.number($0, digits: 3) })
    payload["yawDeg"] = SpatialJSON.orNull(fit.map { SpatialJSON.number($0.yaw * 180 / Double.pi, digits: 1) })
    return payload
  }

  private func saveCalibration() {
    guard mode == .calibrating, let camera = cameraView, !savingCalibration else { return }
    let ar = pairs.map { $0.ar }
    let model = pairs.map { $0.model }
    guard pairs.count >= 3, let fit = YawAlignment.solve(ar: ar, model: model) else {
      emitError("NEED_MORE_POINTS", "Add at least 3 point pairs.")
      return
    }
    let mapping = camera.mappingStatus
    guard mapping == "mapped" || mapping == "extending" else {
      emitError("MAP_NOT_READY", "Walk around a bit more so the camera can learn the place.")
      return
    }
    savingCalibration = true
    emitCalibration(force: true)

    let residuals = fit.residuals(ar: ar, model: model)
    let rms = YawAlignment.rms(residuals) ?? 0
    var pairRecords: [CalibrationPair] = []
    for (index, pair) in pairs.enumerated() {
      pairRecords.append(CalibrationPair(
        ar: [pair.ar.x, pair.ar.y, pair.ar.z],
        model: [pair.model.x, pair.model.y, pair.model.z],
        error: index < residuals.count ? residuals[index] : 0
      ))
    }
    let record = CalibrationRecord(
      schemaVersion: VenueStore.currentCalibrationSchema,
      venueId: venueId,
      createdAt: SpatialTime.iso8601(),
      yaw: fit.yaw,
      translation: [fit.translation.x, fit.translation.y, fit.translation.z],
      rmsError: rms,
      pairs: pairRecords,
      source: "calibration"
    )
    let modelToAR = fit.matrixFloat.inverse
    let storeAtStart = store
    camera.captureWorldMap(modelToAR: modelToAR) { [weak self] result in
      guard let self = self else { return }
      self.savingCalibration = false
      guard self.mode == .calibrating, storeAtStart === self.store else {
        self.emitCalibration(force: true)
        return
      }
      switch result {
      case .failure(let error):
        self.emitError("WORLDMAP_FAILED", error.localizedDescription)
        self.emitCalibration(force: true)
      case .success(let captured):
        let data = captured.data
        var saved = record
        saved.featurePoints = captured.featurePoints
        saved.device = SpatialDevice.model
        let storeRef = self.store
        self.memoryGeneration += 1
        do {
          try self.storeQueue.sync { try storeRef.save(worldMapData: data, record: saved) }
        } catch {
          self.calibration = self.storeQueue.sync { storeRef.loadCalibration() }
          self.emitError("SAVE_FAILED", error.localizedDescription)
          self.emitCalibration(force: true)
          return
        }
        self.calibration = saved
        self.emit("calibrationSaved", [
          "rmsError": SpatialJSON.number(rms, digits: 2),
          "pairs": record.pairs.count,
          "createdAt": record.createdAt,
          "worldMapBytes": data.count,
        ])
        self.finishCalibrationIntoNavigation()
      }
    }
  }

  /// The calibration session already lives in the saved map's coordinates: go straight to the map.
  private func finishCalibrationIntoNavigation() {
    guard let camera = cameraView else { return }
    resetCalibrationDraft()
    camera.setReticleVisible(false)
    camera.setShowsFeaturePoints(debugEnabled)
    camera.showMarkers(confirmed: [], pending: nil)
    camera.adoptCurrentSessionAsLocalized()
    mapView.onMapTap = nil
    mapView.onMapTapMissed = nil
    mapView.setCalibrationMarkers(confirmed: [], pending: nil)
    method = "calibration"
    mode = .navigating
    localizedAt = Date()
    mapView.setViewMode(.perspective, animated: true)
    mapView.setFollow(true)
    layoutForMode(animated: true)
    emitCalibration(force: true)
    emitState(force: true)
  }

  /// Deletes the visual memory (whatever made it: automatic, calibration, import, bundled).
  private func deleteCalibration() {
    if mode != .map {
      stopCamera(nextMode: .map)
    }
    forgetVisualMemory(byUser: true)
    mapView.setPin(position: nil, headingRadians: nil, confidence: .lost)
    emitState(force: true)
  }

  // MARK: - Visual memory

  /// `byUser`: deleted from Settings (a memory bundled in the app then stays deleted too), as
  /// opposed to a memory dropped because ARKit could not read it.
  private func forgetVisualMemory(byUser: Bool) {
    memoryGeneration += 1
    calibration = nil
    let storeRef = store
    storeQueue.async {
      if byUser {
        storeRef.dismissBundledVisualMap()
      }
      storeRef.deleteCalibration()
    }
  }

  /// `<venueId>.flyqmap` shipped in the app: installed (in the background) when it is newer than
  /// the memory on the phone.
  private func installBundledVisualMap() {
    guard let url = store.bundledVisualMapURL() else { return }
    let storeRef = store
    memoryGeneration += 1
    let generation = memoryGeneration
    storeQueue.async { [weak self] in
      let installed = VisualMapImport.installBundled(url: url, store: storeRef)
      DispatchQueue.main.async { [weak self] in
        guard let self = self, let record = installed, storeRef === self.store,
              generation == self.memoryGeneration
        else { return }
        self.memoryGeneration += 1
        self.calibration = record
        self.emitState(force: true)
      }
    }
  }

  /// Memories saved by the first version have no size yet (the LiDAR phone needs it to decide
  /// whether a new memory is better): count it once, in the background.
  private func backfillVisualMapSize() {
    guard let record = calibration, record.featurePoints == nil else { return }
    let storeRef = store
    let generation = memoryGeneration
    storeQueue.async { [weak self] in
      let updated = VisualMapImport.backfillFeaturePoints(store: storeRef)
      DispatchQueue.main.async { [weak self] in
        guard let self = self, let updated = updated, storeRef === self.store,
              generation == self.memoryGeneration
        else { return }
        self.calibration = updated
        self.emitState(force: true)
      }
    }
  }

  /// Whether the position is trustworthy enough to become the memory the other phones rely on:
  /// LiDAR match accepted and walked with for a few seconds, confirmed by the live geometry in the
  /// last seconds, ARKit tracking well, nothing else changing the memory. A memory recorded on
  /// purpose (a whole walk, the venue's own frame) is never replaced this way: only an import, a
  /// newer one in the app, or deleting it changes it. Where the place repeats itself (a corridor
  /// with identical pillars) this also keeps a wrong wall match from spreading to the others.
  private var canSaveVisualMap: Bool {
    guard SpatialCameraView.supportsMesh, method == "auto", mode == .navigating, !trackingLost,
          calibration?.anchorFrame != "recording", calibration?.source != "extended", !autoSaveBlocked,
          trackingBadStreak == 0, !visualMapSaving, !visualMapImporting, let camera = cameraView,
          camera.isRunning, camera.trackingState == "normal",
          camera.mappingStatus == "mapped" || camera.mappingStatus == "extending",
          CACurrentMediaTime() - acceptedAt >= FlyQSpatialHostView.visualMapFirstSaveDelay,
          let confirmed = geometryConfirmedAt, Date().timeIntervalSince(confirmed) < 6
    else { return false }
    return true
  }

  /// While navigating with the automatic method on a LiDAR iPhone: save the memory shortly after
  /// the match, then again as the walk extends it.
  private func maybeSaveVisualMap() {
    let now = CACurrentMediaTime()
    guard now >= nextVisualMapSave, canSaveVisualMap, let camera = cameraView,
          camera.mappingStatus == "mapped" || now - acceptedAt >= 40
    else { return }
    startVisualMapSave()
  }

  /// Captures ARKit's world map with the current alignment and stores it as the venue's memory.
  private func startVisualMapSave() {
    guard canSaveVisualMap, let camera = cameraView, let alignment = currentAlignment() else {
      endVisualMapSave(saved: false)
      return
    }
    let now = CACurrentMediaTime()
    // Within one ARKit session the AR -> model alignment only drifts by centimetres. A clearly
    // different one (a wrong match after the position was lost) must not reach the other phones.
    if let previous = sessionSavedAlignment, let cameraTransform = lastCameraTransform {
      let p = cameraTransform.columns.3
      let here = SIMD3<Double>(Double(p.x), 0, Double(p.z))
      let a = alignment.apply(here)
      let b = previous.apply(here)
      let jump = hypot(a.x - b.x, a.z - b.z)
      let turn = AutoLocalizationJudge.angleDiff(alignment.yaw, previous.yaw)
      if jump > 0.75 || turn > 5 * Double.pi / 180 {
        nextVisualMapSave = now + 30
        emit("visualMapSaveFailed", [
          "message": "alignment differs from this session's saved memory",
          "jump": SpatialJSON.number(jump, digits: 2),
          "turnDeg": SpatialJSON.number(turn * 180 / Double.pi, digits: 1),
        ])
        endVisualMapSave(saved: false)
        return
      }
    }
    visualMapSaving = true
    visualMapSaveToken += 1
    let token = visualMapSaveToken
    let storeRef = store
    let startGeneration = memoryGeneration
    // A new session's first map covers little: it replaces a bigger memory only once the walk has
    // covered about as much. Within a session every save extends the previous one. A memory made
    // by a manual calibration always gives way to the LiDAR one.
    var needed = FlyQSpatialHostView.visualMapMinFeaturePoints
    if visualMapSavesThisSession == 0, let existing = calibration, (existing.source ?? "calibration") != "calibration" {
      needed = max(needed, Int(Double(existing.featurePoints ?? 0) * 0.9))
    }
    let record = CalibrationRecord(
      schemaVersion: VenueStore.currentCalibrationSchema,
      venueId: venueId,
      createdAt: SpatialTime.iso8601(),
      yaw: alignment.yaw,
      translation: [alignment.translation.x, alignment.translation.y, alignment.translation.z],
      rmsError: 0,
      pairs: [],
      source: "auto",
      featurePoints: nil,
      device: SpatialDevice.model
    )
    emitState(force: true)
    // ARKit may never answer if the session stops meanwhile: never stay "saving" for good.
    DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
      guard let self = self, self.visualMapSaving, self.visualMapSaveToken == token else { return }
      self.visualMapSaveToken += 1
      self.nextVisualMapSave = CACurrentMediaTime() + 30
      self.emit("visualMapSaveFailed", ["message": "ARKit did not return the world map in time"])
      self.endVisualMapSave(saved: false)
    }
    camera.captureWorldMap(modelToAR: alignment.matrixFloat.inverse, minimumFeaturePoints: needed) { [weak self] result in
      guard let self = self, token == self.visualMapSaveToken else { return }
      // From here on this callback finishes the save (the watchdog stands down).
      self.visualMapSaveToken += 1
      let now = CACurrentMediaTime()
      // Deleted, imported or another venue meanwhile: what the user did wins.
      guard storeRef === self.store, startGeneration == self.memoryGeneration else {
        self.endVisualMapSave(saved: false)
        return
      }
      switch result {
      case .failure(let error):
        if let spatial = error as? SpatialError, case .worldMapTooSmall = spatial {
          // The walk has not covered enough yet: try again a bit later.
          self.nextVisualMapSave = now + 30
        } else {
          self.nextVisualMapSave = now + 15
          self.emit("visualMapSaveFailed", ["message": error.localizedDescription])
        }
        self.endVisualMapSave(saved: false)
      case .success(let captured):
        var filled = record
        filled.featurePoints = captured.featurePoints
        let saved = filled
        self.memoryGeneration += 1
        let generation = self.memoryGeneration
        let data = captured.data
        self.storeQueue.async { [weak self] in
          let failure: String?
          do {
            try storeRef.save(worldMapData: data, record: saved)
            failure = nil
          } catch {
            failure = error.localizedDescription
          }
          DispatchQueue.main.async { [weak self] in
            self?.finishVisualMapSave(saved, bytes: data.count, failure: failure, store: storeRef,
                                      generation: generation)
          }
        }
      }
    }
  }

  private func finishVisualMapSave(_ record: CalibrationRecord, bytes: Int, failure: String?, store storeRef: VenueStore,
                                   generation: Int) {
    let now = CACurrentMediaTime()
    let current = storeRef === store && generation == memoryGeneration
    if let failure = failure {
      nextVisualMapSave = now + 15
      if current {
        // A failed write can leave no memory at all on disk: mirror what is really there.
        calibration = storeQueue.sync { storeRef.loadCalibration() }
      }
      emit("visualMapSaveFailed", ["message": failure])
      endVisualMapSave(saved: false)
      return
    }
    guard current else {
      endVisualMapSave(saved: false)
      return
    }
    calibration = record
    sessionSavedAlignment = record.alignment
    visualMapSavesThisSession += 1
    nextVisualMapSave = now + (visualMapSavesThisSession < 10 ? 30 : 60)
    var payload = visualMapPayload(record)
    payload["first"] = visualMapSavesThisSession == 1
    payload["bytes"] = bytes
    emit("visualMapSaved", payload)
    endVisualMapSave(saved: true)
  }

  private func endVisualMapSave(saved: Bool) {
    visualMapSaving = false
    let waiters = visualMapSaveWaiters
    visualMapSaveWaiters.removeAll()
    emitState(force: true)
    for waiter in waiters {
      waiter(saved)
    }
  }

  /// Share sheet with the memory as a `.flyqmap` file (AirDrop, Files, Messages...). On a LiDAR
  /// iPhone that is localised right now, the freshest memory is saved first.
  private func exportVisualMap() {
    guard !visualMapExporting else { return }
    visualMapExporting = true
    emitState(force: true)
    if visualMapSaving {
      visualMapSaveWaiters.append { [weak self] _ in
        self?.writeVisualMapExport()
      }
    } else if canSaveVisualMap {
      visualMapSaveWaiters.append { [weak self] _ in
        self?.writeVisualMapExport()
      }
      startVisualMapSave()
    } else {
      writeVisualMapExport()
    }
  }

  private func writeVisualMapExport() {
    let storeRef = store
    storeQueue.async { [weak self] in
      let outcome = VisualMapExport.write(store: storeRef)
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        self.visualMapExporting = false
        switch outcome {
        case .nothing:
          self.emitError("VISUAL_MAP_NONE", "There is no visual memory on this phone yet.")
        case .failure(let message):
          self.emitError("VISUAL_MAP_EXPORT_FAILED", message)
        case .file(let url):
          self.presentShareSheet(url)
        }
        self.emitState(force: true)
      }
    }
  }

  private func presentShareSheet(_ url: URL, event: String = "visualMapExport") {
    guard let presenter = presentingController() else {
      emitError("VISUAL_MAP_EXPORT_FAILED", "The share sheet could not be opened.")
      return
    }
    let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
    sheet.completionWithItemsHandler = { [weak self] activity, completed, _, error in
      let activityName = activity?.rawValue
      let status = completed ? "shared" : (error != nil ? "failed" : "cancelled")
      DispatchQueue.main.async { [weak self] in
        var payload: [String: Any] = ["status": status]
        payload["activity"] = SpatialJSON.orNull(activityName)
        self?.emit(event, payload)
      }
    }
    if let popover = sheet.popoverPresentationController {
      let area = presenter.view.bounds
      popover.sourceView = presenter.view
      popover.sourceRect = CGRect(x: area.midX, y: area.maxY - 40, width: 1, height: 1)
      popover.permittedArrowDirections = []
    }
    presenter.present(sheet, animated: true, completion: nil)
  }

  /// File picker for a `.flyqmap` received from another phone (AirDrop lands in Files > Downloads).
  private func importVisualMap() {
    guard !visualMapImporting else { return }
    guard let presenter = presentingController() else {
      emitError("VISUAL_MAP_IMPORT_FAILED", "The file picker could not be opened.")
      return
    }
    // A quick double tap must not stack two pickers.
    if presenter is UIDocumentPickerViewController { return }
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.item], asCopy: true)
    picker.allowsMultipleSelection = false
    let delegate = VisualMapPickerDelegate { [weak self] url in
      DispatchQueue.main.async { [weak self] in
        self?.handlePickedVisualMap(url)
      }
    }
    pickerDelegate = delegate
    picker.delegate = delegate
    presenter.present(picker, animated: true, completion: nil)
  }

  private func handlePickedVisualMap(_ url: URL?) {
    pickerDelegate = nil
    guard let url = url else {
      emit("visualMapImport", ["status": "cancelled"])
      return
    }
    guard !visualMapImporting else { return }
    // Stops a save in flight from landing after (and over) the import, and new saves from starting.
    visualMapImporting = true
    memoryGeneration += 1
    let generation = memoryGeneration
    let storeRef = store
    let venue = venueId
    emitState(force: true)
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      // Check everything first (decoding a world map takes a moment), store it from the main thread.
      let outcome = VisualMapImport.read(url: url, venueId: venue)
      VisualMapExport.removeTemporaryCopy(url)
      DispatchQueue.main.async { [weak self] in
        self?.storeImportedVisualMap(outcome, store: storeRef, generation: generation)
      }
    }
  }

  private func storeImportedVisualMap(_ outcome: VisualMapImport.Outcome, store storeRef: VenueStore,
                                      generation: Int) {
    switch outcome {
    case .failure(let code, let message):
      finishVisualMapImport(record: nil, failureCode: code, failureMessage: message, store: storeRef,
                            generation: generation)
    case .success(let package):
      // Deleted, or another venue, while the file was being checked: what came later wins.
      guard storeRef === store, generation == memoryGeneration else {
        finishVisualMapImport(record: nil, failureCode: nil, failureMessage: nil, store: storeRef,
                              generation: generation)
        return
      }
      memoryGeneration += 1
      let writeGeneration = memoryGeneration
      storeQueue.async { [weak self] in
        let record: CalibrationRecord?
        let failure: String?
        do {
          record = try storeRef.importPackage(package, source: "import")
          failure = nil
        } catch {
          record = nil
          failure = error.localizedDescription
        }
        DispatchQueue.main.async { [weak self] in
          self?.finishVisualMapImport(record: record, failureCode: failure == nil ? nil : "VISUAL_MAP_SAVE_FAILED",
                                      failureMessage: failure, store: storeRef, generation: writeGeneration)
        }
      }
    }
  }

  private func finishVisualMapImport(record: CalibrationRecord?, failureCode: String?, failureMessage: String?,
                                     store storeRef: VenueStore, generation: Int) {
    visualMapImporting = false
    let current = storeRef === store && generation == memoryGeneration
    if let code = failureCode {
      if current && code == "VISUAL_MAP_SAVE_FAILED" {
        calibration = storeQueue.sync { storeRef.loadCalibration() }
      }
      emitError(code, failureMessage ?? "The visual memory could not be imported.")
    } else if let record = record, current {
      calibration = record
      // A LiDAR phone replaces an imported memory only once its own walk covers about as much,
      // and its alignment no longer has to match this session's earlier saves.
      visualMapSavesThisSession = 0
      sessionSavedAlignment = nil
      var payload = visualMapPayload(record)
      payload["status"] = "imported"
      emit("visualMapImport", payload)
      // A memory search in progress switches to the new memory right away.
      if mode == .locating && method == "worldMap" {
        startWorldMapLocalization()
      }
    }
    emitState(force: true)
  }

  /// The view controller on top (the settings sheet, if open) to present system sheets from.
  private func presentingController() -> UIViewController? {
    var root = window?.rootViewController
    if root == nil {
      let windows = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }
      root = (windows.first(where: { $0.isKeyWindow }) ?? windows.first)?.rootViewController
    }
    var top = root
    while let presented = top?.presentedViewController, !presented.isBeingDismissed {
      top = presented
    }
    return top
  }

  private func visualMapPayload(_ record: CalibrationRecord) -> [String: Any] {
    var info: [String: Any] = [
      "createdAt": record.createdAt,
      "source": record.source ?? "calibration",
    ]
    info["featurePoints"] = SpatialJSON.orNull(record.featurePoints)
    info["device"] = SpatialJSON.orNull(record.device)
    info["recorded"] = record.anchorFrame == "recording"
    return info
  }

  // MARK: - Recording a visual memory (venue without a map yet)

  /// LiDAR iPhone, camera full screen: walk the place, the app keeps the world map and the walls
  /// (SpatialRecording.swift). Works whatever venue is loaded; nothing needs the model.
  /// `extend`: start from the venue's visual memory instead of from nothing. Once ARKit recognises
  /// the place the walk is recorded in the memory's coordinates, and the result (old memory + what
  /// this walk saw: other routes, other light) becomes the venue's memory.
  private func startRecording(extend: Bool = false) {
    guard mode != .recording else { return }
    guard SpatialCameraView.supportsMesh else {
      emitError("RECORDING_NEEDS_LIDAR", "Recording a visual memory needs an iPhone with LiDAR.")
      return
    }
    var base: CalibrationRecord?
    var baseMap: ARWorldMap?
    if extend {
      guard let record = calibration else {
        emitError("VISUAL_MAP_NONE", "There is no visual memory for this place on this phone.")
        return
      }
      baseMap = takeDecodedMemory(record)?.map
      guard baseMap != nil else {
        emitError("CALIBRATION_INVALID", "The saved visual memory could not be read.")
        return
      }
      base = record
    }
    if let free = FlyQSpatialHostView.freeDiskBytes(), free < 300 * 1024 * 1024 {
      emit("hint", ["code": "REC_LOW_STORAGE"])
    }
    withCamera { [weak self] in
      guard let self = self else { return }
      let camera = self.ensureCameraView()
      self.clearCalibrationUI()
      self.stopAutoLocalization()
      self.method = nil
      self.activeAlignment = nil
      self.trackingLost = false
      self.mode = .recording
      self.localizedAt = nil
      self.cameraExpanded = false
      self.recordingToken += 1
      self.recordingBase = base
      self.recordingWaitingForMemory = base != nil
      // An extension starts counting once the memory has been recognised.
      self.recordingStartedAt = base == nil ? Date() : nil
      self.recordingCreatedAt = SpatialTime.iso8601()
      self.recordingPath = []
      self.recordingDistance = 0
      self.recordingCells = 0
      self.recordingSaving = false
      self.recordingCheckpointing = false
      self.pendingFinalSave = false
      self.lastCheckpoint = CACurrentMediaTime()
      self.lastCheckpointAt = nil
      self.preservePartialRecording()
      self.mapView.setPin(position: nil, headingRadians: nil, confidence: .lost)
      camera.setReticleVisible(false)
      camera.setShowsFeaturePoints(self.debugEnabled)
      if let map = baseMap {
        camera.run(mode: .relocalizing, worldMap: map)
        camera.setMeshOverlay(visible: false)
      } else {
        camera.run(mode: .scanning, worldMap: nil)
        camera.setMeshOverlay(visible: true)
      }
      self.journal("recording.start", ["extend": base != nil,
                                       "base": SpatialJSON.orNull(base.map { self.journalMemory($0) })])
      self.layoutForMode(animated: true)
      self.emitState(force: true)
      self.emitRecording(force: true)
    }
  }

  /// Extension: ARKit recognised the memory. The same session starts meshing and the walk counts
  /// from here, in the memory's coordinates.
  private func handleRecordingRelocalized() {
    guard recordingWaitingForMemory else { return }
    let token = recordingToken
    DispatchQueue.main.async { [weak self] in
      guard let self = self, self.mode == .recording, self.recordingWaitingForMemory, token == self.recordingToken,
            let camera = self.cameraView, camera.enableMeshing()
      else { return }
      self.recordingWaitingForMemory = false
      self.recordingStartedAt = Date()
      self.recordingPath = []
      self.recordingDistance = 0
      self.lastCheckpoint = CACurrentMediaTime()
      camera.setMeshOverlay(visible: true)
      self.journal("recording.recognised")
      self.emitRecording(force: true)
    }
  }

  private func recordingSeconds() -> Double {
    return recordingStartedAt.map { Date().timeIntervalSince($0) } ?? 0
  }

  /// Every camera frame while recording: the walked path (a point every 25 cm) and, once a
  /// minute, a checkpoint on disk.
  private func recordFrame(_ transform: simd_float4x4) {
    if cameraView?.trackingState == "normal" && !recordingWaitingForMemory {
      let p = SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
      if let last = recordingPath.last {
        let dx = p.x - last.x
        let dz = p.z - last.z
        let step = (dx * dx + dz * dz).squareRoot()
        if step >= 0.25 {
          // A jump means ARKit corrected itself, not that the user teleported.
          if step < 3 {
            recordingDistance += Double(step)
          }
          recordingPath.append(p)
        }
      } else {
        recordingPath.append(p)
      }
      maybeCheckpointRecording()
    }
    if CACurrentMediaTime() - lastRecordingEmit >= 0.5 {
      emitRecording(force: false)
    }
    if let camera = cameraView {
      journalTick(camera)
    }
  }

  private func maybeCheckpointRecording() {
    let now = CACurrentMediaTime()
    guard mode == .recording, !recordingSaving, !recordingCheckpointing, !recordingWaitingForMemory,
          now - lastCheckpoint >= FlyQSpatialHostView.checkpointInterval,
          let camera = cameraView, camera.mappingStatus == "mapped" || camera.mappingStatus == "extending"
    else { return }
    lastCheckpoint = now
    writeRecording(final: false)
  }

  /// Leaving the app (call, lock, Control Centre): keep what was walked so far.
  private func handleWillResignActive() {
    guard mode == .recording, !recordingSaving, !recordingCheckpointing, recordingPath.count >= 4 else { return }
    lastCheckpoint = CACurrentMediaTime()
    writeRecording(final: false)
  }

  private func saveRecording() {
    guard mode == .recording, !recordingSaving, let camera = cameraView else { return }
    guard !recordingWaitingForMemory else {
      emitError("RECORDING_NOT_RECOGNISED", "The visual memory has not recognised the place yet.")
      return
    }
    guard RecordingCoach.canSave(mapping: camera.mappingStatus, seconds: recordingSeconds(),
                                 distance: recordingDistance)
    else {
      emitError("RECORDING_TOO_SHORT", "Walk a bit more before saving.")
      return
    }
    if recordingCheckpointing {
      // One world map at a time: save right after the checkpoint in flight.
      pendingFinalSave = true
      recordingSaving = true
      emitRecording(force: true)
      return
    }
    writeRecording(final: true)
  }

  /// World map (origin anchor at the recording's origin) + walls of the whole walk -> one file.
  /// An extension keeps the memory's anchor where ARKit restored it (same meaning, same alignment)
  /// and is checked against the venue's localisation map.
  private func writeRecording(final: Bool) {
    guard let camera = cameraView else { return }
    var originToAR = matrix_identity_float4x4
    var baseInfo: VisualMapPackage.Info?
    var toModel: (yaw: Double, tx: Double, tz: Double)?
    var baseFeatures: Int?
    if let base = recordingBase {
      guard let anchor = camera.originAnchorTransform(), let alignment = base.alignment else {
        // Nothing gets written: a save waiting for this checkpoint must not stay blocked.
        if final || pendingFinalSave {
          emitError("RECORDING_FAILED", "The visual memory's origin is missing from the session.")
        }
        recordingSaving = false
        recordingCheckpointing = false
        pendingFinalSave = false
        emitRecording(force: true)
        return
      }
      baseFeatures = base.featurePoints
      originToAR = anchor
      baseInfo = base.packageInfo
      let m = base.anchorFrame == "recording" ? alignment.matrixFloat * anchor.inverse : anchor.inverse
      toModel = (yaw: atan2(Double(m.columns.2.x), Double(m.columns.0.x)), tx: Double(m.columns.3.x),
                 tz: Double(m.columns.3.z))
    }
    let checkMap = locMap
    let extensionInfo = baseInfo
    let modelTransform = toModel
    let baseFeaturePoints = baseFeatures
    let chunks = camera.captureAllMeshChunks()
    if final {
      recordingSaving = true
    } else {
      recordingCheckpointing = true
    }
    emitRecording(force: true)
    let referenceY = RecordingGeometryBuilder.median(recordingPath.map { $0.y })
      ?? (lastCameraTransform?.columns.3.y ?? 0)
    var flatPath: [Float] = []
    flatPath.reserveCapacity(recordingPath.count * 2)
    for p in recordingPath {
      flatPath.append(p.x)
      flatPath.append(p.z)
    }
    let path = flatPath
    let seconds = recordingSeconds()
    let distance = recordingDistance
    let createdAt = recordingCreatedAt
    let device = SpatialDevice.model
    let token = recordingToken
    camera.captureWorldMap(modelToAR: originToAR, minimumFeaturePoints: 50) { [weak self] result in
      switch result {
      case .failure(let error):
        let message = error.localizedDescription
        self?.finishRecordingWrite(final: final, token: token, saved: nil, verified: false, cells: 0, failure: message)
      case .success(let captured):
        let data = captured.data
        let featurePoints = captured.featurePoints
        let queue = self?.storeQueue
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
          let geometry = RecordingGeometryBuilder.build(chunks: chunks, referenceY: referenceY, path: path,
                                                        seconds: seconds, distance: distance)
          var agreement: (share: Double, sampled: Int)?
          if let t = modelTransform, let map = checkMap {
            agreement = RecordingCheck.wallAgreement(geometry, map: map, yaw: t.yaw, tx: t.tx, tz: t.tz)
          }
          let check = agreement
          // Files only on the store queue: never at the same time as a checkpoint promotion.
          (queue ?? DispatchQueue.global(qos: .userInitiated)).async { [weak self] in
            let outcome = VisualMapImport.storeRecording(geometry: geometry, worldMap: data,
                                                         featurePoints: featurePoints, createdAt: createdAt,
                                                         device: device, final: final, base: extensionInfo)
            DispatchQueue.main.async { [weak self] in
              self?.finishRecordingWrite(final: final, token: token, saved: outcome.saved,
                                         verified: outcome.verified, cells: geometry.cellCount,
                                         failure: outcome.failure, extending: extensionInfo != nil,
                                         agreement: check, baseFeaturePoints: baseFeaturePoints)
            }
          }
        }
      }
    }
  }

  private func finishRecordingWrite(final: Bool, token: Int, saved: RecordingFiles.Saved?, verified: Bool, cells: Int,
                                    failure: String?, extending: Bool = false,
                                    agreement: (share: Double, sampled: Int)? = nil, baseFeaturePoints: Int? = nil) {
    if final {
      recordingSaving = false
    } else {
      recordingCheckpointing = false
    }
    if saved != nil {
      refreshRecordings()
    }
    let current = token == recordingToken && mode == .recording
    if !final {
      if current, saved != nil {
        recordingCells = cells
        lastCheckpointAt = Date()
      }
      if current && pendingFinalSave {
        pendingFinalSave = false
        writeRecording(final: true)
        return
      }
      if current {
        emitRecording(force: true)
      }
      return
    }
    guard let saved = saved, verified, failure == nil else {
      // Stay in the recording: the user can walk on and save again (the checkpoint is kept).
      emitError("RECORDING_FAILED", failure ?? RecordingError.verificationFailed.description)
      if current {
        emitRecording(force: true)
      }
      return
    }
    var payload = recordingPayload(saved)
    payload["verified"] = true
    if extending {
      payload["agreement"] = SpatialJSON.orNull(agreement.map { SpatialJSON.number($0.share, digits: 2) })
    }
    emit("recordingSaved", payload)
    if current {
      stopCamera(nextMode: .map)
    }
    if extending && current {
      // The walk must agree with the venue's map, and the new world map must still hold the old
      // memory (about as many points or more), before it becomes the memory everyone uses.
      let share = agreement?.share ?? 0
      let sampled = agreement?.sampled ?? 0
      let checked = locMap != nil
      let points = saved.info.featurePoints ?? 0
      let enoughPoints = baseFeaturePoints.map { points >= Int(Double($0) * 0.9) } ?? true
      journal("recording.extension", ["share": SpatialJSON.number(share, digits: 2), "cells": sampled,
                                      "featurePoints": points, "baseFeaturePoints": SpatialJSON.orNull(baseFeaturePoints)])
      if !enoughPoints {
        emit("memoryExtended", ["status": "smaller", "featurePoints": points,
                                "baseFeaturePoints": SpatialJSON.orNull(baseFeaturePoints)])
      } else if !checked || (sampled >= 200 && share >= 0.5) {
        installExtendedMemory(saved.url, share: checked ? share : nil)
      } else {
        emit("memoryExtended", ["status": "mismatch", "share": SpatialJSON.number(share, digits: 2),
                                "cells": sampled])
      }
    }
    // Straight to the share sheet (AirDrop to the Mac); the file stays on the phone anyway.
    presentShareSheet(saved.url, event: "recordingExport")
  }

  /// An extension that agrees with the venue's map becomes this phone's memory of the venue.
  private func installExtendedMemory(_ url: URL, share: Double?) {
    let storeRef = store
    let venue = venueId
    memoryGeneration += 1
    let generation = memoryGeneration
    storeQueue.async { [weak self] in
      let (record, failure) = VisualMapImport.importExtension(url, venueId: venue, store: storeRef)
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        guard let record = record, storeRef === self.store, generation == self.memoryGeneration else {
          self.emit("memoryExtended", ["status": "failed", "message": failure ?? "changed meanwhile"])
          return
        }
        self.memoryGeneration += 1
        self.calibration = record
        var payload = self.visualMapPayload(record)
        payload["status"] = "installed"
        payload["share"] = SpatialJSON.orNull(share.map { SpatialJSON.number($0, digits: 2) })
        self.emit("memoryExtended", payload)
        self.emitState(force: true)
      }
    }
  }

  private func exportRecording(file: String?) {
    let match = recordings.first { file == nil || $0.url.lastPathComponent == file }
    guard let recording = match else {
      emitError("RECORDING_NONE", "There is no recording on this phone yet.")
      return
    }
    presentShareSheet(recording.url, event: "recordingExport")
  }

  /// The last checkpoint of a walk that was not saved becomes a recording of its own.
  private func preservePartialRecording() {
    storeQueue.async { [weak self] in
      RecordingFiles.promoteCheckpoint()
      let list = RecordingFiles.list()
      DispatchQueue.main.async { [weak self] in
        self?.recordings = list
        self?.emitState(force: true)
      }
    }
  }

  private func refreshRecordings() {
    storeQueue.async { [weak self] in
      let list = RecordingFiles.list()
      DispatchQueue.main.async { [weak self] in
        self?.recordings = list
        self?.emitState(force: true)
      }
    }
  }

  private func recordingPayload(_ saved: RecordingFiles.Saved) -> [String: Any] {
    var item: [String: Any] = [
      "file": saved.url.lastPathComponent,
      "createdAt": saved.info.createdAt,
      "bytes": saved.bytes,
      "inProgress": RecordingFiles.isPartial(saved.url),
    ]
    item["featurePoints"] = SpatialJSON.orNull(saved.info.featurePoints)
    if let geometry = saved.info.recording {
      item["cells"] = geometry.cellCount
      item["seconds"] = SpatialJSON.number(geometry.seconds, digits: 0)
      item["distance"] = SpatialJSON.number(geometry.distance, digits: 0)
    }
    return item
  }

  /// Progress of a recording (the panel shows time, distance, quality and one hint).
  private func emitRecording(force: Bool) {
    let active = mode == .recording
    let seconds = active ? recordingSeconds() : 0
    let mapping = cameraView?.mappingStatus ?? "notAvailable"
    let tracking = cameraView?.trackingState ?? "notAvailable"
    var payload: [String: Any] = [
      "active": active,
      "saving": recordingSaving,
      "checkpointing": recordingCheckpointing,
      "seconds": SpatialJSON.number(seconds, digits: 0),
      "distance": SpatialJSON.number(recordingDistance, digits: 0),
      "mapping": mapping,
      "tracking": tracking,
      "meshAnchors": active ? (cameraView?.meshAnchorCount() ?? 0) : 0,
      "cells": recordingCells,
      "canSave": active && !recordingSaving
        && RecordingCoach.canSave(mapping: mapping, seconds: seconds, distance: recordingDistance),
    ]
    payload["extending"] = active && recordingBase != nil
    payload["waiting"] = active && recordingWaitingForMemory
    if active && recordingWaitingForMemory {
      payload["hint"] = "REC_FIND_MEMORY"
      payload["canSave"] = false
    } else {
      payload["hint"] = active
        ? RecordingCoach.hint(trackingState: tracking, trackingReason: cameraView?.trackingReason, mapping: mapping,
                              seconds: seconds, distance: recordingDistance).rawValue
        : NSNull()
    }
    payload["checkpointAgo"] = SpatialJSON.orNull(
      active ? lastCheckpointAt.map { SpatialJSON.number(Date().timeIntervalSince($0), digits: 0) } : nil
    )
    lastRecordingEmit = CACurrentMediaTime()
    let json = SpatialJSON.encode(payload)
    if !force && json == lastRecordingJSON {
      return
    }
    lastRecordingJSON = json
    onEvent?("recording", json)
  }

  private static func freeDiskBytes() -> Int64? {
    let home = URL(fileURLWithPath: NSHomeDirectory())
    guard let values = try? home.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]) else {
      return nil
    }
    return values.volumeAvailableCapacityForImportantUsage
  }

  // MARK: - Layout

  private func layoutForMode(animated: Bool) {
    let b = bounds
    // The map stops just under the bottom panel's rounded top edge (16 pt overlap), so the area
    // it shows (and the followed pin, which sits in its centre) is never hidden by the panel.
    let bottomCover = min(max(0, overlayBottom - 16), b.height * 0.6)
    let topCover = max(safeAreaInsets.top + 56, overlayTop)
    var mapFrame = CGRect(x: 0, y: 0, width: b.width, height: max(120, b.height - bottomCover))
    var cameraFrame = CGRect(x: b.width - 24, y: topCover + 8, width: 1, height: 1)
    var cameraVisible = false
    var radius: CGFloat = 0
    var border: CGFloat = 0

    switch mode {
    case .map:
      cameraVisible = false
    case .locating, .recording:
      cameraFrame = b
      cameraVisible = true
    case .navigating:
      cameraVisible = true
      if cameraExpanded {
        cameraFrame = b
      } else {
        let width = min(b.width * 0.3, 132)
        let height = width * 4 / 3
        cameraFrame = CGRect(x: b.width - width - 12, y: topCover + 8, width: width, height: height)
        radius = 14
        border = 2
      }
    case .calibrating:
      let cameraHeight = floor(b.height * 0.40)
      cameraFrame = CGRect(x: 0, y: 0, width: b.width, height: cameraHeight)
      let mapHeight = max(120, b.height - cameraHeight - bottomCover)
      mapFrame = CGRect(x: 0, y: cameraHeight, width: b.width, height: mapHeight)
      cameraVisible = true
    }

    cameraContainer.isUserInteractionEnabled = cameraVisible
    let changes = {
      self.mapView.frame = mapFrame
      self.cameraContainer.frame = cameraFrame
      self.cameraContainer.layer.cornerRadius = radius
      self.cameraContainer.layer.borderWidth = border
      self.cameraContainer.alpha = cameraVisible ? 1 : 0
    }
    if animated && window != nil {
      UIView.animate(
        withDuration: 0.35,
        delay: 0,
        options: [.curveEaseInOut, .beginFromCurrentState, .allowUserInteraction],
        animations: changes,
        completion: nil
      )
    } else {
      changes()
    }
  }

  // MARK: - Events

  // MARK: - Test journal

  private func journal(_ kind: String, _ fields: [String: Any] = [:]) {
    var line = fields
    line["venue"] = venueId
    line["mode"] = mode.rawValue
    if line["method"] == nil {
      line["method"] = SpatialJSON.orNull(method)
    }
    SpatialJournal.shared.log(kind, line)
  }

  private func journalMemory(_ record: CalibrationRecord) -> [String: Any] {
    return [
      "createdAt": record.createdAt, "source": record.source ?? "calibration",
      "featurePoints": SpatialJSON.orNull(record.featurePoints), "device": SpatialJSON.orNull(record.device),
      "anchorFrame": SpatialJSON.orNull(record.anchorFrame),
    ]
  }

  /// Once a second while searching (or recording): what the camera and ARKit are doing and what
  /// the user is told.
  private func journalTick(_ camera: SpatialCameraView) {
    let now = CACurrentMediaTime()
    guard now - lastJournalTick >= 1, mode == .locating || trackingLost || mode == .recording else { return }
    lastJournalTick = now
    var line: [String: Any] = [
      "tracking": camera.trackingState, "reason": SpatialJSON.orNull(camera.trackingReason),
      "mapping": camera.mappingStatus, "relocalized": camera.relocalized,
      "features": SpatialJSON.number(camera.featureLevel, digits: 0),
      "coverage": SpatialJSON.number(coverage.fraction, digits: 2),
      "hint": SpatialJSON.orNull(lastHint?.rawValue), "attempts": autoAttempts,
      "elapsed": SpatialJSON.orNull(autoStartedAt.map { SpatialJSON.number(Date().timeIntervalSince($0), digits: 1) }),
      "only": singleMethodSearch, "lost": trackingLost,
    ]
    if let t = lastCameraTransform {
      let p = t.columns.3
      let f = t.columns.2
      line["camAR"] = [SpatialJSON.number(p.x, digits: 2), SpatialJSON.number(p.y, digits: 2),
                       SpatialJSON.number(p.z, digits: 2)]
      let length = (f.x * f.x + f.y * f.y + f.z * f.z).squareRoot()
      if length > 1e-6 {
        line["pitch"] = SpatialJSON.number(-f.y / length, digits: 2)
      }
    }
    journal("tick", line)
  }

  /// A wall match: its numbers, where it puts the camera and (global searches) the scan itself,
  /// so the matcher can be replayed offline (tools/autoloc/journal_report.py).
  private func journalWalls(_ kind: String, scan: LiveScan?, result: RegistrationResult?, verdict: String?,
                            cells: Bool = true, extra: [String: Any] = [:]) {
    var line: [String: Any] = extra
    line["verdict"] = SpatialJSON.orNull(verdict)
    if let scan = scan {
      line["n"] = scan.points.count
      line["floor"] = SpatialJSON.number(scan.floorY, digits: 3)
      line["floorSource"] = scan.floorSource
      line["source"] = scan.source
      line["camAR"] = [SpatialJSON.number(scan.camera.x, digits: 3), SpatialJSON.number(scan.camera.y, digits: 3)]
      if cells && !scan.points.isEmpty {
        line["cells"] = SpatialJournal.packCells(scan.points, camera: scan.camera)
      }
    }
    if let r = result {
      line["score"] = SpatialJSON.number(r.score, digits: 3)
      line["amb"] = SpatialJSON.number(r.ambiguity, digits: 3)
      line["inliers"] = SpatialJSON.number(r.inliers, digits: 3)
      line["yaw"] = SpatialJSON.number(r.yaw, digits: 4)
      line["tx"] = SpatialJSON.number(r.tx, digits: 3)
      line["tz"] = SpatialJSON.number(r.tz, digits: 3)
      line["points"] = r.pointCount
      if let scan = scan {
        let c = r.apply(x: Double(scan.camera.x), z: Double(scan.camera.y))
        line["cam"] = [SpatialJSON.number(c.x, digits: 2), SpatialJSON.number(c.z, digits: 2)]
      }
    }
    journal(kind, line)
  }

  /// Settings > "Send the test journal": every journal file as one .jsonl, to the share sheet.
  private func exportJournal() {
    journal("journal.export")
    SpatialJournal.shared.exportFile { [weak self] url in
      guard let self = self else { return }
      guard let url = url else {
        self.emitError("JOURNAL_EMPTY", "The test journal is empty.")
        return
      }
      self.presentShareSheet(url, event: "journalExport")
    }
  }

  private func emit(_ name: String, _ payload: [String: Any]) {
    onEvent?(name, SpatialJSON.encode(payload))
    if FlyQSpatialHostView.journalEvents.contains(name) {
      journal("event." + name, payload)
    }
  }

  private static let journalEvents: Set<String> = [
    "hint", "error", "visualMapSaved", "visualMapSaveFailed", "visualMapImport", "visualMapExport",
    "recordingSaved", "recordingExport", "calibrationSaved", "journalExport",
  ]

  private func emitError(_ code: String, _ message: String) {
    emit("error", ["code": code, "message": message])
  }

  private func emitVenue() {
    var payload: [String: Any] = [
      "venueId": venueId,
      "modelLoaded": modelLoaded,
      "modelLoading": modelLoading,
      "found": manifest != nil,
    ]
    payload["venues"] = VenueStore.bundledVenues.map { option -> [String: Any] in
      let name: [String: Any] = ["ro": SpatialJSON.orNull(option.nameRo), "en": SpatialJSON.orNull(option.nameEn)]
      return ["id": option.id, "name": name]
    }
    if let m = manifest {
      let name: [String: Any] = ["ro": SpatialJSON.orNull(m.name?.ro), "en": SpatialJSON.orNull(m.name?.en)]
      payload["name"] = name
      payload["triangles"] = SpatialJSON.orNull(m.model.triangles)
      if let mn = m.boundsMin, let mx = m.boundsMax {
        let size: [Any] = [
          SpatialJSON.number(mx.x - mn.x, digits: 1),
          SpatialJSON.number(mx.y - mn.y, digits: 1),
          SpatialJSON.number(mx.z - mn.z, digits: 1),
        ]
        payload["size"] = size
      }
    }
    emit("venue", payload)
  }

  private func emitState(force: Bool) {
    var payload: [String: Any] = [
      "mode": mode.rawValue,
      "venueId": venueId,
      "modelLoaded": modelLoaded,
      "hasCalibration": calibration != nil,
      "arSupported": SpatialCameraView.isSupported,
      "arRunning": cameraView?.isRunning ?? false,
      "tracking": cameraView?.trackingState ?? "notAvailable",
      "mapping": cameraView?.mappingStatus ?? "notAvailable",
      "relocalized": cameraView?.relocalized ?? false,
      "confidence": currentConfidence().rawValue,
      "follow": mapView.followUser,
      "viewMode": mapView.viewMode.rawValue,
      "cameraExpanded": cameraExpanded,
      "cameraPermission": cameraPermission(),
      "autoAvailable": autoAvailable,
      "lidar": SpatialCameraView.supportsMesh,
      "trackingLost": trackingLost,
    ]
    payload["trackingReason"] = SpatialJSON.orNull(cameraView?.trackingReason)
    payload["method"] = SpatialJSON.orNull(method)
    if let record = calibration {
      let info: [String: Any] = [
        "createdAt": record.createdAt,
        "rmsError": SpatialJSON.number(record.rmsError, digits: 2),
        "pairs": record.pairs.count,
        "source": record.source ?? "calibration",
      ]
      payload["calibration"] = info
      payload["visualMap"] = visualMapPayload(record)
    } else {
      payload["calibration"] = NSNull()
      payload["visualMap"] = NSNull()
    }
    payload["visualMapSaving"] = visualMapSaving
    payload["visualMapBusy"] = visualMapImporting || visualMapExporting
    payload["canRecord"] = SpatialCameraView.supportsMesh
    payload["canExtend"] = SpatialCameraView.supportsMesh && calibration != nil && modelLoaded
    payload["memoryZones"] = memoryZones.count
    payload["canReplay"] = modelLoaded && replayURL() != nil
    payload["replaying"] = replayTimer != nil
    payload["placeMode"] = placeMode
    payload["placed"] = simPos != nil
    payload["walking"] = walkTimer != nil
    payload["route"] = routePayload()
    payload["places"] = placesPayload()
    payload["nearby"] = nearbyPayload()
    payload["memoryCheck"] = memoryWallCheck
    payload["mapView"] = mapViewPayload()
    payload["mapPreference"] = mapPreference.rawValue
    payload["device"] = devicePayload()
    // The newest 12: a venue scanned in pieces, each sent later from Settings.
    payload["recordings"] = recordings.prefix(12).map { recordingPayload($0) }
    let json = SpatialJSON.encode(payload)
    if !force && json == lastStateJSON {
      return
    }
    lastStateJSON = json
    onEvent?("state", json)
  }

  private func emitCalibration(force: Bool) {
    let json = SpatialJSON.encode(calibrationPayload())
    if !force && json == lastCalibrationJSON {
      return
    }
    lastCalibrationJSON = json
    onEvent?("calibration", json)
  }

  /// Progress of the automatic localisation (hint for the user, numbers for the debug panel).
  private func emitAuto(force: Bool) {
    let guided = method == "worldMap" && mode == .locating
    let active = (method == "auto" && (mode == .locating || trackingLost)) || guided
    let elapsed = autoStartedAt.map { Date().timeIntervalSince($0) } ?? 0
    var payload: [String: Any] = [
      "active": active,
      "available": autoAvailable,
      "lidar": SpatialCameraView.supportsMesh,
      "attempts": autoAttempts,
      "coverage": SpatialJSON.number(coverage.fraction, digits: 2),
      "searching": autoBusy,
    ]
    let points = lastScan?.points.count ?? 0
    payload["points"] = points
    payload["hint"] = SpatialJSON.orNull(active ? lastHint?.rawValue : nil)
    payload["verdict"] = SpatialJSON.orNull(lastVerdict?.rawValue)
    var progress = 0.0
    if guided {
      progress = AutoLocalizationCoach.relocalizationProgress(coverage: coverage.fraction, elapsed: elapsed)
    } else if active {
      progress = AutoLocalizationCoach.progress(points: points, coverage: coverage.fraction, result: lastMatch,
                                                verdict: lastVerdict)
    }
    payload["progress"] = SpatialJSON.number(progress, digits: 2)
    payload["method"] = SpatialJSON.orNull(method)
    payload["source"] = SpatialJSON.orNull(lastScan?.source)
    payload["fallbackIn"] = guided && autoAvailable && !singleMethodSearch
      ? SpatialJSON.number(max(0, worldMapFallbackAfter - elapsed), digits: 0)
      : NSNull()
    payload["only"] = active && singleMethodSearch
    payload["score"] = SpatialJSON.orNull(lastMatch.map { SpatialJSON.number($0.score, digits: 2) })
    payload["ambiguity"] = SpatialJSON.orNull(lastMatch.map { SpatialJSON.number($0.ambiguity, digits: 2) })
    payload["inliers"] = SpatialJSON.orNull(lastMatch.map { SpatialJSON.number($0.inliers, digits: 2) })
    payload["floorSource"] = SpatialJSON.orNull(lastScan?.floorSource)
    payload["elapsed"] = active && autoStartedAt != nil ? SpatialJSON.number(elapsed, digits: 0) : NSNull()
    let json = SpatialJSON.encode(payload)
    if !force && json == lastAutoJSON {
      return
    }
    lastAutoJSON = json
    onEvent?("auto", json)
  }
}
