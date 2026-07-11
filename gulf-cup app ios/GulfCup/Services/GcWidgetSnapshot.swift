import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

// لقطة خفيفة تُكتب من التطبيق إلى الحاوية المشتركة (App Group) ويقرأها ويدجت
// الشاشة الرئيسية: المباراة المميّزة (قادمة/حية) + ترتيب مجموعة السعودية.
// مشتركة العضوية بين هدفَي التطبيق والويدجت (مثل GcMatchActivity).

struct GcWidgetTeam: Codable, Hashable {
    let name: String
    /// اختصار لاتيني ثابت (KSA/QAT…) للعرض داخل دائرة الويدجت — أخفّ من الشعار.
    let code: String
}

struct GcWidgetMatch: Codable, Hashable {
    let home: GcWidgetTeam
    let away: GcWidgetTeam
    let kickoff: TimeInterval   // Unix ثوانٍ
    let round: String
    let live: Bool
    let finished: Bool
    let elapsed: Int?
    let homeGoals: Int?
    let awayGoals: Int?
}

struct GcWidgetStandingRow: Codable, Hashable {
    let rank: Int
    let name: String
    let code: String
    let played: Int
    let points: Int
    let isSaudi: Bool
}

struct GcWidgetSnapshot: Codable, Hashable {
    let updatedAt: TimeInterval
    let match: GcWidgetMatch?
    let groupName: String?
    let rows: [GcWidgetStandingRow]
}

/// اختصار لاتيني ثابت لكل منتخب خليجي (بمعرّف API-Football) — للعرض في الويدجت.
enum GcWidgetCode {
    private static let byId: [Int: String] = [
        23: "KSA", 1567: "IRQ", 1552: "OMA", 1570: "KUW",
        1563: "UAE", 1569: "QAT", 1547: "BHR", 1550: "YEM",
    ]

    /// بمعرّف ونص الاسم (لا نعتمد نماذج التطبيق كي يبقى الملف مشتركًا مع الويدجت).
    static func of(id: Int, name: String) -> String {
        if let c = byId[id] { return c }
        // احتياط: أول ثلاثة أحرف لاتينية من الاسم إن وُجدت، وإلا «؟».
        let latin = name.unicodeScalars.filter { $0.isASCII && CharacterSet.letters.contains($0) }
        return latin.isEmpty ? "؟" : String(String.UnicodeScalarView(latin.prefix(3))).uppercased()
    }
}

/// يطلب من WidgetKit إعادة تحميل خطوط الويدجت (لا أثر في هدف الإضافة نفسه).
enum GcWidgetReload {
    static func reload() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}

enum GcWidgetStore {
    static let appGroup = "group.com.sabq.gulfcup"
    private static let key = "gc.widget.snapshot.v1"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroup)
    }

    static func write(_ snapshot: GcWidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults?.set(data, forKey: key)
    }

    static func read() -> GcWidgetSnapshot? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(GcWidgetSnapshot.self, from: data)
    }
}
