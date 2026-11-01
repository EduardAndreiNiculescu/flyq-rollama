import Foundation
import simd

/// Rigid transform from ARKit world coordinates to map-model coordinates.
///
/// Both spaces are metric and gravity-aligned (ARKit uses `.gravity` world alignment and the scan
/// is Y-up), so only four degrees of freedom are unknown: a rotation around the vertical axis
/// (yaw) and a translation. Scale is fixed at 1 (LiDAR scans are metric); the estimated scale is
/// reported only as a sanity check.
struct YawAlignment {
  /// Radians, right-handed rotation around +Y applied to AR coordinates.
  let yaw: Double
  /// Added after the rotation.
  let translation: SIMD3<Double>

  static let identity = YawAlignment(yaw: 0, translation: SIMD3<Double>(0, 0, 0))

  /// x' = cos*x + sin*z ; z' = -sin*x + cos*z (same convention as simd_quatf(angle:axis:[0,1,0])).
  func rotate(_ v: SIMD3<Double>) -> SIMD3<Double> {
    let c = cos(yaw)
    let s = sin(yaw)
    return SIMD3<Double>(c * v.x + s * v.z, v.y, -s * v.x + c * v.z)
  }

  func apply(_ point: SIMD3<Double>) -> SIMD3<Double> {
    return rotate(point) + translation
  }

  /// AR world -> model, column-major.
  var matrixFloat: simd_float4x4 {
    let c = Float(cos(yaw))
    let s = Float(sin(yaw))
    return simd_float4x4(columns: (
      SIMD4<Float>(c, 0, -s, 0),
      SIMD4<Float>(0, 1, 0, 0),
      SIMD4<Float>(s, 0, c, 0),
      SIMD4<Float>(Float(translation.x), Float(translation.y), Float(translation.z), 1)
    ))
  }

  /// Least-squares yaw + translation that maps `ar[i]` onto `model[i]`. Needs at least 2 pairs.
  static func solve(ar: [SIMD3<Double>], model: [SIMD3<Double>]) -> YawAlignment? {
    guard ar.count == model.count, ar.count >= 2 else { return nil }
    let n = Double(ar.count)
    var centroidAR = SIMD3<Double>(0, 0, 0)
    var centroidModel = SIMD3<Double>(0, 0, 0)
    for i in 0..<ar.count {
      centroidAR += ar[i]
      centroidModel += model[i]
    }
    centroidAR /= n
    centroidModel /= n

    // Maximise sum m'.R(a') over the yaw angle => yaw = atan2(S, C).
    var sumC = 0.0
    var sumS = 0.0
    for i in 0..<ar.count {
      let a = ar[i] - centroidAR
      let m = model[i] - centroidModel
      sumC += m.x * a.x + m.z * a.z
      sumS += m.x * a.z - m.z * a.x
    }
    guard abs(sumC) + abs(sumS) > 1e-9 else { return nil }
    let yaw = atan2(sumS, sumC)
    let rotationOnly = YawAlignment(yaw: yaw, translation: SIMD3<Double>(0, 0, 0))
    let translation = centroidModel - rotationOnly.rotate(centroidAR)
    return YawAlignment(yaw: yaw, translation: translation)
  }

  /// Distance between the transformed AR point and its model point, per pair.
  func residuals(ar: [SIMD3<Double>], model: [SIMD3<Double>]) -> [Double] {
    var result: [Double] = []
    let count = min(ar.count, model.count)
    for i in 0..<count {
      result.append(simd_length(apply(ar[i]) - model[i]))
    }
    return result
  }

  static func rms(_ values: [Double]) -> Double? {
    guard !values.isEmpty else { return nil }
    var sum = 0.0
    for v in values { sum += v * v }
    return sqrt(sum / Double(values.count))
  }

  /// Horizontal scale that would best match the pairs (1.0 = metric scan matches ARKit).
  static func scaleEstimate(ar: [SIMD3<Double>], model: [SIMD3<Double>], yaw: Double) -> Double? {
    guard ar.count == model.count, ar.count >= 2 else { return nil }
    let n = Double(ar.count)
    var centroidAR = SIMD3<Double>(0, 0, 0)
    var centroidModel = SIMD3<Double>(0, 0, 0)
    for i in 0..<ar.count {
      centroidAR += ar[i]
      centroidModel += model[i]
    }
    centroidAR /= n
    centroidModel /= n
    let rotation = YawAlignment(yaw: yaw, translation: SIMD3<Double>(0, 0, 0))
    var numerator = 0.0
    var denominator = 0.0
    for i in 0..<ar.count {
      let a = rotation.rotate(ar[i] - centroidAR)
      let m = model[i] - centroidModel
      numerator += m.x * a.x + m.z * a.z
      denominator += a.x * a.x + a.z * a.z
    }
    guard denominator > 1e-9 else { return nil }
    return numerator / denominator
  }

  /// Largest horizontal distance between any two points (metres).
  static func horizontalSpread(_ points: [SIMD3<Double>]) -> Double {
    var best = 0.0
    for i in 0..<points.count {
      var j = i + 1
      while j < points.count {
        let dx = points[i].x - points[j].x
        let dz = points[i].z - points[j].z
        best = max(best, sqrt(dx * dx + dz * dz))
        j += 1
      }
    }
    return best
  }

  /// Width of the point cloud across its main direction (metres). Near 0 = points on a line,
  /// which makes the yaw poorly determined.
  static func horizontalThickness(_ points: [SIMD3<Double>]) -> Double {
    guard points.count >= 3 else { return 0 }
    let n = Double(points.count)
    var mx = 0.0
    var mz = 0.0
    for p in points {
      mx += p.x
      mz += p.z
    }
    mx /= n
    mz /= n
    var sxx = 0.0
    var szz = 0.0
    var sxz = 0.0
    for p in points {
      let dx = p.x - mx
      let dz = p.z - mz
      sxx += dx * dx
      szz += dz * dz
      sxz += dx * dz
    }
    sxx /= n
    szz /= n
    sxz /= n
    // Smallest eigenvalue of the 2x2 covariance matrix.
    let trace = sxx + szz
    let det = sxx * szz - sxz * sxz
    let disc = max(0, trace * trace / 4 - det)
    let smallest = max(0, trace / 2 - sqrt(disc))
    return 2 * sqrt(smallest)
  }
}
