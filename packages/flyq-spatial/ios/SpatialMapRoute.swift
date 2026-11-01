import Foundation

/// Walking routes on the drawn map, like a person walks: from the plan's walking grid (`nav`, the
/// clearance of every 0.5 m cell), A* that keeps a little away from the walls without long detours,
/// then the straightest line a person would take (corners cut where there is room) with rounded
/// corners. The same steps and numbers as tools/terminal/route_plan.py (the reference).
struct PlanNavGrid {
  static let rMin: Float = 0.35      // a person needs this much room to their sides
  static let c0: Float = 1.2         // nearer the walls than this, a step costs more...
  static let alpha: Float = 4        // ...up to 1 + alpha times at the wall
  static let losClear: Float = 0.55  // a straight stretch keeps at least this far from the walls
  static let smoothRounds = 3
  static let minArea = 200           // cells: a smaller walkable area is a pocket, not a way

  let x0: Double
  let z0: Double
  let cell: Double
  let width: Int
  let height: Int
  /// Metres to the nearest obstacle, row by row (rows go towards +z).
  let clear: [Float]
  /// The connected walkable area of each cell (-1: not walkable), and each area's size.
  let area: [Int32]
  let areaSizes: [Int]

  init?(_ nav: VenuePlan.Nav) {
    guard nav.origin.count == 2, nav.origin.allSatisfy({ $0.isFinite }), nav.cell.isFinite, nav.cell > 0.05,
          nav.cell < 5, nav.size.count == 2, nav.size[0] > 0, nav.size[1] > 0, nav.size[0] * nav.size[1] <= 2_000_000,
          nav.unit.isFinite, nav.unit > 0, let raw = Data(base64Encoded: nav.clearance)
    else { return nil }
    let n = nav.size[0] * nav.size[1]
    var out = [Float](repeating: 0, count: n)
    var i = 0
    let bytes = [UInt8](raw)
    var k = 0
    while k + 1 < bytes.count {
      let count = Int(bytes[k])
      let value = Float(bytes[k + 1]) * Float(nav.unit)
      guard i + count <= n else { return nil }
      for j in i..<(i + count) { out[j] = value }
      i += count
      k += 2
    }
    guard i == n else { return nil }
    x0 = nav.origin[0]
    z0 = nav.origin[1]
    cell = nav.cell
    width = nav.size[0]
    height = nav.size[1]
    clear = out
    // connected walkable areas (4-neighbours)
    var labels = [Int32](repeating: -1, count: n)
    var sizes: [Int] = []
    var stack: [Int] = []
    for start in 0..<n where labels[start] < 0 && out[start] >= PlanNavGrid.rMin {
      let id = Int32(sizes.count)
      labels[start] = id
      stack.append(start)
      var size = 0
      while let cur = stack.popLast() {
        size += 1
        let r = cur / width, c = cur % width
        for (nr, nc) in [(r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)] {
          guard nr >= 0, nr < height, nc >= 0, nc < width else { continue }
          let j = nr * width + nc
          if labels[j] < 0 && out[j] >= PlanNavGrid.rMin {
            labels[j] = id
            stack.append(j)
          }
        }
      }
      sizes.append(size)
    }
    area = labels
    areaSizes = sizes
  }

  func cellOf(_ p: SIMD2<Double>) -> (r: Int, c: Int) {
    return (Int(((p.y - z0) / cell).rounded(.down)), Int(((p.x - x0) / cell).rounded(.down)))
  }

  func centre(_ r: Int, _ c: Int) -> SIMD2<Double> {
    return SIMD2<Double>(x0 + (Double(c) + 0.5) * cell, z0 + (Double(r) + 0.5) * cell)
  }

  func clearance(_ p: SIMD2<Double>) -> Float {
    guard p.x.isFinite, p.y.isFinite else { return 0 }
    let (r, c) = cellOf(p)
    guard r >= 0, r < height, c >= 0, c < width else { return 0 }
    return clear[r * width + c]
  }

  /// The walkable cell nearest to `p` within `maxMeters`: in the area `inArea`, or else in any area
  /// big enough to be a way (not a pocket closed in by furniture).
  func nearestWalkable(_ p: SIMD2<Double>, maxMeters: Double, inArea: Int32? = nil) -> Int? {
    guard p.x.isFinite, p.y.isFinite else { return nil }
    let (r0, c0) = cellOf(p)
    let steps = Int(maxMeters / cell)
    var best: (d: Double, i: Int)?
    for rad in 0...max(steps, 0) {
      for r in (r0 - rad)...(r0 + rad) {
        for c in (c0 - rad)...(c0 + rad) {
          guard max(abs(r - r0), abs(c - c0)) == rad, r >= 0, r < height, c >= 0, c < width else { continue }
          let i = r * width + c
          let a = area[i]
          guard a >= 0 else { continue }
          if let want = inArea { if a != want { continue } } else if areaSizes[Int(a)] < PlanNavGrid.minArea { continue }
          let d = simd_len(centre(r, c) - p)
          if best == nil || d < best!.d { best = (d, i) }
        }
      }
      if let b = best, b.d <= (Double(rad) + 0.5) * cell { break }
    }
    return best?.i
  }

  private func stepCost(_ i: Int) -> Float {
    let k = max(0, (PlanNavGrid.c0 - clear[i]) / PlanNavGrid.c0)
    return 1 + PlanNavGrid.alpha * k * k
  }

  /// A* over the cells; nil when the goal cannot be reached.
  func cells(from start: Int, to goal: Int) -> [Int]? {
    let n = width * height
    var g = [Float](repeating: .infinity, count: n)
    var came = [Int32](repeating: -1, count: n)
    var closed = [Bool](repeating: false, count: n)
    var heap = MinHeap()
    let gr = goal / width, gc = goal % width
    g[start] = 0
    heap.push(0, start)
    let moves: [(Int, Int, Float)] = [(-1, 0, 1), (1, 0, 1), (0, -1, 1), (0, 1, 1),
                                      (-1, -1, 1.4142135), (-1, 1, 1.4142135), (1, -1, 1.4142135), (1, 1, 1.4142135)]
    while let (_, cur) = heap.pop() {
      if cur == goal {
        var path = [cur]
        var at = cur
        while came[at] >= 0 { at = Int(came[at]); path.append(at) }
        return path.reversed()
      }
      if closed[cur] { continue }
      closed[cur] = true
      let r = cur / width, c = cur % width
      for (dr, dc, len) in moves {
        let nr = r + dr, nc = c + dc
        guard nr >= 0, nr < height, nc >= 0, nc < width else { continue }
        let j = nr * width + nc
        guard clear[j] >= PlanNavGrid.rMin else { continue }
        // no cutting a corner
        if dr != 0 && dc != 0 && (clear[r * width + nc] < PlanNavGrid.rMin || clear[nr * width + c] < PlanNavGrid.rMin) {
          continue
        }
        let ng = g[cur] + len * (stepCost(cur) + stepCost(j)) / 2
        if ng < g[j] {
          g[j] = ng
          came[j] = Int32(cur)
          let h = Float(((Double(nr - gr) * Double(nr - gr)) + (Double(nc - gc) * Double(nc - gc))).squareRoot())
          heap.push(ng + h, j)
        }
      }
    }
    return nil
  }

  private func clearLine(_ a: SIMD2<Double>, _ b: SIMD2<Double>, need: Float) -> Bool {
    let d = simd_len(b - a)
    let n = max(1, Int(d / (cell / 2)))
    for i in 0...n {
      let t = Double(i) / Double(n)
      if clearance(a + (b - a) * t) < need { return false }
    }
    return true
  }

  /// The walking route from `from` to `to` (venue x, z), as a polyline; nil when there is none.
  func route(from: SIMD2<Double>, to: SIMD2<Double>) -> [SIMD2<Double>]? {
    guard let s = nearestWalkable(from, maxMeters: 4),
          let t = nearestWalkable(to, maxMeters: 8, inArea: area[s]),
          let path = cells(from: s, to: t)
    else { return nil }
    var pts = path.map { centre($0 / width, $0 % width) }
    if clearance(from) >= PlanNavGrid.rMin { pts[0] = from }
    // the straightest line: from each point on to the farthest one in plain view
    func need(_ p: SIMD2<Double>) -> Float { return min(PlanNavGrid.losClear, max(PlanNavGrid.rMin, clearance(p))) }
    var way = [pts[0]]
    var i = 0
    while i < pts.count - 1 {
      var j = pts.count - 1
      while j > i + 1 && !clearLine(pts[i], pts[j], need: min(need(pts[i]), need(pts[j]))) { j -= 1 }
      way.append(pts[j])
      i = j
    }
    // rounded corners (Chaikin), as long as they stay where a person fits
    for rounds in stride(from: PlanNavGrid.smoothRounds, through: 0, by: -1) {
      var cur = way
      for _ in 0..<rounds {
        var next = [cur[0]]
        for k in 0..<(cur.count - 1) {
          let a = cur[k], b = cur[k + 1]
          next.append(a * 0.75 + b * 0.25)
          next.append(a * 0.25 + b * 0.75)
        }
        next.append(cur[cur.count - 1])
        cur = next
      }
      if cur.allSatisfy({ clearance($0) >= PlanNavGrid.rMin }) {
        way = cur
        break
      }
    }
    return way
  }

  static func length(_ way: [SIMD2<Double>]) -> Double {
    guard way.count > 1 else { return 0 }
    var sum = 0.0
    for k in 0..<(way.count - 1) { sum += simd_len(way[k + 1] - way[k]) }
    return sum
  }

  /// The point `meters` along the polyline and the direction there.
  static func point(along way: [SIMD2<Double>], meters: Double) -> (p: SIMD2<Double>, dir: SIMD2<Double>)? {
    guard way.count > 1 else { return nil }
    var left = max(0, meters)
    for k in 0..<(way.count - 1) {
      let a = way[k], b = way[k + 1]
      let seg = simd_len(b - a)
      if seg < 1e-9 { continue }
      if left <= seg { return (a + (b - a) * (left / seg), (b - a) / seg) }
      left -= seg
    }
    let a = way[way.count - 2], b = way[way.count - 1]
    let seg = max(simd_len(b - a), 1e-9)
    return (b, (b - a) / seg)
  }

  /// The rest of the polyline after `meters` (what is still to walk).
  static func rest(of way: [SIMD2<Double>], after meters: Double) -> [SIMD2<Double>] {
    guard way.count > 1, let at = point(along: way, meters: meters) else { return way }
    var left = meters
    for k in 0..<(way.count - 1) {
      let seg = simd_len(way[k + 1] - way[k])
      if left <= seg { return [at.p] + way[(k + 1)...] }
      left -= seg
    }
    return [way[way.count - 1]]
  }
}

/// A route as walked: the points (x, z) and the height over the floor at each (stairs climb).
struct RouteLine {
  var points: [SIMD2<Double>]
  var heights: [Double]

  init(points: [SIMD2<Double>], heights: [Double]? = nil) {
    self.points = points
    self.heights = heights ?? [Double](repeating: 0, count: points.count)
  }

  var length: Double { return PlanNavGrid.length(points) }
  var isEmpty: Bool { return points.count < 2 }

  /// The point, height and direction `meters` along the route.
  func at(_ meters: Double) -> (p: SIMD2<Double>, h: Double, dir: SIMD2<Double>)? {
    guard points.count > 1 else { return nil }
    var left = max(0, meters)
    for k in 0..<(points.count - 1) {
      let a = points[k], b = points[k + 1]
      let seg = simd_len(b - a)
      if seg < 1e-9 { continue }
      if left <= seg {
        let t = left / seg
        return (a + (b - a) * t, heights[k] + (heights[k + 1] - heights[k]) * t, (b - a) / seg)
      }
      left -= seg
    }
    let n = points.count
    let seg = max(simd_len(points[n - 1] - points[n - 2]), 1e-9)
    return (points[n - 1], heights[n - 1], (points[n - 1] - points[n - 2]) / seg)
  }

  /// What is still to walk after `meters`.
  func rest(after meters: Double) -> RouteLine {
    guard points.count > 1, let here = at(meters) else { return self }
    var left = meters
    for k in 0..<(points.count - 1) {
      let seg = simd_len(points[k + 1] - points[k])
      if left <= seg {
        return RouteLine(points: [here.p] + points[(k + 1)...], heights: [here.h] + heights[(k + 1)...])
      }
      left -= seg
    }
    return RouteLine(points: [points[points.count - 1]], heights: [heights[heights.count - 1]])
  }

  func reversed() -> RouteLine {
    return RouteLine(points: points.reversed(), heights: heights.reversed())
  }

  /// Where the user `p` stands against the route: the distance to it and how far along it the
  /// nearest point is. Only the pieces on the user's floor count (`upstairs`: the upper floor; the
  /// flights belong to both), so someone under the upper floor is not put on it.
  func project(_ p: SIMD2<Double>, upstairs: Bool = false) -> (distance: Double, along: Double)? {
    guard points.count > 1 else { return nil }
    var best: (distance: Double, along: Double)?
    var walked = 0.0
    for k in 0..<(points.count - 1) {
      let a = points[k], b = points[k + 1]
      let seg = simd_len(b - a)
      let upA = heights[k] > 1, upB = heights[k + 1] > 1
      let onFloor = upA != upB || upA == upstairs
      if seg > 1e-9 && onFloor {
        let t = max(0, min(1, planDot(p - a, b - a) / (seg * seg)))
        let d = simd_len(p - (a + (b - a) * t))
        if best == nil || d < best!.distance { best = (d, walked + t * seg) }
      }
      walked += seg
    }
    return best
  }

  /// The route as shown while the user walks it: from the user's position (`p`, at height `h`) on,
  /// joined to what is left after `along`. Like a map app, the line always starts at the pin.
  func attached(at p: SIMD2<Double>, height h: Double, along: Double) -> RouteLine {
    let rest = self.rest(after: along)
    guard let first = rest.points.first else { return self }
    if simd_len(first - p) < 0.05 { return rest }
    return RouteLine(points: [p] + rest.points, heights: [h] + rest.heights)
  }

  static func + (a: RouteLine, b: RouteLine) -> RouteLine {
    guard let last = a.points.last, let first = b.points.first else { return a.points.isEmpty ? b : a }
    let skip = simd_len(last - first) < 0.05 ? 1 : 0
    return RouteLine(points: a.points + b.points.dropFirst(skip), heights: a.heights + b.heights.dropFirst(skip))
  }
}

/// A turn or the stairs on a route: what to do there and how far along the route it is.
struct RouteManeuver: Equatable {
  enum Kind: String {
    case left, right, slightLeft, slightRight, back, up, down
  }

  let at: Double
  let kind: Kind
}

extension RouteLine {
  /// The turns and the stairs, in order. A turn is a bend of 30° or more within ~3 m either side of a
  /// corner (55° and up: a full turn; 150° and up: turning back); bends closer than 4 m are one turn,
  /// at the sharpest corner. The stairs: where the height starts rising (up) or falling (down). Same
  /// rules as the web map (tools/terminal/prototype/template.html, `maneuvers`).
  func maneuvers() -> [RouteManeuver] {
    let n = points.count
    guard n >= 2, heights.count == n else { return [] }
    var cum = [0.0]
    for i in 1..<n { cum.append(cum[i - 1] + simd_len(points[i] - points[i - 1])) }
    let total = cum[n - 1]
    var out: [(at: Double, kind: RouteManeuver.Kind?, angle: Double?)] = []
    for i in 1..<n {
      let dh = heights[i] - heights[i - 1]
      let before = i > 1 ? heights[i - 1] - heights[i - 2] : 0
      if dh > 0.2 && before <= 0.2 { out.append((cum[i - 1], .up, nil)) }
      if dh < -0.2 && before >= -0.2 { out.append((cum[i - 1], .down, nil)) }
    }
    var bends: [(at: Double, angle: Double)] = []
    if n > 2 {
      for i in 1..<(n - 1) {
        if abs(heights[i] - heights[i - 1]) > 0.2 || abs(heights[i + 1] - heights[i]) > 0.2 { continue }   // on the stairs
        let m = cum[i]
        if m < 2 || m > total - 2 { continue }
        guard let a = at(max(0, m - 3)), let b = at(m), let c = at(min(total, m + 3)) else { continue }
        let incoming = b.p - a.p, outgoing = c.p - b.p
        if simd_len(incoming) < 0.5 || simd_len(outgoing) < 0.5 { continue }
        // + is to the right: x points east and z south
        let cross = incoming.x * outgoing.y - incoming.y * outgoing.x
        let angle = atan2(cross, planDot(incoming, outgoing)) * 180 / .pi
        if abs(angle) >= 30 { bends.append((m, angle)) }
      }
    }
    for bend in bends {
      if let last = out.indices.last, let lastAngle = out[last].angle, bend.at - out[last].at < 4 {
        if abs(bend.angle) > abs(lastAngle) { out[last] = (bend.at, nil, bend.angle) }
        continue
      }
      out.append((bend.at, nil, bend.angle))
    }
    return out.map { item -> RouteManeuver in
      if let kind = item.kind { return RouteManeuver(at: item.at, kind: kind) }
      let angle = item.angle ?? 0
      let right = angle > 0
      let kind: RouteManeuver.Kind = abs(angle) >= 150 ? .back
        : abs(angle) >= 55 ? (right ? .right : .left) : (right ? .slightRight : .slightLeft)
      return RouteManeuver(at: item.at, kind: kind)
    }.sorted { $0.at < $1.at }
  }

  /// What comes next after `done` metres: a maneuver and how far it is, "straight" (nothing before the
  /// end) or "arrive" (under 4 m left). Turns in the last 6 m are not announced.
  static func next(_ maneuvers: [RouteManeuver], done: Double, total: Double) -> (kind: String, meters: Double) {
    let left = total - done
    if left < 4 { return ("arrive", max(0, left)) }
    if let m = maneuvers.first(where: { $0.at > done + 1 && $0.at < total - 6 }) { return (m.kind.rawValue, m.at - done) }
    return ("straight", left)
  }
}

/// A flight of stairs up to an upper floor: where to step on (the foot), its bottom and top, where
/// one steps off on the upper floor (the head), and the height it climbs.
struct PlanFlight {
  let foot: SIMD2<Double>
  let bottom: SIMD2<Double>
  let top: SIMD2<Double>
  let head: SIMD2<Double>
  let height: Double

  init?(_ stairs: VenuePlan.Stairs) {
    guard let ring = PlanGeometry.ring(stairs.outline), stairs.direction.count == 2, stairs.height.isFinite,
          stairs.height > 0.5 else { return nil }
    let (mn, mx) = PlanGeometry.bounds([ring])
    let dir = SIMD2<Double>(stairs.direction[0], stairs.direction[1])
    let c = (mn + mx) / 2
    if abs(dir.x) >= abs(dir.y) {
      bottom = SIMD2<Double>(dir.x >= 0 ? mn.x : mx.x, c.y)
      top = SIMD2<Double>(dir.x >= 0 ? mx.x : mn.x, c.y)
    } else {
      bottom = SIMD2<Double>(c.x, dir.y >= 0 ? mn.y : mx.y)
      top = SIMD2<Double>(c.x, dir.y >= 0 ? mx.y : mn.y)
    }
    let unit = (top - bottom) / max(simd_len(top - bottom), 1e-9)
    foot = bottom - unit * 0.7
    head = top + unit * 0.9
    height = stairs.height
  }

  /// Up the flight: from the foot to the head, the height rising along the steps.
  var climb: RouteLine {
    return RouteLine(points: [foot, bottom, top, head], heights: [0, 0, height, height])
  }
}

extension PlanNavGrid {
  /// A route between two points, either of which may be on the upper floor (`fromH`, `toH`: heights
  /// over the floor): on the ground floor around the walls, up or down the nearest flight, straight
  /// across the upper floor (it is open).
  func route(from a: SIMD2<Double>, fromH: Double, to b: SIMD2<Double>, toH: Double, flights: [PlanFlight]) -> RouteLine? {
    let upA = fromH > 1, upB = toH > 1
    if !upA && !upB {
      return route(from: a, to: b).map { RouteLine(points: $0) }
    }
    if upA && upB {
      return RouteLine(points: [a, b], heights: [fromH, toH])
    }
    if upA {
      return route(from: b, fromH: toH, to: a, toH: fromH, flights: flights)?.reversed()
    }
    // up: the flight that makes the shortest trip as the crow flies
    guard let flight = flights.min(by: {
      simd_len(a - $0.foot) + simd_len($0.head - b) < simd_len(a - $1.foot) + simd_len($1.head - b)
    }), let ground = route(from: a, to: flight.foot) else { return nil }
    return RouteLine(points: ground) + flight.climb + RouteLine(points: [flight.head, b], heights: [flight.height, toH])
  }
}

extension PlanNavGrid {
  /// Of several places of the same kind (the exits), the one with the shortest walk from `a`, and the
  /// route to it. `goals`: (id, where routes end, height over the floor).
  func nearest(from a: SIMD2<Double>, fromH: Double, goals: [(id: String, at: SIMD2<Double>, h: Double)],
               flights: [PlanFlight]) -> (id: String, line: RouteLine)? {
    var best: (id: String, line: RouteLine)?
    // the nearer ones first (as the crow flies): a walk can't be shorter than that, so the rest can be skipped
    for g in goals.sorted(by: { simd_len($0.at - a) < simd_len($1.at - a) }) {
      if let b = best, simd_len(g.at - a) >= b.line.length { break }
      guard let line = route(from: a, fromH: fromH, to: g.at, toH: g.h, flights: flights), !line.isEmpty else { continue }
      if best == nil || line.length < best!.line.length { best = (g.id, line) }
    }
    return best
  }
}

func simd_len(_ v: SIMD2<Double>) -> Double {
  return (v.x * v.x + v.y * v.y).squareRoot()
}

/// A dot product of its own: the simd module's name for it is not available in the Linux tests.
func planDot(_ a: SIMD2<Double>, _ b: SIMD2<Double>) -> Double {
  return a.x * b.x + a.y * b.y
}

/// A binary min-heap of (priority, cell) for A*.
private struct MinHeap {
  private var items: [(Float, Int)] = []

  mutating func push(_ priority: Float, _ value: Int) {
    items.append((priority, value))
    var i = items.count - 1
    while i > 0 {
      let parent = (i - 1) / 2
      if items[parent].0 <= items[i].0 { break }
      items.swapAt(parent, i)
      i = parent
    }
  }

  mutating func pop() -> (Float, Int)? {
    guard !items.isEmpty else { return nil }
    let top = items[0]
    let last = items.removeLast()
    if !items.isEmpty {
      items[0] = last
      var i = 0
      while true {
        let l = 2 * i + 1, r = l + 1
        var m = i
        if l < items.count && items[l].0 < items[m].0 { m = l }
        if r < items.count && items[r].0 < items[m].0 { m = r }
        if m == i { break }
        items.swapAt(i, m)
        i = m
      }
    }
    return top
  }
}
