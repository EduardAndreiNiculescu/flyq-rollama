require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "FlyQSpatial"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/deniskyu/flyq"
  s.license      = { :type => "UNLICENSED", :text => "Private" }
  s.authors      = { "FlyQ" => "dev@flyq.invalid" }
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/deniskyu/flyq.git", :tag => "#{s.version}" }

  # Swift (map, camera, calibration) + one Objective-C++ file (Fabric glue). No public headers.
  s.source_files = "ios/**/*.{swift,mm}"
  s.swift_version = "5.0"
  s.frameworks = "ARKit", "SceneKit", "AVFoundation", "UIKit", "Metal", "UniformTypeIdentifiers", "CryptoKit"

  # Venue files, flat: <venueId>.venue.json, its map views (<venueId>.lite.usdz, <venueId>.map.jpg,
  # or the older single <venueId>.usdz), <venueId>.locmap.json and, optionally, <venueId>.flyqmap
  # (visual memories shipped with the app, for iPhones without LiDAR).
  s.resource_bundles = { "FlyQSpatialAssets" => ["ios/Assets/*.usdz", "ios/Assets/*.json", "ios/Assets/*.flyqmap", "ios/Assets/*.jpg", "ios/Assets/*.png"] }

  s.dependency "React-Core"
  install_modules_dependencies(s)
end
