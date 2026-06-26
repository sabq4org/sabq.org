import Foundation
import ActivityKit

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
        var minute: String
        /// نصّ الحالة: «الشوط الأول» · «بين الشوطين» · «انتهت».
        var statusLabel: String
        var isLive: Bool
        var isFinished: Bool
        /// آخر حدث بارز للعرض السريع: «⚽ 23' محمد» أو «🟨 41' سالم».
        var lastEvent: String?

        public init(homeScore: Int = 0, awayScore: Int = 0, minute: String = "",
                    statusLabel: String = "", isLive: Bool = false, isFinished: Bool = false,
                    lastEvent: String? = nil) {
            self.homeScore = homeScore
            self.awayScore = awayScore
            self.minute = minute
            self.statusLabel = statusLabel
            self.isLive = isLive
            self.isFinished = isFinished
            self.lastEvent = lastEvent
        }
    }

    var fixtureId: Int
    var homeName: String
    var awayName: String
    var homeLogo: String
    var awayLogo: String
    var competition: String
    var kickoff: Date

    public init(fixtureId: Int, homeName: String, awayName: String,
                homeLogo: String, awayLogo: String, competition: String, kickoff: Date) {
        self.fixtureId = fixtureId
        self.homeName = homeName
        self.awayName = awayName
        self.homeLogo = homeLogo
        self.awayLogo = awayLogo
        self.competition = competition
        self.kickoff = kickoff
    }
}
