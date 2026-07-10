import Foundation
import ActivityKit
import CryptoKit
#if canImport(UIKit)
import UIKit
#endif

// MARK: - الحاوية المشتركة (App Group) لتمرير شعارات الأندية للويدجت
//
// إضافة الويدجت تعمل في عملية منفصلة ولا تستطيع تحميل صور عبر الشبكة، فنُنزّل
// شعار كل فريق في التطبيق ونكتبه في حاوية App Group مشتركة، ثم يقرأه الويدجت
// من القرص. اسم الملف يُخزَّن في سمات النشاط (ثابتة طوال عمره).

enum SpSharedContainer {
    nonisolated static let appGroup = "group.com.sabq.sports"
    nonisolated static let languageKey = "sabqsports.app.language"

    /// لغة الواجهة كما كتبها التطبيق — يقرأها الودجت/Live Activity.
    nonisolated static var languageCode: String {
        UserDefaults(suiteName: appGroup)?.string(forKey: languageKey)
            ?? UserDefaults.standard.string(forKey: languageKey)
            ?? "ar"
    }

    nonisolated static func logosDir() -> URL? {
        guard let base = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup) else { return nil }
        let dir = base.appendingPathComponent("LiveActivityLogos", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// اسم ملف ثابت مشتق من رابط الشعار (لتفادي إعادة التنزيل).
    /// SHA256 لا `hashValue`: بذرة hashValue عشوائية مع كل تشغيل، فكان الاسم
    /// يتبدّل كل إقلاع → إعادة تنزيل كل الشعارات ونموّ الحاوية بلا تنظيف أبدًا.
    static func fileName(for urlString: String) -> String {
        let digest = SHA256.hash(data: Data(urlString.utf8))
        let hex = digest.prefix(8).map { String(format: "%02x", $0) }.joined()
        return "logo_\(hex).png"
    }

    private nonisolated static let logosCleanupKey = "sp.logos.cleanup.at"

    /// كنس الشعارات غير المستخدمة (>30 يومًا منذ آخر لمسة) — مرة كل أسبوع كحد
    /// أقصى. يزيل أيضًا مخلّفات الأسماء العشوائية المتراكمة قبل البصمة الثابتة.
    nonisolated static func cleanupStaleLogos() {
        guard let dir = logosDir(), let defaults = UserDefaults(suiteName: appGroup) else { return }
        let now = Date().timeIntervalSince1970
        guard now - defaults.double(forKey: logosCleanupKey) >= 7 * 86_400 else { return }
        defaults.set(now, forKey: logosCleanupKey)
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        for url in files {
            let mtime = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?
                .contentModificationDate ?? .distantPast
            if now - mtime.timeIntervalSince1970 > 30 * 86_400 {
                try? fm.removeItem(at: url)
            }
        }
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
        if FileManager.default.fileExists(atPath: dest.path) {
            // لمسة استخدام — تحمي الشعارات النشطة من كنسة الثلاثين يومًا.
            try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: dest.path)
            return name
        }
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

// MARK: - لقطة ودجت الشاشة الرئيسية «المباراة القادمة» (App Group)
//
// التطبيق يكتبها بعد تحميل الرئيسية، وودجت الشاشة الرئيسية يقرؤها بلا شبكة:
// الفريقان + البطولة + موعد الانطلاق (عدّ تنازلي ذاتي). النتائج الحيّة مسؤولية
// Live Activity — هذا الودجت للترقّب قبل المباراة.

nonisolated struct SpWidgetSnapshot: Codable, Equatable {
    let fixtureId: Int
    let homeName: String
    let awayName: String
    let homeLogoFile: String?
    let awayLogoFile: String?
    let competition: String
    let kickoff: Date
    let isFavoriteTeam: Bool
    let homeScore: Int?
    let awayScore: Int?
    let homePenaltyScore: Int?
    let awayPenaltyScore: Int?
    let statusLabel: String?
    let isLive: Bool?
    let isFinished: Bool?

    static let defaultsKey = "sp_widget_next_match"

    static func load() -> SpWidgetSnapshot? {
        guard let d = UserDefaults(suiteName: SpSharedContainer.appGroup),
              let data = d.data(forKey: defaultsKey) else { return nil }
        return try? JSONDecoder().decode(SpWidgetSnapshot.self, from: data)
    }

    func save() {
        guard let d = UserDefaults(suiteName: SpSharedContainer.appGroup),
              let data = try? JSONEncoder().encode(self) else { return }
        d.set(data, forKey: Self.defaultsKey)
    }

    static func clear() {
        UserDefaults(suiteName: SpSharedContainer.appGroup)?.removeObject(forKey: defaultsKey)
    }
}

/// ترجمة خفيفة للويدجت/Live Activity (لا يعتمد على EnglishStrings الكامل).
nonisolated func SpWidgetL(_ arabic: String) -> String {
    guard SpSharedContainer.languageCode == "en" else { return arabic }
    switch arabic {
    case "افتح VARA لتحميل مبارياتك": return "Open VARA to load your matches"
    case "انطلقت": return "Started"
    case "مباراة فريقك": return "Your team’s match"
    case "انتهت": return "FT"
    case "مباشر الآن": return "LIVE"
    case "مباشر": return "LIVE"
    case "اليوم": return "Today"
    case "غدًا": return "Tomorrow"
    case "على انطلاق المباراة": return "Until kickoff"
    case "لم تبدأ": return "Not started"
    case "قريبًا": return "Soon"
    case "مباراة مباشرة": return "Live match"
    default: return arabic
    }
}

// MARK: - سمات Live Activity للمباراة (مشتركة بين التطبيق وإضافة الويدجت)
//
// هذا الملف يُجمَّع في هدفَي «SabqSports» و«SabqSportsWidgets» معًا، فهو العقد
// المشترك بين مُطلِق النشاط (التطبيق) وواجهته (الإضافة على شاشة القفل/الجزيرة).
//
// • السمات الثابتة (Attributes): لا تتغيّر طوال عمر النشاط — أسماء/شعارات الفريقين،
//   البطولة، موعد الانطلاق، معرّف المباراة.
// • الحالة الديناميكية (ContentState): تُحدَّث لحظيًّا — النتيجة، الدقيقة، نصّ الحالة،
//   آخر حدث (هدف/بطاقة). تُرسَل محليًّا (والتطبيق نشط) أو عبر APNs لاحقًا.

nonisolated struct SpMatchActivityAttributes: ActivityAttributes {
    // ⚠️ أسماء الحقول هنا تُطابق `LiveActivityContentState` في الخادم
    // (server/services/apnsService.ts) حرفيًّا — لأن دفعات APNs تحمل
    // `content-state` بهذه المفاتيح، وأي اختلاف يكسر فكّ الترميز على الجهاز.
    public nonisolated struct ContentState: Codable, Hashable {
        var homeScore: Int
        var awayScore: Int
        var homePenaltyScore: Int?
        var awayPenaltyScore: Int?
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

        public init(homeScore: Int = 0, awayScore: Int = 0,
                    homePenaltyScore: Int? = nil, awayPenaltyScore: Int? = nil,
                    minute: String = "",
                    statusLabel: String = "", isLive: Bool = false, isFinished: Bool = false,
                    lastEvent: String? = nil, clockStartEpoch: Double? = nil) {
            self.homeScore = homeScore
            self.awayScore = awayScore
            self.homePenaltyScore = homePenaltyScore
            self.awayPenaltyScore = awayPenaltyScore
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
