import Foundation
import Testing
@testable import sabq

// نقل تعديلات الويب — الدفعة الرابعة: «الاقتصاد الحي» (البند 9).
// المنسّقات نظير `format.ts` حرفيًا، وقواعد الشارة ووضع بلوك الرئيسية و«آخر بيان».
struct WebParityBatch4Tests {

    // MARK: - المنسّقات

    @Test func fmtSarScalesBillionsMillionsAndIntegers() {
        #expect(EconomyFormat.fmtSar(15_836_298_000) == "15.84 مليار")
        #expect(EconomyFormat.fmtSar(755_968_000) == "756 مليون")
        #expect(EconomyFormat.fmtSar(2_686_248_000) == "2.69 مليار")
        #expect(EconomyFormat.fmtSar(59.1458) == "59")
        #expect(EconomyFormat.fmtSar(1_500) == "1,500")
    }

    @Test func fmtCountScalesMillionsAndThousands() {
        #expect(EconomyFormat.fmtCount(267_750_000) == "267.8 مليون")
        #expect(EconomyFormat.fmtCount(9_620) == "10 ألف")
        #expect(EconomyFormat.fmtCount(842) == "842")
    }

    @Test func fmtPctIsAbsoluteAndDashesOnNil() {
        #expect(EconomyFormat.fmtPct(-31) == "31%")
        #expect(EconomyFormat.fmtPct(16.9626, 0) == "17%")
        #expect(EconomyFormat.fmtPct(nil) == "—")
        #expect(EconomyFormat.fmtPct(Double.nan) == "—")
    }

    @Test func trimNumDropsTrailingZerosWithLatinDigits() {
        #expect(EconomyFormat.trimNum(4.25, 2) == "4.25")
        #expect(EconomyFormat.trimNum(4.0, 2) == "4")
        #expect(EconomyFormat.trimNum(15836.298, 1) == "15,836.3")
    }

    @Test func fmtRateUsesPrecisionBands() {
        #expect(EconomyFormat.fmtRate(3.75) == "3.75")
        #expect(EconomyFormat.fmtRate(4.35543) == "4.3554")
        #expect(EconomyFormat.fmtRate(0.07307) == "0.07307")
        #expect(EconomyFormat.fmtRate(123.456) == "123.46")
    }

    @Test func arabicDateAndMonthLabels() {
        #expect(EconomyFormat.fmtDateAr("2026-08-28") == "28 أغسطس 2026")
        #expect(EconomyFormat.fmtDateAr("2026-08-28", withYear: false) == "28 أغسطس")
        #expect(EconomyFormat.fmtMonthAr("2026-07-31") == "يوليو 2026")
        #expect(EconomyFormat.fmtMonthShort("2026-07") == "يول")
        #expect(EconomyFormat.fmtMonthShort("2026-Q2") == "ر2 26")
        #expect(EconomyFormat.fmtDateAr(nil) == "—")
        #expect(EconomyFormat.fmtDateAr("garbage") == "—")
    }

    @Test func fmtUnitByMonthlyCardUnit() {
        #expect(EconomyFormat.fmtUnit(44_470_249_912.92, unit: "sar") == "44.47 مليار ريال")
        #expect(EconomyFormat.fmtUnit(9_620, unit: "count") == "9,620")
        #expect(EconomyFormat.fmtUnit(1.8, unit: "pct") == "1.8%")
    }

    // MARK: - الشارة 48 ساعة ووضع بلوك الرئيسية

    @Test func freshnessWindowIs48Hours() {
        let now = Date()
        let iso = ISO8601DateFormatter()
        let recent = iso.string(from: now.addingTimeInterval(-47 * 3600))
        let stale = iso.string(from: now.addingTimeInterval(-49 * 3600))
        #expect(EconomyFormat.isFresh(recent, now: now))
        #expect(!EconomyFormat.isFresh(stale, now: now))
        #expect(!EconomyFormat.isFresh(nil, now: now))
    }

    private func snapshot(_ json: String) throws -> EconomySnapshot {
        try JSONDecoder().decode(EconomySnapshot.self, from: json.data(using: .utf8)!)
    }

    @Test func homeModePrefersFreshMonthlyThenWeeklyThenHidden() throws {
        let now = Date()
        let freshIso = ISO8601DateFormatter().string(from: now.addingTimeInterval(-3600))
        let card = #"{"key":"k%d","cardTitle":"t","headline":"h","figure":"1","detailAr":"d","tone":"up","weight":1}"#
        let cards = (1...3).map { String(format: card, $0) }.joined(separator: ",")
        let weekly = #"{"weekLabelAr":"w","periodEnd":"2026-09-05","totalValue":1,"totalChangePct":0,"headline":"h","stories":[],"kpis":[],"topSectors":[{"en":"Food","ar":"غذاء","value":1,"share":10,"changePct":1}],"totalCount":1,"ingestedAt":null}"#

        let both = try snapshot(#"{"indicators":[],"fx":[],"samaNews":[],"weekly":\#(weekly),"monthly":{"month":"2026-07","monthLabelAr":"يوليو 2026","headline":"h","cards":[\#(cards)],"ingestedAt":"\#(freshIso)"}}"#)
        #expect(EconomyFormat.homeMode(both, now: now) == .monthly)

        let staleMonthly = try snapshot(#"{"indicators":[],"fx":[],"samaNews":[],"weekly":\#(weekly),"monthly":{"month":"2026-07","monthLabelAr":"يوليو 2026","headline":"h","cards":[\#(cards)],"ingestedAt":"2026-01-01T00:00:00.000Z"}}"#)
        #expect(EconomyFormat.homeMode(staleMonthly, now: now) == .weekly)

        let empty = try snapshot(#"{"indicators":[],"fx":[],"samaNews":[],"weekly":null,"monthly":null}"#)
        #expect(EconomyFormat.homeMode(empty, now: now) == .hidden)
        #expect(EconomyFormat.homeMode(nil, now: now) == .hidden)
    }

    // MARK: - «آخر بيان» = آخر تاريخ صدر من ساما لا وقت فحصنا

    @Test func latestAsOfIsMaxOfIndicatorsFxAndWeekEnd() throws {
        let s = try snapshot(#"""
        {"updatedAt":"2026-09-12T07:19:54.159Z",
         "indicators":[{"key":"repo","titleAr":"t","shortAr":"s","unit":"%","cadence":"decision","value":4.25,"valueText":"4.25%","asOf":"2025-12-10"},
                       {"key":"gdp","titleAr":"t","shortAr":"s","unit":"%","cadence":"quarterly","value":-4.7,"valueText":"-4.7%","asOf":"2026-08-31","quarter":"2","year":"2026"}],
         "fx":[],"fxAsOf":"2026-09-12","samaNews":[],
         "weekly":{"weekLabelAr":"w","periodEnd":"2026-09-05","totalValue":1,"totalChangePct":0,"headline":"h","stories":[],"kpis":[],"topSectors":[],"totalCount":1}}
        """#)
        #expect(s.latestAsOf == "2026-09-12")
        #expect(EconomyFormat.indicatorSub(s.indicators[0]) == "منذ 10 ديسمبر")
        #expect(EconomyFormat.indicatorSub(s.indicators[1]) == "الربع 2 · 2026")
    }

    @Test func snapshotToleratesMissingSections() throws {
        let s = try snapshot(#"{"indicators":[{"key":"inflation","titleAr":"t","shortAr":"التضخم","unit":"%","cadence":"monthly","value":1.8,"valueText":"1.8%","asOf":"2026-07-31"}]}"#)
        #expect(s.weekly == nil)
        #expect(s.monthly == nil)
        #expect(s.fx.isEmpty)
        #expect(s.samaNews.isEmpty)
        #expect(EconomyFormat.indicatorSub(s.indicators[0]) == "يوليو 2026")
    }

    @Test func monthlyCardDefaultsSeriesToEmpty() throws {
        let c = try JSONDecoder().decode(EconomyMonthlyCard.self, from: #"{"key":"cash","cardTitle":"الكاش يتراجع","headline":"h","figure":"44.5 مليار ريال","detailAr":"d","tone":"down"}"#.data(using: .utf8)!)
        #expect(c.series.isEmpty)
        #expect(c.tone == "down")
    }

    @Test func sectorSymbolsCoverSamaCategories() {
        #expect(EconomyFormat.sectorSymbol("Restaurants & Cafés") == "fork.knife")
        #expect(EconomyFormat.sectorSymbol("Food & Beverages") == "basket")
        #expect(EconomyFormat.sectorSymbol("Gas Stations") == "fuelpump")
        #expect(EconomyFormat.sectorSymbol("Education") == "graduationcap")
        #expect(EconomyFormat.sectorSymbol("Something Else") == "basket")
    }
}
