import Foundation

// "Visual memory" of a venue, shared between phones.
//
// A LiDAR iPhone localises itself automatically (SpatialRegistration) and saves ARKit's world map
// of the place together with the alignment to the venue model. Any other iPhone, with or without
// LiDAR, loads it and ARKit recognises the place from the camera alone; the alignment then puts
// the pin on our map. One file carries everything: `<anything>.flyqmap`.
//
// Pure Swift + Foundation (the world map is opaque bytes here), tested in tools/autoloc.

struct VisualMapPackage {
  static let fileExtension = "flyqmap"
  static let schemaVersion = 1
  /// `venueId` of a recording made where the venue has no map yet (not usable until aligned).
  static let recordingVenueId = "recording"
  /// "FLYQMAP1"
  static let magic: [UInt8] = [0x46, 0x4C, 0x59, 0x51, 0x4D, 0x41, 0x50, 0x31]
  /// Refuse absurd inputs before allocating anything (a real office map is a few MB; importing
  /// briefly needs about twice the file size in memory).
  static let maxBytes = 128 * 1024 * 1024

  struct Info: Codable, Equatable {
    var schemaVersion: Int
    var venueId: String
    var createdAt: String
    /// AR world -> model alignment of the world map (YawAlignment convention).
    var yaw: Double
    var translation: [Double]
    /// "auto" (LiDAR localisation), "calibration" (manual pairs), "import", "bundled".
    var source: String
    var featurePoints: Int?
    var device: String?
    /// AR coordinates of the points marked during a manual calibration: they let a memory
    /// recorded before the venue had a map be aligned to it afterwards.
    var calibrationArPoints: [[Double]]?
    /// What the model-origin anchor in the world map stands for: nil / "model" = the venue model's
    /// origin (yaw/translation only repeat it); "recording" = the recording's own origin, and
    /// yaw/translation map that frame to the model (set when a recording is aligned).
    var anchorFrame: String?
    /// Walls seen during a recording (SpatialRecording.swift).
    var recording: RecordingGeometry?
    /// `createdAt` of the memory this one extends: a recording that started from that memory, in
    /// its coordinates (same anchor, same alignment), and added what it saw.
    var extends: String?
  }

  enum PackageError: Error, CustomStringConvertible {
    case notAPackage
    case unsupportedVersion(Int)
    case corrupt(String)

    var description: String {
      switch self {
      case .notAPackage:
        return "This file is not a FlyQ visual map."
      case .unsupportedVersion(let version):
        return "Unsupported visual map version \(version)."
      case .corrupt(let detail):
        return "The visual map file is damaged (\(detail))."
      }
    }
  }

  var info: Info
  /// NSKeyedArchiver data of an ARWorldMap.
  var worldMap: Data

  /// magic (8 bytes) | info JSON length (UInt32, little endian) | info JSON | world map bytes
  func encoded() throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let json = try encoder.encode(info)
    guard json.count < Int(UInt32.max) else { throw PackageError.corrupt("metadata too large") }
    var out = Data()
    out.reserveCapacity(VisualMapPackage.magic.count + 4 + json.count + worldMap.count)
    out.append(contentsOf: VisualMapPackage.magic)
    let length = UInt32(json.count)
    out.append(contentsOf: [UInt8(length & 0xFF), UInt8((length >> 8) & 0xFF),
                            UInt8((length >> 16) & 0xFF), UInt8((length >> 24) & 0xFF)])
    out.append(json)
    out.append(worldMap)
    return out
  }

  static func decode(_ data: Data) throws -> VisualMapPackage {
    let (info, mapStart) = try header(data)
    let start = data.startIndex
    let worldMap = data.subdata(in: (start + mapStart)..<data.endIndex)
    return VisualMapPackage(info: info, worldMap: worldMap)
  }

  /// Only the metadata (cheap: the world map bytes are not copied). Same checks as `decode`.
  static func peekInfo(_ data: Data) throws -> Info {
    return try header(data).info
  }

  /// Parses and validates everything before the world map; returns where the map starts.
  private static func header(_ data: Data) throws -> (info: Info, mapStart: Int) {
    let bytes = [UInt8](data.prefix(12))
    guard data.count >= 12, Array(bytes[0..<8]) == magic else { throw PackageError.notAPackage }
    guard data.count <= maxBytes else { throw PackageError.corrupt("file too large") }
    let length = Int(bytes[8]) | (Int(bytes[9]) << 8) | (Int(bytes[10]) << 16) | (Int(bytes[11]) << 24)
    let jsonStart = 12
    guard length > 1, length <= data.count - jsonStart else { throw PackageError.corrupt("metadata length") }
    let start = data.startIndex
    let json = data.subdata(in: (start + jsonStart)..<(start + jsonStart + length))
    let info: Info
    do {
      info = try JSONDecoder().decode(Info.self, from: json)
    } catch {
      throw PackageError.corrupt("metadata")
    }
    guard info.schemaVersion == schemaVersion else { throw PackageError.unsupportedVersion(info.schemaVersion) }
    guard info.translation.count == 3, info.yaw.isFinite, info.translation.allSatisfy({ $0.isFinite }),
          !info.venueId.isEmpty
    else {
      throw PackageError.corrupt("alignment")
    }
    let mapStart = jsonStart + length
    guard data.count - mapStart >= 16 else { throw PackageError.corrupt("world map missing") }
    return (info, mapStart)
  }

  /// True when `candidate` was created strictly after `current` (ISO 8601). A missing or
  /// unreadable `current` counts as older; an unreadable `candidate` never wins.
  static func isNewer(_ candidate: String, than current: String?) -> Bool {
    guard let candidateDate = parseDate(candidate) else { return false }
    guard let current = current, let currentDate = parseDate(current) else { return true }
    return candidateDate > currentDate
  }

  static func parseDate(_ text: String) -> Date? {
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    if let date = plain.date(from: text) { return date }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: text)
  }

  /// "FlyQ-office-test-20261030-0812.flyqmap"
  static func suggestedFileName(venueId: String, createdAt: String) -> String {
    let digits = createdAt.filter { $0.isNumber }
    let stamp = digits.count >= 12
      ? String(digits.prefix(8)) + "-" + String(digits.dropFirst(8).prefix(4))
      : "map"
    let safeVenue = venueId.filter { $0.isLetter || $0.isNumber || $0 == "-" }
    return "FlyQ-\(safeVenue.isEmpty ? "venue" : safeVenue)-\(stamp).\(fileExtension)"
  }
}
