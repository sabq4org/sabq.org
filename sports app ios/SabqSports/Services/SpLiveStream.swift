import Foundation
import SwiftUI

// عميل البث الحي (SSE) — «الوقت الفعلي» بدل الاستطلاع: اتصال واحد مفتوح على
// `GET /api/sports/live-stream` يستقبل موجزًا مضغوطًا لكل المباريات الجارية
// (رياضة «s:» + مونديال «w:») فور تغيّره على الخادم (دورة ثانيتين).
//
// الشاشات لا تقرأ الموجز مباشرة — تراقب «ختم» مباراتها (`stamps["w:123"]`)
// أو عدّاد مجالها (`sportsVersion`/`wcVersion`) وعند تغيّره تجلب التفاصيل فورًا
// بدوالّها القائمة. الاستطلاع الدوري (10ث) يبقى شبكة أمان عند انقطاع البث.
@MainActor
@Observable
final class SpLiveStream {
    static let shared = SpLiveStream()

    /// ختم لكل مباراة حية (يتغيّر مع كل تحديث لها). المباراة التي تختفي من
    /// الموجز (انتهت) يُثبَّت ختمها على -1 دفعةً أخيرة كي يلتقط مركزها النهاية.
    private(set) var stamps: [String: Int] = [:]
    /// يرتفع عند تغيّر أي مباراة في مجاله — للقوائم (عالمية / جدول المونديال).
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

    // MARK: - حلقة الاتصال (إعادة اتصال بتراجع أسّي حتى 15ث)

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
                // انقطاع/فشل — نعيد المحاولة بعد مهلة.
            }
            connected = false
            if Task.isCancelled { break }
            try? await Task.sleep(nanoseconds: backoff * 1_000_000_000)
            backoff = min(backoff * 2, 15)
        }
    }

    private func apply(_ json: String) {
        guard let data = json.data(using: .utf8),
              let digest = try? JSONDecoder().decode(SpLiveDigest.self, from: data) else { return }

        var fresh: [String: Int] = [:]
        for item in digest.items { fresh[item.k] = item.hashValue }
        // المباريات التي غادرت الموجز (انتهت): ختم أخير مميّز ثم تُحذف لاحقًا.
        for (k, v) in stamps where fresh[k] == nil && v != -1 { fresh[k] = -1 }

        let sportsChanged = subset(fresh, "s:") != subset(stamps, "s:")
        let wcChanged = subset(fresh, "w:") != subset(stamps, "w:")
        stamps = fresh
        if sportsChanged { sportsVersion &+= 1 }
        if wcChanged { wcVersion &+= 1 }

        // نبّه «مبارياتي»/النشاط الحيّ فورًا (جلب مُوجّه بدل انتظار دورته الدورية).
        if sportsChanged {
            Task { await SpMatchFollows.shared.refresh() }
        }
    }

    private func subset(_ dict: [String: Int], _ prefix: String) -> [String: Int] {
        dict.filter { $0.key.hasPrefix(prefix) }
    }
}

// MARK: - نماذج الموجز (مفاتيح قصيرة مطابقة للخادم)

nonisolated struct SpLiveDigestItem: Decodable, Hashable {
    let k: String
    let gh: Int
    let ga: Int
    let st: String
    let el: Int?
    let ex: Int?
    let liv: Bool
    let fin: Bool
}

nonisolated struct SpLiveDigest: Decodable {
    let v: Int
    let items: [SpLiveDigestItem]
}
