import Foundation
import Testing
@testable import sabq

struct AdminScheduleTests {
    private var now: Date { Self.date("2026-09-23T09:00:00Z") }

    @Test func decodesWriterSlotAndPrefersSavedDate() throws {
        let json = """
        {
          "id": "op-1",
          "title": "رأي",
          "status": "draft",
          "articleType": "opinion",
          "authorId": "writer-1",
          "updatedAt": "2026-09-23T08:00:00Z",
          "scheduledAt": "2026-09-22T09:00:00Z",
          "writerWeeklySlot": {
            "weekday": 4,
            "publishTime": "12:00",
            "nextSlot": "2026-09-25T09:00:00Z"
          }
        }
        """.data(using: .utf8)!

        let item = try JSONDecoder().decode(AdminNewsItem.self, from: json)
        let presentation = try #require(item.schedulePresentation(now: now))

        #expect(item.isOpinion)
        #expect(item.authorId == "writer-1")
        #expect(item.writerWeeklySlot?.weekday == 4)
        #expect(presentation.source == .saved)
        #expect(presentation.isOverdue)
        #expect(presentation.title == "فات موعد الكاتب")
        #expect(presentation.timeLabel == "12:00")
    }

    @Test func writerSuggestionIsFutureAndUsesRiyadhGregorianTime() throws {
        let slot = AdminWriterWeeklySlot(
            weekday: 4,
            publishTime: "12:00",
            nextSlot: date("2026-09-25T09:00:00Z")
        )
        let presentation = AdminSchedulePresentation.opinionDraft(
            savedAt: nil,
            writerSlot: slot,
            now: now
        )

        #expect(presentation.source == .writerSuggestion)
        #expect(!presentation.isOverdue)
        #expect(presentation.title == "الموعد القادم حسب جدول الكاتب")
        #expect(presentation.timeLabel == "12:00")
        #expect(presentation.fullLabel?.contains("25") == true)
    }

    @Test @MainActor func editorAutoSelectsNextWriterSlotAfterMissedSavedDate() async throws {
        let detail = try JSONDecoder().decode(
            AdminArticleDetail.self,
            from: """
            {
              "id": "op-1",
              "title": "رأي",
              "status": "draft",
              "articleType": "opinion",
              "authorId": "writer-1",
              "scheduledAt": "2026-09-22T09:00:00Z",
              "writerWeeklySlot": {
                "weekday": 4,
                "publishTime": "12:00",
                "nextSlot": "2026-09-25T09:00:00Z"
              }
            }
            """.data(using: .utf8)!
        )
        let service = FakeAdminService(detail: detail)
        let vm = AdminEditorViewModel(articleId: "op-1", service: service)
        await vm.load(includeCategories: false)

        vm.setStatus(.scheduled, now: now)
        #expect(vm.scheduledAt == date("2026-09-25T09:00:00Z"))
        #expect(vm.schedulePresentation?.source == .writerSuggestion)
        #expect(vm.saveGuard(now: now) == nil)

        let edited = date("2026-09-26T10:30:00Z")
        vm.selectScheduleDate(edited)
        #expect(vm.scheduledAt == edited)
        #expect(vm.schedulePresentation?.source == .saved)
        let saved = await vm.save(html: "<p>نص</p>", now: now)
        #expect(saved)
        #expect(service.savedPayload?.scheduledAt == SabqFormatters.iso8601Basic.string(from: edited))
    }

    @Test @MainActor func scheduleSaveGuardRejectsMissingAndPastDates() async {
        let service = FakeAdminService()
        let vm = AdminEditorViewModel(articleId: "op-1", service: service)
        vm.title = "رأي"
        vm.articleType = "opinion"
        vm.status = .scheduled

        #expect(vm.saveGuard(now: now) == .missingSchedule)
        let firstSave = await vm.save(html: "<p>نص</p>", now: now)
        #expect(!firstSave)
        #expect(service.savedPayload == nil)

        vm.scheduledAt = date("2026-09-22T09:00:00Z")
        vm.hasSchedule = true
        vm.scheduleWasExplicitlySelected = true
        #expect(vm.saveGuard(now: now) == .scheduleInPast)
        let secondSave = await vm.save(html: "<p>نص</p>", now: now)
        #expect(!secondSave)
        #expect(service.savedPayload == nil)
    }

    @Test @MainActor func ordinaryDraftSavePreservesSavedTimestamp() async {
        let service = FakeAdminService()
        let vm = AdminEditorViewModel(articleId: "op-1", service: service)
        let saved = date("2026-09-22T09:00:00Z")
        vm.title = "رأي"
        vm.articleType = "opinion"
        vm.status = .draft
        vm.scheduledAt = saved

        let savedResult = await vm.save(html: "<p>تعديل عادي</p>", now: now)
        #expect(savedResult)
        #expect(service.savedPayload?.scheduledAt == SabqFormatters.iso8601Basic.string(from: saved))
    }

    @Test func explicitClearEncodesNullInsteadOfOmittingSchedule() throws {
        let payload = AdminArticleEditPayload(
            title: "رأي",
            subtitle: "",
            excerpt: "",
            content: "<p>نص</p>",
            status: "draft",
            newsType: "regular",
            isFeatured: false,
            isReading: false,
            hideFromHomepage: false,
            aiSummary: "",
            imageUrl: "",
            categoryId: nil,
            reporterId: nil,
            authorId: "writer-1",
            scheduledAt: nil,
            seo: AdminSEO(),
            clearScheduledAt: true
        )
        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(payload)) as? [String: Any]
        #expect(object?["scheduledAt"] is NSNull)
    }

    @Test @MainActor func clearAndAuthorChangeSurviveStatusSwitches() async throws {
        for changeAuthor in [false, true] {
            let service = FakeAdminService()
            let vm = AdminEditorViewModel(articleId: "op-1", service: service)
            vm.authorId = "writer-1"
            vm.articleType = "opinion"
            vm.scheduledAt = date("2026-09-22T09:00:00Z")
            if changeAuthor {
                vm.selectAuthor(AdminUser(id: "writer-2", name: "كاتب آخر", email: nil, avatarUrl: nil))
            } else {
                vm.clearSchedule()
            }
            vm.setStatus(.archived, now: now)
            vm.setStatus(.draft, now: now)
            #expect(await vm.save(html: "<p>نص</p>", now: now))
            let payload = try #require(service.savedPayload)
            let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(payload)) as? [String: Any]
            #expect(json?["scheduledAt"] is NSNull)
        }
    }

    @Test @MainActor func futureSavedDateWinsAndManualOverrideSurvivesRetappingScheduled() {
        let vm = AdminEditorViewModel(articleId: "op-1", service: FakeAdminService())
        let future = date("2026-09-28T09:00:00Z")
        vm.selectScheduleDate(future)
        vm.setStatus(.scheduled, now: now)
        #expect(vm.scheduledAt == future)
        let custom = date("2026-09-30T11:00:00Z")
        vm.selectScheduleDate(custom)
        vm.setStatus(.scheduled, now: now)
        #expect(vm.scheduledAt == custom)
        #expect(vm.saveGuard(now: now) == nil)
    }

    private static func date(_ value: String) -> Date {
        SabqFormatters.parseISO8601(value)!
    }

    private func date(_ value: String) -> Date {
        Self.date(value)
    }
}

final class FakeAdminService: AdminServicing, @unchecked Sendable {
    let detail: AdminArticleDetail?
    var savedPayload: AdminArticleEditPayload?

    init(detail: AdminArticleDetail? = nil) {
        self.detail = detail
    }

    func fetchFullStats() async throws -> AdminFullStats {
        AdminFullStats(articles: nil, users: nil, comments: nil, mediaLibrary: nil, aiTasks: nil, aiImages: nil, smartBlocks: nil)
    }
    func fetchCounts() async throws -> AdminCounts { AdminCounts(draft: 0, scheduled: 0) }
    func fetchNews(status: AdminArticleStatus, page: Int) async throws -> AdminNewsPage { AdminNewsPage(items: [], total: 0) }
    func createArticle(_ body: AdminCreateBody) async throws -> String { "new-id" }
    func publish(id: String) async throws -> AdminNewsItem { throw TestError.unimplemented }
    func fetchDetail(id: String) async throws -> AdminArticleDetail {
        guard let detail else { throw TestError.unimplemented }
        return detail
    }
    func saveArticle(id: String, payload: AdminArticleEditPayload) async throws {
        savedPayload = payload
    }
    func generateSummary(text: String) async throws -> String { "" }
    func generateSEO(title: String, content: String, excerpt: String) async throws -> AdminSEO { AdminSEO() }
    func uploadImage(dataURI: String) async throws -> String { "" }
    func generateAll(content: String) async throws -> AdminGenerationResult { throw TestError.unimplemented }
    func editAndGenerate(content: String) async throws -> AdminGenerationResult { throw TestError.unimplemented }
    func proofread(content: String) async throws -> [AdminProofIssue] { [] }
    func autoGenerateImage(articleId: String, title: String, content: String, excerpt: String, category: String, articleType: String) async throws -> String { "" }
    func fetchUsers(role: String, query: String) async throws -> [AdminUser] { [] }
    func archive(id: String, reason: String) async throws {}
    func requestRevision(id: String, notes: String) async throws {}
    func permanentDelete(id: String, reason: String) async throws {}
}

private enum TestError: Error {
    case unimplemented
}
