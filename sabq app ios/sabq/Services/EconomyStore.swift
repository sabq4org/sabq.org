import Foundation
import SwiftUI

// MARK: - نداءات «الاقتصاد الحي» (مسارات عامة فقط تحت /api/economy)

extension APIClient {
    func fetchEconomySnapshot(ignoreCache: Bool = false) async throws -> EconomySnapshot {
        try await get(EconomySnapshot.self, path: "/economy/snapshot", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// 404 عندما لا يوجد تقرير أسبوعي بعد — يُترجم إلى nil في المخزن.
    func fetchEconomyWeeklyStory() async throws -> EconomyWeeklyStory {
        try await get(EconomyWeeklyStory.self, path: "/economy/weekly-story", apiRoot: URLConstants.publicAPI)
    }

    /// 404 عندما لا توجد نشرة شهرية بعد.
    func fetchEconomyMonthlyStory() async throws -> EconomyMonthlyStory {
        try await get(EconomyMonthlyStory.self, path: "/economy/monthly-story", apiRoot: URLConstants.publicAPI)
    }
}

// MARK: - مخزن مشترك على مستوى التطبيق
//
// اللقطة تُجلب مرة وتُعاد قراءتها من الذاكرة عند العودة (نمط مخازن البطولات).
// إيقاعات الويب: الرئيسية 5 دقائق، الصفحة 60 ثانية، التقرير الأسبوعي 5 دقائق،
// الشهري 10 دقائق. لا SSE في هذه الدفعة — التحديث عند الظهور وبالسحب.
@MainActor
@Observable
final class EconomyStore {
    static let shared = EconomyStore()
    private init() {}

    private(set) var snapshot: EconomySnapshot?
    private(set) var weekly: EconomyWeeklyStory?
    private(set) var monthly: EconomyMonthlyStory?
    private(set) var snapshotFailed = false
    private(set) var isLoadingSnapshot = false

    private var snapshotAt: Date?
    private var weeklyAt: Date?
    private var monthlyAt: Date?

    func loadSnapshotIfNeeded(maxAge: TimeInterval) async {
        if isLoadingSnapshot { return }
        if snapshot != nil, let at = snapshotAt, Date().timeIntervalSince(at) < maxAge { return }
        isLoadingSnapshot = true
        defer { isLoadingSnapshot = false }
        do {
            snapshot = try await APIClient.shared.fetchEconomySnapshot()
            snapshotAt = Date()
            snapshotFailed = false
        } catch {
            // فشل صامت: البلوك يختفي كما في الويب (`ErrorBoundary fallback={null}`).
            if snapshot == nil { snapshotFailed = true }
        }
    }

    func loadStoriesIfNeeded() async {
        async let w: Void = loadWeekly()
        async let m: Void = loadMonthly()
        _ = await (w, m)
    }

    func refreshAll() async {
        snapshotAt = nil; weeklyAt = nil; monthlyAt = nil
        await loadSnapshotIfNeeded(maxAge: 0)
        await loadStoriesIfNeeded()
    }

    private func loadWeekly() async {
        if weekly != nil, let at = weeklyAt, Date().timeIntervalSince(at) < 300 { return }
        if let story = try? await APIClient.shared.fetchEconomyWeeklyStory() {
            weekly = story
            weeklyAt = Date()
        }
    }

    private func loadMonthly() async {
        if monthly != nil, let at = monthlyAt, Date().timeIntervalSince(at) < 600 { return }
        if let story = try? await APIClient.shared.fetchEconomyMonthlyStory() {
            monthly = story
            monthlyAt = Date()
        }
    }
}

/// وجهة صفحة «الاقتصاد بالأرقام».
struct EconomyRoute: Hashable {}
