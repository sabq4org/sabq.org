import ActivityKit
import Foundation

// MARK: - نموذج بيانات النشاط المباشر للمباراة (Live Activity)
//
// يُترجم هذا الملف داخل هدفين: التطبيق الرئيسي (الذي يبدأ/يحدّث/ينهي النشاط)
// وامتداد الويدجت (الذي يرسم شاشة القفل والـ Dynamic Island). لذلك يجب أن
// يبقى خاليًا من أي اعتماد على شيفرة التطبيق — أنواع أساسية فقط.
//
// `ContentState` هو الجزء المتغيّر لحظيًا (النتيجة/الشوط/الدقيقة/آخر حدث)،
// و`Attributes` الثابتة تُحدَّد مرة واحدة عند بدء النشاط (الفريقان والدور).

public struct LiveMatchAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// أهداف المضيف والضيف
        public var homeScore: Int
        public var awayScore: Int
        /// نص الدقيقة الجاهز للعرض، مثل "67'" أو "45+2'" — فارغ قبل الانطلاق
        public var minute: String
        /// وصف الحالة، مثل "الشوط الأول" / "استراحة" / "انتهت المباراة"
        public var statusLabel: String
        /// هل المباراة جارية الآن (لإظهار النبض الأحمر)
        public var isLive: Bool
        /// هل انتهت المباراة (لإيقاف العدّاد وتثبيت النتيجة)
        public var isFinished: Bool
        /// آخر حدث مهم جاهز للعرض، مثل "⚽ 67' هدف — صلاح" — null إن لا يوجد
        public var lastEvent: String?

        public init(
            homeScore: Int,
            awayScore: Int,
            minute: String,
            statusLabel: String,
            isLive: Bool,
            isFinished: Bool,
            lastEvent: String?
        ) {
            self.homeScore = homeScore
            self.awayScore = awayScore
            self.minute = minute
            self.statusLabel = statusLabel
            self.isLive = isLive
            self.isFinished = isFinished
            self.lastEvent = lastEvent
        }
    }

    /// معرّف المباراة عند المزود — يُستخدم لفتح مركز المباراة عند النقر
    public var fixtureId: Int
    /// اسم المنتخب المضيف (يُعرض يمينًا في RTL)
    public var homeName: String
    /// اسم المنتخب الضيف
    public var awayName: String
    /// الدور/البطولة، مثل "دور المجموعات — المجموعة أ" — اختياري
    public var round: String?
    /// موعد انطلاق المباراة — يُمكّن الويدجت من عرض عدّاد تنازلي ذاتي التحديث
    /// (Text(timerInterval:)) قبل البدء دون أي سحب من الخادم
    public var kickoff: Date

    public init(fixtureId: Int, homeName: String, awayName: String, round: String?, kickoff: Date) {
        self.fixtureId = fixtureId
        self.homeName = homeName
        self.awayName = awayName
        self.round = round
        self.kickoff = kickoff
    }
}
