import Foundation

/// The ways the venue map is shown: the drawn map (`<venue>.plan.json`, outlines drawn as a clean
/// indoor map), the light 3D scan (`<venue>.lite.usdz`) or a picture of the scan from above
/// (`<venue>.map.jpg`). All are in venue coordinates, so the pin is the same on any of them.
enum MapViewKind: String {
  case plan = "plan"
  case model3d = "3d"
  case image2d = "2d"
}

/// The Settings choice: let the phone decide, or always one of them.
enum MapViewPreference: String {
  case auto
  case plan = "plan"
  case model3d = "3d"
  case image2d = "2d"
}

/// What the phone can afford, read when the map view is chosen.
struct DeviceProfile: Equatable {
  var memoryMB: Int
  var lowPower: Bool
  /// ProcessInfo.ThermalState: 0 nominal, 1 fair, 2 serious, 3 critical.
  var thermal: Int

  static func current() -> DeviceProfile {
    let info = ProcessInfo.processInfo
    let memoryMB = Int(info.physicalMemory / (1024 * 1024))
    #if os(iOS)
    return DeviceProfile(memoryMB: memoryMB, lowPower: info.isLowPowerModeEnabled, thermal: info.thermalState.rawValue)
    #else
    return DeviceProfile(memoryMB: memoryMB, lowPower: false, thermal: 0)
    #endif
  }
}

/// One way of showing the map, as described by the bundled venue manifest or by the backend.
struct MapViewEntry: Equatable {
  var kind: MapViewKind
  var sha256: String?
  var sizeBytes: Int?
  /// The 3D view is used only on phones with at least this much memory.
  var minMemoryMB: Int?
  /// 2D: metres per pixel, venue (x, z) of the image's top-left corner, pixel size (width, height).
  /// Columns go towards +x, rows towards +z.
  var metersPerPixel: Double?
  var origin: [Double]?
  var pixels: [Int]?

  /// A 2D view the map can place (a picture without its scale and corner cannot be put anywhere).
  /// The drawn map and the 3D scan carry venue coordinates themselves.
  var placeable: Bool {
    guard kind == .image2d else { return true }
    guard let mpp = metersPerPixel, mpp.isFinite, mpp > 0, mpp < 10,
          let o = origin, o.count == 2, o.allSatisfy({ $0.isFinite }),
          let p = pixels, p.count == 2, p.allSatisfy({ $0 > 0 && $0 <= 16384 })
    else { return false }
    return true
  }
}

struct MapViewChoice: Equatable {
  let kind: MapViewKind
  /// "drawn" (the drawn map, the default), "forced" (Settings), "capable", "memory", "lowPower",
  /// "thermal", "only3d", "only2d".
  let reason: String
}

/// Which view this phone shows. The drawn map when there is one: it is light (a few thousand
/// triangles, no textures) and the clearest, so every phone gets it unless Settings ask for a scan.
/// Between the scans, the 3D one is for phones with memory to spare that are not saving battery or
/// overheating (it runs next to the camera and ARKit); every other phone gets the 2D picture.
enum MapViewPolicy {
  /// iPhones with 4 GB report about 3.7 GB; the 3 GB ones stay under this.
  static let defaultMinMemoryMB = 3500

  /// A drawn map from the backend is shown instead of the one in the app only when it is a newer
  /// drawing: an old pack (or an old download kept on the phone) never hides a newer build's map.
  static func backendPlanWins(bundledRevision: Int, backendRevision: Int) -> Bool {
    return backendRevision > bundledRevision
  }

  static func choose(preference: MapViewPreference, profile: DeviceProfile, hasPlan: Bool = false, has3d: Bool,
                     has2d: Bool, minMemoryMB: Int?) -> MapViewChoice? {
    // A view asked for in Settings, when it is here (with a single scan and no drawn map, that scan
    // is all there is: "only3d" / "only2d").
    switch preference {
    case .plan where hasPlan: return MapViewChoice(kind: .plan, reason: "forced")
    case .model3d where has3d && (hasPlan || has2d): return MapViewChoice(kind: .model3d, reason: "forced")
    case .image2d where has2d && (hasPlan || has3d): return MapViewChoice(kind: .image2d, reason: "forced")
    default: break
    }
    if hasPlan { return MapViewChoice(kind: .plan, reason: "drawn") }
    if !has3d && !has2d { return nil }
    if !has2d { return MapViewChoice(kind: .model3d, reason: "only3d") }
    if !has3d { return MapViewChoice(kind: .image2d, reason: "only2d") }
    let needed = (minMemoryMB ?? 0) > 0 ? minMemoryMB! : defaultMinMemoryMB
    if profile.memoryMB < needed { return MapViewChoice(kind: .image2d, reason: "memory") }
    if profile.lowPower { return MapViewChoice(kind: .image2d, reason: "lowPower") }
    if profile.thermal >= 2 { return MapViewChoice(kind: .image2d, reason: "thermal") }
    return MapViewChoice(kind: .model3d, reason: "capable")
  }
}

/// `GET /v1/venues/{venueId}/manifest` (FlyQ backend): the newest published pack and its views.
struct RemoteVenueManifest: Decodable {
  struct View: Decodable, Equatable {
    let id: String
    let kind: String
    let url: String
    let size: Int
    let sha256: String
    let minMemoryMB: Int?
    let metersPerPixel: Double?
    let origin: [Double]?
    let pixels: [Int]?

    var mapKind: MapViewKind? {
      switch kind {
      case "plan": return .plan
      case "model3d": return .model3d
      case "image2d": return .image2d
      default: return nil
      }
    }

    var entry: MapViewEntry? {
      guard let kind = mapKind, size > 0, RemoteVenueManifest.isSha256(sha256) else { return nil }
      return MapViewEntry(kind: kind, sha256: sha256, sizeBytes: size, minMemoryMB: minMemoryMB,
                          metersPerPixel: metersPerPixel, origin: origin, pixels: pixels)
    }
  }

  struct Pack: Decodable {
    let version: Int
    let views: [View]?
  }

  let venueId: String
  let latest: Pack

  static func isSha256(_ value: String) -> Bool {
    return value.count == 64 && value.allSatisfy { "0123456789abcdef".contains($0) }
  }

  /// The usable views of the newest pack, one per kind (the first one listed wins).
  func views(for venue: String) -> [MapViewKind: View] {
    guard venueId == venue else { return [:] }
    var out: [MapViewKind: View] = [:]
    for view in latest.views ?? [] {
      guard let entry = view.entry, entry.placeable, out[entry.kind] == nil else { continue }
      out[entry.kind] = view
    }
    return out
  }
}

/// A view downloaded from the backend, kept on the phone (`views/views.json` next to the files).
struct CachedMapView: Codable, Equatable {
  var kind: String
  var file: String
  var sha256: String
  var sizeBytes: Int
  var version: Int
  var minMemoryMB: Int?
  var metersPerPixel: Double?
  var origin: [Double]?
  var pixels: [Int]?

  var entry: MapViewEntry? {
    guard let k = MapViewKind(rawValue: kind) else { return nil }
    return MapViewEntry(kind: k, sha256: sha256, sizeBytes: sizeBytes, minMemoryMB: minMemoryMB,
                        metersPerPixel: metersPerPixel, origin: origin, pixels: pixels)
  }
}

struct CachedMapViews: Codable, Equatable {
  var venueId: String
  var views: [String: CachedMapView]
}
