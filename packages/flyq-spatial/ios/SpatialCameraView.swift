import ARKit
import Metal
import SceneKit
import UIKit
import simd

/// Forwards ARSession callbacks to closures. Kept separate from the views so the delegate
/// methods are plain (non-actor-isolated) Objective-C methods.
final class SessionDelegateProxy: NSObject, ARSessionDelegate {
  var onFrame: ((ARFrame) -> Void)?
  var onTrackingChange: ((ARCamera) -> Void)?
  var onFailure: ((Error) -> Void)?
  var onInterrupted: (() -> Void)?
  var onInterruptionEnded: (() -> Void)?

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    onFrame?(frame)
  }

  func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
    onTrackingChange?(camera)
  }

  func session(_ session: ARSession, didFailWithError error: Error) {
    onFailure?(error)
  }

  func sessionWasInterrupted(_ session: ARSession) {
    onInterrupted?()
  }

  func sessionInterruptionEnded(_ session: ARSession) {
    onInterruptionEnded?()
  }

  func sessionShouldAttemptRelocalization(_ session: ARSession) -> Bool {
    return true
  }
}

/// Crosshair shown in the middle of the camera during calibration.
final class ReticleView: UIView {
  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    backgroundColor = .clear
    let ring = UIView()
    ring.translatesAutoresizingMaskIntoConstraints = false
    ring.layer.borderColor = UIColor.white.cgColor
    ring.layer.borderWidth = 2
    ring.layer.cornerRadius = 15
    ring.backgroundColor = .clear
    addSubview(ring)
    let dot = UIView()
    dot.translatesAutoresizingMaskIntoConstraints = false
    dot.backgroundColor = SpatialColors.accentLight
    dot.layer.cornerRadius = 3
    addSubview(dot)
    NSLayoutConstraint.activate([
      ring.centerXAnchor.constraint(equalTo: centerXAnchor),
      ring.centerYAnchor.constraint(equalTo: centerYAnchor),
      ring.widthAnchor.constraint(equalToConstant: 30),
      ring.heightAnchor.constraint(equalToConstant: 30),
      dot.centerXAnchor.constraint(equalTo: centerXAnchor),
      dot.centerYAnchor.constraint(equalTo: centerYAnchor),
      dot.widthAnchor.constraint(equalToConstant: 6),
      dot.heightAnchor.constraint(equalToConstant: 6),
    ])
    layer.shadowColor = UIColor.black.cgColor
    layer.shadowOpacity = 0.6
    layer.shadowRadius = 3
    layer.shadowOffset = .zero
  }

  required init?(coder: NSCoder) {
    return nil
  }
}

/// Names shared by threads (kept out of the view classes, which belong to the main actor).
enum SpatialNames {
  static let originAnchor = "flyq.model-origin"
}

/// ARWorldMap (un)archiving, usable from any thread.
enum WorldMapCodec {
  static func decode(_ data: Data) -> ARWorldMap? {
    do {
      return try NSKeyedUnarchiver.unarchivedObject(ofClass: ARWorldMap.self, from: data)
    } catch {
      return nil
    }
  }
}

/// Reads a `.flyqmap` chosen by the user (background thread) and checks it fully before use.
enum VisualMapImport {
  enum Outcome {
    case success(VisualMapPackage)
    case failure(code: String, message: String)
  }

  static func read(url: URL, venueId: String) -> Outcome {
    let scoped = url.startAccessingSecurityScopedResource()
    defer {
      if scoped { url.stopAccessingSecurityScopedResource() }
    }
    let data: Data
    do {
      let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
      guard size <= VisualMapPackage.maxBytes else {
        return .failure(code: "VISUAL_MAP_INVALID", message: "The file is too large to be a visual map.")
      }
      // Mapped: a wrong file is rejected by its first bytes without loading all of it.
      data = try Data(contentsOf: url, options: [.alwaysMapped])
    } catch {
      return .failure(code: "VISUAL_MAP_INVALID", message: error.localizedDescription)
    }
    var package: VisualMapPackage
    do {
      package = try VisualMapPackage.decode(data)
    } catch {
      return .failure(code: "VISUAL_MAP_INVALID", message: String(describing: error))
    }
    guard package.info.venueId != VisualMapPackage.recordingVenueId else {
      return .failure(code: "VISUAL_MAP_NOT_ALIGNED",
                      message: "This is a raw recording: it has to be aligned with the venue map first.")
    }
    guard package.info.venueId == venueId else {
      return .failure(code: "VISUAL_MAP_WRONG_VENUE",
                      message: "This visual map is for '\(package.info.venueId)', not '\(venueId)'.")
    }
    guard let points = featureCount(package.worldMap) else {
      return .failure(code: "VISUAL_MAP_INVALID", message: "The file does not contain a usable ARKit world map.")
    }
    if package.info.featurePoints == nil {
      package.info.featurePoints = points
    }
    return .success(package)
  }

  /// Feature points of a usable world map: it decodes and carries the model-origin anchor (without
  /// it the pin has no place). Nil when unusable.
  static func featureCount(_ worldMap: Data) -> Int? {
    guard let map = WorldMapCodec.decode(worldMap),
          map.anchors.contains(where: { $0.name == SpatialNames.originAnchor })
    else { return nil }
    return map.rawFeaturePoints.points.count
  }

  /// A memory zone shipped with the venue, read straight from the app bundle (nothing is copied to
  /// the phone's storage). Any thread. Nil when the file is missing, for another venue or unusable.
  static func loadZone(url: URL, venueId: String) -> (record: CalibrationRecord, worldMap: Data)? {
    guard let data = try? Data(contentsOf: url, options: [.alwaysMapped]),
          let package = try? VisualMapPackage.decode(data),
          package.info.venueId == venueId, package.info.translation.count == 3
    else { return nil }
    let record = CalibrationRecord(
      schemaVersion: VenueStore.currentCalibrationSchema, venueId: venueId, createdAt: package.info.createdAt,
      yaw: package.info.yaw, translation: package.info.translation, rmsError: 0, pairs: [], source: "zone",
      featurePoints: package.info.featurePoints, device: package.info.device, anchorFrame: package.info.anchorFrame)
    return (record, package.worldMap)
  }

  /// The memory bundled in the app (`<venueId>.flyqmap`) replaces the one on the phone only when
  /// it was made later (and the user did not delete it). Run on the store queue. Returns the
  /// installed record, or nil.
  static func installBundled(url: URL, store: VenueStore) -> CalibrationRecord? {
    guard let data = try? Data(contentsOf: url, options: [.alwaysMapped]),
          let info = try? VisualMapPackage.peekInfo(data),
          info.venueId == store.venueId,
          VisualMapPackage.isNewer(info.createdAt, than: store.loadCalibration()?.createdAt),
          VisualMapPackage.isNewer(info.createdAt, than: store.dismissedBundledCreatedAt()),
          var package = try? VisualMapPackage.decode(data),
          let points = featureCount(package.worldMap)
    else { return nil }
    if package.info.featurePoints == nil {
      package.info.featurePoints = points
    }
    return try? store.importPackage(package, source: "bundled")
  }

  /// Reads an extension of the venue memory (a recording that started from it) and stores it as
  /// the venue's memory. Run on the store queue.
  static func importExtension(_ url: URL, venueId: String, store: VenueStore) -> (CalibrationRecord?, String?) {
    switch read(url: url, venueId: venueId) {
    case .success(let package):
      do {
        return (try store.importPackage(package, source: "extended"), nil)
      } catch {
        return (nil, String(describing: error))
      }
    case .failure(_, let message):
      return (nil, message)
    }
  }

  struct RecordingOutcome {
    let saved: RecordingFiles.Saved?
    let verified: Bool
    let failure: String?
  }

  /// Packs and writes a recording (background thread). The final one is read back and checked:
  /// header, walls, and an ARKit world map that decodes and carries the origin anchor.
  /// `base`: the venue memory this recording extends (nil for a raw recording).
  static func storeRecording(geometry: RecordingGeometry, worldMap: Data, featurePoints: Int, createdAt: String,
                             device: String, final: Bool, base: VisualMapPackage.Info? = nil) -> RecordingOutcome {
    guard geometry.cellCount > 0 else {
      return RecordingOutcome(saved: nil, verified: false, failure: RecordingError.noGeometry.description)
    }
    let info = VisualMapPackage.Info.forRecording(geometry: geometry, createdAt: createdAt,
                                                  featurePoints: featurePoints, device: device, base: base)
    let package = VisualMapPackage(info: info, worldMap: worldMap)
    do {
      let saved = final ? try RecordingFiles.writeFinal(package) : try RecordingFiles.writeCheckpoint(package)
      guard final else {
        return RecordingOutcome(saved: saved, verified: true, failure: nil)
      }
      guard RecordingFiles.verify(saved.url),
            let data = try? Data(contentsOf: saved.url, options: [.alwaysMapped]),
            let back = try? VisualMapPackage.decode(data),
            featureCount(back.worldMap) != nil
      else {
        return RecordingOutcome(saved: saved, verified: false, failure: RecordingError.verificationFailed.description)
      }
      return RecordingOutcome(saved: saved, verified: true, failure: nil)
    } catch {
      return RecordingOutcome(saved: nil, verified: false, failure: String(describing: error))
    }
  }

  /// Memories saved by the first version have no size: count it once from the world map (the
  /// LiDAR phone needs it to decide whether a new memory is better). Run on the store queue.
  static func backfillFeaturePoints(store: VenueStore) -> CalibrationRecord? {
    guard var record = store.loadCalibration(), record.featurePoints == nil,
          let data = store.loadWorldMapData()
    else { return nil }
    record.featurePoints = featureCount(data) ?? 0
    try? store.saveRecord(record)
    return record
  }
}

/// Document picker callbacks forwarded to a closure (the host view keeps it alive while shown).
final class VisualMapPickerDelegate: NSObject, UIDocumentPickerDelegate {
  private let onPick: (URL?) -> Void

  init(onPick: @escaping (URL?) -> Void) {
    self.onPick = onPick
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    onPick(urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    onPick(nil)
  }
}

/// Draws the LiDAR mesh ARKit reconstructs as a light wireframe over the camera image, so the user
/// sees which surfaces the phone has already captured. ARSCNView calls this on its render thread.
final class MeshOverlayRenderer: NSObject, ARSCNViewDelegate {
  static let nodeName = "flyq.mesh-overlay"
  /// Read on the render thread, written on the main thread (a stale read only delays one update).
  var visible = false

  func renderer(_ renderer: SCNSceneRenderer, didAdd node: SCNNode, for anchor: ARAnchor) {
    update(node: node, anchor: anchor)
  }

  func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
    update(node: node, anchor: anchor)
  }

  private func update(node: SCNNode, anchor: ARAnchor) {
    guard let meshAnchor = anchor as? ARMeshAnchor else { return }
    let existing = node.childNode(withName: MeshOverlayRenderer.nodeName, recursively: false)
    guard visible, let geometry = MeshOverlayRenderer.geometry(from: meshAnchor.geometry) else {
      existing?.removeFromParentNode()
      return
    }
    if let child = existing {
      child.geometry = geometry
    } else {
      let child = SCNNode(geometry: geometry)
      child.name = MeshOverlayRenderer.nodeName
      child.renderingOrder = 10
      node.addChildNode(child)
    }
  }

  /// Copies the anchor's buffers (ARKit may reuse them) into a wireframe SceneKit geometry.
  static func geometry(from mesh: ARMeshGeometry) -> SCNGeometry? {
    let vertices = mesh.vertices
    let faces = mesh.faces
    guard vertices.count > 0, faces.count > 0, vertices.format == .float3, vertices.stride >= 12,
          faces.indexCountPerPrimitive == 3, faces.bytesPerIndex == 2 || faces.bytesPerIndex == 4
    else { return nil }
    let vertexBytes = vertices.stride * (vertices.count - 1) + 12
    let indexBytes = faces.count * 3 * faces.bytesPerIndex
    guard vertices.offset + vertexBytes <= vertices.buffer.length, indexBytes <= faces.buffer.length else { return nil }
    let vertexData = Data(bytes: vertices.buffer.contents().advanced(by: vertices.offset), count: vertexBytes)
    let indexData = Data(bytes: faces.buffer.contents(), count: indexBytes)
    let source = SCNGeometrySource(data: vertexData, semantic: .vertex, vectorCount: vertices.count,
                                   usesFloatComponents: true, componentsPerVector: 3,
                                   bytesPerComponent: MemoryLayout<Float>.size, dataOffset: 0,
                                   dataStride: vertices.stride)
    let element = SCNGeometryElement(data: indexData, primitiveType: .triangles, primitiveCount: faces.count,
                                     bytesPerIndex: faces.bytesPerIndex)
    let geometry = SCNGeometry(sources: [source], elements: [element])
    geometry.materials = [MeshOverlayRenderer.material]
    return geometry
  }

  /// One wireframe material for every mesh chunk (created once, thread-safe lazy static).
  private static let material: SCNMaterial = {
    let material = SCNMaterial()
    material.fillMode = .lines
    material.lightingModel = .constant
    material.diffuse.contents = UIColor(red: 0.42, green: 0.86, blue: 1.0, alpha: 1)
    material.transparency = 0.55
    material.isDoubleSided = true
    material.writesToDepthBuffer = false
    return material
  }()
}

/// Camera + ARKit world tracking. Two ways to run:
/// - `.mapping`: a fresh session (calibration builds a new map);
/// - `.relocalizing`: starts from a saved ARWorldMap and waits until ARKit recognises the place.
final class SpatialCameraView: UIView {
  enum RunMode: String {
    case mapping
    case relocalizing
    /// Fresh session with LiDAR scene reconstruction (automatic localisation).
    case scanning
  }

  static let originAnchorName = SpatialNames.originAnchor

  static var isSupported: Bool {
    return ARWorldTrackingConfiguration.isSupported
  }

  /// LiDAR devices (iPhone 12 Pro and later Pro models): ARKit builds a live mesh of the room.
  static var supportsMesh: Bool {
    return ARWorldTrackingConfiguration.isSupported && ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
  }

  let arView = ARSCNView(frame: .zero)
  private let coaching = ARCoachingOverlayView()
  private let reticle = ReticleView(frame: .zero)
  private let proxy = SessionDelegateProxy()
  private let meshOverlay = MeshOverlayRenderer()
  private let markerRoot = SCNNode()
  /// The origin anchor this view added last (removed by identity, even within the same frame).
  private var originAnchor: ARAnchor?

  private(set) var isRunning = false
  /// ARKit feature points collected during a scanning session on iPhones without LiDAR (the
  /// automatic localisation uses them instead of the LiDAR mesh). Latest position per point id.
  private var featurePositions: [UInt64: SIMD3<Float>] = [:]
  private var featureOrder: [UInt64] = []
  private var collectFeatures = false
  private var featureFrameCounter = 0
  private static let maxFeatures = 40_000
  private(set) var runMode: RunMode = .mapping
  /// "normal" | "limited" | "notAvailable"
  private(set) var trackingState = "notAvailable"
  /// "initializing" | "excessiveMotion" | "insufficientFeatures" | "relocalizing" | "interrupted" | nil
  private(set) var trackingReason: String?
  /// "notAvailable" | "limited" | "extending" | "mapped"
  private(set) var mappingStatus = "notAvailable"
  /// True once the current session's coordinates match the saved map (or the session that made it).
  private(set) var relocalized = false
  /// ARKit feature points in the camera view right now (smoothed over a few frames): how much
  /// detail the camera sees. Low while it faces a bare wall, the floor or the sky.
  private(set) var featureLevel: Double = 0
  /// ARKit reported feature points in this session at least once (it may give none while it
  /// relocalises): until then the level says nothing.
  private(set) var featureLevelKnown = false
  var knownFeatureLevel: Double? {
    return featureLevelKnown ? featureLevel : nil
  }
  /// The session builds the LiDAR mesh: a scanning session, or a memory session after it was
  /// recognised (`enableMeshing`).
  private(set) var meshing = false

  var onFrameUpdate: ((simd_float4x4) -> Void)?
  var onStatusChange: (() -> Void)?
  var onFailure: ((Error) -> Void)?
  var onRelocalized: (() -> Void)?
  /// ARKit is back after an interruption (the app returned from the background).
  var onResumed: (() -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  required init?(coder: NSCoder) {
    return nil
  }

  private func setup() {
    clipsToBounds = true
    backgroundColor = .black

    arView.frame = bounds
    arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    arView.automaticallyUpdatesLighting = false
    arView.rendersCameraGrain = false
    arView.scene = SCNScene()
    arView.scene.rootNode.addChildNode(markerRoot)
    arView.session.delegate = proxy
    arView.delegate = meshOverlay
    addSubview(arView)

    coaching.session = arView.session
    coaching.goal = .tracking
    // Apple's coaching overlay ("Move iPhone to start", English, centre of the screen) would talk
    // over the app's own hints: never shown.
    coaching.activatesAutomatically = false
    coaching.frame = bounds
    coaching.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(coaching)

    reticle.isHidden = true
    addSubview(reticle)

    proxy.onFrame = { [weak self] frame in
      self?.handleFrame(frame)
    }
    proxy.onTrackingChange = { [weak self] camera in
      self?.handleTracking(camera.trackingState)
    }
    proxy.onFailure = { [weak self] error in
      self?.handleFailure(error)
    }
    proxy.onInterrupted = { [weak self] in
      self?.handleInterrupted()
    }
    proxy.onInterruptionEnded = { [weak self] in
      self?.onStatusChange?()
      self?.onResumed?()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    reticle.frame = CGRect(x: bounds.midX - 22, y: bounds.midY - 22, width: 44, height: 44)
  }

  // MARK: - Session

  func run(mode: RunMode, worldMap: ARWorldMap?) {
    let configuration = ARWorldTrackingConfiguration()
    configuration.worldAlignment = .gravity
    configuration.planeDetection = [.horizontal, .vertical]
    configuration.environmentTexturing = .none
    configuration.isAutoFocusEnabled = true
    if mode == .relocalizing, let map = worldMap {
      configuration.initialWorldMap = map
    }
    if mode == .scanning && SpatialCameraView.supportsMesh {
      configuration.sceneReconstruction = .mesh
    }
    meshing = configuration.sceneReconstruction == .mesh
    collectFeatures = mode == .scanning && !SpatialCameraView.supportsMesh
    featurePositions.removeAll(keepingCapacity: true)
    featureOrder.removeAll(keepingCapacity: true)
    runMode = mode
    relocalized = false
    featureLevel = 0
    featureLevelKnown = false
    originAnchor = nil  // .removeExistingAnchors below drops it from the session
    trackingState = "notAvailable"
    trackingReason = nil
    mappingStatus = "notAvailable"
    showMarkers(confirmed: [], pending: nil)
    arView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    isRunning = true
    // The screen must not lock while the camera works (a walk, a recording, a demo): that would
    // send the app to the background and interrupt ARKit.
    UIApplication.shared.isIdleTimerDisabled = true
    onStatusChange?()
  }

  /// After the visual memory was recognised (LiDAR iPhones): the same session, in the memory's
  /// coordinates, starts building the LiDAR mesh too, so the walls can check the position and a
  /// recording can extend the memory. No initial world map (it would relocalise again) and no
  /// reset: tracking, coordinates and anchors carry on.
  @discardableResult
  func enableMeshing() -> Bool {
    guard isRunning, SpatialCameraView.supportsMesh, runMode == .relocalizing, relocalized, !meshing else {
      return meshing
    }
    let configuration = ARWorldTrackingConfiguration()
    configuration.worldAlignment = .gravity
    configuration.planeDetection = [.horizontal, .vertical]
    configuration.environmentTexturing = .none
    configuration.isAutoFocusEnabled = true
    configuration.sceneReconstruction = .mesh
    arView.session.run(configuration, options: [])
    meshing = true
    onStatusChange?()
    return true
  }

  func pause() {
    meshOverlay.visible = false
    collectFeatures = false
    guard isRunning else { return }
    arView.session.pause()
    isRunning = false
    UIApplication.shared.isIdleTimerDisabled = false
    trackingState = "notAvailable"
    trackingReason = nil
    onStatusChange?()
  }

  /// After a successful calibration the running session *is* the saved map's coordinate frame.
  func adoptCurrentSessionAsLocalized() {
    if runMode == .mapping {
      runMode = .relocalizing
    }
    relocalized = true
    onStatusChange?()
  }

  private func handleFrame(_ frame: ARFrame) {
    let mapping = SpatialCameraView.describe(frame.worldMappingStatus)
    if mapping != mappingStatus {
      mappingStatus = mapping
      onStatusChange?()
    }
    if collectFeatures {
      collectFeaturePoints(frame)
    }
    let visible = Double(frame.rawFeaturePoints?.points.count ?? 0)
    if visible > 0 {
      featureLevelKnown = true
    }
    featureLevel += (visible - featureLevel) * 0.15
    // Recognised = tracking normal *and* the memory's origin anchor back in the session. ARKit
    // restores the saved anchors once it has matched the place, so the pin never goes on the map
    // in a frame that is not the memory's.
    if runMode == .relocalizing && !relocalized, case .normal = frame.camera.trackingState,
       frame.anchors.contains(where: { $0.name == SpatialCameraView.originAnchorName }) {
      relocalized = true
      onRelocalized?()
      onStatusChange?()
    }
    onFrameUpdate?(frame.camera.transform)
  }

  /// Every other frame, while tracking is normal: remember where ARKit sees textured spots.
  private func collectFeaturePoints(_ frame: ARFrame) {
    featureFrameCounter += 1
    guard featureFrameCounter % 2 == 0, case .normal = frame.camera.trackingState,
          let cloud = frame.rawFeaturePoints
    else { return }
    let points = cloud.points
    let ids = cloud.identifiers
    let count = min(points.count, ids.count)
    for i in 0..<count {
      let p = points[i]
      guard p.x.isFinite, p.y.isFinite, p.z.isFinite else { continue }
      let id = ids[i]
      if featurePositions.updateValue(p, forKey: id) == nil {
        featureOrder.append(id)
      }
    }
    if featureOrder.count > SpatialCameraView.maxFeatures {
      // Forget the oldest quarter (points seen at the start, usually far behind the user).
      let drop = featureOrder.count / 4
      for id in featureOrder.prefix(drop) {
        featurePositions.removeValue(forKey: id)
      }
      featureOrder.removeFirst(drop)
    }
  }

  private func handleTracking(_ state: ARCamera.TrackingState) {
    if case .normal = state {
      // (Relocalisation is decided per frame in handleFrame: it also needs the origin anchor.)
      trackingState = "normal"
      trackingReason = nil
    } else if case .limited(let reason) = state {
      trackingState = "limited"
      switch reason {
      case .initializing:
        trackingReason = "initializing"
      case .excessiveMotion:
        trackingReason = "excessiveMotion"
      case .insufficientFeatures:
        trackingReason = "insufficientFeatures"
      case .relocalizing:
        trackingReason = "relocalizing"
      @unknown default:
        trackingReason = "unknown"
      }
    } else {
      trackingState = "notAvailable"
      trackingReason = nil
    }
    onStatusChange?()
  }

  private func handleFailure(_ error: Error) {
    isRunning = false
    trackingState = "notAvailable"
    trackingReason = nil
    onFailure?(error)
    onStatusChange?()
  }

  private func handleInterrupted() {
    trackingState = "limited"
    trackingReason = "interrupted"
    onStatusChange?()
  }

  static func describe(_ status: ARFrame.WorldMappingStatus) -> String {
    switch status {
    case .notAvailable:
      return "notAvailable"
    case .limited:
      return "limited"
    case .extending:
      return "extending"
    case .mapped:
      return "mapped"
    @unknown default:
      return "notAvailable"
    }
  }

  // MARK: - Model origin anchor & world map

  /// Pose of the model origin in AR coordinates (model -> AR), restored from the saved map.
  func originAnchorTransform() -> simd_float4x4? {
    guard let anchors = arView.session.currentFrame?.anchors else { return nil }
    for anchor in anchors where anchor.name == SpatialCameraView.originAnchorName {
      return anchor.transform
    }
    return nil
  }

  /// Adds the model-origin anchor, waits for the session to absorb it, then serialises the map.
  struct CapturedWorldMap {
    let data: Data
    /// Feature points ARKit stored: a rough measure of how much of the place it can recognise.
    let featurePoints: Int
  }

  /// Sets the model-origin anchor, waits for the session to absorb it, then serialises the map.
  /// Only the origin anchor is kept in the file (no LiDAR meshes / planes: smaller, loads anywhere).
  /// A map with fewer than `minimumFeaturePoints` points fails with `worldMapTooSmall` (not archived).
  func captureWorldMap(modelToAR: simd_float4x4, minimumFeaturePoints: Int = 0,
                       completion: @escaping (Result<CapturedWorldMap, Error>) -> Void) {
    let session = arView.session
    setOriginAnchor(modelToAR: modelToAR)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
      session.getCurrentWorldMap { worldMap, error in
        // The handler runs on the session's delegate queue, i.e. the main thread here: archive a
        // multi-MB map in the background, report back on main.
        DispatchQueue.global(qos: .utility).async {
          let result: Result<CapturedWorldMap, Error>
          if let error = error {
            result = .failure(error)
          } else if let map = worldMap {
            map.anchors = map.anchors.filter { $0.name == SpatialNames.originAnchor }
            let points = map.rawFeaturePoints.points.count
            if map.anchors.isEmpty {
              result = .failure(SpatialError.worldMapUnavailable)
            } else if points < minimumFeaturePoints {
              result = .failure(SpatialError.worldMapTooSmall(points))
            } else {
              do {
                let data = try NSKeyedArchiver.archivedData(withRootObject: map, requiringSecureCoding: true)
                result = .success(CapturedWorldMap(data: data, featurePoints: points))
              } catch {
                result = .failure(error)
              }
            }
          } else {
            result = .failure(SpatialError.worldMapUnavailable)
          }
          DispatchQueue.main.async {
            completion(result)
          }
        }
      }
    }
  }

  static func decodeWorldMap(_ data: Data) -> ARWorldMap? {
    return WorldMapCodec.decode(data)
  }

  /// Replaces the model-origin anchor (model -> AR). ARKit keeps it consistent with its own
  /// corrections of the world, so the pin stays right even after ARKit refines its map.
  func setOriginAnchor(modelToAR: simd_float4x4) {
    let session = arView.session
    if let previous = originAnchor {
      session.remove(anchor: previous)
    }
    if let anchors = session.currentFrame?.anchors {
      for anchor in anchors where anchor.name == SpatialCameraView.originAnchorName {
        session.remove(anchor: anchor)
      }
    }
    let anchor = ARAnchor(name: SpatialCameraView.originAnchorName, transform: modelToAR)
    session.add(anchor: anchor)
    originAnchor = anchor
  }

  func setMeshOverlay(visible: Bool) {
    meshOverlay.visible = visible && meshing
    if !meshOverlay.visible {
      SCNTransaction.begin()
      arView.scene.rootNode.enumerateChildNodes { node, _ in
        if node.name == MeshOverlayRenderer.nodeName {
          node.removeFromParentNode()
        }
      }
      SCNTransaction.commit()
    }
  }

  // MARK: - Automatic localisation input

  /// Every LiDAR mesh anchor of the session (a recording keeps the walls of the whole walk).
  func captureAllMeshChunks() -> [LiveMeshChunk] {
    guard let frame = arView.session.currentFrame else { return [] }
    var chunks: [LiveMeshChunk] = []
    for anchor in frame.anchors {
      if let meshAnchor = anchor as? ARMeshAnchor, let chunk = SpatialCameraView.chunk(from: meshAnchor) {
        chunks.append(chunk)
      }
    }
    return chunks
  }

  /// Number of LiDAR mesh anchors so far (a rough "how much was captured").
  func meshAnchorCount() -> Int {
    guard let frame = arView.session.currentFrame else { return 0 }
    var count = 0
    for anchor in frame.anchors where anchor is ARMeshAnchor {
      count += 1
    }
    return count
  }

  /// Copies what the matcher needs out of the current ARFrame (main thread, a few ms).
  /// `meshRadius`: mesh anchors farther than this (m, horizontally) are left out.
  func captureSnapshot(meshRadius: Float = 12) -> LiveGeometrySnapshot? {
    guard isRunning, let frame = arView.session.currentFrame else { return nil }
    let cameraTransform = frame.camera.transform
    let cameraPosition = cameraTransform.columns.3
    var chunks: [LiveMeshChunk] = []
    var planes: [LivePlaneSegment] = []
    var floors: [Float] = []
    for anchor in frame.anchors {
      if let meshAnchor = anchor as? ARMeshAnchor {
        // Mesh anchors cover a few metres each; skip the ones far from the user.
        let p = meshAnchor.transform.columns.3
        let dx = p.x - cameraPosition.x
        let dz = p.z - cameraPosition.z
        if dx * dx + dz * dz > meshRadius * meshRadius { continue }
        if let chunk = SpatialCameraView.chunk(from: meshAnchor) {
          chunks.append(chunk)
        }
      } else if let plane = anchor as? ARPlaneAnchor {
        if plane.alignment == .horizontal {
          if ARPlaneAnchor.isClassificationSupported, case .floor = plane.classification {
            floors.append(plane.transform.columns.3.y)
          }
        } else if let segment = SpatialCameraView.footprint(of: plane) {
          planes.append(segment)
        }
      }
    }
    var features: [Float] = []
    if collectFeatures && chunks.isEmpty {
      features.reserveCapacity(featurePositions.count * 3)
      for p in featurePositions.values {
        features.append(p.x)
        features.append(p.y)
        features.append(p.z)
      }
    }
    return LiveGeometrySnapshot(cameraTransform: SpatialCameraView.flatten(cameraTransform), chunks: chunks,
                                planes: planes, floorPlaneHeights: floors,
                                meshSupported: SpatialCameraView.supportsMesh, featurePoints: features)
  }

  static func flatten(_ m: simd_float4x4) -> [Float] {
    let c0 = m.columns.0
    let c1 = m.columns.1
    let c2 = m.columns.2
    let c3 = m.columns.3
    return [c0.x, c0.y, c0.z, c0.w, c1.x, c1.y, c1.z, c1.w, c2.x, c2.y, c2.z, c2.w, c3.x, c3.y, c3.z, c3.w]
  }

  private static func chunk(from anchor: ARMeshAnchor) -> LiveMeshChunk? {
    let geometry = anchor.geometry
    guard let vertices = copyFloat3(geometry.vertices), let normals = copyFloat3(geometry.normals),
          geometry.vertices.count == geometry.normals.count
    else { return nil }
    return LiveMeshChunk(transform: flatten(anchor.transform), vertices: vertices.values,
                         vertexStride: vertices.stride, normals: normals.values, normalStride: normals.stride,
                         count: geometry.vertices.count)
  }

  /// Float32 copy of a float3 geometry source; `stride` is in floats.
  private static func copyFloat3(_ source: ARGeometrySource) -> (values: [Float], stride: Int)? {
    guard source.count > 0, source.format == .float3, source.stride >= 12, source.stride % 4 == 0 else { return nil }
    let byteCount = source.stride * (source.count - 1) + 12
    guard source.offset >= 0, source.offset + byteCount <= source.buffer.length else { return nil }
    var values = [Float](repeating: 0, count: (byteCount + 3) / 4)
    let start = UnsafeRawPointer(source.buffer.contents().advanced(by: source.offset))
    values.withUnsafeMutableBytes { destination in
      destination.copyMemory(from: UnsafeRawBufferPointer(start: start, count: byteCount))
    }
    return (values, source.stride / 4)
  }

  /// Horizontal extent of a vertical plane, from its boundary polygon (no assumption about which
  /// local axis ARKit made horizontal).
  private static func footprint(of plane: ARPlaneAnchor) -> LivePlaneSegment? {
    let t = plane.transform
    let normal = SIMD3<Float>(t.columns.1.x, t.columns.1.y, t.columns.1.z)
    var tangent = SIMD3<Float>(normal.z, 0, -normal.x)
    let length = simd_length(tangent)
    guard length > 0.5 else { return nil }
    tangent /= length
    let origin = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
    var low = Float.greatestFiniteMagnitude
    var high = -Float.greatestFiniteMagnitude
    var ySum: Float = 0
    var count = 0
    for local in plane.geometry.boundaryVertices {
      let world4 = t * SIMD4<Float>(local.x, local.y, local.z, 1)
      let world = SIMD3<Float>(world4.x, world4.y, world4.z)
      let along = simd_dot(world - origin, tangent)
      low = min(low, along)
      high = max(high, along)
      ySum += world.y
      count += 1
    }
    guard count >= 2, high - low > 0.2 else { return nil }
    let a = origin + tangent * low
    let b = origin + tangent * high
    return LivePlaneSegment(x0: a.x, z0: a.z, x1: b.x, z1: b.z, centerY: ySum / Float(count))
  }

  // MARK: - Calibration helpers

  /// World point under the crosshair (centre of the camera view), if ARKit can find a surface.
  func raycastCenter() -> SIMD3<Float>? {
    let point = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
    let attempts: [ARRaycastQuery.Target] = [.existingPlaneGeometry, .estimatedPlane]
    for target in attempts {
      guard let query = arView.raycastQuery(from: point, allowing: target, alignment: .any) else { continue }
      if let result = arView.session.raycast(query).first {
        let c = result.worldTransform.columns.3
        return SIMD3<Float>(c.x, c.y, c.z)
      }
    }
    return nil
  }

  func setReticleVisible(_ visible: Bool) {
    reticle.isHidden = !visible
  }

  func setShowsFeaturePoints(_ visible: Bool) {
    arView.debugOptions = visible ? [ARSCNDebugOptions.showFeaturePoints] : []
  }

  func showMarkers(confirmed: [SIMD3<Float>], pending: SIMD3<Float>?) {
    for child in markerRoot.childNodes {
      child.removeFromParentNode()
    }
    for (index, point) in confirmed.enumerated() {
      markerRoot.addChildNode(SpatialCameraView.arMarker(at: point, color: SpatialColors.pairColor(index)))
    }
    if let point = pending {
      markerRoot.addChildNode(SpatialCameraView.arMarker(at: point, color: .white))
    }
  }

  private static func arMarker(at point: SIMD3<Float>, color: UIColor) -> SCNNode {
    let node = SCNNode()
    node.simdPosition = point
    let sphere = SCNSphere(radius: 0.035)
    sphere.materials = [PinGraphic.material(color: color, alpha: 1)]
    let ball = SCNNode(geometry: sphere)
    node.addChildNode(ball)
    let ring = SCNNode(geometry: PinGraphic.cylinder(radius: 0.09, height: 0.004, color: color, alpha: 0.8))
    node.addChildNode(ring)
    return node
  }
}
