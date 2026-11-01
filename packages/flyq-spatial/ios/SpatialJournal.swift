import Foundation

/// Test journal of the localisation: what the phone did, one JSON object per line (JSONL), kept on
/// the phone and shared only when the user sends it (Settings). It holds no images and no personal
/// data: venue coordinates, timings, ARKit states and match numbers, the phone model.
///
/// Every line has `k` (kind), `t` (UTC time) and `ms` (milliseconds since the app started).
/// Writes happen on a serial background queue; a file is closed at 8 MB and the newest few are kept.
final class SpatialJournal: @unchecked Sendable {
  static let shared = SpatialJournal()

  static let filePrefix = "journal-"
  private let maxFileBytes: Int
  private let keepFiles: Int

  private let queue = DispatchQueue(label: "ro.flyq.spatial.journal", qos: .utility)
  private let started = Date()
  private let directoryOverride: URL?
  // Only touched on `queue`.
  private var handle: FileHandle?
  private var currentURL: URL?
  private var written = 0
  private var sequence = 0

  /// `directory`: where the files go (tests); default Application Support/FlyQ/journal.
  init(directory: URL? = nil, maxFileBytes: Int = 8 * 1024 * 1024, keepFiles: Int = 8) {
    directoryOverride = directory
    self.maxFileBytes = maxFileBytes
    self.keepFiles = keepFiles
  }

  /// Appends one line. Values must be JSON types (numbers, strings, bools, arrays, dictionaries,
  /// NSNull); non-finite numbers become null. Never throws, never blocks the caller.
  func log(_ kind: String, _ fields: [String: Any] = [:]) {
    var object = SpatialJournal.sanitize(fields) as? [String: Any] ?? [:]
    object["k"] = kind
    object["t"] = SpatialJournal.timestamp(Date())
    object["ms"] = Int(Date().timeIntervalSince(started) * 1000)
    guard JSONSerialization.isValidJSONObject(object),
          let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    else { return }
    queue.async { [weak self] in
      self?.append(data)
    }
  }

  /// Waits until every line logged so far is on disk (tests, export).
  func flush() {
    queue.sync {
      try? handle?.synchronize()
    }
  }

  /// All journal files, oldest first.
  func files() -> [URL] {
    return queue.sync { listFiles() }
  }

  /// One file with the whole journal (oldest lines first) in the temporary folder, for the share
  /// sheet. Calls back on the main queue; nil when there is nothing to send.
  func exportFile(completion: @escaping (URL?) -> Void) {
    queue.async { [weak self] in
      let url = self?.writeExport()
      DispatchQueue.main.async {
        completion(url)
      }
    }
  }

  func directory() -> URL? {
    if let dir = directoryOverride {
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: nil)
      return dir
    }
    guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
      return nil
    }
    var url = base.appendingPathComponent("FlyQ", isDirectory: true)
      .appendingPathComponent("journal", isDirectory: true)
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

  // MARK: - Private (on `queue`)

  private func append(_ line: Data) {
    if handle == nil || written >= maxFileBytes {
      openNewFile()
    }
    guard let handle = handle else { return }
    var data = line
    data.append(0x0A)
    do {
      // The throwing variant: a full disk must not raise an exception (that would end the app).
      try handle.write(contentsOf: data)
      written += data.count
    } catch {
      try? handle.close()
      self.handle = nil
    }
  }

  private func openNewFile() {
    try? handle?.close()
    handle = nil
    guard let dir = directory() else { return }
    sequence += 1
    let name = "\(SpatialJournal.filePrefix)\(SpatialJournal.fileStamp(Date()))-\(sequence).jsonl"
    let url = dir.appendingPathComponent(name)
    guard FileManager.default.createFile(atPath: url.path, contents: nil, attributes: nil),
          let opened = try? FileHandle(forWritingTo: url)
    else { return }
    handle = opened
    currentURL = url
    written = 0
    prune()
  }

  private func listFiles() -> [URL] {
    guard let dir = directory(),
          let names = try? FileManager.default.contentsOfDirectory(atPath: dir.path)
    else { return [] }
    return names.filter { $0.hasPrefix(SpatialJournal.filePrefix) && $0.hasSuffix(".jsonl") }
      .sorted { SpatialJournal.order($0) < SpatialJournal.order($1) }
      .map { dir.appendingPathComponent($0) }
  }

  private func prune() {
    let all = listFiles()
    guard all.count > keepFiles else { return }
    for url in all.prefix(all.count - keepFiles) where url != currentURL {
      try? FileManager.default.removeItem(at: url)
    }
  }

  private func writeExport() -> URL? {
    try? handle?.synchronize()
    let all = listFiles()
    guard !all.isEmpty else { return nil }
    let tmp = FileManager.default.temporaryDirectory
    // Earlier exports are not needed any more.
    if let old = try? FileManager.default.contentsOfDirectory(atPath: tmp.path) {
      for name in old where name.hasPrefix("FlyQ-jurnal-") && name.hasSuffix(".jsonl") {
        try? FileManager.default.removeItem(at: tmp.appendingPathComponent(name))
      }
    }
    let out = tmp.appendingPathComponent("FlyQ-jurnal-\(SpatialJournal.fileStamp(Date())).jsonl")
    guard FileManager.default.createFile(atPath: out.path, contents: nil, attributes: nil),
          let writer = try? FileHandle(forWritingTo: out)
    else { return nil }
    var total = 0
    for url in all {
      guard let data = try? Data(contentsOf: url), !data.isEmpty else { continue }
      do {
        try writer.write(contentsOf: data)
      } catch {
        break
      }
      total += data.count
    }
    try? writer.close()
    return total > 0 ? out : nil
  }

  // MARK: - Helpers

  /// "journal-20261031-091200-3.jsonl" -> sortable key (stamp, then sequence number).
  static func order(_ name: String) -> String {
    let core = name.dropFirst(filePrefix.count).dropLast(".jsonl".count)
    let parts = core.split(separator: "-")
    guard parts.count >= 3, let seq = Int(parts[2]) else { return String(core) }
    return "\(parts[0])-\(parts[1])-\(String(format: "%06d", seq))"
  }

  /// Replaces non-finite numbers by NSNull, recursively; drops values JSON cannot carry.
  static func sanitize(_ value: Any) -> Any {
    switch value {
    case let d as Double:
      return d.isFinite ? d : NSNull()
    case let f as Float:
      return f.isFinite ? Double(f) : NSNull()
    case let i as Int:
      return i
    case let b as Bool:
      return b
    case let s as String:
      return s
    case is NSNull:
      return NSNull()
    case let array as [Any]:
      return array.map { sanitize($0) }
    case let dict as [String: Any]:
      var out: [String: Any] = [:]
      for (key, item) in dict {
        out[key] = sanitize(item)
      }
      return out
    case let n as NSNumber:
      return n.doubleValue.isFinite ? n : NSNull()
    default:
      return String(describing: value)
    }
  }

  private static let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  private static let stampFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(identifier: "UTC")
    formatter.dateFormat = "yyyyMMdd-HHmmss"
    return formatter
  }()

  static func timestamp(_ date: Date) -> String {
    return isoFormatter.string(from: date)
  }

  static func fileStamp(_ date: Date) -> String {
    return stampFormatter.string(from: date)
  }

  /// Wall cells of a scan, relative to the camera, as base64 of little-endian Int16 pairs (5 cm
  /// units): compact enough to keep every attempt for replaying the matcher offline.
  static func packCells(_ points: [SIMD2<Float>], camera: SIMD2<Float>, cell: Float = 0.05,
                        limit: Int = 4000) -> String {
    var bytes = [UInt8]()
    bytes.reserveCapacity(min(points.count, limit) * 4)
    // Evenly over the whole scan (the points come in grid order: a prefix would be one strip).
    let stride = max(1, (points.count + limit - 1) / limit)
    for index in Swift.stride(from: 0, to: points.count, by: stride) {
      let p = points[index]
      let dx = ((p.x - camera.x) / cell).rounded()
      let dz = ((p.y - camera.y) / cell).rounded()
      guard dx.isFinite, dz.isFinite, abs(dx) < 32_000, abs(dz) < 32_000 else { continue }
      let ix = UInt16(bitPattern: Int16(dx))
      let iz = UInt16(bitPattern: Int16(dz))
      bytes.append(UInt8(ix & 0xFF))
      bytes.append(UInt8(ix >> 8))
      bytes.append(UInt8(iz & 0xFF))
      bytes.append(UInt8(iz >> 8))
    }
    return Data(bytes).base64EncodedString()
  }

  /// Inverse of `packCells` (tests and tools).
  static func unpackCells(_ text: String, camera: SIMD2<Float>, cell: Float = 0.05) -> [SIMD2<Float>] {
    guard let data = Data(base64Encoded: text) else { return [] }
    let bytes = [UInt8](data)
    var out: [SIMD2<Float>] = []
    var i = 0
    while i + 3 < bytes.count {
      let ix = Int16(bitPattern: UInt16(bytes[i]) | (UInt16(bytes[i + 1]) << 8))
      let iz = Int16(bitPattern: UInt16(bytes[i + 2]) | (UInt16(bytes[i + 3]) << 8))
      out.append(SIMD2<Float>(camera.x + Float(ix) * cell, camera.y + Float(iz) * cell))
      i += 4
    }
    return out
  }
}
