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
