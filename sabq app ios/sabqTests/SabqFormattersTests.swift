import Foundation
import Testing
@testable import sabq

// المنسّقات تظهر في كل خلية خبر («قبل ٥ دقائق»، توقيت الرياض، عدّاد
// المشاهدات) — والأشكال المتعددة لتواريخ الخادم مصدر كسر كلاسيكي.
struct SabqFormattersTests {

    // MARK: - ISO-8601 بكسور ثوانٍ وبدونها

    @Test func parsesFractionalSecondsISO8601() {
        let date = SabqFormatters.parseISO8601("2026-03-29T05:12:58.951Z")
        #expect(date != nil)
    }

    @Test func parsesBasicISO8601() {
        let date = SabqFormatters.parseISO8601("2026-04-04T07:04:38Z")
        #expect(date != nil)
    }

    @Test func rejectsGarbageDate() {
        #expect(SabqFormatters.parseISO8601("ليس تاريخًا") == nil)
        #expect(SabqFormatters.parseISO8601("2026-04-04") == nil)
    }

    @Test func fractionalAndBasicAgreeOnSameInstant() throws {
        let a = try #require(SabqFormatters.parseISO8601("2026-06-01T12:00:00.000Z"))
        let b = try #require(SabqFormatters.parseISO8601("2026-06-01T12:00:00Z"))
        #expect(a == b)
    }

    // MARK: - توقيت الرياض (UTC+3 دائمًا — لا توقيت صيفي)

    @Test func riyadhTimeIsUTCPlus3() throws {
        let noon = try #require(SabqFormatters.parseISO8601("2026-06-01T12:00:00Z"))
        #expect(SabqFormatters.riyadhTime.string(from: noon) == "15:00")
    }

    // MARK: - صياغة مدة القراءة العربية (مفرد/مثنى/جمع)

    @Test func arabicReadingTimeHandlesSingularDualPlural() {
        #expect(SabqFormatters.arabicReadingTime(minutes: 1) == "دقيقة قراءة")
        #expect(SabqFormatters.arabicReadingTime(minutes: 2) == "دقيقتان قراءة")
        #expect(SabqFormatters.arabicReadingTime(minutes: 5) == "5 دقائق قراءة")
    }

    // MARK: - عدّاد المشاهدات المضغوط

    @Test func compactViewCountFormatsTiers() {
        #expect(SabqFormatters.compactViewCount(999) == "999")
        #expect(SabqFormatters.compactViewCount(12_500) == "12.5K")
        #expect(SabqFormatters.compactViewCount(10_000) == "10K")
        #expect(SabqFormatters.compactViewCount(1_200_000) == "1.2M")
    }
}
