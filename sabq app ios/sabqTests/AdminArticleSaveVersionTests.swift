import Foundation
import Testing
@testable import sabq

/// حفظ محرر المسؤول مشروط بنسخة الخبر: يرسل النسخة التي فُتح عليها، يحدّثها
/// بعد كل حفظ ناجح، ويُبقي تعديل المحرر عند التعارض.
struct AdminArticleSaveVersionTests {
    private static let detailJSON = """
    {
      "id": "n-1",
      "title": "خبر",
      "status": "published",
      "articleType": "news",
      "content": "<p>نص</p>",
      "updatedAt": "2026-10-31T09:00:00.123Z"
    }
    """

    private func detail() throws -> AdminArticleDetail {
        try JSONDecoder().decode(AdminArticleDetail.self, from: Data(Self.detailJSON.utf8))
    }

    @Test func detailKeepsServerVersionVerbatim() throws {
        #expect(try detail().updatedAt == "2026-10-31T09:00:00.123Z")
    }

    @Test func payloadEncodesExpectedVersionOnlyWhenKnown() throws {
        var payload = AdminArticleEditPayload(
            title: "t", subtitle: "", excerpt: "", content: "<p>x</p>", status: "draft", newsType: "regular",
            isFeatured: false, isReading: false, hideFromHomepage: false, aiSummary: "", imageUrl: "",
            categoryId: nil, reporterId: nil, authorId: nil, scheduledAt: nil, seo: AdminSEO()
        )
        var json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(payload)) as? [String: Any]
        #expect(json?["expectedUpdatedAt"] == nil)
        payload.expectedUpdatedAt = "2026-10-31T09:00:00.123Z"
        json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(payload)) as? [String: Any]
        #expect(json?["expectedUpdatedAt"] as? String == "2026-10-31T09:00:00.123Z")
    }

    @Test @MainActor func saveSendsOpenedVersionAndAdvancesIt() async throws {
        let service = VersionedAdminService(detail: try detail(), nextVersions: ["2026-10-31T09:05:00.000Z", "2026-10-31T09:06:00.000Z"])
        let vm = AdminEditorViewModel(articleId: "n-1", service: service)
        await vm.load(includeCategories: false)

        #expect(await vm.save(html: "<p>أول</p>"))
        #expect(await vm.save(html: "<p>ثانٍ</p>"))
        #expect(service.sentVersions == ["2026-10-31T09:00:00.123Z", "2026-10-31T09:05:00.000Z"])
    }

    @Test @MainActor func conflictKeepsTheEditorsChanges() async throws {
        let service = VersionedAdminService(
            detail: try detail(),
            failure: ArticleWriteConflictError(code: "ARTICLE_VERSION_CONFLICT", message: "حُفظ الخبر من مكان آخر")
        )
        let vm = AdminEditorViewModel(articleId: "n-1", service: service)
        await vm.load(includeCategories: false)
        vm.title = "عنوان المحرر على الجوال"

        let saved = await vm.save(html: "<p>تعديلي</p>")

        #expect(!saved)
        #expect(vm.conflict?.code == "ARTICLE_VERSION_CONFLICT")
        #expect(vm.error == "حُفظ الخبر من مكان آخر")
        #expect(vm.title == "عنوان المحرر على الجوال")
        #expect(vm.articleVersion == "2026-10-31T09:00:00.123Z")
    }
}

final class VersionedAdminService: AdminServicing, @unchecked Sendable {
    let detail: AdminArticleDetail
    var nextVersions: [String]
    let failure: Error?
    var sentVersions: [String?] = []

    init(detail: AdminArticleDetail, nextVersions: [String] = [], failure: Error? = nil) {
        self.detail = detail
        self.nextVersions = nextVersions
        self.failure = failure
    }

    func fetchFullStats() async throws -> AdminFullStats {
        AdminFullStats(articles: nil, users: nil, comments: nil, mediaLibrary: nil, aiTasks: nil, aiImages: nil, smartBlocks: nil)
    }
    func fetchCounts() async throws -> AdminCounts { AdminCounts(draft: 0, scheduled: 0) }
    func fetchNews(status: AdminArticleStatus, page: Int) async throws -> AdminNewsPage { AdminNewsPage(items: [], total: 0) }
    func createArticle(_ body: AdminCreateBody) async throws -> String { "new-id" }
    func publish(id: String) async throws -> AdminNewsItem { throw VersionedServiceError.unimplemented }
    func fetchDetail(id: String) async throws -> AdminArticleDetail { detail }
    func saveArticle(id: String, payload: AdminArticleEditPayload) async throws -> String? {
        sentVersions.append(payload.expectedUpdatedAt)
        if let failure { throw failure }
        return nextVersions.isEmpty ? nil : nextVersions.removeFirst()
    }
    func generateSummary(text: String) async throws -> String { "" }
    func generateSEO(title: String, content: String, excerpt: String) async throws -> AdminSEO { AdminSEO() }
    func uploadImage(dataURI: String) async throws -> String { "" }
    func generateAll(content: String) async throws -> AdminGenerationResult { throw VersionedServiceError.unimplemented }
    func editAndGenerate(content: String) async throws -> AdminGenerationResult { throw VersionedServiceError.unimplemented }
    func proofread(content: String) async throws -> [AdminProofIssue] { [] }
    func autoGenerateImage(articleId: String, title: String, content: String, excerpt: String, category: String, articleType: String) async throws -> String { "" }
    func fetchUsers(role: String, query: String) async throws -> [AdminUser] { [] }
    func archive(id: String, reason: String) async throws {}
    func requestRevision(id: String, notes: String) async throws {}
    func permanentDelete(id: String, reason: String) async throws {}
}

enum VersionedServiceError: Error { case unimplemented }
