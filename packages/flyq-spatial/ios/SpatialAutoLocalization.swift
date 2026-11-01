import Foundation

// Everything the automatic localisation needs between ARKit and the matcher, kept free of ARKit
// so it can be tested on any machine (tools/autoloc):
// - LiveScanBuilder: LiDAR mesh chunks (or, without LiDAR, ARKit feature points) -> floor height +
//   points of walls / furniture (AR x, z);
// - AutoLocalizationJudge: when a match is good enough to trust;
// - AutoLocalizationCoach: the one hint shown to the user, and a progress value.

/// One ARMeshAnchor copied out of ARKit: positions and normals in anchor space.
struct LiveMeshChunk {
  /// Anchor -> AR world, column-major 4x4 (16 values).
  var transform: [Float]
  /// Float32 values; vertex i starts at i * vertexStride (x, y, z).
  var vertices: [Float]
  var vertexStride: Int
  var normals: [Float]
  var normalStride: Int
  var count: Int
}

/// A vertical ARPlaneAnchor reduced to its footprint on the floor (used when there is no LiDAR).
struct LivePlaneSegment {
  var x0: Float
  var z0: Float
  var x1: Float
  var z1: Float
  var centerY: Float
}

/// What the camera saw, copied on the main thread and processed in the background.
struct LiveGeometrySnapshot {
  /// Camera -> AR world, column-major 4x4.
  var cameraTransform: [Float]
  var chunks: [LiveMeshChunk]
  var planes: [LivePlaneSegment]
  /// AR y of planes ARKit classified as floor.
  var floorPlaneHeights: [Float]
  /// True when the device does LiDAR scene reconstruction.
  var meshSupported: Bool
  /// iPhones without LiDAR: ARKit feature points seen so far (AR world x, y, z triples).
  var featurePoints: [Float] = []
}

/// Live points ready for the matcher, plus what the coach needs to know.
struct LiveScan {
  /// Cell centres (AR x, z) of vertical surfaces in the height band.
  var points: [SIMD2<Float>]
  var floorY: Float
  /// "mesh" | "points" | "plane" | "camera"
  var floorSource: String
  /// Where the points come from: "mesh" (LiDAR) | "features" (ARKit points) | "planes" | "none".
  var source: String
  var camera: SIMD2<Float>
  var cameraY: Float
  /// Vertical component of the viewing direction (-1 = straight down, 1 = straight up).
  var forwardY: Float
  /// Horizontal viewing direction (unit length, or zero when looking straight down / up).
  var forward: SIMD2<Float>
  /// Fraction of the points closer than 1 m to the camera.
  var nearFraction: Float
  var vertexCount: Int
}

enum LiveScanBuilder {
  static let cell: Float = 0.05

  /// - Parameters:
  ///   - radius: only points this close to the camera (horizontally) are kept.
  ///   - minCount: mesh vertices needed in a 5 cm cell for it to count.
  static func build(_ snapshot: LiveGeometrySnapshot, bandMin: Float, bandMax: Float, maxAbsNormalY: Float,
                    radius: Float = 7.5, minCount: Int = 2) -> LiveScan? {
    let m = snapshot.cameraTransform
    guard m.count == 16, m.allSatisfy({ $0.isFinite }) else { return nil }
    let camX = m[12]
    let camY = m[13]
    let camZ = m[14]
    var fx = -m[8]
    var fy = -m[9]
    var fz = -m[10]
    let flen = (fx * fx + fy * fy + fz * fz).squareRoot()
    if flen > 1e-6 {
      fx /= flen
      fy /= flen
      fz /= flen
    }
    let hlen = (fx * fx + fz * fz).squareRoot()
    let forward = hlen > 0.3 ? SIMD2<Float>(fx / hlen, fz / hlen) : SIMD2<Float>(0, 0)

    // Pass 1: transform every vertex; floor histogram from upward faces, keep steep candidates.
    let histLow = camY - 2.3
    let binSize: Float = 0.02
    let binCount = 96
    var hist = [Int](repeating: 0, count: binCount)
    var candidates: [Float] = []  // x, y, z triples
    var vertexCount = 0
    let r2 = radius * radius
    for chunk in snapshot.chunks {
      let t = chunk.transform
      guard t.count == 16, t.allSatisfy({ $0.isFinite }), chunk.count > 0, chunk.vertexStride >= 3,
            chunk.normalStride >= 3,
            chunk.vertices.count >= (chunk.count - 1) * chunk.vertexStride + 3,
            chunk.normals.count >= (chunk.count - 1) * chunk.normalStride + 3
      else { continue }
      vertexCount += chunk.count
      // Matrix entries as locals: the loop runs for every vertex, also in unoptimised Debug builds.
      let t0 = t[0], t1 = t[1], t2 = t[2], t4 = t[4], t5 = t[5], t6 = t[6]
      let t8 = t[8], t9 = t[9], t10 = t[10], t12 = t[12], t13 = t[13], t14 = t[14]
      let count = chunk.count
      let vStride = chunk.vertexStride
      let nStride = chunk.normalStride
      chunk.vertices.withUnsafeBufferPointer { vbuf in
        chunk.normals.withUnsafeBufferPointer { nbuf in
          let v = vbuf.baseAddress!
          let n = nbuf.baseAddress!
          var i = 0
          while i < count {
            let vo = i * vStride
            let no = i * nStride
            let x = v[vo]
            let y = v[vo + 1]
            let z = v[vo + 2]
            let wx = t0 * x + t4 * y + t8 * z + t12
            let wy = t1 * x + t5 * y + t9 * z + t13
            let wz = t2 * x + t6 * y + t10 * z + t14
            let nx = n[no]
            let ny = n[no + 1]
            let nz = n[no + 2]
            let wny = t1 * nx + t5 * ny + t9 * nz
            if wny > 0.9 {
              // Range-check as Float first: NaN fails both comparisons, so Int() never traps.
              let fb = ((wy - histLow) / binSize).rounded(.down)
              if fb >= 0 && fb < Float(binCount) && wy < camY - 0.4 {
                hist[Int(fb)] += 1
              }
            } else if abs(wny) < maxAbsNormalY {
              let dx = wx - camX
              let dz = wz - camZ
              if dx * dx + dz * dz <= r2 {
                candidates.append(wx)
                candidates.append(wy)
                candidates.append(wz)
              }
            }
            i += 1
          }
        }
      }
    }

    // Without LiDAR: ARKit feature points. They have no normals, so every point counts: the floor
    // is the lowest dense layer of points (floors usually have texture: carpet, tiles), and all
    // points in the height band go to the map (furniture, doors, frames, posters...).
    let useFeatures = snapshot.chunks.isEmpty && snapshot.featurePoints.count >= 3
    var featureCandidates: [Float] = []
    if useFeatures {
      let f = snapshot.featurePoints
      var i = 0
      while i + 2 < f.count {
        let x = f[i]
        let y = f[i + 1]
        let z = f[i + 2]
        i += 3
        guard x.isFinite, y.isFinite, z.isFinite else { continue }
        let fb = ((y - histLow) / binSize).rounded(.down)
        if fb >= 0 && fb < Float(binCount) && y < camY - 0.4 {
          hist[Int(fb)] += 1
        }
        let dx = x - camX
        let dz = z - camZ
        if dx * dx + dz * dz <= r2 {
          featureCandidates.append(x)
          featureCandidates.append(y)
          featureCandidates.append(z)
        }
      }
      vertexCount = f.count / 3
    }

    // Floor: lowest clear peak of the (3-bin smoothed) histogram, else ARKit floor planes, else
    // the usual phone height.
    var floorY = camY - 1.4
    var floorSource = "camera"
    var smooth = [Int](repeating: 0, count: binCount)
    var smoothMax = 0
    for b in 0..<binCount {
      let s = hist[b] + (b > 0 ? hist[b - 1] : 0) + (b + 1 < binCount ? hist[b + 1] : 0)
      smooth[b] = s
      smoothMax = max(smoothMax, s)
    }
    let threshold = useFeatures ? max(15, smoothMax / 4) : max(60, smoothMax / 4)
    if smoothMax >= threshold {
      for b in 0..<binCount {
        let s = smooth[b]
        if s >= threshold && (b == 0 || s >= smooth[b - 1]) && (b + 1 == binCount || s >= smooth[b + 1]) {
          floorY = histLow + (Float(b) + 0.5) * binSize
          floorSource = useFeatures ? "points" : "mesh"
          break
        }
      }
    }
    if floorSource == "camera" {
      let usable = snapshot.floorPlaneHeights.filter { $0.isFinite && $0 < camY - 0.4 && $0 > camY - 2.3 }
      if let lowest = usable.min() {
        floorY = lowest
        floorSource = "plane"
      }
    }

    // Pass 2: height band -> 5 cm cells around the camera.
    let half = Int((radius / cell).rounded(.up)) + 1
    let side = 2 * half + 1
    var counts = [UInt16](repeating: 0, count: side * side)
    let originX = camX - Float(half) * cell
    let originZ = camZ - Float(half) * cell
    func bump(_ x: Float, _ z: Float, by amount: Int) {
      let cx = Int(((x - originX) / cell).rounded(.down))
      let cz = Int(((z - originZ) / cell).rounded(.down))
      guard cx >= 0, cz >= 0, cx < side, cz < side else { return }
      let index = cz * side + cx
      let value = Int(counts[index]) + amount
      counts[index] = UInt16(min(value, Int(UInt16.max)))
    }
    var k = 0
    while k + 2 < candidates.count {
      let h = candidates[k + 1] - floorY
      if h >= bandMin && h <= bandMax {
        bump(candidates[k], candidates[k + 2], by: 1)
      }
      k += 3
    }
    // Each feature point is a single observation: it counts as a full cell (the matcher's scoring
    // is robust to the stray ones).
    k = 0
    while k + 2 < featureCandidates.count {
      let h = featureCandidates[k + 1] - floorY
      if h >= bandMin && h <= bandMax {
        bump(featureCandidates[k], featureCandidates[k + 2], by: minCount)
      }
      k += 3
    }
    if snapshot.chunks.isEmpty {
      // No LiDAR: vertical planes too, sampled every 2.5 cm along their footprint.
      for plane in snapshot.planes {
        let h = plane.centerY - floorY
        guard h > bandMin - 0.5, h < bandMax + 0.5,
              plane.x0.isFinite, plane.z0.isFinite, plane.x1.isFinite, plane.z1.isFinite
        else { continue }
        let length = ((plane.x1 - plane.x0) * (plane.x1 - plane.x0) + (plane.z1 - plane.z0) * (plane.z1 - plane.z0)).squareRoot()
        let steps = min(800, max(1, Int(length / 0.025)))
        for s in 0...steps {
          let f = Float(s) / Float(steps)
          bump(plane.x0 + (plane.x1 - plane.x0) * f, plane.z0 + (plane.z1 - plane.z0) * f, by: minCount)
        }
      }
    }

    var points: [SIMD2<Float>] = []
    var near = 0
    for cz in 0..<side {
      for cx in 0..<side where Int(counts[cz * side + cx]) >= minCount {
        let x = originX + (Float(cx) + 0.5) * cell
        let z = originZ + (Float(cz) + 0.5) * cell
        points.append(SIMD2<Float>(x, z))
        let dx = x - camX
        let dz = z - camZ
        if dx * dx + dz * dz < 1 { near += 1 }
      }
    }
    let source = !snapshot.chunks.isEmpty ? "mesh" : (useFeatures ? "features" : (snapshot.planes.isEmpty ? "none" : "planes"))
    return LiveScan(points: points, floorY: floorY, floorSource: floorSource, source: source,
                    camera: SIMD2<Float>(camX, camZ), cameraY: camY, forwardY: fy, forward: forward,
                    nearFraction: points.isEmpty ? 0 : Float(near) / Float(points.count),
                    vertexCount: vertexCount)
  }
}

/// Background work of the automatic localisation (kept out of the UIView subclass, whose methods
/// belong to the main actor).
enum AutoLocalizationWork {
  /// Reads and prepares the localisation map.
  static func loadMatcher(url: URL, venueId: String) -> ((LocalizationMap, SpatialMatcher)?, String?) {
    do {
      let map = try LocalizationMap(contentsOf: url)
      guard map.venueId == venueId else {
        return (nil, "The localisation map is for '\(map.venueId)', not '\(venueId)'.")
      }
      return ((map, SpatialMatcher(map: map)), nil)
    } catch {
      return (nil, String(describing: error))
    }
  }

  /// Global search without a start pose; local refinement around it otherwise.
  static func match(scan: LiveScan?, start: (yaw: Double, tx: Double, tz: Double)?,
                    matcher: SpatialMatcher) -> RegistrationResult? {
    guard let scan = scan else { return nil }
    if let s = start {
      return matcher.refineLocally(points: scan.points, camera: scan.camera, yaw: s.yaw, tx: s.tx, tz: s.tz,
                                   translationRange: 0.3, angleRange: 3 * Float.pi / 180)
    }
    return matcher.search(points: scan.points, camera: scan.camera)
  }
}

/// When to trust a match. Thresholds from simulation on the office scan (tools/autoloc/README.md):
/// the ambiguity (runner-up score / best score) is what separates right from wrong matches.
struct AutoLocalizationPolicy {
  var strongAmbiguity = 0.70
  var ambiguity = 0.80
  var minScore = 0.45
  var minInliers = 0.40
  var minPoints = 150
  /// Two consecutive matches agree when the camera lands this close (m) and turned this little.
  var agreeDistance = 0.30
  var agreeAngle = 3.0 * Double.pi / 180
  // While navigating (local refinement).
  var trackMinScore = 0.35
  var trackMinInliers = 0.35
  var trackLostScore = 0.25
  var trackMinPoints = 120
  var trackMaxJump = 0.6
  var trackMaxTurn = 6.0 * Double.pi / 180
  var trackLostStreak = 3
}

enum AutoVerdict: String {
  case accept
  case needMoreData
  case poorMatch
  case ambiguous
  case confirming
}

final class AutoLocalizationJudge {
  let policy: AutoLocalizationPolicy
  private var previous: RegistrationResult?

  init(policy: AutoLocalizationPolicy = AutoLocalizationPolicy()) {
    self.policy = policy
  }

  func reset() {
    previous = nil
  }

  /// `camera`: AR x, z of the phone when the points were taken.
  func judge(_ result: RegistrationResult?, camera: SIMD2<Float>) -> AutoVerdict {
    guard let r = result else { return .needMoreData }
    let last = previous
    previous = r
    if r.pointCount < policy.minPoints { return .needMoreData }
    if r.score < policy.minScore || r.inliers < policy.minInliers { return .poorMatch }
    if r.ambiguity <= policy.strongAmbiguity { return .accept }
    if r.ambiguity <= policy.ambiguity {
      // Two attempts agree when both alignments put the *current* camera at the same place (the
      // user may have walked in between, which must not count as a disagreement).
      if let p = last {
        let a = r.apply(x: Double(camera.x), z: Double(camera.y))
        let b = p.apply(x: Double(camera.x), z: Double(camera.y))
        if hypot(a.x - b.x, a.z - b.z) < policy.agreeDistance
          && AutoLocalizationJudge.angleDiff(r.yaw, p.yaw) < policy.agreeAngle {
          return .accept
        }
      }
      return .confirming
    }
    return .ambiguous
  }

  static func angleDiff(_ a: Double, _ b: Double) -> Double {
    var d = (a - b).truncatingRemainder(dividingBy: 2 * Double.pi)
    if d > Double.pi { d -= 2 * Double.pi }
    if d < -Double.pi { d += 2 * Double.pi }
    return abs(d)
  }
}

/// Checks a position given by the visual memory against the LiDAR walls (memory sessions on LiDAR
/// iPhones, once ARKit recognised the place). Every 2 s a local refinement around the memory's
/// pose; every third check a global search on the same walls, which also scores the memory's pose
/// on exactly those walls (`memoryFit`).
///
/// The memory is trusted unless the walls clearly say otherwise: two consecutive confident global
/// matches (at most one inconclusive search between them) that agree with each other, put the user
/// more than 1.5 m (or 10 degrees) away from the memory, and fit those walls clearly better than the
/// memory's own pose refined on the same walls (same points, same scoring). A pose that fits about
/// as well as the best one (the next pillar of a repeating corridor) is an alias, not a
/// contradiction. Then `correction` is the wall match to switch to. The local checks refresh the
/// confidence and are logged; in a corridor that repeats itself they fit a wrong pose half-way, so
/// they do not decide (tools/autoloc/memory_verify_test.py: a right memory is never contradicted).
struct MemoryWallVerifier {
  enum Verdict: String {
    /// Not enough walls seen yet, or nothing conclusive.
    case pending
    /// The walls fit the memory's position.
    case agrees
    /// Something does not fit (not enough to act on).
    case disagrees
    /// The walls are sure the memory is wrong: switch to `correction`.
    case contradicted
  }

  let policy: AutoLocalizationPolicy
  /// The walls must put the camera at least this far (m) or this much turned from the memory's
  /// pose to contradict it.
  var minOffset = 1.5
  var minTurn = 10 * Double.pi / 180
  /// "Clearly better": the memory's pose scores below this share of the best match (and at least
  /// `minMargin` lower) on the same walls.
  var relativeFit = 0.80
  var minMargin = 0.10
  private(set) var agreements = 0
  /// Poor local fits at the memory's pose since the last good one.
  private(set) var poorFits = 0
  /// Consecutive agreeing contradictions from the global searches.
  private(set) var contradictions = 0
  private var contradiction: RegistrationResult?
  private var inconclusiveGlobals = 0

  init(policy: AutoLocalizationPolicy = AutoLocalizationPolicy()) {
    self.policy = policy
  }

  mutating func reset() {
    agreements = 0
    poorFits = 0
    contradictions = 0
    contradiction = nil
    inconclusiveGlobals = 0
  }

  /// The confident wall match to switch to (only meaningful after `.contradicted`).
  var correction: RegistrationResult? {
    return contradictions >= 2 ? contradiction : nil
  }

  private func clearlyWorse(_ memoryScore: Double, than best: Double) -> Bool {
    return memoryScore < relativeFit * best && memoryScore + minMargin < best
  }

  private var verdictAfterEvidence: Verdict {
    return contradictions >= 2 ? .contradicted : .disagrees
  }

  /// Local refinement of the walls around the memory's alignment (logged; never decides alone).
  mutating func local(_ r: RegistrationResult?) -> Verdict {
    guard let r = r, r.pointCount >= policy.trackMinPoints else { return .pending }
    if r.score < policy.trackLostScore {
      poorFits += 1
      return .disagrees
    }
    if r.score >= policy.trackMinScore && r.inliers >= policy.trackMinInliers {
      agreements += 1
      poorFits = 0
      return .agrees
    }
    // In between: not good enough to clear doubts, not bad enough to add any.
    return .pending
  }

  /// Global wall search. `memoryFit`: the memory's pose refined on the same walls (nil when it
  /// could not be scored); `memory`: the memory's AR -> model alignment now; `camera`: AR x, z of
  /// the phone when the walls were taken.
  mutating func global(_ r: RegistrationResult?, memoryFit: RegistrationResult?,
                       memory: (yaw: Double, tx: Double, tz: Double), camera: SIMD2<Float>) -> Verdict {
    // Ambiguity up to the two-attempt limit: a contradiction needs two agreeing matches anyway.
    guard let r = r, r.pointCount >= policy.minPoints, r.score >= policy.minScore,
          r.inliers >= policy.minInliers, r.ambiguity <= policy.ambiguity
    else {
      inconclusiveGlobals += 1
      if inconclusiveGlobals >= 2 {
        contradictions = 0
        contradiction = nil
      }
      return .pending
    }
    inconclusiveGlobals = 0
    let x = Double(camera.x)
    let z = Double(camera.y)
    let walls = r.apply(x: x, z: z)
    let c = cos(memory.yaw)
    let s = sin(memory.yaw)
    let mx = c * x + s * z + memory.tx
    let mz = -s * x + c * z + memory.tz
    let offset = hypot(walls.x - mx, walls.z - mz)
    let turn = AutoLocalizationJudge.angleDiff(r.yaw, memory.yaw)
    if offset < 0.5 && turn < 3 * Double.pi / 180 {
      agreements += 1
      contradictions = 0
      contradiction = nil
      return .agrees
    }
    let elsewhere = offset >= minOffset || turn >= minTurn
    let memoryScore = memoryFit?.score ?? 0
    guard elsewhere, clearlyWorse(memoryScore, than: r.score) else {
      // Close by, or the memory's pose fits these walls about as well (an alias): no contradiction.
      contradictions = 0
      contradiction = nil
      return .disagrees
    }
    // Two contradicting matches must agree with each other (same alignment, compared where they
    // put the current camera: the user may have walked in between).
    if let previous = contradiction {
      let p = previous.apply(x: x, z: z)
      if hypot(walls.x - p.x, walls.z - p.z) < 2 * policy.agreeDistance
        && AutoLocalizationJudge.angleDiff(r.yaw, previous.yaw) < 2 * policy.agreeAngle {
        contradictions += 1
      } else {
        contradictions = 1
      }
    } else {
      contradictions = 1
    }
    contradiction = r
    return verdictAfterEvidence
  }
}

/// Which directions the user has already looked at (12 sectors of 30 degrees).
struct LookCoverage {
  private(set) var sectors = [Bool](repeating: false, count: 12)

  mutating func reset() {
    sectors = [Bool](repeating: false, count: 12)
  }

  mutating func add(forward: SIMD2<Float>) {
    guard forward.x != 0 || forward.y != 0, forward.x.isFinite, forward.y.isFinite else { return }
    var angle = atan2(forward.y, forward.x)
    if angle < 0 { angle += 2 * Float.pi }
    let index = min(11, max(0, Int(angle / (2 * Float.pi) * 12)))
    sectors[index] = true
  }

  var fraction: Double {
    return Double(sectors.filter { $0 }.count) / 12
  }
}

enum AutoHint: String {
  case starting = "AUTO_STARTING"
  case tooFast = "AUTO_TOO_FAST"
  case lowDetail = "AUTO_LOW_DETAIL"
  case holdStill = "AUTO_HOLD_STILL"
  case raisePhone = "AUTO_RAISE_PHONE"
  case lowerPhone = "AUTO_LOWER_PHONE"
  case stepBack = "AUTO_STEP_BACK"
  case lookAround = "AUTO_LOOK_AROUND"
  case turnAround = "AUTO_TURN_AROUND"
  case walk = "AUTO_WALK"
  case notRecognized = "AUTO_NOT_RECOGNIZED"
  case almost = "AUTO_ALMOST"
  /// Visual memory: look along the hall, towards its ends and doors (what the recording walk saw).
  case lookAlong = "AUTO_LOOK_ALONG"
  /// Visual memory: the other direction may be the one the memory knows better.
  case turnOther = "AUTO_TURN_OTHER"
}

enum AutoLocalizationCoach {
  struct Input {
    var trackingState: String
    var trackingReason: String?
    var scan: LiveScan?
    var verdict: AutoVerdict?
    var coverage: Double
    var elapsed: Double
  }

  static func hint(_ input: Input) -> AutoHint {
    if input.trackingState != "normal" {
      switch input.trackingReason {
      case "excessiveMotion"?:
        return .tooFast
      case "insufficientFeatures"?:
        return .lowDetail
      case "relocalizing"?, "interrupted"?:
        return .holdStill
      default:
        return .starting
      }
    }
    if let scan = input.scan {
      if scan.forwardY < -0.65 { return .raisePhone }
      if scan.forwardY > 0.65 { return .lowerPhone }
      if scan.points.count >= 50 && scan.nearFraction > 0.6 { return .stepBack }
    }
    switch input.verdict {
    case .confirming?, .accept?:
      return .almost
    case .ambiguous?:
      return input.coverage < 0.5 ? .turnAround : .walk
    case .poorMatch?:
      return input.elapsed > 25 ? .notRecognized : .lookAround
    case .needMoreData?, nil:
      return input.coverage >= 0.75 && input.elapsed > 20 ? .walk : .lookAround
    }
  }

  /// While ARKit compares the camera with the venue's visual memory. ARKit recognises a spot from
  /// views like the ones it was recorded from: looking along the hall, towards its ends, doors and
  /// signs; not the floor, a bare wall up close or the windows (repetitive frames, the outside
  /// changes). `featureLevel`: feature points ARKit sees right now (nil when unknown).
  static func relocalizationHint(trackingState: String, trackingReason: String?, forwardY: Float?,
                                 coverage: Double, elapsed: Double, featureLevel: Double? = nil) -> AutoHint {
    if trackingState == "notAvailable" { return .starting }
    switch trackingReason {
    case "excessiveMotion"?:
      return .tooFast
    case "insufficientFeatures"?:
      return .lowDetail
    case "initializing"?:
      return .starting
    default:
      break
    }
    if let fy = forwardY {
      if fy < -0.65 { return .raisePhone }
      if fy > 0.65 { return .lowerPhone }
    }
    if let level = featureLevel, level < 40, elapsed > 2 { return .lowDetail }
    if elapsed < 7 { return .lookAlong }
    if elapsed < 13 { return coverage < 0.5 ? .turnOther : .lookAlong }
    return .walk
  }

  static func relocalizationProgress(coverage: Double, elapsed: Double) -> Double {
    return min(0.9, 0.1 + 0.6 * min(1, coverage / 0.6) + 0.2 * min(1, elapsed / 15))
  }

  /// 0...1, only for the progress bar.
  static func progress(points: Int, coverage: Double, result: RegistrationResult?, verdict: AutoVerdict?) -> Double {
    let data = min(1, Double(points) / 600)
    let look = min(1, coverage / 0.5)
    var confidence = 0.0
    if let r = result, verdict != .poorMatch {
      confidence = max(0, min(1, (0.95 - r.ambiguity) / 0.15))
    }
    var value = 0.35 * data + 0.25 * look + 0.4 * confidence
    if verdict == .confirming { value = max(value, 0.85) }
    if verdict == .accept { value = 1 }
    return max(0, min(1, value))
  }
}

/// Which of a venue's visual memories (zones) a search tries first. A zone is a recording aligned
/// to the map; ARKit recognises the place only from a memory that saw it, so the order matters on
/// a large venue: the zones whose walk passed closest to where the pin last was come first, and the
/// zone that recognised the place last time leads when the user was within its walk.
enum MemoryZonePlanner {
  struct Zone {
    let id: String
    /// Model x, z of the recorded walk (a point every few metres).
    let path: [SIMD2<Double>]
  }

  /// Within this distance (m) of its walk, the zone that worked last time is tried first.
  static let lastZoneReach = 6.0

  static func distance(from p: SIMD2<Double>, to zone: Zone) -> Double {
    var best = Double.infinity
    for q in zone.path {
      let dx = q.x - p.x
      let dz = q.y - p.y
      best = min(best, (dx * dx + dz * dz).squareRoot())
    }
    return best
  }

  /// Indices of `zones` in the order to try them (manifest order when nothing is known).
  static func order(_ zones: [Zone], lastPosition: SIMD2<Double>?, lastZone: String?) -> [Int] {
    var indices = Array(zones.indices)
    if let p = lastPosition {
      let d = zones.map { distance(from: p, to: $0) }
      indices.sort { d[$0] != d[$1] ? d[$0] < d[$1] : $0 < $1 }
      if let last = lastZone, let i = indices.firstIndex(where: { zones[$0].id == last }),
         d[indices[i]] <= lastZoneReach {
        indices.insert(indices.remove(at: i), at: 0)
      }
    } else if let last = lastZone, let i = indices.firstIndex(where: { zones[$0].id == last }) {
      indices.insert(indices.remove(at: i), at: 0)
    }
    return indices
  }
}
