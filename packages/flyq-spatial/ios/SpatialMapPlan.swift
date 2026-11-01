import Foundation

/// The drawn map of a venue (`<venue>.plan.json`, made by `tools/terminal/make_plan.py`): a clean
/// indoor map in venue coordinates (x, z in metres, heights above the floor), drawn by the app as lit
/// prisms in the plan's own colours. Same coordinates as the scans, so the pin does not move.
///
/// Only the data and its checks are here (no SceneKit), so the tests run anywhere; the scene is built
/// by `PlanSceneBuilder` (SpatialMapPlanScene.swift).
struct VenuePlan: Decodable {
  struct Floor: Decodable {
    let outline: [[Double]]
  }

  /// The building's walls ("shell", "glass" for the facade, "partition" inside).
  struct Wall: Decodable {
    let outline: [[Double]]
    let holes: [[[Double]]]?
    let height: Double
    let kind: String?
  }

  /// A booth ("room": tinted floor, low walls) or a closed shop ("shop": a solid block).
  struct Room: Decodable {
    let outline: [[Double]]
    let wallHeight: Double?
    let wallThickness: Double?
    let kind: String?
    /// A booth's low walls: one outline with the booth as the hole.
    let ring: Shape?
  }

  struct Shape: Decodable {
    let outline: [[Double]]
    let holes: [[[Double]]]?
  }

  struct Stairs: Decodable {
    let outline: [[Double]]
    let height: Double
    /// The way up: (1, 0), (-1, 0), (0, 1) or (0, -1) in (x, z).
    let direction: [Double]
    let steps: Int
    /// The upper floor it climbs to, when it does.
    var level: String? = nil
  }

  /// Furniture: seats, desks, the bag belts, plants (a pot with a round crown), other objects.
  struct Object: Decodable {
    let outline: [[Double]]
    let height: Double
    let kind: String
    let color: String?
    let round: Bool?
    let base: Double?
  }

  struct Outline: Decodable {
    let outline: [[Double]]
  }

  struct Railing: Decodable {
    let outline: [[Double]]
    let height: Double
  }

  /// An upper floor over part of the venue: a slab whose top is at `elevation`, on columns, with glass
  /// railings on its open edges.
  struct Level: Decodable {
    let id: String
    let elevation: Double
    let thickness: Double?
    let outline: [[Double]]
    let columns: [Outline]?
    let railings: [Railing]?
  }

  /// A point of interest (information, a shop, the toilets, security...): a badge with an icon and a
  /// name, floating over its place. `y` is the floor it is on (0, or an upper floor's elevation).
  struct Label: Decodable {
    struct Name: Decodable {
      let ro: String?
      let en: String?
    }

    let id: String
    let kind: String
    let name: Name?
    let at: [Double]
    let y: Double?
    let level: String?
    /// The badge's colour ("#RRGGBB"), set by the tool; the kind's colour otherwise.
    let color: String?
    /// Where people walk up to it, when that is not the nearest free floor (a desk served from one
    /// side): routes end here.
    let approach: [Double]?

    /// Where a route to it ends: the approach, or the place itself.
    var goal: SIMD2<Double> {
      if let a = approach, a.count == 2, a[0].isFinite, a[1].isFinite {
        return SIMD2<Double>(a[0], a[1])
      }
      return SIMD2<Double>(at[0], at[1])
    }
  }

  /// The walking grid: per cell, the clearance to the nearest obstacle in `unit` metres (0: blocked),
  /// run-length encoded as (count, value) bytes in base64; rows go towards +z (SpatialMapRoute.swift).
  struct Nav: Decodable {
    let origin: [Double]
    let cell: Double
    let size: [Int]
    let unit: Double
    let clearance: String
  }

  /// A shadow on the floor, baked by the tool (two layers overlap for a soft edge).
  struct Shadow: Decodable {
    let outline: [[Double]]
    let holes: [[[Double]]]?
    let alpha: Double
  }

  let schemaVersion: Int
  let venueId: String
  /// Which drawing this is (plan_extras.json → revision, e.g. 2026110104); missing on the first ones.
  let revision: Int?
  let floorY: Double?
  let style: [String: String]
  let floor: Floor
  let walls: [Wall]
  let rooms: [Room]?
  let stairs: [Stairs]?
  let objects: [Object]?
  let levels: [Level]?
  let shadows: [Shadow]?
  let labels: [Label]?
  let nav: Nav?

  static let maxBytes = 4_000_000
  static let maxPieces = 20_000

  /// Reads and checks a plan: schema 1, the venue asked for, at most 4 MB and 20 000 pieces, a floor
  /// outline. Nil for anything else (the map then falls back to a scan).
  /// Only the revision of the plan file at `url` (0 when it has none or does not read).
  static func revision(at url: URL) -> Int {
    struct Head: Decodable { let revision: Int? }
    guard let data = try? Data(contentsOf: url), data.count <= maxBytes,
          let head = try? JSONDecoder().decode(Head.self, from: data) else { return 0 }
    return head.revision ?? 0
  }

  static func load(url: URL, venueId: String?) -> VenuePlan? {
    guard let data = try? Data(contentsOf: url), data.count <= maxBytes else { return nil }
    return decode(data, venueId: venueId)
  }

  static func decode(_ data: Data, venueId: String?) -> VenuePlan? {
    guard data.count <= maxBytes, let plan = try? JSONDecoder().decode(VenuePlan.self, from: data),
          plan.schemaVersion == 1, venueId == nil || plan.venueId == venueId,
          PlanGeometry.ring(plan.floor.outline) != nil, plan.pieceCount <= maxPieces
    else { return nil }
    if let y = plan.floorY, !y.isFinite { return nil }
    return plan
  }

  var pieceCount: Int {
    var count: Int = walls.count
    count += rooms?.count ?? 0
    count += stairs?.count ?? 0
    count += objects?.count ?? 0
    count += shadows?.count ?? 0
    count += labels?.count ?? 0
    for level in levels ?? [] {
      count += 1
      count += level.columns?.count ?? 0
      count += level.railings?.count ?? 0
    }
    return count
  }

  /// The floor outline's extent and the highest piece: what the camera frames.
  var bounds: (min: SIMD3<Double>, max: SIMD3<Double>)? {
    guard let ring = PlanGeometry.ring(floor.outline) else { return nil }
    let (mn, mx) = PlanGeometry.bounds([ring])
    let base = floorY ?? 0
    var top = 0.0
    for w in walls where w.height.isFinite { top = max(top, w.height) }
    for l in levels ?? [] where l.elevation.isFinite { top = max(top, l.elevation) }
    return (SIMD3<Double>(mn.x, base - PlanGeometry.floorThickness, mn.y),
            SIMD3<Double>(mx.x, base + min(top, 20), mx.y))
  }

  static let maxLabels = 500

  /// The labels that can be drawn: an id, a point of two finite numbers within 100 km, a sane floor
  /// height; at most 500. An unknown kind is drawn as "other".
  var drawableLabels: [Label] {
    var out: [Label] = []
    for label in labels ?? [] {
      guard out.count < VenuePlan.maxLabels, !label.id.isEmpty, label.id.count <= 64, label.at.count == 2,
            label.at.allSatisfy({ $0.isFinite && abs($0) < 100_000 })
      else { continue }
      if let y = label.y, !y.isFinite || abs(y) > 50 { continue }
      out.append(label)
    }
    return out
  }

  /// A colour of the plan's style, "#RRGGBB" as (r, g, b) in 0...1, or the fallback.
  func styleColor(_ key: String, _ fallback: String) -> PlanColor {
    return PlanColor(hex: style[key]) ?? PlanColor(hex: fallback) ?? PlanColor(r: 0.5, g: 0.5, b: 0.5)
  }
}

extension VenuePlan.Label {
  /// The name in `lang` ("ro" or "en"), else the kind's own name; at most 40 characters.
  func title(_ lang: String) -> String {
    let own = lang == "ro" ? name?.ro : name?.en
    let trimmed = own?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let kindInfo = PlanLabelKind.info(kind)
    let text = trimmed.isEmpty ? (lang == "ro" ? kindInfo.ro : kindInfo.en) : trimmed
    return String(text.prefix(40))
  }
}

/// The kinds of points of interest: their default names, badge colour and icon (an SF Symbol, with an
/// older one for phones that lack it). Same kinds, names and colours as LABEL_KINDS in make_plan.py.
enum PlanLabelKind {
  struct Info {
    let ro: String
    let en: String
    let color: String
    let symbol: String
    let fallbackSymbol: String
  }

  /// Same colours as LABEL_KINDS in tools/terminal/make_plan.py. The glyph is the bundled
  /// `poi-<kind>.png` (Material Design Icons, as in the previews); the SF Symbols only stand in when
  /// that picture is missing.
  static let all: [String: Info] = [
    "info": Info(ro: "Informații", en: "Information", color: "#0A84FF", symbol: "info", fallbackSymbol: "info.circle"),
    "shop": Info(ro: "Magazin", en: "Shop", color: "#E3A600", symbol: "bag.fill", fallbackSymbol: "bag"),
    "food": Info(ro: "Mâncare și cafea", en: "Food & coffee", color: "#FF7A1A", symbol: "fork.knife",
                 fallbackSymbol: "cup.and.saucer.fill"),
    "wc": Info(ro: "Toalete", en: "Toilets", color: "#5856D6", symbol: "toilet.fill", fallbackSymbol: "figure.stand"),
    "medical": Info(ro: "Cabinet medical", en: "Medical office", color: "#FF375F", symbol: "cross.case.fill",
                    fallbackSymbol: "cross.fill"),
    "vip": Info(ro: "Salon VIP", en: "VIP lounge", color: "#2C2C2E", symbol: "crown.fill", fallbackSymbol: "star.fill"),
    "security": Info(ro: "Control de securitate", en: "Security check", color: "#1E3A8A",
                     symbol: "checkmark.shield.fill", fallbackSymbol: "shield.fill"),
    "checkin": Info(ro: "Check-in", en: "Check-in", color: "#1FA2B8", symbol: "suitcase.rolling.fill",
                    fallbackSymbol: "ticket.fill"),
    "gate": Info(ro: "Poartă", en: "Gate", color: "#AF52DE", symbol: "airplane", fallbackSymbol: "airplane"),
    "exit": Info(ro: "Ieșire", en: "Exit", color: "#34C759", symbol: "door.left.hand.open",
                 fallbackSymbol: "arrow.right.square.fill"),
    "stairs": Info(ro: "Scări", en: "Stairs", color: "#8E8E93", symbol: "stairs", fallbackSymbol: "arrow.up.right"),
    "elevator": Info(ro: "Lift", en: "Elevator", color: "#8E8E93", symbol: "arrow.up.arrow.down",
                     fallbackSymbol: "arrow.up.arrow.down"),
    "atm": Info(ro: "Bancomat", en: "ATM", color: "#2E8B57", symbol: "banknote.fill", fallbackSymbol: "creditcard.fill"),
    "baggage": Info(ro: "Bagaje", en: "Baggage", color: "#A2845E", symbol: "suitcase.fill", fallbackSymbol: "bag.fill"),
    "parking": Info(ro: "Parcare", en: "Parking", color: "#3478F6", symbol: "parkingsign", fallbackSymbol: "p.square.fill"),
    "taxi": Info(ro: "Taxi", en: "Taxi", color: "#E0A800", symbol: "car.fill", fallbackSymbol: "car"),
    "other": Info(ro: "Punct de reper", en: "Landmark", color: "#636366", symbol: "mappin", fallbackSymbol: "mappin"),
  ]

  static func info(_ kind: String) -> Info {
    return all[kind] ?? all["other"]!
  }
}

/// An sRGB colour of the plan, 0...1 per channel.
struct PlanColor: Equatable, Hashable {
  var r: Double
  var g: Double
  var b: Double

  init(r: Double, g: Double, b: Double) {
    self.r = r
    self.g = g
    self.b = b
  }

  /// "#RRGGBB" (or "RRGGBB"); nil for anything else.
  init?(hex: String?) {
    guard var s = hex?.trimmingCharacters(in: .whitespaces) else { return nil }
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
    r = Double((v >> 16) & 0xFF) / 255
    g = Double((v >> 8) & 0xFF) / 255
    b = Double(v & 0xFF) / 255
  }

  /// `t` of the way towards white (0: this colour, 1: white).
  func lighter(_ t: Double) -> PlanColor {
    return PlanColor(r: r + (1 - r) * t, g: g + (1 - g) * t, b: b + (1 - b) * t)
  }
}

enum PlanGeometry {
  /// The floor is drawn as a slab this thick (its edge shows when the map is tilted).
  static let floorThickness = 0.12
  /// A plant: the pot's height; its crown is a ball of the outline's radius on top.
  static let potHeight = 0.4

  /// A ring of at least 3 distinct finite points (x, z) within 100 km of the origin; nil otherwise.
  /// A last point equal to the first (a closed ring) is dropped.
  static func ring(_ points: [[Double]]) -> [SIMD2<Double>]? {
    guard points.count >= 3, points.count <= 100_000 else { return nil }
    var out: [SIMD2<Double>] = []
    out.reserveCapacity(points.count)
    for p in points {
      guard p.count == 2, p[0].isFinite, p[1].isFinite, abs(p[0]) < 100_000, abs(p[1]) < 100_000 else { return nil }
      let q = SIMD2<Double>(p[0], p[1])
      if let last = out.last, last == q { continue }
      out.append(q)
    }
    if out.count > 1, out.first == out.last { out.removeLast() }
    guard out.count >= 3, abs(signedArea(out)) > 1e-6 else { return nil }
    return out
  }

  /// The outline and its holes, or nil when the outline is unusable (bad holes are left out).
  static func rings(_ outline: [[Double]], holes: [[[Double]]]?) -> [[SIMD2<Double>]]? {
    guard let outer = ring(outline) else { return nil }
    return [outer] + (holes ?? []).compactMap { ring($0) }
  }

  /// Shoelace area in (x, z): positive when counter-clockwise with x right and z up.
  static func signedArea(_ ring: [SIMD2<Double>]) -> Double {
    var sum = 0.0
    for i in 0..<ring.count {
      let a = ring[i]
      let b = ring[(i + 1) % ring.count]
      sum += a.x * b.y - b.x * a.y
    }
    return sum / 2
  }

  static func bounds(_ rings: [[SIMD2<Double>]]) -> (min: SIMD2<Double>, max: SIMD2<Double>) {
    var mn = SIMD2<Double>(Double.infinity, Double.infinity)
    var mx = SIMD2<Double>(-Double.infinity, -Double.infinity)
    for r in rings {
      for p in r {
        mn = SIMD2<Double>(min(mn.x, p.x), min(mn.y, p.y))
        mx = SIMD2<Double>(max(mx.x, p.x), max(mx.y, p.y))
      }
    }
    return (mn, mx)
  }

  /// The steps of a flight, bottom first: footprint (min x, min z, max x, max z) and top height.
  static func steps(_ stairs: VenuePlan.Stairs) -> [(box: (SIMD2<Double>, SIMD2<Double>), height: Double)] {
    guard let r = ring(stairs.outline), stairs.height.isFinite, stairs.height > 0, stairs.direction.count == 2 else {
      return []
    }
    let n = min(max(stairs.steps, 1), 60)
    let (mn, mx) = bounds([r])
    let dx = stairs.direction[0]
    let dz = stairs.direction[1]
    var out: [(box: (SIMD2<Double>, SIMD2<Double>), height: Double)] = []
    for k in 0..<n {
      let t0 = Double(k) / Double(n)
      let t1 = Double(k + 1) / Double(n)
      var lo = mn
      var hi = mx
      if abs(dx) >= abs(dz) {
        let a = dx >= 0 ? mn.x + (mx.x - mn.x) * t0 : mx.x - (mx.x - mn.x) * t1
        let b = dx >= 0 ? mn.x + (mx.x - mn.x) * t1 : mx.x - (mx.x - mn.x) * t0
        lo.x = a
        hi.x = b
      } else {
        let a = dz >= 0 ? mn.y + (mx.y - mn.y) * t0 : mx.y - (mx.y - mn.y) * t1
        let b = dz >= 0 ? mn.y + (mx.y - mn.y) * t1 : mx.y - (mx.y - mn.y) * t0
        lo.y = a
        hi.y = b
      }
      out.append(((lo, hi), stairs.height * t1))
    }
    return out
  }

  /// Centre and radius of a round outline (a plant): the centroid of its points and the radius of a
  /// circle of the same area.
  static func circle(_ ring: [SIMD2<Double>]) -> (center: SIMD2<Double>, radius: Double) {
    var c = SIMD2<Double>(0, 0)
    for p in ring { c += p }
    c /= Double(ring.count)
    return (c, (abs(signedArea(ring)) / Double.pi).squareRoot())
  }
}
