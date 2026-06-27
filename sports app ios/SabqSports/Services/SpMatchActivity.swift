import Foundation
import ActivityKit
#if canImport(UIKit)
import UIKit
#endif

// MARK: - الحاوية المشتركة (App Group) لتمرير شعارات الأندية للويدجت
//
// إضافة الويدجت تعمل في عملية منفصلة ولا تستطيع تحميل صور عبر الشبكة، فنُنزّل
// شعار كل فريق في التطبيق ونكتبه في حاوية App Group مشتركة، ثم يقرأه الويدجت
// من القرص. اسم الملف يُخزَّن في سمات النشاط (ثابتة طوال عمره).

enum SpSharedContainer {
    static let appGroup = "group.com.sabq.sports"

    static func logosDir() -> URL? {
        guard let base = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup) else { return nil }
        let dir = base.appendingPathComponent("LiveActivityLogos", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// اسم ملف ثابت مشتق من رابط الشعار (لتفادي إعادة التنزيل).
    static func fileName(for urlString: String) -> String {
        let hash = urlString.hashValue
        return "logo_\(UInt(bitPattern: hash)).png"
    }

    #if canImport(UIKit)
    /// يقرأ صورة شعار من الحاوية المشتركة (للويدجت).
    static func image(named name: String?) -> UIImage? {
        guard let name, let dir = logosDir() else { return nil }
        let url = dir.appendingPathComponent(name)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
    }

    /// يُنزّل شعارًا ويكتبه في الحاوية، ويعيد اسم الملف (للتطبيق). أفضل-جهد.
    static func cacheLogo(from urlString: String) async -> String? {
        guard !urlString.isEmpty, let url = URL(string: urlString), let dir = logosDir() else { return nil }
        let name = fileName(for: urlString)
        let dest = dir.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: dest.path) { return name }
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let img = UIImage(data: data) else { return nil }
        // أعد الترميز PNG بحجم معقول (≤120px) لتقليل حجم الحاوية.
        let sized = img.sp_resized(maxDimension: 120)
        guard let png = sized.pngData() else { return nil }
        try? png.write(to: dest, options: .atomic)
        return name
    }
    #endif
}

#if canImport(UIKit)
private extension UIImage {
    func sp_resized(maxDimension: CGFloat) -> UIImage {
        let m = max(size.width, size.height)
        guard m > maxDimension, m > 0 else { return self }
        let scale = maxDimension / m
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in draw(in: CGRect(origin: .zero, size: newSize)) }
    }
}
#endif

// MARK: - سمات Live Activity للمباراة (مشتركة بين التطبيق وإضافة الويدجت)
//
// هذا الملف يُجمَّع في هدفَي «SabqSports» و«SabqSportsWidgets» معًا، فهو العقد
// المشترك بين مُطلِق النشاط (التطبيق) وواجهته (الإضافة على شاشة القفل/الجزيرة).
//
// • السمات الثابتة (Attributes): لا تتغيّر طوال عمر النشاط — أسماء/شعارات الفريقين،
//   البطولة، موعد الانطلاق، معرّف المباراة.
// • الحالة الديناميكية (ContentState): تُحدَّث لحظيًّا — النتيجة، الدقيقة، نصّ الحالة،
//   آخر حدث (هدف/بطاقة). تُرسَل محليًّا (والتطبيق نشط) أو عبر APNs لاحقًا.

struct SpMatchActivityAttributes: ActivityAttributes {
    // ⚠️ أسماء الحقول هنا تُطابق `LiveActivityContentState` في الخادم
    // (server/services/apnsService.ts) حرفيًّا — لأن دفعات APNs تحمل
    // `content-state` بهذه المفاتيح، وأي اختلاف يكسر فكّ الترميز على الجهاز.
    public struct ContentState: Codable, Hashable {
        var homeScore: Int
        var awayScore: Int
        /// نصّ الدقيقة الجارية: «78'» أو «45+2'» — فارغ قبل الانطلاق/بعد النهاية.
        /// يبقى كـ fallback للأجهزة القديمة وأثناء توقّف الساعة (استراحة/ترجيح).
        var minute: String
        /// نصّ الحالة: «الشوط الأول» · «بين الشوطين» · «انتهت».
        var statusLabel: String
        var isLive: Bool
        var isFinished: Bool
        /// آخر حدث بارز للعرض السريع: «⚽ 23' محمد» أو «🟨 41' سالم».
        var lastEvent: String?
        /// مرساة الساعة الذاتية (Unix ثوانٍ): اللحظة التي تمثّل «0:00» للساعة الجارية،
        /// أي «الآن − الزمن المنقضي». حين تتوفّر والمباراة تجري، يعرض الويدجت ساعةً
        /// **تتحرّك ذاتيًّا على الجهاز بلا أي دفعة APNs** (يُكسر تأخّر الدقيقة جذريًّا).
        /// nil = الساعة متوقّفة (قبل البدء/استراحة/ترجيح) → يسقط العرض على `minute` المدفوع.
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
    /// اسم ملف شعار الفريق في الحاوية المشتركة (إن نُزِّل) — يقرأه الويدجت.
    var homeLogoFile: String?
    var awayLogoFile: String?
    var competition: String
    var kickoff: Date

    public init(fixtureId: Int, homeName: String, awayName: String,
                homeLogo: String, awayLogo: String,
                homeLogoFile: String? = nil, awayLogoFile: String? = nil,
                competition: String, kickoff: Date) {
        self.fixtureId = fixtureId
        self.homeName = homeName
        self.awayName = awayName
        self.homeLogo = homeLogo
        self.awayLogo = awayLogo
        self.homeLogoFile = homeLogoFile
        self.awayLogoFile = awayLogoFile
        self.competition = competition
        self.kickoff = kickoff
    }
}
