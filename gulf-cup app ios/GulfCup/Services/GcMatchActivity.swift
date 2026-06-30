import Foundation
import ActivityKit
#if canImport(UIKit)
import UIKit
#endif

// الحاوية المشتركة (App Group) لتمرير شعارات المنتخبات لويدجت Live Activity.

enum GcSharedContainer {
    static let appGroup = "group.com.sabq.gulfcup"

    static func logosDir() -> URL? {
        guard let base = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup) else { return nil }
        let dir = base.appendingPathComponent("LiveActivityLogos", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func fileName(for urlString: String) -> String {
        "logo_\(UInt(bitPattern: urlString.hashValue)).png"
    }

    #if canImport(UIKit)
    static func image(named name: String?) -> UIImage? {
        guard let name, let dir = logosDir() else { return nil }
        let url = dir.appendingPathComponent(name)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
    }

    static func cacheLogo(from urlString: String) async -> String? {
        guard !urlString.isEmpty, let url = URL(string: urlString), let dir = logosDir() else { return nil }
        let name = fileName(for: urlString)
        let dest = dir.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: dest.path) { return name }
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let img = UIImage(data: data) else { return nil }
        let sized = img.gc_resized(maxDimension: 120)
        guard let png = sized.pngData() else { return nil }
        try? png.write(to: dest, options: .atomic)
        return name
    }
    #endif
}

#if canImport(UIKit)
private extension UIImage {
    func gc_resized(maxDimension: CGFloat) -> UIImage {
        let m = max(size.width, size.height)
        guard m > maxDimension, m > 0 else { return self }
        let scale = maxDimension / m
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in draw(in: CGRect(origin: .zero, size: newSize)) }
    }
}
#endif

// سمات Live Activity — أسماء ContentState تطابق LiveActivityContentState في الخادم حرفيًّا.
nonisolated struct GcMatchActivityAttributes: ActivityAttributes {
    public nonisolated struct ContentState: Codable, Hashable {
        var homeScore: Int
        var awayScore: Int
        var minute: String
        var statusLabel: String
        var isLive: Bool
        var isFinished: Bool
        var lastEvent: String?
        var clockStartEpoch: Double?

        public init(homeScore: Int = 0, awayScore: Int = 0, minute: String = "",
                    statusLabel: String = "", isLive: Bool = false, isFinished: Bool = false,
                    lastEvent: String? = nil, clockStartEpoch: Double? = nil) {
            self.homeScore = homeScore
            self.awayScore = awayScore
            self.minute = minute
            self.statusLabel = statusLabel
            self.isLive = isLive
            self.isFinished = isFinished
            self.lastEvent = lastEvent
            self.clockStartEpoch = clockStartEpoch
        }
    }

    var fixtureId: Int
    var homeName: String
    var awayName: String
    var homeLogo: String
    var awayLogo: String
    var homeLogoFile: String?
    var awayLogoFile: String?
    var competition: String
    var kickoff: Date
}

extension GcFixture {
    var kickoffDate: Date {
        GcDateMath.date(from: date) ?? Date(timeIntervalSince1970: TimeInterval(timestamp))
    }
}
