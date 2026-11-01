import SceneKit
import UIKit
import simd

enum PinConfidence: String {
  /// Relocalized against the saved map within the last 30 s, tracking normal.
  case exact
  /// Tracking normal, last relocalization older.
  case tracked
  /// ARKit tracking limited (fast motion, few features): position drifts.
  case estimated
  /// No reliable position (relocalizing again, session stopped).
  case lost
}

/// The pin shown on the map: white/blue disc, pulsing halo, heading wedge and a pole with a head
/// so it stays visible from any angle. Always drawn on top of the model.
final class PinGraphic {
  let root = SCNNode()
  private let yawNode = SCNNode()
  private let innerDisc = SCNNode()
  private let halo = SCNNode()
  private let wedge = SCNNode()
  private let head = SCNNode()
  private let pole = SCNNode()
  private var confidence: PinConfidence = .tracked
  private var headingVisible = true

  init() {
    root.addChildNode(yawNode)

    let outer = SCNNode(geometry: PinGraphic.cylinder(radius: 0.30, height: 0.02, color: .white, alpha: 1))
    outer.position = SCNVector3(0, 0.01, 0)
    root.addChildNode(outer)

    innerDisc.geometry = PinGraphic.cylinder(radius: 0.22, height: 0.03, color: SpatialColors.accent, alpha: 1)
    innerDisc.position = SCNVector3(0, 0.025, 0)
    root.addChildNode(innerDisc)

    halo.geometry = PinGraphic.cylinder(radius: 0.30, height: 0.004, color: SpatialColors.accent, alpha: 1)
    halo.opacity = 0.5
    root.addChildNode(halo)
    let reset = SCNAction.group([SCNAction.scale(to: 1.0, duration: 0), SCNAction.fadeOpacity(to: 0.5, duration: 0)])
    let expand = SCNAction.group([SCNAction.scale(to: 2.8, duration: 1.4), SCNAction.fadeOpacity(to: 0.0, duration: 1.4)])
    halo.runAction(SCNAction.repeatForever(SCNAction.sequence([reset, expand])))

    wedge.geometry = PinGraphic.wedgeGeometry(radius: 1.7, halfAngle: CGFloat.pi / 5)
    wedge.eulerAngles = SCNVector3(-Float.pi / 2, 0, 0)
    wedge.position = SCNVector3(0, 0.015, 0)
    yawNode.addChildNode(wedge)

    pole.geometry = PinGraphic.cylinder(radius: 0.025, height: 1.1, color: .white, alpha: 0.9)
    pole.position = SCNVector3(0, 0.55, 0)
    root.addChildNode(pole)

    let sphere = SCNSphere(radius: 0.16)
    sphere.materials = [PinGraphic.material(color: SpatialColors.accent, alpha: 1)]
    head.geometry = sphere
    head.position = SCNVector3(0, 1.18, 0)
    root.addChildNode(head)

    // Draw the pin over the model so walls never hide it.
    root.enumerateHierarchy { node, _ in
      node.renderingOrder = 50
      if let geometry = node.geometry {
        for material in geometry.materials {
          material.readsFromDepthBuffer = false
          material.writesToDepthBuffer = false
        }
      }
    }
    // The halo and the wedge first, the discs and the head on top of them.
    halo.renderingOrder = 48
    wedge.renderingOrder = 49
    setConfidence(.tracked)
  }

  func setHeading(_ radians: Float) {
    yawNode.eulerAngles = SCNVector3(0, radians, 0)
  }

  func setHeadingVisible(_ visible: Bool) {
    headingVisible = visible
    wedge.isHidden = !visible || confidence == .lost
  }

  func setConfidence(_ value: PinConfidence) {
    guard value != confidence || innerDisc.geometry?.firstMaterial?.diffuse.contents == nil else { return }
    confidence = value
    let color: UIColor
    let alpha: CGFloat
    switch value {
    case .exact, .tracked:
      color = SpatialColors.accent
      alpha = 1
    case .estimated:
      color = SpatialColors.warning
      alpha = 0.85
    case .lost:
      color = SpatialColors.lost
      alpha = 0.7
    }
    innerDisc.geometry?.firstMaterial?.diffuse.contents = color
    head.geometry?.firstMaterial?.diffuse.contents = color
    halo.geometry?.firstMaterial?.diffuse.contents = color
    wedge.geometry?.firstMaterial?.diffuse.contents = color
    halo.isHidden = (value == .lost)
    wedge.isHidden = (value == .lost) || !headingVisible
    root.opacity = alpha
  }

  static func material(color: UIColor, alpha: CGFloat) -> SCNMaterial {
    let material = SCNMaterial()
    material.lightingModel = .constant
    material.diffuse.contents = color
    material.transparency = alpha
    material.isDoubleSided = true
    return material
  }

  static func cylinder(radius: CGFloat, height: CGFloat, color: UIColor, alpha: CGFloat) -> SCNCylinder {
    let cylinder = SCNCylinder(radius: radius, height: height)
    cylinder.radialSegmentCount = 36
    cylinder.materials = [material(color: color, alpha: alpha)]
    return cylinder
  }

  /// Flat fan in the XY plane pointing towards +Y (becomes -Z, i.e. "forward", after the -90 deg
  /// rotation around X). Built from explicit points (no arc direction ambiguity).
  static func wedgeGeometry(radius: CGFloat, halfAngle: CGFloat) -> SCNGeometry {
    let path = UIBezierPath()
    path.move(to: CGPoint(x: 0, y: 0))
    let steps = 12
    for i in 0...steps {
      let angle = (CGFloat.pi / 2 - halfAngle) + (2 * halfAngle) * CGFloat(i) / CGFloat(steps)
      path.addLine(to: CGPoint(x: radius * cos(angle), y: radius * sin(angle)))
    }
    path.close()
    let shape = SCNShape(path: path, extrusionDepth: 0.002)
    let material = PinGraphic.material(color: SpatialColors.accent, alpha: 0.32)
    shape.materials = [material]
    return shape
  }
}

/// Top-down / 3D map of a venue model, rendered with SceneKit.
///
/// Camera: orbit around a target on the floor (yaw, pitch, distance), smoothed every frame.
/// Gestures: 1 finger pan = move, pinch = zoom, 2-finger rotate = rotate, 2-finger vertical drag =
/// tilt, double tap = toggle top view / 3D. Single tap on the model reports the point (calibration).
final class SpatialMapView: UIView, UIGestureRecognizerDelegate {
  enum ViewMode: String {
    case perspective = "3d"
    case top = "top"
  }

  /// Tap on the model surface (or, between surfaces, on the floor plane), in model coordinates.
  var onMapTap: ((SIMD3<Float>) -> Void)?
  /// Tap that hit neither the model nor the floor inside the venue.
  var onMapTapMissed: (() -> Void)?
  /// The user moved the camera by hand (the host turns "follow me" off and reports it).
  var onUserMovedCamera: (() -> Void)?
  /// The camera went back to following the user by itself (a few seconds after the last touch).
  var onRefollowed: (() -> Void)?
  private var refollowWork: DispatchWorkItem?

  private let scnView = SCNView(frame: .zero, options: nil)
  private let scene = SCNScene()
  private let cameraNode = SCNNode()
  private let ambientLight = SCNLight()
  /// The drawn map's light (off for the scans, whose lighting is baked in).
  private let sunNode = SCNNode()
  private let modelContainer = SCNNode()
  private let groundNode = SCNNode()
  private let markersNode = SCNNode()
  /// The drawn map's points of interest (`PlanLabelNodes`).
  private let labelsNode = SCNNode()
  /// The walking route shown (`PlanRouteNodes`).
  private let routeNode = SCNNode()
  /// A label tapped on the drawn map (its id).
  var onLabelTap: ((String) -> Void)?
  /// While the user walks a route, the camera turns behind them (what is ahead shows).
  var walkHeadingUp = false
  private let pin = PinGraphic()
  private var displayLink: DisplayLinkProxy?

  // Camera state (current and desired; the display link eases current towards desired).
  private var target = SIMD3<Float>(0, 0, 0)
  private var yaw: Float = 0.35
  private var pitch: Float = 0.98
  private var distance: Float = 18
  private var desiredTarget = SIMD3<Float>(0, 0, 0)
  private var desiredYaw: Float = 0.35
  private var desiredPitch: Float = 0.98
  private var desiredDistance: Float = 18

  private(set) var viewMode: ViewMode = .perspective
  private(set) var followUser = false
  private(set) var hasModel = false
  /// The 2D view is shown (a picture from above): the camera only looks straight down.
  private(set) var flatMap = false
  /// The drawn map is shown (lit prisms, light background).
  private(set) var drawnMap = false
  private var groundColor = SpatialColors.ground

  private var boundsMin = SIMD3<Float>(-5, 0, -5)
  private var boundsMax = SIMD3<Float>(5, 2, 5)
  private var floorY: Float = 0

  // Pin state.
  private var hasPinPose = false
  private var pinPosition = SIMD3<Float>(0, 0, 0)
  private var pinTargetPosition = SIMD3<Float>(0, 0, 0)
  private var pinHeading: Float = 0
  private var pinTargetHeading: Float = 0

  // Gesture baselines.
  private var pinchStartDistance: Float = 18
  private var rotateStartYaw: Float = 0
  private var tiltStartPitch: Float = 0.98

  private static let perspectivePitch: Float = 0.98  // ~56 deg
  /// The drawn map tilts more, so it reads as 3D (as in the web prototype: ~42 deg over the floor).
  private static let drawnPitch: Float = 0.73
  private var tiltedPitch: Float { return drawnMap ? SpatialMapView.drawnPitch : SpatialMapView.perspectivePitch }
  private static let topPitch: Float = 1.553  // ~89 deg
  private static let minPitch: Float = 0.35
  private static let maxPitch: Float = 1.553

  override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  required init?(coder: NSCoder) {
    return nil
  }

  private func setup() {
    backgroundColor = SpatialColors.background
    clipsToBounds = true

    scnView.frame = bounds
    scnView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    scnView.backgroundColor = SpatialColors.background
    scnView.scene = scene
    scnView.antialiasingMode = .multisampling4X
    scnView.preferredFramesPerSecond = 60
    scnView.isPlaying = true
    scnView.allowsCameraControl = false
    scnView.autoenablesDefaultLighting = false
    scnView.isJitteringEnabled = false
    addSubview(scnView)

    let camera = SCNCamera()
    camera.fieldOfView = 50
    camera.zNear = 0.05
    camera.zFar = 500
    cameraNode.camera = camera
    scene.rootNode.addChildNode(cameraNode)
    scnView.pointOfView = cameraNode

    // The scans' materials are unlit (their lighting is baked in); the drawn map is lit by the
    // ambient light turned down and the sun (see `setLook`).
    let ambient = SCNNode()
    ambientLight.type = .ambient
    ambientLight.intensity = 1000
    ambientLight.color = UIColor.white
    ambient.light = ambientLight
    scene.rootNode.addChildNode(ambient)
    let sun = SCNLight()
    sun.type = .directional
    sun.intensity = PlanSceneBuilder.directionalIntensity
    sun.color = UIColor.white
    sunNode.light = sun
    // A directional light shines along its -Z: turn -Z to point away from `towardsLight`.
    sunNode.simdOrientation = simd_quatf(from: SIMD3<Float>(0, 0, -1), to: -PlanSceneBuilder.towardsLight)
    sunNode.isHidden = true
    scene.rootNode.addChildNode(sunNode)

    scene.rootNode.addChildNode(groundNode)
    scene.rootNode.addChildNode(modelContainer)
    scene.rootNode.addChildNode(markersNode)
    scene.rootNode.addChildNode(routeNode)
    scene.rootNode.addChildNode(labelsNode)
    pin.root.isHidden = true
    scene.rootNode.addChildNode(pin.root)

    installGestures()
    applyCamera()
    displayLink = DisplayLinkProxy { [weak self] dt in
      self?.step(Float(dt))
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      displayLink?.start()
      scnView.isPlaying = true
    } else {
      displayLink?.stop()
      scnView.isPlaying = false
    }
  }

  func shutdown() {
    displayLink?.stop()
    scnView.isPlaying = false
  }

  // MARK: - Model

  /// Attaches a scene loaded elsewhere (loading happens off the main thread).
  func attachModel(scene loaded: SCNScene, floorY: Float, boundsMin: SIMD3<Float>?, boundsMax: SIMD3<Float>?) {
    for child in modelContainer.childNodes {
      child.removeFromParentNode()
    }
    let children = loaded.rootNode.childNodes
    for child in children {
      child.removeFromParentNode()
      modelContainer.addChildNode(child)
    }
    modelContainer.enumerateHierarchy { node, _ in
      guard let geometry = node.geometry else { return }
      for material in geometry.materials {
        material.lightingModel = .constant
        material.isDoubleSided = false
        material.diffuse.mipFilter = .linear
        material.diffuse.minificationFilter = .linear
        material.diffuse.magnificationFilter = .linear
      }
    }

    self.floorY = floorY
    if let mn = boundsMin, let mx = boundsMax {
      self.boundsMin = mn
      self.boundsMax = mx
    } else {
      let (mn, mx) = modelContainer.boundingBox
      self.boundsMin = SIMD3<Float>(Float(mn.x), Float(mn.y), Float(mn.z))
      self.boundsMax = SIMD3<Float>(Float(mx.x), Float(mx.y), Float(mx.z))
    }
    flatMap = false
    setLook(drawn: false, background: SpatialColors.background, ground: SpatialColors.ground)
    setLabels([])
    setRoute(nil)
    buildGround()
    hasModel = true
    showOverview(animated: false)
  }

  /// The drawn map (built off the main thread by `PlanSceneBuilder`): lit prisms on a light
  /// background, in venue coordinates like the scans. It can be tilted like the 3D scan.
  func attachPlan(_ built: PlanSceneBuilder.Built) {
    for child in modelContainer.childNodes {
      child.removeFromParentNode()
    }
    modelContainer.addChildNode(built.root)
    floorY = built.floorY
    boundsMin = built.boundsMin
    boundsMax = built.boundsMax
    flatMap = false
    setLook(drawn: true, background: built.background, ground: built.background)
    buildGround()
    hasModel = true
    showOverview(animated: false)
  }

  /// The route to show; nil removes it.
  func setRoute(_ node: SCNNode?) {
    for child in routeNode.childNodes {
      child.removeFromParentNode()
    }
    if let node = node {
      routeNode.addChildNode(node)
    }
  }

  /// Looks at a point of the map from where the camera is (stops following the user).
  func focus(x: Float, z: Float) {
    followUser = false
    desiredTarget = clampTarget(SIMD3<Float>(x, floorY, z))
    desiredDistance = min(max(desiredDistance, 20), 45)
  }

  /// Where the pin is (x, z), when there is one.
  var pinXZ: SIMD2<Float>? {
    return hasPinPose ? SIMD2<Float>(pinTargetPosition.x, pinTargetPosition.z) : nil
  }

  /// The drawn map's points of interest; [] removes them (a scan is shown).
  func setLabels(_ nodes: [SCNNode]) {
    for child in labelsNode.childNodes {
      child.removeFromParentNode()
    }
    for node in nodes {
      labelsNode.addChildNode(node)
    }
    updateLabelScale()
  }

  /// Labels grow with the camera's distance, so they keep about the same size on screen.
  private func updateLabelScale() {
    // Smaller than before and with a lower floor: zoomed in, the badges no longer cover the map (Alex, 01.11)
    let s = min(max(distance / 21, 0.2), 14)
    for child in labelsNode.childNodes {
      child.simdScale = SIMD3<Float>(s, s, s)
    }
    // The person: grows with the distance like the labels, so it stays easy to see (it was too small)
    let p = min(max(distance / 9, 1.6), 8)
    pin.root.simdScale = SIMD3<Float>(p, p, p)
  }

  /// Once the user is on the map, a label shows when they come near it (fully within
  /// `labelNear`, gone past `labelFar`); with no pin, or zoomed out to look around, all of them do.
  static let labelNear: Float = 16
  static let labelFar: Float = 26
  static let labelsAllFrom: Float = 60
  private func updateLabelVisibility() {
    let all = !hasPinPose || distance >= SpatialMapView.labelsAllFrom
    for child in labelsNode.childNodes {
      var opacity: CGFloat = 1
      if !all {
        let p = child.simdPosition
        let d = simd_length(SIMD2<Float>(p.x - pinPosition.x, p.z - pinPosition.z))
        let t = (SpatialMapView.labelFar - d) / (SpatialMapView.labelFar - SpatialMapView.labelNear)
        opacity = CGFloat(min(max(t, 0), 1))
      }
      if abs(child.opacity - opacity) > 0.01 {
        child.opacity = opacity
      }
      child.isHidden = opacity < 0.02          // nor can it be tapped
    }
  }

  /// Following the user on the drawn map, only what is around them shows: the map fades into the
  /// background with the distance from the camera (fog), so the whole screen is the map near them.
  /// Off when the map is looked at freely (overview, panned away) or on a scan.
  private var fogOn = false
  private func updateFog() {
    let on = drawnMap && followUser && hasPinPose
    if on {
      scene.fogStartDistance = CGFloat(distance * 0.95)
      scene.fogEndDistance = CGFloat(distance * 1.6)
      scene.fogDensityExponent = 1.5
      if !fogOn { scene.fogColor = backgroundColor ?? SpatialColors.background }
    } else if fogOn {
      scene.fogStartDistance = 0
      scene.fogEndDistance = 0
    }
    fogOn = on
  }

  /// Background, ground and light for the drawn map or for a scan.
  private func setLook(drawn: Bool, background: UIColor, ground: UIColor) {
    drawnMap = drawn
    backgroundColor = background
    scnView.backgroundColor = background
    groundColor = ground
    ambientLight.intensity = drawn ? PlanSceneBuilder.ambientIntensity : 1000
    sunNode.isHidden = !drawn
    // The drawn map never needs the scans' close-ups; a farther near plane keeps the floor layers apart.
    cameraNode.camera?.zNear = drawn ? 0.1 : 0.05
  }

  /// The 2D view: a picture of the venue from above, lying on the floor (same coordinates as the
  /// model, so the pin does not change). The camera stays straight above it.
  /// `origin`: venue (x, z) of the picture's top-left corner; columns go towards +x, rows towards +z.
  func attachFlatMap(image: UIImage, origin: SIMD2<Float>, metersPerPixel: Float, pixels: SIMD2<Int>,
                     floorY: Float, boundsMin: SIMD3<Float>?, boundsMax: SIMD3<Float>?) {
    for child in modelContainer.childNodes {
      child.removeFromParentNode()
    }
    let width = Float(pixels.x) * metersPerPixel
    let depth = Float(pixels.y) * metersPerPixel
    let plane = SCNPlane(width: CGFloat(width), height: CGFloat(depth))
    let material = SCNMaterial()
    material.lightingModel = .constant
    material.diffuse.contents = image
    material.diffuse.wrapS = .clamp
    material.diffuse.wrapT = .clamp
    material.diffuse.mipFilter = .linear
    material.diffuse.minificationFilter = .linear
    material.diffuse.magnificationFilter = .linear
    material.isDoubleSided = false
    plane.materials = [material]
    let node = SCNNode(geometry: plane)
    // The plane stands in XY facing +Z; lying down (-90 deg about X) its top edge goes to -Z, which
    // is the picture's first row (smallest z), and it faces up.
    node.eulerAngles = SCNVector3(-Float.pi / 2, 0, 0)
    node.position = SCNVector3(origin.x + width / 2, floorY + 0.005, origin.y + depth / 2)
    modelContainer.addChildNode(node)

    self.floorY = floorY
    if let mn = boundsMin, let mx = boundsMax {
      self.boundsMin = mn
      self.boundsMax = mx
    } else {
      self.boundsMin = SIMD3<Float>(origin.x, floorY, origin.y)
      self.boundsMax = SIMD3<Float>(origin.x + width, floorY + 0.1, origin.y + depth)
    }
    flatMap = true
    setLook(drawn: false, background: SpatialColors.background, ground: SpatialColors.ground)
    setLabels([])
    viewMode = .top
    desiredPitch = SpatialMapView.topPitch
    pitch = desiredPitch
    buildGround()
    hasModel = true
    showOverview(animated: false)
  }

  private func buildGround() {
    let size = boundsMax - boundsMin
    let center = (boundsMin + boundsMax) * 0.5
    let plane = SCNPlane(width: CGFloat(max(size.x, 4) * 1.6), height: CGFloat(max(size.z, 4) * 1.6))
    plane.cornerRadius = 0.6
    let material = SCNMaterial()
    material.lightingModel = .constant
    material.diffuse.contents = groundColor
    material.isDoubleSided = false
    plane.materials = [material]
    groundNode.geometry = plane
    groundNode.eulerAngles = SCNVector3(-Float.pi / 2, 0, 0)
    // Under the drawn map's floor slab; just under a scan's floor.
    let below: Float = drawnMap ? Float(PlanGeometry.floorThickness) + 0.2 : 0.03
    groundNode.position = SCNVector3(center.x, floorY - below, center.z)
  }

  // MARK: - Camera

  func showOverview(animated: Bool = true) {
    let size = boundsMax - boundsMin
    let center = (boundsMin + boundsMax) * 0.5
    let extent = max(size.x, size.z, 3)
    followUser = false
    desiredTarget = SIMD3<Float>(center.x, floorY, center.z)
    desiredDistance = clampDistance(extent * 1.15)
    desiredPitch = viewMode == .top ? SpatialMapView.topPitch : tiltedPitch
    if !animated {
      target = desiredTarget
      distance = desiredDistance
      pitch = desiredPitch
      yaw = desiredYaw
      applyCamera()
    }
  }

  func setViewMode(_ mode: ViewMode, animated: Bool) {
    viewMode = flatMap ? .top : mode
    desiredPitch = viewMode == .top ? SpatialMapView.topPitch : tiltedPitch
    if !animated {
      pitch = desiredPitch
      applyCamera()
    }
  }

  func setFollow(_ enabled: Bool) {
    followUser = enabled
    if enabled {
      // On the drawn map farther and more tilted (a tall screen needs the height to show the user's
      // surroundings); the fog keeps it to them anyway. Same framing as the web prototype.
      desiredDistance = min(desiredDistance, viewMode == .top ? (drawnMap ? 40 : 14) : (drawnMap ? 36 : 10))
      if drawnMap && viewMode == .perspective {
        desiredPitch = SpatialMapView.drawnPitch
      }
      if hasPinPose {
        desiredTarget = SIMD3<Float>(pinPosition.x, floorY, pinPosition.z)
      }
    }
  }

  /// Back to the user (if there is a pin) or to the whole venue.
  func recenter() {
    if hasPinPose {
      setFollow(true)
    } else {
      showOverview(animated: true)
    }
  }

  private func applyCamera() {
    let cp = cos(pitch)
    let sp = sin(pitch)
    let offset = SIMD3<Float>(sin(yaw) * cp, sp, cos(yaw) * cp) * distance
    cameraNode.simdPosition = target + offset
    // Camera looks down -Z: tilt down by `pitch`, then turn by `yaw` (no gimbal issue at 90 deg).
    let turn = simd_quatf(angle: yaw, axis: SIMD3<Float>(0, 1, 0))
    let tilt = simd_quatf(angle: -pitch, axis: SIMD3<Float>(1, 0, 0))
    cameraNode.simdOrientation = turn * tilt
  }

  private func clampDistance(_ value: Float) -> Float {
    let size = boundsMax - boundsMin
    let maxDistance = max(40, max(size.x, size.z) * 3)
    return min(max(value, 1.5), maxDistance)
  }

  private func clampPitch(_ value: Float) -> Float {
    return min(max(value, SpatialMapView.minPitch), SpatialMapView.maxPitch)
  }

  private func clampTarget(_ value: SIMD3<Float>) -> SIMD3<Float> {
    let margin: Float = 4
    let x = min(max(value.x, boundsMin.x - margin), boundsMax.x + margin)
    let z = min(max(value.z, boundsMin.z - margin), boundsMax.z + margin)
    return SIMD3<Float>(x, floorY, z)
  }

  private func step(_ dt: Float) {
    let k = 1 - exp(-dt * 8)
    if followUser && hasPinPose {
      desiredTarget = SIMD3<Float>(pinPosition.x, floorY, pinPosition.z)
      if walkHeadingUp {
        // turn behind the user, slowly (the camera's yaw and the pin's heading share the angle)
        var d = pinTargetHeading - desiredYaw
        d = atan2(sin(d), cos(d))
        desiredYaw += d * min(1, dt * 2.5)
      }
    }
    var changed = false
    if simd_distance(target, desiredTarget) > 0.0005 {
      target += (desiredTarget - target) * k
      changed = true
    }
    if abs(desiredDistance - distance) > 0.0005 {
      distance += (desiredDistance - distance) * k
      changed = true
    }
    if abs(desiredPitch - pitch) > 0.0002 {
      pitch += (desiredPitch - pitch) * k
      changed = true
    }
    let yawDelta = spatialAngleDelta(desiredYaw, yaw)
    if abs(yawDelta) > 0.0002 {
      yaw += yawDelta * k
      changed = true
    }
    if changed {
      applyCamera()
      updateLabelScale()
    }
    if !labelsNode.childNodes.isEmpty {
      updateLabelVisibility()
    }
    updateFog()

    if hasPinPose {
      let kp = 1 - exp(-dt * 12)
      pinPosition += (pinTargetPosition - pinPosition) * kp
      pinHeading += spatialAngleDelta(pinTargetHeading, pinHeading) * kp
      pin.root.simdPosition = pinPosition
      pin.setHeading(pinHeading)
    }
  }

  // MARK: - Pin

  /// Shows the user at `position` (model coordinates; projected to the floor). nil hides the pin.
  /// `elevation`: metres over the floor where the pin stands (an upper floor of the drawn map).
  func setPin(position: SIMD3<Float>?, headingRadians: Float?, confidence: PinConfidence, elevation: Float = 0) {
    guard let p = position, p.x.isFinite, p.z.isFinite else {
      hasPinPose = false
      pin.root.isHidden = true
      return
    }
    let onFloor = SIMD3<Float>(p.x, floorY + max(0, min(elevation, 20)) + 0.02, p.z)
    if !hasPinPose || simd_distance(pinPosition, onFloor) > 4 {
      pinPosition = onFloor
      pin.root.simdPosition = onFloor
    }
    pinTargetPosition = onFloor
    if let h = headingRadians, h.isFinite {
      if !hasPinPose {
        pinHeading = h
      }
      pinTargetHeading = h
      pin.setHeadingVisible(true)
    } else if !hasPinPose {
      pin.setHeadingVisible(false)
    }
    let wasHidden = !hasPinPose
    hasPinPose = true
    pin.root.isHidden = false
    pin.setConfidence(confidence)
    if wasHidden && followUser {
      desiredTarget = SIMD3<Float>(onFloor.x, floorY, onFloor.z)
    }
  }

  func setPinConfidence(_ confidence: PinConfidence) {
    guard hasPinPose else { return }
    pin.setConfidence(confidence)
  }

  var hasPin: Bool {
    return hasPinPose
  }

  // MARK: - Calibration markers

  func setCalibrationMarkers(confirmed: [SIMD3<Float>], pending: SIMD3<Float>?) {
    for child in markersNode.childNodes {
      child.removeFromParentNode()
    }
    for (index, point) in confirmed.enumerated() {
      markersNode.addChildNode(SpatialMapView.markerNode(at: point, color: SpatialColors.pairColor(index), pulsing: false))
    }
    if let point = pending {
      markersNode.addChildNode(SpatialMapView.markerNode(at: point, color: .white, pulsing: true))
    }
  }

  static func markerNode(at point: SIMD3<Float>, color: UIColor, pulsing: Bool) -> SCNNode {
    let node = SCNNode()
    node.simdPosition = point
    let disc = SCNNode(geometry: PinGraphic.cylinder(radius: 0.14, height: 0.02, color: color, alpha: 1))
    disc.position = SCNVector3(0, 0.02, 0)
    node.addChildNode(disc)
    let stick = SCNNode(geometry: PinGraphic.cylinder(radius: 0.02, height: 0.6, color: color, alpha: 1))
    stick.position = SCNVector3(0, 0.3, 0)
    node.addChildNode(stick)
    let ball = SCNNode(geometry: SCNSphere(radius: 0.09))
    ball.geometry?.materials = [PinGraphic.material(color: color, alpha: 1)]
    ball.position = SCNVector3(0, 0.64, 0)
    node.addChildNode(ball)
    node.enumerateHierarchy { child, _ in
      child.renderingOrder = 40
      child.geometry?.firstMaterial?.readsFromDepthBuffer = false
    }
    if pulsing {
      let up = SCNAction.scale(to: 1.25, duration: 0.5)
      let down = SCNAction.scale(to: 1.0, duration: 0.5)
      node.runAction(SCNAction.repeatForever(SCNAction.sequence([up, down])))
    }
    return node
  }

  // MARK: - Gestures

  private func installGestures() {
    let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
    pan.minimumNumberOfTouches = 1
    pan.maximumNumberOfTouches = 1
    pan.delegate = self

    let tilt = UIPanGestureRecognizer(target: self, action: #selector(handleTilt(_:)))
    tilt.minimumNumberOfTouches = 2
    tilt.maximumNumberOfTouches = 2
    tilt.delegate = self

    let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
    pinch.delegate = self

    let rotate = UIRotationGestureRecognizer(target: self, action: #selector(handleRotate(_:)))
    rotate.delegate = self

    let doubleTap = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
    doubleTap.numberOfTapsRequired = 2

    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    tap.numberOfTapsRequired = 1
    tap.require(toFail: doubleTap)

    for recognizer in [pan, tilt, pinch, rotate, doubleTap, tap] as [UIGestureRecognizer] {
      scnView.addGestureRecognizer(recognizer)
    }
  }

  private func userMovedCamera() {
    if followUser {
      followUser = false
      onUserMovedCamera?()
    }
    scheduleRefollow()
  }

  /// Auto-follow: a few seconds after the last touch the camera goes back to the user (if there is one).
  private func scheduleRefollow() {
    refollowWork?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard let self = self, self.hasPinPose, !self.followUser else { return }
      self.setFollow(true)
      self.onRefollowed?()
    }
    refollowWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: work)
  }

  private func metersPerPoint() -> Float {
    let height = max(Float(scnView.bounds.height), 1)
    let fov = Float(cameraNode.camera?.fieldOfView ?? 50) * Float.pi / 180
    return 2 * distance * tan(fov / 2) / height
  }

  @objc private func handlePan(_ recognizer: UIPanGestureRecognizer) {
    switch recognizer.state {
    case .began:
      userMovedCamera()
    case .changed:
      let translation = recognizer.translation(in: scnView)
      recognizer.setTranslation(.zero, in: scnView)
      let scale = metersPerPoint()
      let right = SIMD3<Float>(cos(yaw), 0, -sin(yaw))
      let forward = SIMD3<Float>(-sin(yaw), 0, -cos(yaw))
      let delta = (right * -Float(translation.x) + forward * Float(translation.y)) * scale
      target = clampTarget(target + delta)
      desiredTarget = target
      applyCamera()
    default:
      break
    }
  }

  @objc private func handleTilt(_ recognizer: UIPanGestureRecognizer) {
    switch recognizer.state {
    case .began:
      tiltStartPitch = pitch
    case .changed:
      guard !flatMap else { return }
      let translation = recognizer.translation(in: scnView)
      guard abs(translation.y) > 12, abs(translation.y) > abs(translation.x) else { return }
      pitch = clampPitch(tiltStartPitch + Float(translation.y) * 0.004)
      desiredPitch = pitch
      viewMode = pitch > 1.45 ? .top : .perspective
      applyCamera()
    default:
      break
    }
  }

  @objc private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
    switch recognizer.state {
    case .began:
      pinchStartDistance = distance
    case .changed:
      let scale = max(Float(recognizer.scale), 0.01)
      distance = clampDistance(pinchStartDistance / scale)
      desiredDistance = distance
      applyCamera()
    default:
      break
    }
  }

  @objc private func handleRotate(_ recognizer: UIRotationGestureRecognizer) {
    switch recognizer.state {
    case .began:
      rotateStartYaw = yaw
    case .changed:
      yaw = rotateStartYaw + Float(recognizer.rotation)
      desiredYaw = yaw
      applyCamera()
    default:
      break
    }
  }

  @objc private func handleDoubleTap(_ recognizer: UITapGestureRecognizer) {
    guard !flatMap else { return }
    setViewMode(viewMode == .top ? .perspective : .top, animated: true)
  }

  @objc private func handleTap(_ recognizer: UITapGestureRecognizer) {
    guard hasModel else { return }
    let location = recognizer.location(in: scnView)
    // a point of interest first (its badge is drawn over everything)
    if let onLabel = onLabelTap, !labelsNode.childNodes.isEmpty {
      let labelHits = scnView.hitTest(location, options: [
        SCNHitTestOption.rootNode: labelsNode,
        SCNHitTestOption.ignoreHiddenNodes: true,
        SCNHitTestOption.searchMode: NSNumber(value: SCNHitTestSearchMode.all.rawValue),
      ])
      for hit in labelHits {
        var node: SCNNode? = hit.node
        while let cur = node, !(cur.name?.hasPrefix("label:") ?? false) { node = cur.parent }
        if let name = node?.name {
          onLabel(String(name.dropFirst("label:".count)))
          return
        }
      }
    }
    guard let handler = onMapTap else { return }
    let options: [SCNHitTestOption: Any] = [
      SCNHitTestOption.rootNode: modelContainer,
      SCNHitTestOption.ignoreHiddenNodes: true,
      SCNHitTestOption.searchMode: NSNumber(value: SCNHitTestSearchMode.closest.rawValue),
    ]
    let hits = scnView.hitTest(location, options: options)
    if let hit = hits.first {
      let w = hit.worldCoordinates
      handler(SIMD3<Float>(Float(w.x), Float(w.y), Float(w.z)))
      return
    }
    // Holes in the scan, or between objects: use the floor plane under the finger.
    if let point = floorPoint(at: location) {
      handler(point)
    } else {
      onMapTapMissed?()
    }
  }

  /// Where the ray under a screen point meets the floor plane, if that is inside the venue.
  private func floorPoint(at location: CGPoint) -> SIMD3<Float>? {
    let near = scnView.unprojectPoint(SCNVector3(Float(location.x), Float(location.y), 0))
    let far = scnView.unprojectPoint(SCNVector3(Float(location.x), Float(location.y), 1))
    let a = SIMD3<Float>(Float(near.x), Float(near.y), Float(near.z))
    let b = SIMD3<Float>(Float(far.x), Float(far.y), Float(far.z))
    let dy = b.y - a.y
    guard abs(dy) > 1e-6 else { return nil }
    let t = (floorY - a.y) / dy
    guard t > 0, t.isFinite else { return nil }
    let p = a + (b - a) * t
    let margin: Float = 0.5
    guard p.x >= boundsMin.x - margin, p.x <= boundsMax.x + margin,
          p.z >= boundsMin.z - margin, p.z <= boundsMax.z + margin
    else { return nil }
    return SIMD3<Float>(p.x, floorY, p.z)
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    return SpatialMapView.isMultiTouch(gestureRecognizer) && SpatialMapView.isMultiTouch(otherGestureRecognizer)
  }

  private static func isMultiTouch(_ recognizer: UIGestureRecognizer) -> Bool {
    if recognizer is UIPinchGestureRecognizer || recognizer is UIRotationGestureRecognizer {
      return true
    }
    if let pan = recognizer as? UIPanGestureRecognizer {
      return pan.minimumNumberOfTouches >= 2
    }
    return false
  }
}
