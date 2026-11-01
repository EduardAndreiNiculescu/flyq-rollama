import Foundation
import simd

/// Bundled description of a venue (`<venueId>.venue.json` next to `<venueId>.usdz`).
struct VenueManifest: Decodable {
  struct Name: Decodable {
    let ro: String?
    let en: String?
  }

  struct Model: Decodable {
    let file: String
    let sha256: String?
    let triangles: Int?
  }

  struct Bounds: Decodable {
    let min: [Double]
    let max: [Double]
  }

  /// A visual memory of one part of the venue (a recording aligned to the map), shipped as
  /// `<file>` next to the manifest. A large venue has several: ARKit cannot merge world maps, and
  /// the size of one stays about the same however far the walk went.
  struct MemoryZone: Decodable {
    let id: String
    let file: String
    /// `createdAt` of the memory in the file (tells it apart from the one installed on the phone).
    let createdAt: String?
    /// Where the recording walked, model x, z (flat, a point every few metres): which zone is
    /// tried first depends on how close the user last was to it.
    let path: [Double]?
  }

  /// A way of showing the map shipped next to the manifest ("3d": the light model, "2d": the
  /// picture from above); the backend may have newer ones (SpatialMapViewSync.swift).
  struct View: Decodable {
    let file: String
    let sha256: String?
    let sizeBytes: Int?
    let minMemoryMB: Int?
    let metersPerPixel: Double?
    let origin: [Double]?
    let pixels: [Int]?
  }

  let schemaVersion: Int
  let venueId: String
  let name: Name?
  let model: Model
  let floorY: Double?
  let cutHeight: Double?
  let bounds: Bounds?
  let memoryZones: [MemoryZone]?
  let views: [String: View]?

  /// The bundled views as map entries (the old single model counts as the 3D view).
  func viewEntries() -> [MapViewKind: (entry: MapViewEntry, file: String)] {
    var out: [MapViewKind: (entry: MapViewEntry, file: String)] = [:]
    for (key, view) in views ?? [:] {
      guard let kind = MapViewKind(rawValue: key) else { continue }
      let entry = MapViewEntry(kind: kind, sha256: view.sha256, sizeBytes: view.sizeBytes, minMemoryMB: view.minMemoryMB,
                               metersPerPixel: view.metersPerPixel, origin: view.origin, pixels: view.pixels)
      if entry.placeable {
        out[kind] = (entry, view.file)
      }
    }
    if out[.model3d] == nil {
      out[.model3d] = (MapViewEntry(kind: .model3d, sha256: model.sha256), model.file)
    }
    return out
  }

  var boundsMin: SIMD3<Float>? {
    guard let b = bounds, b.min.count == 3 else { return nil }
    return SIMD3<Float>(Float(b.min[0]), Float(b.min[1]), Float(b.min[2]))
  }

  var boundsMax: SIMD3<Float>? {
    guard let b = bounds, b.max.count == 3 else { return nil }
    return SIMD3<Float>(Float(b.max[0]), Float(b.max[1]), Float(b.max[2]))
  }
}

struct CalibrationPair: Codable {
  var ar: [Double]
  var model: [Double]
  var error: Double
}

/// The saved "visual memory" of the venue: what we persist next to the ARKit world map. Made by
/// the automatic LiDAR localisation, by a manual calibration, or imported / bundled.
struct CalibrationRecord: Codable {
  var schemaVersion: Int
  var venueId: String
  var createdAt: String
  /// AR world -> model transform (see YawAlignment).
  var yaw: Double
  var translation: [Double]
  var rmsError: Double
  var pairs: [CalibrationPair]
  /// "auto" | "calibration" | "import" | "bundled" (nil in files from the first version = calibration).
  var source: String?
  var featurePoints: Int?
  var device: String?
  /// See VisualMapPackage.Info.anchorFrame ("recording": the alignment applies on top of the anchor).
  var anchorFrame: String?

  var alignment: YawAlignment? {
    guard translation.count == 3, yaw.isFinite else { return nil }
    return YawAlignment(yaw: yaw, translation: SIMD3<Double>(translation[0], translation[1], translation[2]))
  }
}

extension CalibrationRecord {
  /// The record as a package header (what an export or an extension of this memory carries).
  var packageInfo: VisualMapPackage.Info {
    return VisualMapPackage.Info(
      schemaVersion: VisualMapPackage.schemaVersion,
      venueId: venueId,
      createdAt: createdAt,
      yaw: yaw,
      translation: translation,
      source: source ?? "calibration",
      featurePoints: featurePoints,
      device: device,
      calibrationArPoints: pairs.isEmpty ? nil : pairs.map { $0.ar },
      anchorFrame: anchorFrame
    )
  }
}

/// A venue shipped with the app (Settings lets the user switch between them).
struct VenueOption {
  let id: String
  let nameRo: String?
  let nameEn: String?
}

/// Finds the bundled venue files and stores the calibration (world map + transform) on disk.
/// Immutable (only `venueId`) and file-system based: safe to use from the store queue.
final class VenueStore: @unchecked Sendable {
  static let defaultVenueId = "office-test"
  static let assetBundleName = "FlyQSpatialAssets"
  static let currentCalibrationSchema = 1

  let venueId: String

  init(venueId: String) {
    self.venueId = VenueStore.sanitize(venueId)
  }

  /// Only lowercase letters, digits and '-' (the id is used in file names).
  static func sanitize(_ raw: String) -> String {
    let allowed = Set("abcdefghijklmnopqrstuvwxyz0123456789-")
    let cleaned = String(raw.lowercased().filter { allowed.contains($0) }.prefix(64))
    return cleaned.isEmpty ? defaultVenueId : cleaned
  }

  // MARK: - Bundled venue

  private static func candidateBundles() -> [Bundle] {
    var bundles: [Bundle] = []
    let hosts = [Bundle.main, Bundle(for: VenueStore.self)]
    for host in hosts {
      if let url = host.url(forResource: assetBundleName, withExtension: "bundle"),
         let bundle = Bundle(url: url) {
        bundles.append(bundle)
      }
    }
    // Fallback: resources copied directly into the app bundle.
    bundles.append(Bundle.main)
    return bundles
  }

  /// Every bundled `<venueId>.venue.json`, sorted by id (computed once).
  static let bundledVenues: [VenueOption] = {
    var seen = Set<String>()
    var result: [VenueOption] = []
    for bundle in candidateBundles() {
      // Resources sit flat at the bundle's root (CocoaPods resource bundle or the app itself).
      let urls = (try? FileManager.default.contentsOfDirectory(at: bundle.bundleURL, includingPropertiesForKeys: nil)) ?? []
      for url in urls {
        let file = url.lastPathComponent
        guard file.hasSuffix(".venue.json") else { continue }
        let id = sanitize(String(file.dropLast(".venue.json".count)))
        guard !seen.contains(id),
              let data = try? Data(contentsOf: url),
              let manifest = try? JSONDecoder().decode(VenueManifest.self, from: data)
        else { continue }
        seen.insert(id)
        result.append(VenueOption(id: id, nameRo: manifest.name?.ro, nameEn: manifest.name?.en))
      }
    }
    return result.sorted { $0.id < $1.id }
  }()

  private func findResource(named file: String) -> URL? {
    let name = (file as NSString).deletingPathExtension
    let ext = (file as NSString).pathExtension
    for bundle in VenueStore.candidateBundles() {
      if let url = bundle.url(forResource: name, withExtension: ext.isEmpty ? nil : ext) {
        return url
      }
    }
    return nil
  }

  /// Loads `<venueId>.venue.json` and resolves the model file.
  func loadManifest() -> Result<(manifest: VenueManifest, modelURL: URL), Error> {
    guard let manifestURL = findResource(named: "\(venueId).venue.json") else {
      return .failure(SpatialError.venueManifestMissing(venueId))
    }
    let manifest: VenueManifest
    do {
      let data = try Data(contentsOf: manifestURL)
      manifest = try JSONDecoder().decode(VenueManifest.self, from: data)
    } catch {
      return .failure(SpatialError.venueManifestInvalid(error.localizedDescription))
    }
    guard let modelURL = findResource(named: manifest.model.file) else {
      return .failure(SpatialError.modelMissing(manifest.model.file))
    }
    return .success((manifest: manifest, modelURL: modelURL))
  }

  /// `<venueId>.locmap.json` (made by tools/build_locmap.py), if the venue ships one.
  func localizationMapURL() -> URL? {
    return findResource(named: "\(venueId).locmap.json")
  }

  // MARK: - Calibration on disk

  /// Application Support/FlyQ/venues/<venueId>/ (created on demand, excluded from iCloud backup).
  func directory() -> URL? {
    guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
      return nil
    }
    var url = base.appendingPathComponent("FlyQ", isDirectory: true)
      .appendingPathComponent("venues", isDirectory: true)
      .appendingPathComponent(venueId, isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: nil)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try? url.setResourceValues(values)
    } catch {
      return nil
    }
    return url
  }

  private func worldMapURL() -> URL? {
    return directory()?.appendingPathComponent("worldmap.arworldmap")
  }

  private func calibrationURL() -> URL? {
    return directory()?.appendingPathComponent("calibration.json")
  }

  /// The saved calibration, or nil when there is none (or it is unusable).
  func loadCalibration() -> CalibrationRecord? {
    guard let url = calibrationURL(),
          let mapURL = worldMapURL(),
          FileManager.default.fileExists(atPath: url.path),
          FileManager.default.fileExists(atPath: mapURL.path),
          let data = try? Data(contentsOf: url),
          let record = try? JSONDecoder().decode(CalibrationRecord.self, from: data),
          record.schemaVersion == VenueStore.currentCalibrationSchema,
          record.venueId == venueId,
          record.alignment != nil
    else {
      return nil
    }
    return record
  }

  func loadWorldMapData() -> Data? {
    guard let url = worldMapURL() else { return nil }
    return try? Data(contentsOf: url)
  }

  /// Writes the world map first, then the record (each atomically). A record without a map is
  /// never left behind.
  func save(worldMapData: Data, record: CalibrationRecord) throws {
    guard let mapURL = worldMapURL(), let recordURL = calibrationURL() else {
      throw SpatialError.venueManifestInvalid("Application Support directory unavailable")
    }
    try worldMapData.write(to: mapURL, options: [.atomic])
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let recordData = try encoder.encode(record)
    do {
      try recordData.write(to: recordURL, options: [.atomic])
    } catch {
      try? FileManager.default.removeItem(at: mapURL)
      throw error
    }
  }

  /// Rewrites only the record (metadata), next to the world map already saved.
  func saveRecord(_ record: CalibrationRecord) throws {
    guard let mapURL = worldMapURL(), let recordURL = calibrationURL(),
          FileManager.default.fileExists(atPath: mapURL.path)
    else {
      throw SpatialError.worldMapUnavailable
    }
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try encoder.encode(record).write(to: recordURL, options: [.atomic])
  }

  func deleteCalibration() {
    if let url = calibrationURL() { try? FileManager.default.removeItem(at: url) }
    if let url = worldMapURL() { try? FileManager.default.removeItem(at: url) }
  }

  // MARK: - Visual memory files (.flyqmap)

  /// A file shipped next to the venue manifest (memory zones).
  func bundledFile(named file: String) -> URL? {
    return findResource(named: file)
  }

  /// `<venueId>.flyqmap` shipped inside the app, if any.
  func bundledVisualMapURL() -> URL? {
    return findResource(named: "\(venueId).\(VisualMapPackage.fileExtension)")
  }

  /// `createdAt` of the bundled memory the user deleted: it is not installed again (a newer one,
  /// from a new app build, is).
  func dismissedBundledCreatedAt() -> String? {
    guard let url = directory()?.appendingPathComponent("bundled-dismissed.txt"),
          let data = try? Data(contentsOf: url),
          let text = String(data: data, encoding: .utf8)
    else { return nil }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  /// Remembers the bundled memory (if the app ships one) as deleted by the user.
  func dismissBundledVisualMap() {
    guard let bundled = bundledVisualMapURL(),
          let data = try? Data(contentsOf: bundled, options: [.alwaysMapped]),
          let info = try? VisualMapPackage.peekInfo(data),
          let url = directory()?.appendingPathComponent("bundled-dismissed.txt")
    else { return }
    try? Data(info.createdAt.utf8).write(to: url, options: [.atomic])
  }

  /// The saved memory as one shareable package, or nil when there is none.
  func exportPackage() -> VisualMapPackage? {
    guard let record = loadCalibration(), let map = loadWorldMapData(), record.translation.count == 3 else {
      return nil
    }
    let info = VisualMapPackage.Info(
      schemaVersion: VisualMapPackage.schemaVersion,
      venueId: record.venueId,
      createdAt: record.createdAt,
      yaw: record.yaw,
      translation: record.translation,
      source: record.source ?? "calibration",
      featurePoints: record.featurePoints,
      device: record.device,
      calibrationArPoints: record.pairs.isEmpty ? nil : record.pairs.map { $0.ar },
      anchorFrame: record.anchorFrame
    )
    return VisualMapPackage(info: info, worldMap: map)
  }

  /// Stores a package as this phone's memory. The caller checks that the world map decodes.
  @discardableResult
  func importPackage(_ package: VisualMapPackage, source: String) throws -> CalibrationRecord {
    guard package.info.venueId == venueId else {
      throw SpatialError.venueManifestInvalid("visual map is for '\(package.info.venueId)'")
    }
    let record = CalibrationRecord(
      schemaVersion: VenueStore.currentCalibrationSchema,
      venueId: venueId,
      createdAt: package.info.createdAt,
      yaw: package.info.yaw,
      translation: package.info.translation,
      rmsError: 0,
      pairs: [],
      source: source,
      featurePoints: package.info.featurePoints,
      device: package.info.device,
      anchorFrame: package.info.anchorFrame
    )
    try save(worldMapData: package.worldMap, record: record)
    return record
  }
}

/// Writes the saved memory as a `.flyqmap` file for the share sheet (any thread; the host view
/// runs it on its store queue so it never reads a half-written memory).
enum VisualMapExport {
  enum Outcome {
    case file(URL)
    case nothing
    case failure(String)
  }

  static func write(store: VenueStore) -> Outcome {
    guard let package = store.exportPackage() else { return .nothing }
    do {
      let data = try package.encoded()
      let manager = FileManager.default
      let directory = manager.temporaryDirectory.appendingPathComponent("FlyQExport", isDirectory: true)
      // Only the newest export is kept (tmp is purged by iOS anyway).
      try? manager.removeItem(at: directory)
      try manager.createDirectory(at: directory, withIntermediateDirectories: true, attributes: nil)
      let name = VisualMapPackage.suggestedFileName(venueId: package.info.venueId, createdAt: package.info.createdAt)
      let url = directory.appendingPathComponent(name)
      try data.write(to: url, options: [.atomic])
      return .file(url)
    } catch {
      return .failure(error.localizedDescription)
    }
  }

  /// Removes a picked file's private copy (document picker `asCopy`), never anything else.
  static func removeTemporaryCopy(_ url: URL) {
    let tmp = FileManager.default.temporaryDirectory.resolvingSymlinksInPath().standardizedFileURL.path
    let path = url.resolvingSymlinksInPath().standardizedFileURL.path
    let prefix = tmp.hasSuffix("/") ? tmp : tmp + "/"
    if path.hasPrefix(prefix) {
      try? FileManager.default.removeItem(at: url)
    }
  }
}
