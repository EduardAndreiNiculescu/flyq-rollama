import CryptoKit
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking  // Linux (the type-check of this module off a Mac)
#endif
#if !canImport(ObjectiveC)
private func autoreleasepool<T>(_ body: () throws -> T) rethrows -> T { return try body() }
#endif

/// Fetches the venue's map views from the FlyQ backend and keeps them on the phone:
/// `GET /v1/venues/{venueId}/manifest` lists the newest published pack and its views; the chosen
/// view's file is downloaded once (`X-FlyQ-App-Key`), checked (size and SHA-256) and stored in
/// Application Support/FlyQ/venues/<venueId>/views/ with `views.json` describing it. Offline-first:
/// any failure leaves the bundled or already downloaded view on screen.
final class MapViewSync {
  struct Backend: Equatable {
    let baseURL: String
    let appKey: String
  }

  enum ManifestResult {
    case views(version: Int, views: [MapViewKind: RemoteVenueManifest.View])
    /// The backend has no published pack for this venue (or packs are turned off there).
    case noPack
    case failed(String)
  }

  private let session: URLSession
  private let fileQueue = DispatchQueue(label: "flyq.mapviews.files")

  init() {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 15
    config.timeoutIntervalForResource = 240
    config.urlCache = nil
    session = URLSession(configuration: config)
  }

  // MARK: - Cache on the phone

  static func directory(store: VenueStore) -> URL? {
    guard let venue = store.directory() else { return nil }
    let url = venue.appendingPathComponent("views", isDirectory: true)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: nil)
    return url
  }

  static func loadCache(store: VenueStore) -> CachedMapViews? {
    guard let dir = directory(store: store),
          let data = try? Data(contentsOf: dir.appendingPathComponent("views.json")),
          let cache = try? JSONDecoder().decode(CachedMapViews.self, from: data),
          cache.venueId == store.venueId
    else { return nil }
    return cache
  }

  /// The downloaded file of a cached view, if it is still there with the right size.
  static func fileURL(store: VenueStore, view: CachedMapView) -> URL? {
    guard let dir = directory(store: store) else { return nil }
    let url = dir.appendingPathComponent(view.file)
    guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
          let size = attrs[.size] as? NSNumber, size.intValue == view.sizeBytes
    else { return nil }
    return url
  }

  static func sha256Hex(of url: URL) -> String? {
    guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
    defer { try? handle.close() }
    var hasher = SHA256()
    while true {
      let chunk = autoreleasepool { handle.readData(ofLength: 1 << 20) }
      if chunk.isEmpty { break }
      hasher.update(data: chunk)
    }
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
  }

  // MARK: - Backend

  private func request(_ backend: Backend, path: String, accept: String) -> URLRequest? {
    let base = backend.baseURL.hasSuffix("/") ? String(backend.baseURL.dropLast()) : backend.baseURL
    guard path.hasPrefix("/"), !path.contains(".."), let url = URL(string: base + path),
          let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https"
    else { return nil }
    var req = URLRequest(url: url)
    req.setValue(backend.appKey, forHTTPHeaderField: "X-FlyQ-App-Key")
    req.setValue(accept, forHTTPHeaderField: "Accept")
    req.cachePolicy = .reloadIgnoringLocalCacheData
    return req
  }

  /// Completion on the main queue.
  func fetchManifest(backend: Backend, venueId: String, completion: @escaping (ManifestResult) -> Void) {
    let finish: (ManifestResult) -> Void = { result in DispatchQueue.main.async { completion(result) } }
    guard let req = request(backend, path: "/v1/venues/\(venueId)/manifest", accept: "application/json") else {
      finish(.failed("BAD_BACKEND_URL"))
      return
    }
    session.dataTask(with: req) { data, response, error in
      if let error = error {
        finish(.failed("NETWORK: \(error.localizedDescription)"))
        return
      }
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let body = data ?? Data()
      if status == 404 || status == 422 {
        // 404 PACK_NOT_FOUND (nothing published) or 422 FEATURE_DISABLED (map packs turned off on
        // the server): keep what the app has.
        finish(.noPack)
        return
      }
      guard status == 200 else {
        finish(.failed("HTTP_\(status)"))
        return
      }
      guard let manifest = try? JSONDecoder().decode(RemoteVenueManifest.self, from: body) else {
        finish(.failed("MANIFEST_INVALID"))
        return
      }
      let views = manifest.views(for: venueId)
      finish(views.isEmpty ? .noPack : .views(version: manifest.latest.version, views: views))
    }.resume()
  }

  /// Makes sure the view's file is on the phone: downloads it if needed, checks it, records it in
  /// `views.json` and removes the older file of the same kind. Completion on the main queue with
  /// the cached view and its file, or an error code.
  func ensure(view: RemoteVenueManifest.View, version: Int, backend: Backend, store: VenueStore,
              completion: @escaping (Result<(CachedMapView, URL), Error>) -> Void) {
    let finish: (Result<(CachedMapView, URL), Error>) -> Void = { result in
      DispatchQueue.main.async { completion(result) }
    }
    guard let kind = view.mapKind, let dir = MapViewSync.directory(store: store) else {
      finish(.failure(SyncError("VIEW_INVALID")))
      return
    }
    let ext = MapViewSync.fileExtension(kind: kind, url: view.url)
    let fileName = "\(kind.rawValue)-\(view.sha256.prefix(16)).\(ext)"
    let record = CachedMapView(kind: kind.rawValue, file: fileName, sha256: view.sha256, sizeBytes: view.size,
                               version: version, minMemoryMB: view.minMemoryMB, metersPerPixel: view.metersPerPixel,
                               origin: view.origin, pixels: view.pixels)
    let target = dir.appendingPathComponent(fileName)
    fileQueue.async {
      // Already here (another version of the pack with the same file, or a retry).
      if let attrs = try? FileManager.default.attributesOfItem(atPath: target.path),
         (attrs[.size] as? NSNumber)?.intValue == view.size,
         MapViewSync.sha256Hex(of: target) == view.sha256 {
        MapViewSync.record(record, store: store, dir: dir)
        finish(.success((record, target)))
        return
      }
      guard let req = self.request(backend, path: view.url, accept: "*/*") else {
        finish(.failure(SyncError("BAD_VIEW_URL")))
        return
      }
      self.session.downloadTask(with: req) { temp, response, error in
        if let error = error {
          finish(.failure(SyncError("NETWORK: \(error.localizedDescription)")))
          return
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200, let temp = temp else {
          finish(.failure(SyncError("HTTP_\(status)")))
          return
        }
        // The temporary file is gone once this block returns: check and move it now.
        let staged = dir.appendingPathComponent(".\(fileName).part")
        try? FileManager.default.removeItem(at: staged)
        do {
          try FileManager.default.moveItem(at: temp, to: staged)
        } catch {
          finish(.failure(SyncError("MOVE_FAILED")))
          return
        }
        self.fileQueue.async {
          let size = ((try? FileManager.default.attributesOfItem(atPath: staged.path))?[.size] as? NSNumber)?.intValue
          guard size == view.size, MapViewSync.sha256Hex(of: staged) == view.sha256 else {
            try? FileManager.default.removeItem(at: staged)
            finish(.failure(SyncError("CHECKSUM_MISMATCH")))
            return
          }
          try? FileManager.default.removeItem(at: target)
          do {
            try FileManager.default.moveItem(at: staged, to: target)
          } catch {
            try? FileManager.default.removeItem(at: staged)
            finish(.failure(SyncError("MOVE_FAILED")))
            return
          }
          MapViewSync.record(record, store: store, dir: dir)
          finish(.success((record, target)))
        }
      }.resume()
    }
  }

  private static func fileExtension(kind: MapViewKind, url: String) -> String {
    switch kind {
    case .plan: return "json"
    case .model3d: return "usdz"
    case .image2d:
      let lower = url.lowercased()
      if lower.hasSuffix(".png") { return "png" }
      if lower.hasSuffix(".webp") { return "webp" }
      return "jpg"
    }
  }

  /// Writes `views.json` with this view and deletes the files no record points to any more.
  private static func record(_ view: CachedMapView, store: VenueStore, dir: URL) {
    var cache = loadCache(store: store) ?? CachedMapViews(venueId: store.venueId, views: [:])
    cache.views[view.kind] = view
    if let data = try? JSONEncoder().encode(cache) {
      try? data.write(to: dir.appendingPathComponent("views.json"), options: .atomic)
    }
    let keep = Set(cache.views.values.map { $0.file } + ["views.json"])
    for name in (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? [] where !keep.contains(name) {
      if !name.hasSuffix(".part") {
        try? FileManager.default.removeItem(at: dir.appendingPathComponent(name))
      }
    }
  }

  struct SyncError: Error, CustomStringConvertible {
    let code: String
    init(_ code: String) { self.code = code }
    var description: String { code }
  }
}
