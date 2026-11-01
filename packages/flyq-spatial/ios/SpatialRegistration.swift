import Dispatch
import Foundation

// Automatic localisation core.
//
// The iPhone's LiDAR mesh is reduced to its vertical surfaces (walls, doors, furniture sides),
// projected on the floor plane and matched against the venue's localisation map (the same kind of
// projection, made from the scan by tools/build_locmap.py). Both are metric and gravity-aligned,
// so only a rotation around the vertical axis and a horizontal translation are searched:
// coarse brute force over every rotation and position, then local refinement of the best peaks.
//
// Pure Swift + Foundation (no ARKit, no simd module): the same file is compiled and tested on Linux
// against the Python reference (tools/test_registration/). 2D points are SIMD2<Float> with
// .x = x and .y = z (metres).

/// Top-down grid of distances (m) to the nearest vertical surface of the venue scan.
final class LocalizationMap {
  let venueId: String
  /// Metres per cell.
  let resolution: Float
  /// Model x / z of the grid's first cell edge.
  let originX: Float
  let originZ: Float
  let width: Int
  let height: Int
  let floorY: Float
  /// Height band above the floor used for the map (and for the live points), metres.
  let bandMin: Float
  let bandMax: Float
  /// Faces count as vertical when |normal.y| is below this.
  let maxAbsNormalY: Float
  /// Metres, row-major: index = z * width + x.
  let distance: [Float]
  /// Extent of the scanned vertical surfaces (model metres): where the user can be.
  let minX: Float
  let minZ: Float
  let maxX: Float
  let maxZ: Float

  /// Value used outside the grid (and the largest value a grid cell can hold).
  static let farDistance: Float = 2.55

  enum LoadError: Error, CustomStringConvertible {
    case invalid(String)

    var description: String {
      switch self {
      case .invalid(let detail):
        return "Invalid localisation map: \(detail)"
      }
    }
  }

  private struct File: Decodable {
    let schemaVersion: Int
    let venueId: String
    let resolution: Double
    let origin: [Double]
    let width: Int
    let height: Int
    let floorY: Double
    let band: [Double]
    let maxAbsNormalY: Double
    let distanceUnit: Double
    let distance: String
  }

  convenience init(contentsOf url: URL) throws {
    try self.init(data: try Data(contentsOf: url))
  }

  init(data: Data) throws {
    let file = try JSONDecoder().decode(File.self, from: data)
    guard file.schemaVersion == 1 else {
      throw LoadError.invalid("unsupported schemaVersion \(file.schemaVersion)")
    }
    guard file.resolution >= 0.01, file.resolution <= 0.5 else {
      throw LoadError.invalid("resolution \(file.resolution)")
    }
    guard file.width >= 8, file.height >= 8, file.width <= 8000, file.height <= 8000 else {
      throw LoadError.invalid("size \(file.width)x\(file.height)")
    }
    guard file.origin.count == 2, file.origin[0].isFinite, file.origin[1].isFinite,
          file.band.count == 2, file.band[0] < file.band[1],
          file.distanceUnit > 0, file.maxAbsNormalY > 0, file.maxAbsNormalY <= 1, file.floorY.isFinite
    else {
      throw LoadError.invalid("origin / band / units")
    }
    let count = file.width * file.height
    guard let bytes = Data(base64Encoded: file.distance), bytes.count == count else {
      throw LoadError.invalid("distance grid does not match \(file.width)x\(file.height)")
    }
    let unit = Float(file.distanceUnit)
    let w = file.width
    var values = [Float](repeating: 0, count: count)
    var lowX = Int.max
    var lowZ = Int.max
    var highX = -1
    var highZ = -1
    bytes.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
      for i in 0..<count {
        let b = raw[i]
        values[i] = Float(b) * unit
        if b == 0 {
          let x = i % w
          let z = i / w
          if x < lowX { lowX = x }
          if x > highX { highX = x }
          if z < lowZ { lowZ = z }
          if z > highZ { highZ = z }
        }
      }
    }
    guard highX >= 0 else {
      throw LoadError.invalid("the map has no surfaces")
    }
    let res = Float(file.resolution)
    venueId = file.venueId
    resolution = res
    originX = Float(file.origin[0])
    originZ = Float(file.origin[1])
    width = file.width
    height = file.height
    floorY = Float(file.floorY)
    bandMin = Float(file.band[0])
    bandMax = Float(file.band[1])
    maxAbsNormalY = Float(file.maxAbsNormalY)
    distance = values
    minX = originX + Float(lowX) * res
    minZ = originZ + Float(lowZ) * res
    maxX = originX + Float(highX + 1) * res
    maxZ = originZ + Float(highZ + 1) * res
  }

  /// Distance (m) to the nearest mapped surface at a model point; `farDistance` outside the grid.
  func distanceAt(x: Float, z: Float) -> Float {
    let fx = (x - originX) / resolution
    let fz = (z - originZ) / resolution
    guard fx >= 0, fz >= 0, fx < Float(width), fz < Float(height) else { return LocalizationMap.farDistance }
    return distance[Int(fz) * width + Int(fx)]
  }
}

/// Tuning of the matcher. Defaults validated in simulation on the office scan
/// (tools/test_registration/README.md).
struct RegistrationParams {
  /// Coarse cells = this many map cells (0.05 m * 4 = 0.2 m).
  var coarseFactor = 4
  var sigmaCoarse: Float = 0.20
  var rotationStepCoarse: Float = 3 * Float.pi / 180
  var maxPointsCoarse = 400
  /// Peaks kept per rotation in the coarse search, then candidates kept overall.
  var peaksPerRotation = 4
  var topK = 12
  var nmsDistance: Float = 0.75
  var nmsAngle: Float = 12 * Float.pi / 180
  var sigmaFine: Float = 0.08
  var maxPointsFine = 1200
  var refineT: Float = 0.30
  var refineTStep: Float = 0.05
  var refineA: Float = 3 * Float.pi / 180
  var refineAStep: Float = 0.5 * Float.pi / 180
  var polishT: Float = 0.06
  var polishTStep: Float = 0.015
  var polishA: Float = 0.6 * Float.pi / 180
  var polishAStep: Float = 0.15 * Float.pi / 180
  /// A live point is an inlier when it lands this close to a mapped surface.
  var inlierDistance: Float = 0.10
  /// The runner-up only counts as an alternative when it is this different from the best pose.
  var distinctDistance: Float = 1.0
  var distinctAngle: Float = 15 * Float.pi / 180
  /// Live points farther than this from the camera are ignored. 15 m: what the LiDAR saw over the
  /// last steps of a walk, which breaks the repetition of a long corridor (walk test on the airport
  /// corridor: found within 16 m of walking 46/56 vs 37/56 with 7 m, never a wrong place).
  var maxRadius: Float = 15.0
  var boundsMargin: Float = 0.5
  var minPoints = 10
}

/// AR -> model transform found by the matcher: model = R(yaw) * ar + t (YawAlignment convention,
/// x' = cos*x + sin*z, z' = -sin*x + cos*z), plus how good the match is.
struct RegistrationResult {
  let yaw: Double
  let tx: Double
  let tz: Double
  /// Mean likelihood of the live points on the map (0...1).
  let score: Double
  /// Fraction of live points within `inlierDistance` of a mapped surface.
  let inliers: Double
  /// Score of the best clearly different pose (0 when there is none).
  let second: Double
  let pointCount: Int

  /// second / score: near 1 = two different places fit equally well (ambiguous).
  var ambiguity: Double {
    return score > 1e-6 ? min(1, second / score) : 1
  }

  func apply(x: Double, z: Double) -> (x: Double, z: Double) {
    let c = cos(yaw)
    let s = sin(yaw)
    return (c * x + s * z + tx, -s * x + c * z + tz)
  }
}

/// Matches live 2D points against a LocalizationMap. Thread-safe after init (all state immutable).
final class SpatialMatcher {
  let map: LocalizationMap
  let params: RegistrationParams

  private let fine: [Float]
  private let coarse: [Float]
  private let coarseRes: Float
  private let pad: Int
  private let paddedWidth: Int
  private let u0: Int
  private let u1: Int
  private let v0: Int
  private let v1: Int

  private struct Pose {
    var theta: Float
    var mx: Float
    var mz: Float
    var score: Float
  }

  private struct Peak {
    var score: Float
    var rotation: Int
    var cell: Int
  }

  init(map: LocalizationMap, params: RegistrationParams = RegistrationParams()) {
    self.map = map
    self.params = params

    let sigmaF = params.sigmaFine
    let denomF = 2 * sigmaF * sigmaF
    var fineValues = [Float](repeating: 0, count: map.distance.count)
    for i in 0..<map.distance.count {
      let d = map.distance[i]
      fineValues[i] = exp(-(d * d) / denomF)
    }
    fine = fineValues

    let factor = max(1, params.coarseFactor)
    let cw = (map.width + factor - 1) / factor
    let ch = (map.height + factor - 1) / factor
    let cres = map.resolution * Float(factor)
    let padCells = Int((params.maxRadius / cres).rounded(.up)) + 2
    let pw = cw + 2 * padCells
    let ph = ch + 2 * padCells
    let sigmaC = params.sigmaCoarse
    let denomC = 2 * sigmaC * sigmaC
    var coarseValues = [Float](repeating: 0, count: pw * ph)
    for cz in 0..<ch {
      for cx in 0..<cw {
        var dmin = LocalizationMap.farDistance
        let zEnd = min(map.height, (cz + 1) * factor)
        let xEnd = min(map.width, (cx + 1) * factor)
        var fz = cz * factor
        while fz < zEnd {
          var fx = cx * factor
          while fx < xEnd {
            let d = map.distance[fz * map.width + fx]
            if d < dmin { dmin = d }
            fx += 1
          }
          fz += 1
        }
        coarseValues[(cz + padCells) * pw + (cx + padCells)] = exp(-(dmin * dmin) / denomC)
      }
    }
    coarse = coarseValues
    coarseRes = cres
    pad = padCells
    paddedWidth = pw

    let margin = params.boundsMargin
    u0 = max(0, Int(((map.minX - margin - map.originX) / cres).rounded(.down)))
    u1 = min(cw - 1, Int(((map.maxX + margin - map.originX) / cres).rounded(.down)))
    v0 = max(0, Int(((map.minZ - margin - map.originZ) / cres).rounded(.down)))
    v1 = min(ch - 1, Int(((map.maxZ + margin - map.originZ) / cres).rounded(.down)))
  }

  // MARK: - Public API

  /// Global search: every rotation, every position in the venue. `camera` (AR x, z) limits the
  /// live points to the ones around the user. Returns nil when there are too few points.
  func search(points: [SIMD2<Float>], camera: SIMD2<Float>?) -> RegistrationResult? {
    guard let prepared = prepare(points: points, camera: camera) else { return nil }
    let q = prepared.relative
    let qc = SpatialMatcher.subsample(SpatialMatcher.dedupe(q, cell: coarseRes), max: params.maxPointsCoarse)
    let qf = SpatialMatcher.subsample(q, max: params.maxPointsFine)
    guard !qc.isEmpty, !qf.isEmpty, u1 >= u0, v1 >= v0 else { return nil }

    let candidates = coarseCandidates(qc)
    guard !candidates.isEmpty else { return nil }

    var refined = [Pose](repeating: Pose(theta: 0, mx: 0, mz: 0, score: -1), count: candidates.count)
    refined.withUnsafeMutableBufferPointer { out in
      let base = out.baseAddress!
      DispatchQueue.concurrentPerform(iterations: candidates.count) { i in
        base[i] = refine(qf, candidates[i], tRange: params.refineT, tStep: params.refineTStep,
                         aRange: params.refineA, aStep: params.refineAStep, bilinear: false)
      }
    }
    refined = SpatialMatcher.sortedByScore(refined)

    let polishCount = min(3, refined.count)
    var polished = [Pose](repeating: Pose(theta: 0, mx: 0, mz: 0, score: -1), count: polishCount)
    for i in 0..<polishCount {
      polished[i] = refine(qf, refined[i], tRange: params.polishT, tStep: params.polishTStep,
                           aRange: params.polishA, aStep: params.polishAStep, bilinear: true)
    }
    polished = SpatialMatcher.sortedByScore(polished)
    let best = polished[0]

    var alternatives = Array(polished.dropFirst())
    alternatives.append(contentsOf: refined.dropFirst(polishCount))
    var second: Float = 0
    for alt in alternatives {
      let da = abs(SpatialMatcher.angleDelta(alt.theta, best.theta))
      let dx = alt.mx - best.mx
      let dz = alt.mz - best.mz
      if (dx * dx + dz * dz).squareRoot() >= params.distinctDistance || da >= params.distinctAngle {
        second = max(second, finalScore(qf, alt))
      }
    }
    return makeResult(best: best, q: q, qf: qf, center: prepared.center, second: second)
  }

  /// Local refinement around a known alignment (tracking): small translation / rotation window.
  func refineLocally(points: [SIMD2<Float>], camera: SIMD2<Float>?, yaw: Double, tx: Double, tz: Double,
                     translationRange: Float = 0.30, angleRange: Float = 3 * Float.pi / 180) -> RegistrationResult? {
    guard let prepared = prepare(points: points, camera: camera) else { return nil }
    let q = prepared.relative
    let qf = SpatialMatcher.subsample(q, max: params.maxPointsFine)
    guard !qf.isEmpty, yaw.isFinite, tx.isFinite, tz.isFinite else { return nil }
    let theta = Float(yaw)
    let c = cos(theta)
    let s = sin(theta)
    let center = prepared.center
    let start = Pose(theta: theta,
                     mx: c * center.x + s * center.y + Float(tx),
                     mz: -s * center.x + c * center.y + Float(tz),
                     score: 0)
    let coarseStep = max(params.refineTStep, translationRange / 6)
    let angleStep = max(params.refineAStep, angleRange / 6)
    let refined = refine(qf, start, tRange: translationRange, tStep: coarseStep,
                         aRange: angleRange, aStep: angleStep, bilinear: false)
    let polished = refine(qf, refined, tRange: params.polishT, tStep: params.polishTStep,
                          aRange: params.polishA, aStep: params.polishAStep, bilinear: true)
    return makeResult(best: polished, q: q, qf: qf, center: center, second: 0)
  }

  /// Score of a given alignment (no search).
  func evaluate(points: [SIMD2<Float>], camera: SIMD2<Float>?, yaw: Double, tx: Double, tz: Double) -> RegistrationResult? {
    guard let prepared = prepare(points: points, camera: camera), yaw.isFinite, tx.isFinite, tz.isFinite else {
      return nil
    }
    let q = prepared.relative
    let qf = SpatialMatcher.subsample(q, max: params.maxPointsFine)
    let theta = Float(yaw)
    let c = cos(theta)
    let s = sin(theta)
    let center = prepared.center
    let pose = Pose(theta: theta,
                    mx: c * center.x + s * center.y + Float(tx),
                    mz: -s * center.x + c * center.y + Float(tz),
                    score: 0)
    return makeResult(best: pose, q: q, qf: qf, center: center, second: 0)
  }

  // MARK: - Steps

  private struct Prepared {
    let relative: [SIMD2<Float>]
    let center: SIMD2<Float>
  }

  /// Drops invalid / far points and centres the rest on their centroid.
  private func prepare(points: [SIMD2<Float>], camera: SIMD2<Float>?) -> Prepared? {
    var pts: [SIMD2<Float>] = []
    pts.reserveCapacity(points.count)
    let r2 = params.maxRadius * params.maxRadius
    let cam = camera.flatMap { $0.x.isFinite && $0.y.isFinite ? $0 : nil }
    for v in points {
      guard v.x.isFinite, v.y.isFinite, abs(v.x) < 100_000, abs(v.y) < 100_000 else { continue }
      if let c = cam {
        let dx = v.x - c.x
        let dz = v.y - c.y
        if dx * dx + dz * dz > r2 { continue }
      }
      pts.append(v)
    }
    guard pts.count >= params.minPoints else { return nil }
    var sx = 0.0
    var sz = 0.0
    for v in pts {
      sx += Double(v.x)
      sz += Double(v.y)
    }
    let center = SIMD2<Float>(Float(sx / Double(pts.count)), Float(sz / Double(pts.count)))
    let limit = params.maxRadius - 0.5
    let limit2 = limit * limit
    var q: [SIMD2<Float>] = []
    q.reserveCapacity(pts.count)
    for v in pts {
      let d = SIMD2<Float>(v.x - center.x, v.y - center.y)
      if d.x * d.x + d.y * d.y <= limit2 {
        q.append(d)
      }
    }
    guard q.count >= params.minPoints else { return nil }
    return Prepared(relative: q, center: center)
  }

  /// Brute force over rotations x centroid positions on the coarse grid; returns the best,
  /// mutually distinct peaks.
  private func coarseCandidates(_ qc: [SIMD2<Float>]) -> [Pose] {
    let nRot = max(1, Int((2 * Float.pi / params.rotationStepCoarse).rounded()))
    let width = u1 - u0 + 1
    let height = v1 - v0 + 1
    let cells = width * height
    let perRotation = max(1, params.peaksPerRotation)
    let pointCount = Float(qc.count)
    var peaks = [Peak](repeating: Peak(score: -1, rotation: 0, cell: 0), count: nRot * perRotation)

    coarse.withUnsafeBufferPointer { grid in
      peaks.withUnsafeMutableBufferPointer { peakBuffer in
        let gridBase = grid.baseAddress!
        let peakBase = peakBuffer.baseAddress!
        DispatchQueue.concurrentPerform(iterations: nRot) { k in
          let theta = Float(k) * 2 * Float.pi / Float(nRot)
          let c = cos(theta)
          let s = sin(theta)
          let acc = UnsafeMutablePointer<Float>.allocate(capacity: cells)
          acc.initialize(repeating: 0, count: cells)
          defer { acc.deallocate() }
          for p in qc {
            let rx = c * p.x + s * p.y
            let rz = -s * p.x + c * p.y
            let ox = Int((rx / coarseRes + 0.5).rounded(.down))
            let oz = Int((rz / coarseRes + 0.5).rounded(.down))
            var v = 0
            while v < height {
              let src = gridBase + ((pad + v0 + v + oz) * paddedWidth + (pad + u0 + ox))
              let dst = acc + v * width
              var u = 0
              while u < width {
                dst[u] += src[u]
                u += 1
              }
              v += 1
            }
          }
          // Local maxima (8-neighbourhood) of this rotation, best `perRotation` kept.
          let slot = peakBase + k * perRotation
          var v = 0
          while v < height {
            var u = 0
            while u < width {
              let value = acc[v * width + u] / pointCount
              if value > 0 && SpatialMatcher.isLocalMax(acc, width: width, height: height, u: u, v: v) {
                SpatialMatcher.insertPeak(slot, count: perRotation,
                                          Peak(score: value, rotation: k, cell: v * width + u))
              }
              u += 1
            }
            v += 1
          }
        }
      }
    }

    var all = peaks.filter { $0.score > 0 }
    all.sort { a, b in
      if a.score != b.score { return a.score > b.score }
      if a.rotation != b.rotation { return a.rotation < b.rotation }
      return a.cell < b.cell
    }
    guard let bestScore = all.first?.score else { return [] }
    var out: [Pose] = []
    for peak in all {
      if peak.score < 0.5 * bestScore || out.count >= params.topK { break }
      let theta = Float(peak.rotation) * 2 * Float.pi / Float(nRot)
      let v = peak.cell / width
      let u = peak.cell % width
      let mx = map.originX + (Float(u0 + u) + 0.5) * coarseRes
      let mz = map.originZ + (Float(v0 + v) + 0.5) * coarseRes
      var clash = false
      for other in out {
        let dx = mx - other.mx
        let dz = mz - other.mz
        if (dx * dx + dz * dz).squareRoot() < params.nmsDistance
          && abs(SpatialMatcher.angleDelta(theta, other.theta)) < params.nmsAngle {
          clash = true
          break
        }
      }
      if !clash {
        out.append(Pose(theta: theta, mx: mx, mz: mz, score: peak.score))
      }
    }
    return out
  }

  private static func isLocalMax(_ acc: UnsafeMutablePointer<Float>, width: Int, height: Int, u: Int, v: Int) -> Bool {
    let value = acc[v * width + u]
    var dv = -1
    while dv <= 1 {
      let vv = v + dv
      if vv >= 0 && vv < height {
        var du = -1
        while du <= 1 {
          let uu = u + du
          if (du != 0 || dv != 0) && uu >= 0 && uu < width && acc[vv * width + uu] > value {
            return false
          }
          du += 1
        }
      }
      dv += 1
    }
    return true
  }

  /// Keeps `slot[0..<count]` sorted by score (descending; ties: smaller cell first).
  private static func insertPeak(_ slot: UnsafeMutablePointer<Peak>, count: Int, _ peak: Peak) {
    var i = count - 1
    let last = slot[i]
    if peak.score < last.score || (peak.score == last.score && last.score > 0 && peak.cell > last.cell) {
      return
    }
    while i > 0 {
      let prev = slot[i - 1]
      if prev.score > peak.score || (prev.score == peak.score && prev.cell < peak.cell) {
        break
      }
      slot[i] = prev
      i -= 1
    }
    slot[i] = peak
  }

  /// Grid search around a pose on the fine map.
  /// - nearest mode: translations move by whole cells (tStep rounded to cells), scores accumulate per
  ///   point over the window like the coarse search (fast even in unoptimised Debug builds);
  /// - bilinear mode: continuous offsets with bilinear lookups (sub-cell polish).
  /// Ties keep the first pose in (angle, z offset, x offset) order, like the Python reference.
  private func refine(_ q: [SIMD2<Float>], _ start: Pose, tRange: Float, tStep: Float,
                      aRange: Float, aStep: Float, bilinear: Bool) -> Pose {
    let count = q.count
    var best = Pose(theta: start.theta, mx: start.mx, mz: start.mz, score: -1)
    guard count > 0, start.mx.isFinite, start.mz.isFinite, start.theta.isFinite else { return best }
    let res = map.resolution
    let invRes = 1 / res
    let w = map.width
    let h = map.height
    let fw = Float(w)
    let fh = Float(h)
    let fcount = Float(count)
    let nt = max(0, Int((tRange / tStep).rounded()))
    let na = max(0, Int((aRange / aStep).rounded()))
    let side = 2 * nt + 1
    let stepCells = max(1, Int((tStep * invRes).rounded()))

    let qx = UnsafeMutablePointer<Float>.allocate(capacity: count)
    let qz = UnsafeMutablePointer<Float>.allocate(capacity: count)
    let acc = UnsafeMutablePointer<Float>.allocate(capacity: side * side)
    defer {
      qx.deallocate()
      qz.deallocate()
      acc.deallocate()
    }
    for i in 0..<count {
      let p = q[i]
      qx[i] = p.x
      qz[i] = p.y
    }

    fine.withUnsafeBufferPointer { gridBuffer in
      let grid = gridBuffer.baseAddress!
      var ia = -na
      while ia <= na {
        let theta = start.theta + Float(ia) * aStep
        let c = cos(theta)
        let s = sin(theta)
        acc.initialize(repeating: 0, count: side * side)
        var i = 0
        while i < count {
          let x = start.mx + c * qx[i] + s * qz[i]
          let z = start.mz - s * qx[i] + c * qz[i]
          if bilinear {
            // Fractional cell coordinates relative to cell centres.
            let bx = (x - map.originX) * invRes - 0.5
            let bz = (z - map.originZ) * invRes - 0.5
            var iz = 0
            while iz < side {
              let fz = bz + Float(iz - nt) * tStep * invRes
              var ix = 0
              while ix < side {
                let fx = bx + Float(ix - nt) * tStep * invRes
                if fx > -1 && fz > -1 && fx < fw && fz < fh {
                  let flx = floor(fx)
                  let flz = floor(fz)
                  let cx = Int(flx)
                  let cz = Int(flz)
                  let ax = fx - flx
                  let az = fz - flz
                  let x0ok = cx >= 0
                  let x1ok = cx + 1 < w
                  let z0ok = cz >= 0
                  let z1ok = cz + 1 < h
                  var v: Float = 0
                  if z0ok {
                    let row = cz * w
                    if x0ok { v += (1 - ax) * (1 - az) * grid[row + cx] }
                    if x1ok { v += ax * (1 - az) * grid[row + cx + 1] }
                  }
                  if z1ok {
                    let row = (cz + 1) * w
                    if x0ok { v += (1 - ax) * az * grid[row + cx] }
                    if x1ok { v += ax * az * grid[row + cx + 1] }
                  }
                  acc[iz * side + ix] += v
                }
                ix += 1
              }
              iz += 1
            }
          } else {
            let fx = (x - map.originX) * invRes
            let fz = (z - map.originZ) * invRes
            if fx > -1_000_000 && fx < 1_000_000 && fz > -1_000_000 && fz < 1_000_000 {
              let cx = Int(floor(fx))
              let cz = Int(floor(fz))
              var iz = 0
              while iz < side {
                let zz = cz + (iz - nt) * stepCells
                if zz >= 0 && zz < h {
                  let row = grid + zz * w
                  let out = acc + iz * side
                  var ix = 0
                  while ix < side {
                    let xx = cx + (ix - nt) * stepCells
                    if xx >= 0 && xx < w {
                      out[ix] += row[xx]
                    }
                    ix += 1
                  }
                }
                iz += 1
              }
            }
          }
          i += 1
        }
        var j = 0
        while j < side * side {
          let score = acc[j] / fcount
          if score > best.score {
            let iz = j / side - nt
            let ix = j % side - nt
            let offset = bilinear ? tStep : Float(stepCells) * res
            best = Pose(theta: theta, mx: start.mx + Float(ix) * offset, mz: start.mz + Float(iz) * offset, score: score)
          }
          j += 1
        }
        ia += 1
      }
    }
    return best
  }

  private func finalScore(_ q: [SIMD2<Float>], _ pose: Pose) -> Float {
    let c = cos(pose.theta)
    let s = sin(pose.theta)
    var sum: Float = 0
    fine.withUnsafeBufferPointer { grid in
      let gridBase = grid.baseAddress!
      for p in q {
        sum += sampleBilinear(gridBase, x: pose.mx + c * p.x + s * p.y, z: pose.mz - s * p.x + c * p.y)
      }
    }
    return q.isEmpty ? 0 : sum / Float(q.count)
  }

  private func makeResult(best: Pose, q: [SIMD2<Float>], qf: [SIMD2<Float>], center: SIMD2<Float>,
                          second: Float) -> RegistrationResult {
    let score = finalScore(qf, best)
    let c = cos(best.theta)
    let s = sin(best.theta)
    var inside = 0
    for p in q {
      let d = map.distanceAt(x: best.mx + c * p.x + s * p.y, z: best.mz - s * p.x + c * p.y)
      if d <= params.inlierDistance { inside += 1 }
    }
    let tx = Double(best.mx) - (Double(c) * Double(center.x) + Double(s) * Double(center.y))
    let tz = Double(best.mz) - (-Double(s) * Double(center.x) + Double(c) * Double(center.y))
    var yaw = Double(best.theta).truncatingRemainder(dividingBy: 2 * Double.pi)
    if yaw < 0 { yaw += 2 * Double.pi }
    return RegistrationResult(yaw: yaw, tx: tx, tz: tz, score: Double(score),
                              inliers: q.isEmpty ? 0 : Double(inside) / Double(q.count),
                              second: Double(second), pointCount: q.count)
  }

  // MARK: - Lookups

  /// Bilinear between cell centres; neighbours outside the grid count as 0.
  private func sampleBilinear(_ grid: UnsafePointer<Float>, x: Float, z: Float) -> Float {
    let fx = (x - map.originX) / map.resolution - 0.5
    let fz = (z - map.originZ) / map.resolution - 0.5
    guard fx > -1, fz > -1, fx < Float(map.width), fz < Float(map.height) else { return 0 }
    let flX = fx.rounded(.down)
    let flZ = fz.rounded(.down)
    let ix = Int(flX)
    let iz = Int(flZ)
    let ax = fx - flX
    let az = fz - flZ
    let w = map.width
    let h = map.height
    let x0ok = ix >= 0 && ix < w
    let x1ok = ix + 1 >= 0 && ix + 1 < w
    let z0ok = iz >= 0 && iz < h
    let z1ok = iz + 1 >= 0 && iz + 1 < h
    let g00: Float = (x0ok && z0ok) ? grid[iz * w + ix] : 0
    let g10: Float = (x1ok && z0ok) ? grid[iz * w + ix + 1] : 0
    let g01: Float = (x0ok && z1ok) ? grid[(iz + 1) * w + ix] : 0
    let g11: Float = (x1ok && z1ok) ? grid[(iz + 1) * w + ix + 1] : 0
    return (1 - ax) * (1 - az) * g00 + ax * (1 - az) * g10 + (1 - ax) * az * g01 + ax * az * g11
  }

  // MARK: - Helpers

  static func angleDelta(_ a: Float, _ b: Float) -> Float {
    var d = (a - b).truncatingRemainder(dividingBy: 2 * Float.pi)
    if d > Float.pi { d -= 2 * Float.pi }
    if d < -Float.pi { d += 2 * Float.pi }
    return d
  }

  private static func sortedByScore(_ poses: [Pose]) -> [Pose] {
    // Stable: equal scores keep their order (same as the Python reference).
    return poses.enumerated().sorted { a, b in
      if a.element.score != b.element.score { return a.element.score > b.element.score }
      return a.offset < b.offset
    }.map { $0.element }
  }

  /// One point per `cell` x `cell` square (its centre), sorted by (x cell, z cell).
  static func dedupe(_ points: [SIMD2<Float>], cell: Float) -> [SIMD2<Float>] {
    var seen = Set<Int64>()
    var keys: [(Int32, Int32)] = []
    keys.reserveCapacity(points.count)
    for p in points {
      let fx = (p.x / cell).rounded(.down)
      let fz = (p.y / cell).rounded(.down)
      guard abs(fx) < 1_000_000, abs(fz) < 1_000_000 else { continue }
      let kx = Int32(fx)
      let kz = Int32(fz)
      let key = (Int64(kx) << 32) | Int64(UInt32(bitPattern: kz))
      if seen.insert(key).inserted {
        keys.append((kx, kz))
      }
    }
    keys.sort { a, b in a.0 != b.0 ? a.0 < b.0 : a.1 < b.1 }
    return keys.map { SIMD2<Float>((Float($0.0) + 0.5) * cell, (Float($0.1) + 0.5) * cell) }
  }

  /// At most `max` points, evenly spread over the input order (deterministic).
  static func subsample(_ points: [SIMD2<Float>], max limit: Int) -> [SIMD2<Float>] {
    let n = points.count
    guard limit >= 2, n > limit else { return points }
    var out: [SIMD2<Float>] = []
    out.reserveCapacity(limit)
    for i in 0..<limit {
      // round(i * (n - 1) / (limit - 1)), half up, in integers.
      let index = (2 * i * (n - 1) + (limit - 1)) / (2 * (limit - 1))
      out.append(points[index])
    }
    return out
  }
}
