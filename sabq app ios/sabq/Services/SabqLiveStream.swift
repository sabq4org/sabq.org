import Foundation
import SwiftUI

// عميل البث الحي (SSE) لسبق — نفس مسار VARA: اتصال واحد على
// `GET /api/sports/live-stream` يستقبل موجز المباريات الجارية (~2ث).
// الشاشات تراقب `stamps["w:<id>"]` أو `wcVersion` وتجلب التفاصيل فورًا.
// الاستطلاع الدوري يبقى شبكة أمان عند انقطاع البث.
@MainActor
@Observable
final class SabqLiveStream {
    static let shared = SabqLiveStream()

    /// ختم لكل مباراة حية. المباراة التي تغادر الموجز (انتهت) تُثبَّت على -1.
    private(set) var stamps: [String: Int] = [:]
    private(set) var sportsVersion = 0
    private(set) var wcVersion = 0
    private(set) var connected = false

    private var task: Task<Void, Never>?

    private init() {}

    func start() {
        guard task == nil else { return }
        task = Task { await run() }
    }

    func stop() {
        task?.cancel()
        task = nil
        connected = false
    }

    private func run() async {
        var backoff: UInt64 = 1
        while !Task.isCancelled {
            do {
                guard let url = URL(string: URLConstants.publicAPI + "/sports/live-stream") else { return }
                var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
                req.timeoutInterval = 3600
                req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                let (bytes, response) = try await URLSession.shared.bytes(for: req)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                    throw URLError(.badServerResponse)
                }
                connected = true
                backoff = 1
                for try await line in bytes.lines {
                    if Task.isCancelled { break }
                    guard line.hasPrefix("data:") else { continue }
                    apply(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
                }
            } catch {
                // انقطاع — إعادة اتصال بتراجع.
            }
            connected = false
            if Task.isCancelled { break }
            try? await Task.sleep(nanoseconds: backoff * 1_000_000_000)
            backoff = min(backoff * 2, 15)
        }
    }

    private func apply(_ json: String) {
        guard let data = json.data(using: .utf8),
              let digest = try? JSONDecoder().decode(SabqLiveDigest.self, from: data) else { return }

        var fresh: [String: Int] = [:]
        for item in digest.items { fresh[item.k] = item.hashValue }
        for (k, v) in stamps where fresh[k] == nil && v != -1 { fresh[k] = -1 }

        let previous = stamps
        let sportsChanged = subset(fresh, "s:") != subset(previous, "s:")
        let wcChanged = subset(fresh, "w:") != subset(previous, "w:")
        stamps = fresh
        if sportsChanged { sportsVersion &+= 1 }
        if wcChanged { wcVersion &+= 1 }
    }

    private func subset(_ dict: [String: Int], _ prefix: String) -> [String: Int] {
        dict.filter { $0.key.hasPrefix(prefix) }
    }
}

nonisolated struct SabqLiveDigestItem: Decodable, Hashable {
    let k: String
    let gh: Int
    let ga: Int
    let st: String
    let el: Int?
    let ex: Int?
    let liv: Bool
    let fin: Bool
    let cs: Double?
}

nonisolated struct SabqLiveDigest: Decodable {
    let v: Int
    let items: [SabqLiveDigestItem]
}
