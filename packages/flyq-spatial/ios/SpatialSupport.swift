import Foundation
import QuartzCore
import UIKit

// Small helpers shared by the FlyQ spatial view.
// Kept free of React Native types: the Fabric glue (FlyQSpatialViewComponentView.mm) talks to
// FlyQSpatialHostView through plain Objective-C selectors.

enum SpatialJSON {
  /// Serialises a JSON-compatible dictionary. Never throws; returns "{}" for invalid input.
  static func encode(_ object: [String: Any]) -> String {
    guard JSONSerialization.isValidJSONObject(object),
          let data = try? JSONSerialization.data(withJSONObject: object, options: []),
          let string = String(data: data, encoding: .utf8)
    else {
      return "{}"
    }
    return string
  }

  /// Parses a JSON object string. Returns an empty dictionary for anything else.
  static func decode(_ json: String) -> [String: Any] {
    guard let data = json.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: data, options: []),
          let dictionary = object as? [String: Any]
    else {
      return [:]
    }
    return dictionary
  }

  /// A finite number rounded to `digits` decimals, or NSNull (JSON cannot carry NaN/Infinity).
  static func number(_ value: Double, digits: Int = 3) -> Any {
    guard value.isFinite else { return NSNull() }
    let factor = pow(10.0, Double(digits))
    return (value * factor).rounded() / factor
  }

  static func number(_ value: Float, digits: Int = 3) -> Any {
    return number(Double(value), digits: digits)
  }

  static func vector(_ v: SIMD3<Double>, digits: Int = 3) -> [Any] {
    return [number(v.x, digits: digits), number(v.y, digits: digits), number(v.z, digits: digits)]
  }

  static func orNull(_ value: Any?) -> Any {
    return value ?? NSNull()
  }
}

enum SpatialDevice {
  /// Hardware identifier, e.g. "iPhone14,3" (no personal data).
  static var model: String {
    var info = utsname()
    uname(&info)
    let mirror = Mirror(reflecting: info.machine)
    var identifier = ""
    for child in mirror.children {
      if let value = child.value as? Int8, value != 0 {
        identifier.append(Character(UnicodeScalar(UInt8(bitPattern: value))))
      }
    }
    return identifier.isEmpty ? "unknown" : identifier
  }
}

enum SpatialTime {
  static func iso8601(_ date: Date = Date()) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.string(from: date)
  }
}

/// CADisplayLink retains its target; this proxy keeps the owner weakly referenced through the
/// closure it was given, so views can be released normally.
final class DisplayLinkProxy: NSObject {
  private var link: CADisplayLink?
  private var lastTimestamp: CFTimeInterval = 0
  private let tick: (CFTimeInterval) -> Void

  init(tick: @escaping (CFTimeInterval) -> Void) {
    self.tick = tick
    super.init()
  }

  var isRunning: Bool {
    return link != nil
  }

  func start() {
    guard link == nil else { return }
    let newLink = CADisplayLink(target: self, selector: #selector(onFrame(_:)))
    newLink.add(to: .main, forMode: .common)
    link = newLink
    lastTimestamp = 0
  }

  func stop() {
    link?.invalidate()
    link = nil
  }

  @objc private func onFrame(_ displayLink: CADisplayLink) {
    let dt: CFTimeInterval
    if lastTimestamp == 0 {
      dt = 1.0 / 60.0
    } else {
      dt = min(0.1, max(0.0, displayLink.timestamp - lastTimestamp))
    }
    lastTimestamp = displayLink.timestamp
    tick(dt)
  }
}

enum SpatialColors {
  static let background = UIColor(red: 0.043, green: 0.078, blue: 0.188, alpha: 1)  // #0B1430
  static let ground = UIColor(red: 0.075, green: 0.118, blue: 0.247, alpha: 1)  // #131E3F
  static let accent = UIColor(red: 0.180, green: 0.357, blue: 1.0, alpha: 1)  // #2E5BFF
  static let accentLight = UIColor(red: 0.553, green: 0.714, blue: 1.0, alpha: 1)  // #8DB6FF
  static let warning = UIColor(red: 0.961, green: 0.651, blue: 0.137, alpha: 1)  // #F5A623
  static let lost = UIColor(red: 0.541, green: 0.580, blue: 0.651, alpha: 1)  // #8A94A6

  private static let pairPalette: [UIColor] = [
    UIColor(red: 1.0, green: 0.333, blue: 0.333, alpha: 1),
    UIColor(red: 0.204, green: 0.827, blue: 0.6, alpha: 1),
    UIColor(red: 1.0, green: 0.784, blue: 0.2, alpha: 1),
    UIColor(red: 0.729, green: 0.4, blue: 1.0, alpha: 1),
    UIColor(red: 0.2, green: 0.8, blue: 1.0, alpha: 1),
    UIColor(red: 1.0, green: 0.502, blue: 0.0, alpha: 1),
  ]

  static func pairColor(_ index: Int) -> UIColor {
    let count = pairPalette.count
    return pairPalette[((index % count) + count) % count]
  }
}

/// Shortest signed difference between two angles (radians), in [-pi, pi].
func spatialAngleDelta(_ to: Float, _ from: Float) -> Float {
  var delta = (to - from).truncatingRemainder(dividingBy: 2 * Float.pi)
  if delta > Float.pi { delta -= 2 * Float.pi }
  if delta < -Float.pi { delta += 2 * Float.pi }
  return delta
}

enum SpatialError: LocalizedError {
  case worldMapUnavailable
  /// The world map holds fewer feature points than asked for (not worth saving yet).
  case worldMapTooSmall(Int)
  case venueManifestMissing(String)
  case venueManifestInvalid(String)
  case modelMissing(String)

  var errorDescription: String? {
    switch self {
    case .worldMapUnavailable:
      return "ARKit did not return a world map."
    case .worldMapTooSmall(let points):
      return "The visual memory is still too small (\(points) points)."
    case .venueManifestMissing(let venueId):
      return "No venue manifest bundled for '\(venueId)'."
    case .venueManifestInvalid(let detail):
      return "Venue manifest is invalid: \(detail)"
    case .modelMissing(let file):
      return "Model file '\(file)' is missing from the app bundle."
    }
  }
}
