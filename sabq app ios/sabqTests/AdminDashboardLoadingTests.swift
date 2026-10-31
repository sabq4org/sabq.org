import Foundation
import Testing
@testable import sabq

/// تحديث بعد نشر أثناء تبديل التبويب يُبطل تذكرة طلب التبويب؛ أحدث طلب مقبول
/// يجب أن يطفئ مؤشر التحميل وإلا بقيت هياكل التحميل بدل «لا توجد أخبار».
@MainActor
struct AdminDashboardLoadingTests {
    @Test func refreshThatSupersedesTabSwitchStillEndsLoading() async throws {
        let service = GatedAdminService()
        let vm = AdminDashboardViewModel(service: service)

        // تبديل التبويب: طلبه معلّق.
        let switchTask = Task { await vm.select(.scheduled) }
        try await service.waitForCalls(1)
        #expect(vm.isLoading)

        // نشر/تحديث يبدأ طلبًا أحدث للتبويب نفسه، ويكتمل أولًا بقائمة فارغة.
        let refreshTask = Task { await vm.refreshAfterEdit() }
        try await service.waitForCalls(2)
        service.release(call: 1)
        await refreshTask.value

        // ثم يكتمل طلب التبويب الأقدم ويُرفض.
        service.release(call: 0)
        await switchTask.value

        #expect(!vm.isLoading)
        #expect(vm.items.isEmpty)
        #expect(vm.selectedStatus == .scheduled)
    }
}

final class GatedAdminService: AdminServicing, @unchecked Sendable {
    private var gates: [CheckedContinuation<Void, Never>?] = []
    private var released: Set<Int> = []
    private(set) var calls = 0

    func waitForCalls(_ count: Int) async throws {
        for _ in 0..<200 where calls < count { try await Task.sleep(nanoseconds: 5_000_000) }
        #expect(calls >= count)
    }

    func release(call index: Int) {
        if index < gates.count, let gate = gates[index] {
            gates[index] = nil
            gate.resume()
        } else {
            released.insert(index)
        }
    }

    func fetchNews(status: AdminArticleStatus, page: Int) async throws -> AdminNewsPage {
        let index = calls
        calls += 1
        gates.append(nil)
        if !released.contains(index) {
            await withCheckedContinuation { gates[index] = $0 }
        }
        return AdminNewsPage(items: [], total: 0)
    }

    func fetchFullStats() async throws -> AdminFullStats {
        AdminFullStats(articles: nil, users: nil, comments: nil, mediaLibrary: nil, aiTasks: nil, aiImages: nil, smartBlocks: nil)
    }
    func fetchCounts() async throws -> AdminCounts { AdminCounts(draft: 0, scheduled: 0) }
    func createArticle(_ body: AdminCreateBody) async throws -> String { "new-id" }
    func publish(id: String) async throws -> AdminNewsItem { throw GatedServiceError.unimplemented }
    func fetchDetail(id: String) async throws -> AdminArticleDetail { throw GatedServiceError.unimplemented }
    func saveArticle(id: String, payload: AdminArticleEditPayload) async throws {}
    func generateSummary(text: String) async throws -> String { "" }
    func generateSEO(title: String, content: String, excerpt: String) async throws -> AdminSEO { AdminSEO() }
    func uploadImage(dataURI: String) async throws -> String { "" }
    func generateAll(content: String) async throws -> AdminGenerationResult { throw GatedServiceError.unimplemented }
    func editAndGenerate(content: String) async throws -> AdminGenerationResult { throw GatedServiceError.unimplemented }
    func proofread(content: String) async throws -> [AdminProofIssue] { [] }
    func autoGenerateImage(articleId: String, title: String, content: String, excerpt: String, category: String, articleType: String) async throws -> String { "" }
    func fetchUsers(role: String, query: String) async throws -> [AdminUser] { [] }
    func archive(id: String, reason: String) async throws {}
    func requestRevision(id: String, notes: String) async throws {}
    func permanentDelete(id: String, reason: String) async throws {}
}

enum GatedServiceError: Error { case unimplemented }
