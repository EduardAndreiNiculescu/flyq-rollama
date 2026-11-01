import SceneKit
import UIKit
import simd

/// Builds the SceneKit nodes of a drawn map (`VenuePlan`): every piece a prism (`SCNShape` of its
/// outline, extruded to its height), a plant a pot with a round crown, the baked shadows flat on the
/// floor. Lit like the previews of tools/terminal/render_plan.py. Runs off the main thread: nothing
/// it makes is on screen until `SpatialMapView.attachPlan`.
enum PlanSceneBuilder {
  /// Towards the light: from the north-west and high. With the ambient part at 0.6, a top face shows
  /// exactly its colour and a wall facing away from the light 60 % of it.
  static let towardsLight = simd_normalize(SIMD3<Float>(-0.4, 0.85, -0.35))
  static let ambientIntensity: CGFloat = 600
  static var directionalIntensity: CGFloat { return CGFloat(400 / towardsLight.y) }
  static let glassAlpha: CGFloat = 0.55
  /// Each step this much closer to white than the one below (the last one by this much).
  static let stepTint = 0.45
  /// Flat layers just above the floor: room tints, then the shadows.
  static let roomTintLift = 0.015
  static let shadowLift = 0.03

  struct Built {
    let root: SCNNode
    let floorY: Float
    let boundsMin: SIMD3<Float>
    let boundsMax: SIMD3<Float>
    let background: UIColor
    /// Its points of interest (drawn by the host with `PlanLabelNodes`, in the app's language).
    let labels: [VenuePlan.Label]
  }

  static func build(_ plan: VenuePlan) -> Built? {
    guard let bounds = plan.bounds, let floorRing = PlanGeometry.ring(plan.floor.outline) else { return nil }
    let y0 = plan.floorY ?? 0
    let mats = Materials()
    let solid = SCNNode()
    let glass = SCNNode()
    let shade = SCNNode()
    func color(_ key: String, _ fallback: String) -> PlanColor { return plan.styleColor(key, fallback) }

    let floorColor = color("floor", "#F8F4EB")
    add(prism([floorRing], from: -PlanGeometry.floorThickness, to: 0, floorY: y0,
              top: mats.lit(floorColor), side: mats.lit(floorColor)), to: solid)

    for room in plan.rooms ?? [] {
      guard let rings = PlanGeometry.rings(room.outline, holes: nil) else { continue }
      let height = clampHeight(room.wallHeight ?? 1.2)
      if room.kind == "vestibule" {
        // an exit: a pale green floor; its glass walls (with the doors' openings) are among the walls
        add(flat(rings, lift: roomTintLift, floorY: y0, material: mats.lit(color("exitFloor", "#DDF0E1"))), to: solid)
        continue
      }
      if room.kind == "room" {
        add(flat(rings, lift: roomTintLift, floorY: y0, material: mats.lit(color("room", "#FDE5A4"))), to: solid)
        if let ring = room.ring, let wall = PlanGeometry.rings(ring.outline, holes: ring.holes) {
          let c = color("roomWall", "#E3BB66")
          add(prism(wall, from: 0, to: height, floorY: y0, top: mats.lit(c), side: mats.lit(c)), to: solid)
        }
      } else {
        // a closed shop: a solid block
        add(prism(rings, from: 0, to: height, floorY: y0, top: mats.lit(color("shop", "#FDBD7D")),
                  side: mats.lit(color("shopWall", "#EC9C4C"))), to: solid)
      }
    }

    let wallTop = mats.lit(color("wallTop", "#A7B1BF"))
    let wallSide = mats.lit(color("wall", "#B3BCC8"))
    let glassMat = mats.lit(color("glass", "#8DC3EE"), alpha: glassAlpha)
    for wall in plan.walls {
      guard let rings = PlanGeometry.rings(wall.outline, holes: wall.holes) else { continue }
      let height = clampHeight(wall.height)
      if wall.kind == "glass" {
        add(prism(rings, from: 0, to: height, floorY: y0, top: glassMat, side: glassMat), to: glass)
      } else {
        add(prism(rings, from: 0, to: height, floorY: y0, top: wallTop, side: wallSide), to: solid)
      }
    }

    let stairsColor = color("stairs", "#C9D4E2")
    for flight in plan.stairs ?? [] {
      let steps = PlanGeometry.steps(flight)
      for (k, step) in steps.enumerated() {
        let tint = stairsColor.lighter(stepTint * Double(k) / Double(max(steps.count - 1, 1)))
        let (lo, hi) = step.box
        let ring = [SIMD2<Double>(lo.x, lo.y), SIMD2<Double>(hi.x, lo.y), SIMD2<Double>(hi.x, hi.y), SIMD2<Double>(lo.x, hi.y)]
        add(prism([ring], from: 0, to: step.height, floorY: y0, top: mats.lit(tint), side: mats.lit(tint)), to: solid)
      }
    }

    let potColor = color("pot", "#D6C7B3")
    for object in plan.objects ?? [] {
      guard let rings = PlanGeometry.rings(object.outline, holes: nil) else { continue }
      let c = PlanColor(hex: object.color) ?? color("object", "#B8C1CD")
      if object.kind == "plant" {
        add(tree(rings[0], crown: mats.lit(c), pot: mats.lit(potColor), floorY: y0), to: solid)
        continue
      }
      let base = max(0, min(object.base ?? 0, 10))
      add(prism(rings, from: base, to: clampHeight(object.height), floorY: y0, top: mats.lit(c), side: mats.lit(c)),
          to: solid)
    }

    let upper = color("upperFloor", "#ECE5D7")
    for level in plan.levels ?? [] {
      let elevation = clampHeight(level.elevation)
      let thickness = min(max(level.thickness ?? 0.3, 0.05), 1)
      for column in level.columns ?? [] {
        guard let rings = PlanGeometry.rings(column.outline, holes: nil) else { continue }
        add(prism(rings, from: 0, to: elevation - thickness, floorY: y0, top: wallTop, side: wallSide), to: solid)
      }
      if let rings = PlanGeometry.rings(level.outline, holes: nil) {
        add(prism(rings, from: elevation - thickness, to: elevation, floorY: y0, top: mats.lit(upper),
                  side: mats.lit(upper)), to: solid)
      }
      for railing in level.railings ?? [] {
        guard let rings = PlanGeometry.rings(railing.outline, holes: nil) else { continue }
        add(prism(rings, from: elevation, to: elevation + clampHeight(railing.height), floorY: y0, top: glassMat,
                  side: glassMat), to: glass)
      }
    }

    for shadow in plan.shadows ?? [] {
      guard let rings = PlanGeometry.rings(shadow.outline, holes: shadow.holes), shadow.alpha.isFinite else { continue }
      let alpha = CGFloat(min(max(shadow.alpha, 0), 0.5))
      add(flat(rings, lift: shadowLift, floorY: y0, material: mats.shadow(alpha: alpha)), to: shade)
    }

    // One node per kind of drawing: the solid pieces, the shadows over the floor, the glass last.
    let root = SCNNode()
    let solidFlat = solid.flattenedClone()
    root.addChildNode(solidFlat)
    let shadeFlat = shade.flattenedClone()
    shadeFlat.renderingOrder = 10
    root.addChildNode(shadeFlat)
    let glassFlat = glass.flattenedClone()
    glassFlat.renderingOrder = 20
    root.addChildNode(glassFlat)
    let bg = color("background", "#DCE1E7")
    return Built(root: root, floorY: Float(y0),
                 boundsMin: SIMD3<Float>(Float(bounds.min.x), Float(bounds.min.y), Float(bounds.min.z)),
                 boundsMax: SIMD3<Float>(Float(bounds.max.x), Float(bounds.max.y), Float(bounds.max.z)),
                 background: uiColor(bg), labels: plan.drawableLabels)
  }

  static func uiColor(_ c: PlanColor, alpha: CGFloat = 1) -> UIColor {
    return UIColor(red: CGFloat(c.r), green: CGFloat(c.g), blue: CGFloat(c.b), alpha: alpha)
  }

  private static func clampHeight(_ h: Double) -> Double {
    return h.isFinite ? min(max(h, 0.01), 20) : 0.01
  }

  private static func add(_ node: SCNNode?, to parent: SCNNode) {
    if let node = node { parent.addChildNode(node) }
  }

  /// The outline (first ring) and its holes as a path in the shape's own plane: (x, -z) around the
  /// rings' centre. The holes run the other way round and the even-odd rule is on, so either rule
  /// leaves them open.
  private static func path(_ rings: [[SIMD2<Double>]], center c: SIMD2<Double>) -> UIBezierPath {
    let path = UIBezierPath()
    for (i, ring) in rings.enumerated() {
      let ccw = PlanGeometry.signedArea(ring) > 0
      let wantCCW = (i == 0)
      let points = ccw == wantCCW ? ring : ring.reversed()
      for (j, p) in points.enumerated() {
        let q = CGPoint(x: CGFloat(p.x - c.x), y: CGFloat(-(p.y - c.y)))
        if j == 0 { path.move(to: q) } else { path.addLine(to: q) }
      }
      path.close()
    }
    path.usesEvenOddFillRule = true
    return path
  }

  /// A prism from `from` to `to` metres above the floor. The shape is extruded along its own z, which
  /// lying down (-90 degrees about x) becomes up; its front face is the top.
  private static func prism(_ rings: [[SIMD2<Double>]], from y0: Double, to y1: Double, floorY: Double,
                            top: SCNMaterial, side: SCNMaterial) -> SCNNode? {
    let h = y1 - y0
    guard h > 0.001 else { return nil }
    let (mn, mx) = PlanGeometry.bounds(rings)
    let c = (mn + mx) / 2
    let shape = SCNShape(path: path(rings, center: c), extrusionDepth: CGFloat(h))
    shape.chamferRadius = 0
    shape.materials = [top, top, side]
    let node = SCNNode(geometry: shape)
    node.eulerAngles = SCNVector3(-Float.pi / 2, 0, 0)
    node.position = SCNVector3(Float(c.x), Float(floorY + y0 + h / 2), Float(c.y))
    return node
  }

  /// A flat shape lying `lift` metres above the floor, facing up.
  private static func flat(_ rings: [[SIMD2<Double>]], lift: Double, floorY: Double, material: SCNMaterial) -> SCNNode? {
    let (mn, mx) = PlanGeometry.bounds(rings)
    let c = (mn + mx) / 2
    let shape = SCNShape(path: path(rings, center: c), extrusionDepth: 0)
    shape.materials = [material]
    let node = SCNNode(geometry: shape)
    node.eulerAngles = SCNVector3(-Float.pi / 2, 0, 0)
    node.position = SCNVector3(Float(c.x), Float(floorY + lift), Float(c.y))
    return node
  }

  /// A plant: a pot and a round crown of the outline's radius on it.
  private static func tree(_ ring: [SIMD2<Double>], crown: SCNMaterial, pot: SCNMaterial, floorY: Double) -> SCNNode? {
    let (center, radius) = PlanGeometry.circle(ring)
    guard radius.isFinite, radius > 0.05, radius < 5 else { return nil }
    let node = SCNNode()
    let potShape = SCNCylinder(radius: CGFloat(0.55 * radius), height: CGFloat(PlanGeometry.potHeight))
    potShape.radialSegmentCount = 20
    potShape.materials = [pot]
    let potNode = SCNNode(geometry: potShape)
    potNode.position = SCNVector3(Float(center.x), Float(floorY + PlanGeometry.potHeight / 2), Float(center.y))
    node.addChildNode(potNode)
    let ball = SCNSphere(radius: CGFloat(radius))
    ball.segmentCount = 24
    ball.materials = [crown]
    let ballNode = SCNNode(geometry: ball)
    ballNode.position = SCNVector3(Float(center.x), Float(floorY + PlanGeometry.potHeight + 0.75 * radius), Float(center.y))
    node.addChildNode(ballNode)
    return node
  }

  /// Shared materials, one per colour: lit (Lambert, the plan's light) or the shadows' flat black.
  private final class Materials {
    private var cache: [String: SCNMaterial] = [:]

    func lit(_ c: PlanColor, alpha: CGFloat = 1) -> SCNMaterial {
      let key = "lit \(c.r) \(c.g) \(c.b) \(alpha)"
      if let m = cache[key] { return m }
      let m = SCNMaterial()
      m.lightingModel = .lambert
      m.diffuse.contents = PlanSceneBuilder.uiColor(c)
      m.isDoubleSided = false
      if alpha < 1 {
        m.transparency = alpha
        m.writesToDepthBuffer = false
      }
      cache[key] = m
      return m
    }

    func shadow(alpha: CGFloat) -> SCNMaterial {
      let key = "shadow \(alpha)"
      if let m = cache[key] { return m }
      let m = SCNMaterial()
      m.lightingModel = .constant
      m.diffuse.contents = UIColor.black
      m.transparency = alpha
      m.writesToDepthBuffer = false
      m.isDoubleSided = false
      cache[key] = m
      return m
    }
  }
}

/// The points of interest over the drawn map: billboards with a round badge (the kind's colour, a
/// white SF Symbol) and the name under it, drawn over the map but under the pin. `SpatialMapView`
/// scales them with the camera's distance so they keep their size on screen.
enum PlanLabelNodes {
  /// A label at scale 1, in metres (the picture is 180 x 75 points: the badge in the top 48).
  static let width: CGFloat = 2.4
  static let height: CGFloat = 1.0
  /// From the picture's centre up to the badge's centre, at scale 1.
  static let badgeOffset: Float = 0.18
  /// How high over its floor a badge floats.
  static let lift: Float = 0.6
  static let renderingOrder = 40

  /// `glyph`: the kind's picture (the bundled `poi-<kind>.png`), nil to use an SF Symbol.
  static func make(_ labels: [VenuePlan.Label], floorY: Float, lang: String,
                   glyph: (String) -> UIImage? = { _ in nil }) -> [SCNNode] {
    return labels.map { label in
      let info = PlanLabelKind.info(label.kind)
      let color = PlanColor(hex: label.color) ?? PlanColor(hex: info.color) ?? PlanColor(r: 0.39, g: 0.39, b: 0.4)
      let image = PlanLabelArt.image(title: label.title(lang), glyph: glyph(label.kind), symbol: info.symbol,
                                     fallback: info.fallbackSymbol, color: PlanSceneBuilder.uiColor(color))
      let plane = SCNPlane(width: width, height: height)
      let material = SCNMaterial()
      material.lightingModel = .constant
      material.diffuse.contents = image
      material.isDoubleSided = true
      // over walls and objects, like the pin (which is drawn after it)
      material.readsFromDepthBuffer = false
      material.writesToDepthBuffer = false
      plane.materials = [material]
      let art = SCNNode(geometry: plane)
      art.position = SCNVector3(0, -badgeOffset, 0)
      art.renderingOrder = renderingOrder
      let node = SCNNode()
      node.name = "label:\(label.id)"
      node.addChildNode(art)
      node.constraints = [SCNBillboardConstraint()]
      node.position = SCNVector3(Float(label.at[0]), floorY + Float(label.y ?? 0) + lift, Float(label.at[1]))
      return node
    }
  }
}

/// The picture of one label: a white ring, the badge in its colour, the white icon (the kind's
/// picture, else an SF Symbol, else the name's first letter) and the name under it with a white halo.
enum PlanLabelArt {
  static let size = CGSize(width: 180, height: 75)

  static func image(title: String, glyph picture: UIImage? = nil, symbol: String, fallback: String,
                    color: UIColor) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 3
    format.opaque = false
    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
      let badge = CGRect(x: size.width / 2 - 22, y: 2, width: 44, height: 44)
      UIColor.white.setFill()
      UIBezierPath(ovalIn: badge.insetBy(dx: -2.5, dy: -2.5)).fill()
      color.setFill()
      UIBezierPath(ovalIn: badge).fill()
      if let picture = picture {
        // the same white glyph as the previews, about 60 % of the badge
        let side = badge.width * 0.6
        picture.draw(in: CGRect(x: badge.midX - side / 2, y: badge.midY - side / 2, width: side, height: side))
        text(title, in: CGRect(x: 2, y: 50, width: size.width - 4, height: 22), size: 15,
             color: UIColor(red: 0.13, green: 0.15, blue: 0.2, alpha: 1), halo: true)
        return
      }
      let config = UIImage.SymbolConfiguration(pointSize: 21, weight: .semibold)
      let glyph = UIImage(systemName: symbol, withConfiguration: config)
        ?? UIImage(systemName: fallback, withConfiguration: config)
      if let glyph = glyph?.withTintColor(.white, renderingMode: .alwaysOriginal) {
        let s = glyph.size
        glyph.draw(in: CGRect(x: badge.midX - s.width / 2, y: badge.midY - s.height / 2, width: s.width, height: s.height))
      } else {
        text(String(title.prefix(1)).uppercased(), in: badge.insetBy(dx: 0, dy: 10), size: 20, color: .white, halo: false)
      }
      text(title, in: CGRect(x: 2, y: 50, width: size.width - 4, height: 22), size: 15,
           color: UIColor(red: 0.13, green: 0.15, blue: 0.2, alpha: 1), halo: true)
    }
  }

  private static func text(_ string: String, in rect: CGRect, size: CGFloat, color: UIColor, halo: Bool) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.lineBreakMode = .byTruncatingTail
    let font = UIFont.systemFont(ofSize: size, weight: .semibold)
    let text = NSString(string: string)
    if halo {
      // a positive stroke width draws the outline only (in % of the font size)
      text.draw(in: rect, withAttributes: [.font: font, .paragraphStyle: paragraph, .foregroundColor: UIColor.white,
                                            .strokeColor: UIColor.white, .strokeWidth: 22])
    }
    text.draw(in: rect, withAttributes: [.font: font, .paragraphStyle: paragraph, .foregroundColor: color])
  }
}

/// A walking route on the map, as in a navigation app: a blue band with a white edge a little over the
/// floor, ending in a ring at the destination. Under the walls (they hide it where it passes behind).
enum PlanRouteNodes {
  static let halfWidth: Float = 0.26
  static let edge: Float = 0.12
  static let lift: Float = 0.06
  static let blue = UIColor(red: 0.04, green: 0.52, blue: 1.0, alpha: 1)

  static func make(_ line: RouteLine, floorY: Float) -> SCNNode? {
    let way = line.points
    guard way.count >= 2 else { return nil }
    let heights = line.heights.map { floorY + Float($0) + lift }
    let node = SCNNode()
    node.name = "route"
    if let white = ribbon(way, heights: heights, half: halfWidth + edge, dy: 0, color: .white) {
      white.renderingOrder = 25
      node.addChildNode(white)
    }
    if let band = ribbon(way, heights: heights, half: halfWidth, dy: 0.01, color: blue) {
      band.renderingOrder = 26
      node.addChildNode(band)
    }
    let y = heights[heights.count - 1]
    let end = way[way.count - 1]
    for (r, color, order, dy) in [(CGFloat(0.62), UIColor.white, 27, Float(0.02)), (CGFloat(0.42), blue, 28, Float(0.03))] {
      let disc = SCNCylinder(radius: r, height: 0.01)
      disc.radialSegmentCount = 32
      disc.materials = [material(color)]
      let n = SCNNode(geometry: disc)
      n.position = SCNVector3(Float(end.x), y + dy, Float(end.y))
      n.renderingOrder = order
      node.addChildNode(n)
    }
    return node
  }

  private static func material(_ color: UIColor) -> SCNMaterial {
    let m = SCNMaterial()
    m.lightingModel = .constant
    m.diffuse.contents = color
    m.isDoubleSided = true
    m.writesToDepthBuffer = false
    return m
  }

  private static func unit(_ v: SIMD2<Float>) -> SIMD2<Float> {
    let l = (v.x * v.x + v.y * v.y).squareRoot()
    return l > 1e-6 ? v / l : SIMD2<Float>(0, 0)
  }

  /// A band `2 * half` wide along the polyline at each point's height (mitred joints, kept short at
  /// sharp turns).
  private static func ribbon(_ way: [SIMD2<Double>], heights: [Float], half: Float, dy: Float, color: UIColor) -> SCNNode? {
    let pts = way.map { SIMD2<Float>(Float($0.x), Float($0.y)) }
    var verts: [Float] = []
    var normals: [Float] = []
    for i in 0..<pts.count {
      let y = (i < heights.count ? heights[i] : heights[heights.count - 1]) + dy
      let p = pts[i]
      let din = i > 0 ? unit(p - pts[i - 1]) : nil
      let dout = i < pts.count - 1 ? unit(pts[i + 1] - p) : nil
      let dir = unit((din ?? SIMD2<Float>(0, 0)) + (dout ?? SIMD2<Float>(0, 0)))
      guard dir.x != 0 || dir.y != 0 else { continue }
      let side = SIMD2<Float>(-dir.y, dir.x)
      var scale: Float = 1
      if let a = din {
        let cosHalf = side.x * -a.y + side.y * a.x
        scale = 1 / max(0.55, cosHalf)
      }
      let off = side * half * scale
      verts += [p.x + off.x, y, p.y + off.y, p.x - off.x, y, p.y - off.y]
      normals += [0, 1, 0, 0, 1, 0]
    }
    let count = verts.count / 3
    guard count >= 4 else { return nil }
    var index: [UInt32] = []
    for k in 0..<(count / 2 - 1) {
      let a = UInt32(2 * k)
      index += [a, a + 2, a + 1, a + 1, a + 2, a + 3]
    }
    let vdata = verts.withUnsafeBufferPointer { Data(buffer: $0) }
    let ndata = normals.withUnsafeBufferPointer { Data(buffer: $0) }
    let idata = index.withUnsafeBufferPointer { Data(buffer: $0) }
    let vs = SCNGeometrySource(data: vdata, semantic: .vertex, vectorCount: count, usesFloatComponents: true,
                               componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: 12)
    let ns = SCNGeometrySource(data: ndata, semantic: .normal, vectorCount: count, usesFloatComponents: true,
                               componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: 12)
    let element = SCNGeometryElement(data: idata, primitiveType: .triangles, primitiveCount: index.count / 3,
                                     bytesPerIndex: 4)
    let geometry = SCNGeometry(sources: [vs, ns], elements: [element])
    geometry.materials = [material(color)]
    return SCNNode(geometry: geometry)
  }
}
