import Foundation
import Testing
@testable import sabq

/// عزل لوحات التحرير بين الحسابات وتجاهل الردود القديمة (مراجعة 2026-10-31 د+ح).
@MainActor
@Suite(.serialized)
struct EditorialRequestIsolationTests {

    private func makeDefaults() -> UserDefaults {
        let name = "editorial-isolation-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    private func snapshot(views: Int, period: String = "30") throws -> ContributorPerformance {
        let json = """
        {"role":"reporter","period":"\(period)","generatedAt":"2026-10-31T10:00:00Z","views":\(views),
         "viewsTrendPct":null,"publishedInPeriod":1,"series":[],"peak":null,"likes":0,"comments":0,
         "bookmarks":0,"newFollowers":0,"topArticles":[],
         "statusCounts":{"published":1,"pending":0,"needsChanges":0,"scheduled":0,"draft":0},
         "activity":{"thisWeekCount":1,"lastPublishedAt":null},"featuredComment":null}
        """
        return try JSONDecoder().decode(ContributorPerformance.self, from: Data(json.utf8))
    }

    // MARK: كاش الأداء

    @Test func cacheIsKeyedByAccountAndPeriod() throws {
        let defaults = makeDefaults()
        #expect(PerformanceSnapshotCache.entryName(accountId: "a", period: "30")
                != PerformanceSnapshotCache.entryName(accountId: "b", period: "30"))
        #expect(PerformanceSnapshotCache.entryName(accountId: "a", period: "7")
                != PerformanceSnapshotCache.entryName(accountId: "a", period: "30"))

        PerformanceSnapshotCache.write(try snapshot(views: 111), accountId: "a", period: "30", defaults: defaults)
        #expect(PerformanceSnapshotCache.read(accountId: "a", period: "30", defaults: defaults)?.views == 111)
        // الحساب ب لا يرى لقطة أ، ولا فترة أخرى لنفس الحساب.
        #expect(PerformanceSnapshotCache.read(accountId: "b", period: "30", defaults: defaults) == nil)
        #expect(PerformanceSnapshotCache.read(accountId: "a", period: "7", defaults: defaults) == nil)
    }

    @Test func legacySharedSnapshotsArePurged() throws {
        let defaults = makeDefaults()
        let raw = try JSONEncoder().encode(try snapshot(views: 5))
        for period in ["7", "30", "all"] {
            defaults.set(raw, forKey: PerformanceSnapshotCache.legacyPrefix + period)
        }
        PerformanceSnapshotCache.write(try snapshot(views: 9), accountId: "a", period: "30", defaults: defaults)
        defaults.set("keep", forKey: "unrelated-pref")

        PerformanceSnapshotCache.purgeLegacy(defaults: defaults)

        for period in ["7", "30", "all"] {
            #expect(defaults.data(forKey: PerformanceSnapshotCache.legacyPrefix + period) == nil)
        }
        #expect(PerformanceSnapshotCache.read(accountId: "a", period: "30", defaults: defaults)?.views == 9)
        #expect(defaults.string(forKey: "unrelated-pref") == "keep")
    }

    @Test func clearAllRemovesEveryAccountAndLegacyEntry() throws {
        let defaults = makeDefaults()
        PerformanceSnapshotCache.write(try snapshot(views: 1), accountId: "a", period: "30", defaults: defaults)
        PerformanceSnapshotCache.write(try snapshot(views: 2), accountId: "b", period: "7", defaults: defaults)
        defaults.set(Data([1]), forKey: PerformanceSnapshotCache.legacyPrefix + "30")
        defaults.set("keep", forKey: "unrelated-pref")

        PerformanceSnapshotCache.clearAll(defaults: defaults)

        #expect(PerformanceSnapshotCache.read(accountId: "a", period: "30", defaults: defaults) == nil)
        #expect(PerformanceSnapshotCache.read(accountId: "b", period: "7", defaults: defaults) == nil)
        #expect(defaults.data(forKey: PerformanceSnapshotCache.legacyPrefix + "30") == nil)
        #expect(defaults.string(forKey: "unrelated-pref") == "keep")
    }

    @Test func leavingAnAccountClearsCacheButFirstSignInDoesNot() throws {
        let defaults = makeDefaults()
        EditorialAccountScope.accountDidChange(from: EditorialAccountScope.currentId, to: nil, defaults: defaults)

        // أول تعرّف بعد الإقلاع (nil → أ): الكاش يبقى للفتح الفوري.
        PerformanceSnapshotCache.write(try snapshot(views: 3), accountId: "a", period: "30", defaults: defaults)
        let before = EditorialAccountScope.generation
        EditorialAccountScope.accountDidChange(from: nil, to: "a", defaults: defaults)
        #expect(EditorialAccountScope.currentId == "a")
        #expect(EditorialAccountScope.generation == before + 1)
        #expect(PerformanceSnapshotCache.read(accountId: "a", period: "30", defaults: defaults)?.views == 3)

        // نفس الحساب (تحديث الملف الشخصي): لا شيء يتغير.
        EditorialAccountScope.accountDidChange(from: "a", to: "a", defaults: defaults)
        #expect(EditorialAccountScope.generation == before + 1)

        // تبديل أ → ب: يُمسح كل شيء.
        EditorialAccountScope.accountDidChange(from: "a", to: "b", defaults: defaults)
        #expect(EditorialAccountScope.currentId == "b")
        #expect(PerformanceSnapshotCache.read(accountId: "a", period: "30", defaults: defaults) == nil)

        // خروج ب → nil: يُمسح أيضًا.
        PerformanceSnapshotCache.write(try snapshot(views: 4), accountId: "b", period: "7", defaults: defaults)
        EditorialAccountScope.accountDidChange(from: "b", to: nil, defaults: defaults)
        #expect(EditorialAccountScope.currentId == nil)
        #expect(PerformanceSnapshotCache.read(accountId: "b", period: "7", defaults: defaults) == nil)
    }

    // MARK: «الأحدث يفوز»

    @Test func olderResponseIsDroppedAfterNewerRequest() {
        let gate = EditorialRequestGate<String>()
        let week = gate.begin("7", accountId: "a", generation: 1)
        let month = gate.begin("30", accountId: "a", generation: 1)
        // رد «7 أيام» عاد بعد طلب «30 يومًا»: يُهمل.
        #expect(!gate.accepts(week, currentKey: "30", accountId: "a", generation: 1))
        #expect(gate.accepts(month, currentKey: "30", accountId: "a", generation: 1))
    }

    @Test func responseForAnotherFilterIsDropped() {
        let gate = EditorialRequestGate<String>()
        let ticket = gate.begin("pending", accountId: "a", generation: 1)
        #expect(!gate.accepts(ticket, currentKey: "published", accountId: "a", generation: 1))
    }

    @Test func responseStartedUnderPreviousAccountIsDropped() {
        let gate = EditorialRequestGate<String>()
        let ticket = gate.begin("30", accountId: "a", generation: 1)
        #expect(!gate.accepts(ticket, currentKey: "30", accountId: "b", generation: 2))
        // نفس المعرّف بعد خروج ودخول (جيل جديد) يُهمل كذلك.
        #expect(!gate.accepts(ticket, currentKey: "30", accountId: "a", generation: 3))
        #expect(gate.accepts(ticket, currentKey: "30", accountId: "a", generation: 1))
    }

    @Test func gateDefaultsFollowAccountScope() {
        let defaults = makeDefaults()
        EditorialAccountScope.accountDidChange(from: EditorialAccountScope.currentId, to: "a", defaults: defaults)
        let gate = EditorialRequestGate<String>()
        let ticket = gate.begin("all")
        #expect(gate.accepts(ticket, currentKey: "all"))
        EditorialAccountScope.accountDidChange(from: "a", to: "b", defaults: defaults)
        #expect(!gate.accepts(ticket, currentKey: "all"))
        EditorialAccountScope.accountDidChange(from: "b", to: nil, defaults: defaults)
    }

    // MARK: ترقيم «المزيد»

    @Test func staleNextPageFromPreviousStatusIsNotAppended() {
        var cursor = EditorialPageCursor<AdminArticleStatus>(filter: .draft)
        let first = cursor.reset(to: .draft)
        let committed1 = cursor.commit(first)
        #expect(committed1)
        let draftPage2 = cursor.nextPageTicket()
        #expect(draftPage2.page == 2 && draftPage2.filter == .draft)

        // المستخدم انتقل إلى «المجدولة» قبل عودة صفحة المسودات الثانية.
        let scheduled = cursor.reset(to: .scheduled)
        let committed2 = cursor.commit(draftPage2)
        #expect(!committed2)
        let committed3 = cursor.commit(scheduled)
        #expect(committed3)
        #expect(cursor.page == 1)
        #expect(cursor.nextPageTicket().filter == .scheduled)
    }

    @Test func refreshOfSameStatusInvalidatesInFlightPage() {
        var cursor = EditorialPageCursor<AdminArticleStatus>(filter: .draft)
        let committed4 = cursor.commit(cursor.reset(to: .draft))
        #expect(committed4)
        let page2 = cursor.nextPageTicket()
        // سحب للتحديث (أو نشر خبر) يعيد الصفحة الأولى في حقبة جديدة.
        let refreshed = cursor.reset(to: .draft)
        #expect(!cursor.accepts(page2))
        let committed5 = cursor.commit(refreshed)
        #expect(committed5)
        let fresh2 = cursor.nextPageTicket()
        let committed6 = cursor.commit(fresh2)
        #expect(committed6)
        #expect(cursor.page == 2)
        #expect(cursor.nextPageTicket().page == 3)
    }

    @Test func olderFirstPageLosesToNewerFirstPage() {
        var cursor = EditorialPageCursor<AdminArticleStatus>(filter: .draft)
        let older = cursor.reset(to: .draft)
        let newer = cursor.reset(to: .draft)
        let committed7 = cursor.commit(older)
        #expect(!committed7)
        let committed8 = cursor.commit(newer)
        #expect(committed8)
    }

    // MARK: إبقاء المحتوى

    @Test func onlyTransientErrorsKeepVisibleContent() {
        #expect(EditorialError.message("تعذر").keepsVisibleContent)
        #expect(!EditorialError.unauthorized.keepsVisibleContent)
        #expect(!EditorialError.forbidden("x").keepsVisibleContent)
        #expect(!EditorialError.twoFactorRequired("x").keepsVisibleContent)
    }
}
