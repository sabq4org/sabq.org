import Foundation
import Testing
@testable import sabq

/// بلاغ المالك 2026-10-31: المحفوظات تعرض «خلال 7 أشهر» لخبر مضى، لأن
/// `RelativeDateTimeFormatter` العربي يكتب صيغة المستقبل بين 3 و10 أشهر.
struct ArabicRelativeDateTests {
    private let now = SabqFormatters.parseISO8601("2026-10-31T09:00:00.000Z")!

    private func ago(_ seconds: TimeInterval) -> String {
        SabqFormatters.arabicRelative(now.addingTimeInterval(-seconds), now: now)
    }

    @Test func minutesUseArabicCountForms() {
        #expect(ago(20) == "الآن")
        #expect(ago(60) == "قبل دقيقة")
        #expect(ago(120) == "قبل دقيقتين")
        #expect(ago(5 * 60) == "قبل 5 دقائق")
        #expect(ago(15 * 60) == "قبل 15 دقيقة")
    }

    @Test func hoursUseArabicCountForms() {
        #expect(ago(3600) == "قبل ساعة")
        #expect(ago(2 * 3600) == "قبل ساعتين")
        #expect(ago(4 * 3600) == "قبل 4 ساعات")
        #expect(ago(11 * 3600) == "قبل 11 ساعة")
    }

    @Test func recentDaysThenCalendarDate() {
        #expect(ago(3 * 86400) == "قبل 3 أيام")
        let march = SabqFormatters.parseISO8601("2026-03-22T16:20:00.129Z")!
        let label = SabqFormatters.arabicRelative(march, now: now)
        #expect(label == "22 مارس")
        #expect(!label.contains("خلال"))
        let lastYear = SabqFormatters.parseISO8601("2025-12-05T10:00:00.000Z")!
        #expect(SabqFormatters.arabicRelative(lastYear, now: now) == "5 ديسمبر 2025")
    }
}
