import Foundation

// Recording a venue's visual memory before the venue has a map (a single visit to the airport).
//
// The LiDAR iPhone walks the place with a scanning ARKit session and keeps, in one `.flyqmap`:
// - the ARKit world map (what the camera recognises, for the phones without LiDAR), with the
//   model-origin anchor at the recording's own origin;
// - the walls it saw (LiDAR mesh of the whole walk reduced to the same 5 cm cells the matcher uses)
//   plus the floor height and the walked path.
// Offline, tools/autoloc/align_recording.py finds where those walls sit on the venue's
// localisation map (made later from the Scaniverse scan) and turns the recording into a normal
// visual memory (`anchorFrame` "recording").
//
// Pure Swift + Foundation, tested in tools/autoloc.

/// Walls and floor seen during a recording, in the recording's AR coordinates.
struct RecordingGeometry: Codable, Equatable {
  /// Cell size in metres. A cell (ix, iz) covers AR x in [ix, ix + 1) * cell, z likewise.
  var cell: Double
  /// Flat [ix0, iz0, ix1, iz1, ...] of the vertical-surface cells inside the height band.
  var cells: [Int32]
  /// AR y of the floor.
  var floorY: Double
  /// "mesh" (from the LiDAR floor) | "camera" (guessed from the phone height).
  var floorSource: String
  var bandMin: Double
  var bandMax: Double
  var maxAbsNormalY: Double
  /// Walked path, flat [x0, z0, x1, z1, ...] (AR metres, a point every ~25 cm).
  var path: [Float]
  var seconds: Double
  var distance: Double
  var vertexCount: Int

  var cellCount: Int {
    return cells.count / 2
  }
}

enum RecordingGeometryBuilder {
  /// Same defaults as tools/build_locmap.py (and the office localisation map).
  static let defaultBandMin: Float = 0.15
  static let defaultBandMax: Float = 2.4
  static let defaultMaxAbsNormalY: Float = 0.5

  /// - Parameters:
  ///   - referenceY: typical AR height of the phone during the walk (the floor is searched 0.4 to
  ///     2.3 m below it).
  ///   - minCount: mesh vertices needed in a cell for it to count.
  static func build(chunks: [LiveMeshChunk], referenceY: Float, path: [Float], seconds: Double, distance: Double,
                    bandMin: Float = defaultBandMin, bandMax: Float = defaultBandMax,
                    maxAbsNormalY: Float = defaultMaxAbsNormalY, cell: Float = 0.05,
                    minCount: Int = 2) -> RecordingGeometry {
    let refY = referenceY.isFinite ? referenceY : 0
    // Pass 1: floor histogram from upward faces (2 cm bins).
    let histLow = refY - 2.3
    let binSize: Float = 0.02
    let binCount = 96
    var hist = [Int](repeating: 0, count: binCount)
    var vertexCount = 0
    for chunk in chunks where valid(chunk) {
      vertexCount += chunk.count
      let t = chunk.transform
      let t1 = t[1], t5 = t[5], t9 = t[9], t13 = t[13]
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
            let wny = t1 * n[no] + t5 * n[no + 1] + t9 * n[no + 2]
            if wny > 0.9 {
              let wy = t1 * v[vo] + t5 * v[vo + 1] + t9 * v[vo + 2] + t13
              let fb = ((wy - histLow) / binSize).rounded(.down)
              if fb >= 0 && fb < Float(binCount) && wy < refY - 0.4 {
                hist[Int(fb)] += 1
              }
            }
            i += 1
          }
        }
      }
    }
    var floorY = refY - 1.4
    var floorSource = "camera"
    var smooth = [Int](repeating: 0, count: binCount)
    var smoothMax = 0
    for b in 0..<binCount {
      let s = hist[b] + (b > 0 ? hist[b - 1] : 0) + (b + 1 < binCount ? hist[b + 1] : 0)
      smooth[b] = s
      smoothMax = max(smoothMax, s)
    }
    let threshold = max(60, smoothMax / 4)
    if smoothMax >= threshold {
      for b in 0..<binCount {
        let s = smooth[b]
        if s >= threshold && (b == 0 || s >= smooth[b - 1]) && (b + 1 == binCount || s >= smooth[b + 1]) {
          floorY = histLow + (Float(b) + 0.5) * binSize
          floorSource = "mesh"
          break
        }
      }
    }

    // Pass 2: steep faces inside the height band -> 5 cm cells (unbounded: the whole walk).
    var counts: [Int64: UInt16] = [:]
    for chunk in chunks where valid(chunk) {
      let t = chunk.transform
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
            let wny = t1 * n[no] + t5 * n[no + 1] + t9 * n[no + 2]
            if abs(wny) < maxAbsNormalY {
              let x = v[vo]
              let y = v[vo + 1]
              let z = v[vo + 2]
              let h = t1 * x + t5 * y + t9 * z + t13 - floorY
              if h >= bandMin && h <= bandMax {
                let fx = ((t0 * x + t4 * y + t8 * z + t12) / cell).rounded(.down)
                let fz = ((t2 * x + t6 * y + t10 * z + t14) / cell).rounded(.down)
                // NaN fails the comparisons, so Int32() never traps.
                if fx > -2_000_000 && fx < 2_000_000 && fz > -2_000_000 && fz < 2_000_000 {
                  let key = (Int64(Int32(fx)) << 32) | Int64(UInt32(bitPattern: Int32(fz)))
                  let value = counts[key, default: 0]
                  if value < UInt16.max {
                    counts[key] = value + 1
                  }
                }
              }
            }
            i += 1
          }
        }
      }
    }
    var keys: [Int64] = []
    keys.reserveCapacity(counts.count)
    for (key, value) in counts where Int(value) >= minCount {
      keys.append(key)
    }
    keys.sort()
    var cells: [Int32] = []
    cells.reserveCapacity(keys.count * 2)
    for key in keys {
      cells.append(Int32(truncatingIfNeeded: key >> 32))
      cells.append(Int32(bitPattern: UInt32(truncatingIfNeeded: key)))
    }
    return RecordingGeometry(cell: Double(cell), cells: cells, floorY: Double(floorY), floorSource: floorSource,
                             bandMin: Double(bandMin), bandMax: Double(bandMax),
                             maxAbsNormalY: Double(maxAbsNormalY), path: path, seconds: seconds,
                             distance: distance, vertexCount: vertexCount)
  }

  private static func valid(_ chunk: LiveMeshChunk) -> Bool {
    return chunk.transform.count == 16 && chunk.transform.allSatisfy({ $0.isFinite }) && chunk.count > 0
      && chunk.vertexStride >= 3 && chunk.normalStride >= 3
      && chunk.vertices.count >= (chunk.count - 1) * chunk.vertexStride + 3
      && chunk.normals.count >= (chunk.count - 1) * chunk.normalStride + 3
  }

  /// Median of the finite values (nil when there are none).
  static func median(_ values: [Float]) -> Float? {
    let finite = values.filter { $0.isFinite }.sorted()
    guard !finite.isEmpty else { return nil }
    let mid = finite.count / 2
    return finite.count % 2 == 1 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2
  }
}

/// The one hint shown while recording.
enum RecordingHint: String {
  case starting = "REC_STARTING"
  case tooFast = "REC_TOO_FAST"
  case lowDetail = "REC_LOW_DETAIL"
  case learning = "REC_LEARNING"
  case walk = "REC_WALK"
  case good = "REC_GOOD"
}

enum RecordingCoach {
  /// Minimum before "Save" is offered: enough for a usable memory and for aligning the walls.
  static let minSeconds: Double = 25
  static let minDistance: Double = 8
  static let minCells = 400

  static func hint(trackingState: String, trackingReason: String?, mapping: String, seconds: Double,
                   distance: Double) -> RecordingHint {
    if trackingState != "normal" {
      switch trackingReason {
      case "excessiveMotion"?:
        return .tooFast
      case "insufficientFeatures"?:
        return .lowDetail
      default:
        return .starting
      }
    }
    if mapping != "mapped" && mapping != "extending" {
      return .learning
    }
    if mapping == "mapped" && seconds >= 90 && distance >= 30 {
      return .good
    }
    return .walk
  }

  static func canSave(mapping: String, seconds: Double, distance: Double) -> Bool {
    return (mapping == "mapped" || mapping == "extending") && seconds >= minSeconds && distance >= minDistance
  }
}

/// Recordings kept on the phone: Application Support/FlyQ/recordings/*.flyqmap (newest first).
/// Any thread (the host view uses its store queue).
enum RecordingFiles {
  /// The newest ones are kept; older ones are removed only beyond this many.
  static let keep = 12
  static let inProgressName = "FlyQ-recording-in-progress.flyqmap"

  struct Saved {
    let url: URL
    let info: VisualMapPackage.Info
    let bytes: Int
  }

  static func directory() -> URL? {
    guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
      return nil
    }
    let url = base.appendingPathComponent("FlyQ", isDirectory: true)
      .appendingPathComponent("recordings", isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: nil)
    } catch {
      return nil
    }
    return url
  }

  /// Writes (atomically) the in-progress checkpoint, replacing the previous one.
  static func writeCheckpoint(_ package: VisualMapPackage) throws -> Saved {
    guard let dir = directory() else { throw RecordingError.storageUnavailable }
    let url = dir.appendingPathComponent(inProgressName)
    let data = try package.encoded()
    try data.write(to: url, options: [.atomic])
    return Saved(url: url, info: package.info, bytes: data.count)
  }

  /// Writes the final recording under its own name and drops the checkpoint.
  static func writeFinal(_ package: VisualMapPackage) throws -> Saved {
    guard let dir = directory() else { throw RecordingError.storageUnavailable }
    let base = VisualMapPackage.suggestedFileName(venueId: package.info.venueId, createdAt: package.info.createdAt)
    var url = dir.appendingPathComponent(base)
    var suffix = 2
    while FileManager.default.fileExists(atPath: url.path) {
      let stem = (base as NSString).deletingPathExtension
      url = dir.appendingPathComponent("\(stem)-\(suffix).\(VisualMapPackage.fileExtension)")
      suffix += 1
    }
    let data = try package.encoded()
    try data.write(to: url, options: [.atomic])
    try? FileManager.default.removeItem(at: dir.appendingPathComponent(inProgressName))
    prune()
    return Saved(url: url, info: package.info, bytes: data.count)
  }

  /// An interrupted or cancelled walk: its last checkpoint becomes a recording of its own
  /// ("...-partial.flyqmap"), so the next walk can never overwrite it.
  @discardableResult
  static func promoteCheckpoint() -> URL? {
    guard let dir = directory() else { return nil }
    let source = dir.appendingPathComponent(inProgressName)
    guard FileManager.default.fileExists(atPath: source.path),
          let data = try? Data(contentsOf: source, options: [.alwaysMapped]),
          let info = try? VisualMapPackage.peekInfo(data)
    else { return nil }
    let stem = (VisualMapPackage.suggestedFileName(venueId: info.venueId, createdAt: info.createdAt)
      as NSString).deletingPathExtension + "-partial"
    var target = dir.appendingPathComponent("\(stem).\(VisualMapPackage.fileExtension)")
    var suffix = 2
    while FileManager.default.fileExists(atPath: target.path) {
      target = dir.appendingPathComponent("\(stem)-\(suffix).\(VisualMapPackage.fileExtension)")
      suffix += 1
    }
    do {
      try FileManager.default.moveItem(at: source, to: target)
    } catch {
      return nil
    }
    return target
  }

  /// A checkpoint or a promoted checkpoint (the walk was not saved with "Save").
  static func isPartial(_ url: URL) -> Bool {
    let name = url.lastPathComponent
    return name == inProgressName || name.contains("-partial")
  }

  /// Every readable recording, newest first (an interrupted walk's checkpoint included).
  static func list() -> [Saved] {
    guard let dir = directory(),
          let urls = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
    else { return [] }
    var result: [Saved] = []
    for url in urls where url.pathExtension == VisualMapPackage.fileExtension {
      // Raw recordings and extensions of a venue memory: everything with recorded walls.
      guard let data = try? Data(contentsOf: url, options: [.alwaysMapped]),
            let info = try? VisualMapPackage.peekInfo(data),
            info.recording != nil
      else { continue }
      result.append(Saved(url: url, info: info, bytes: data.count))
    }
    return result.sorted { a, b in
      a.info.createdAt != b.info.createdAt ? a.info.createdAt > b.info.createdAt
        : a.url.lastPathComponent > b.url.lastPathComponent
    }
  }

  /// Re-reads a saved recording and checks every part (header, walls, world map present).
  static func verify(_ url: URL) -> Bool {
    guard let data = try? Data(contentsOf: url, options: [.alwaysMapped]),
          let package = try? VisualMapPackage.decode(data),
          let geometry = package.info.recording,
          geometry.cellCount > 0, geometry.floorY.isFinite,
          package.worldMap.count > 1024
    else { return false }
    return true
  }

  private static func prune() {
    let finals = list().filter { $0.url.lastPathComponent != inProgressName && !isPartial($0.url) }
    guard finals.count > keep else { return }
    for old in finals.dropFirst(keep) {
      try? FileManager.default.removeItem(at: old.url)
    }
  }
}

/// What a recording package says about itself.
extension VisualMapPackage.Info {
  /// A recording's header. Without `base`: a raw recording (its own coordinates, `venueId`
  /// "recording", to be aligned offline). With `base`: an extension of that venue memory, made
  /// in its coordinates (the session started from it), so it carries the same venue, alignment and
  /// anchor meaning and can be used as the venue's memory directly.
  static func forRecording(geometry: RecordingGeometry, createdAt: String, featurePoints: Int, device: String,
                           base: VisualMapPackage.Info? = nil) -> VisualMapPackage.Info {
    var info = VisualMapPackage.Info(
      schemaVersion: VisualMapPackage.schemaVersion,
      venueId: VisualMapPackage.recordingVenueId,
      createdAt: createdAt,
      yaw: 0,
      translation: [0, 0, 0],
      source: "recording",
      featurePoints: featurePoints,
      device: device,
      anchorFrame: "recording",
      recording: geometry
    )
    if let base = base {
      info.venueId = base.venueId
      info.yaw = base.yaw
      info.translation = base.translation
      info.anchorFrame = base.anchorFrame
      info.extends = base.createdAt
      info.calibrationArPoints = base.calibrationArPoints
    }
    return info
  }
}

/// How well walls recorded in a memory's coordinates lie on the venue's localisation map, after the
/// memory's AR -> model alignment (`yaw`, `tx`, `tz`, YawAlignment convention): among the wall
/// cells that fall near mapped surfaces (within `nearLimit`; new routes outside the map do not
/// count against the walk), the share within `tolerance` of one. A walk recorded in the wrong place
/// (or a memory recognised in the wrong place) scores low.
enum RecordingCheck {
  static func wallAgreement(_ geometry: RecordingGeometry, map: LocalizationMap, yaw: Double, tx: Double, tz: Double,
                            tolerance: Float = 0.15, nearLimit: Float = 1.0,
                            maxSamples: Int = 6000) -> (share: Double, sampled: Int) {
    let count = geometry.cellCount
    guard count > 0, yaw.isFinite, tx.isFinite, tz.isFinite else { return (0, 0) }
    let step = max(1, count / maxSamples)
    let c = cos(yaw)
    let s = sin(yaw)
    var near = 0
    var counted = 0
    var i = 0
    while i < count {
      let x = (Double(geometry.cells[2 * i]) + 0.5) * geometry.cell
      let z = (Double(geometry.cells[2 * i + 1]) + 0.5) * geometry.cell
      let d = map.distanceAt(x: Float(c * x + s * z + tx), z: Float(-s * x + c * z + tz))
      if d <= nearLimit {
        counted += 1
        if d <= tolerance {
          near += 1
        }
      }
      i += step
    }
    return (counted > 0 ? Double(near) / Double(counted) : 0, counted)
  }
}

enum RecordingError: Error, CustomStringConvertible {
  case storageUnavailable
  case noGeometry
  case verificationFailed

  var description: String {
    switch self {
    case .storageUnavailable:
      return "The phone storage is not available."
    case .noGeometry:
      return "No LiDAR walls were captured yet."
    case .verificationFailed:
      return "The saved recording could not be read back."
    }
  }
}
