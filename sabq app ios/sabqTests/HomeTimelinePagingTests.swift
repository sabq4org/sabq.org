import Foundation
import Testing
@testable import sabq

@Suite @MainActor
struct HomeTimelinePagingTests {
    private let excluded: Set<String> = ["0", "1", "2", "3"]

    private func rows(_ range: Range<Int>) -> [Article] {
        range.map { Article.placeholder(slug: String($0)) }
    }

    private func seed(_ range: Range<Int>, source: NewsService.HomeFeedSource = .news,
                      nextPage: Int = 2, hasMore: Bool = true) -> NewsService.HomepageResult {
        ([], rows(range), [], [], [], .init(source: source, nextPage: nextPage, hasMore: hasMore))
    }

    @Test func initialQuotaExcludesHeroAndNextTapAddsTwentyFive() async {
        var requested: [Int] = []
        let store = ArticlesStore(homepageLoader: { _ in seed(0..<50) }, pageLoader: { cursor, size in
            requested.append(cursor.nextPage)
            #expect(cursor.source == .news)
            #expect(size == 50)
            return (rows(50..<100), true)
        }, loadsSupplementalData: false)
        await store.loadArticles()
        #expect(store.homeTimelineArticles(excluding: excluded).count == 25)
        await store.loadMore(excluding: excluded)
        #expect(store.homeTimelineArticles(excluding: excluded).count == 50)
        #expect(requested == [2])
    }

    @Test func duplicateOnlyPageIsConsumedWithinTheSameTap() async {
        var requested: [Int] = []
        let store = ArticlesStore(homepageLoader: { _ in seed(0..<50) }, pageLoader: { cursor, _ in
            requested.append(cursor.nextPage)
            return (cursor.nextPage == 2 ? rows(0..<50) : rows(50..<100), true)
        }, loadsSupplementalData: false)
        await store.loadArticles()
        await store.loadMore(excluding: excluded)
        let result = store.homeTimelineArticles(excluding: excluded)
        #expect(result.count == 50)
        #expect(Set(result.map(\.id)).count == 50)
        #expect(requested == [2, 3])
    }

    @Test func failedRequestRetriesSameCursorAndSameVisibleTarget() async {
        var requested: [Int] = []
        let store = ArticlesStore(homepageLoader: { _ in seed(0..<50) }, pageLoader: { cursor, _ in
            requested.append(cursor.nextPage)
            return requested.count == 1 ? nil : (rows(50..<100), true)
        }, loadsSupplementalData: false)
        await store.loadArticles()
        await store.loadMore(excluding: excluded)
        #expect(store.loadMoreFailed)
        #expect(store.homeTimelineArticles(excluding: excluded).count == 25)
        await store.loadMore(excluding: excluded)
        #expect(!store.loadMoreFailed)
        #expect(store.homeTimelineArticles(excluding: excluded).count == 50)
        #expect(requested == [2, 2])
    }

    @Test func initialFailedSeedStartsAtPageOneAndFillsQuota() async {
        var requested: [Int] = []
        let store = ArticlesStore(homepageLoader: { _ in seed(0..<20, nextPage: 1) }, pageLoader: { cursor, _ in
            requested.append(cursor.nextPage)
            return (rows(0..<50), true)
        }, loadsSupplementalData: false)
        await store.loadArticles()
        await store.ensureHomeTimeline(excluding: excluded)
        #expect(store.homeTimelineArticles(excluding: excluded).count == 25)
        #expect(requested == [1])
    }

    @Test func articlesFallbackKeepsItsOwnSourceAndCursor() async {
        var requested: [Int] = []
        let store = ArticlesStore(homepageLoader: { _ in seed(0..<50, source: .articles) }, pageLoader: { cursor, _ in
            #expect(cursor.source == .articles)
            requested.append(cursor.nextPage)
            return (rows(50..<100), true)
        }, loadsSupplementalData: false)
        await store.loadArticles()
        await store.loadMore(excluding: excluded)
        #expect(requested == [2])
        #expect(store.homeTimelineArticles(excluding: excluded).count == 50)
    }

    @Test func finalPartialPageStopsWithoutAnExtraTap() async {
        let store = ArticlesStore(homepageLoader: { _ in seed(0..<50) }, pageLoader: { _, _ in
            (rows(50..<53), false)
        }, loadsSupplementalData: false)
        await store.loadArticles()
        await store.loadMore(excluding: excluded)
        #expect(store.homeTimelineArticles(excluding: excluded).count == 49)
        #expect(!store.hasMoreHomeTimeline(excluding: excluded))
    }

    @Test func emptyExhaustedSeedDoesNotFetchAgain() async {
        let store = ArticlesStore(homepageLoader: { _ in seed(0..<0, hasMore: false) }, pageLoader: { _, _ in
            Issue.record("Exhausted feed unexpectedly fetched another page")
            return nil
        }, loadsSupplementalData: false)
        await store.loadArticles()
        await store.ensureHomeTimeline(excluding: excluded)
        await store.loadMore(excluding: excluded)
        #expect(!store.hasMoreHomeTimeline(excluding: excluded))
        #expect(store.homeTimelineArticles(excluding: excluded).isEmpty)
    }

    @Test func refreshInvalidatesAnOlderLoadMoreResponseAndCursor() async {
        var homeCalls = 0
        var requests: [Int] = []
        var pending: CheckedContinuation<NewsService.HomeFeedPage?, Never>?
        let store = ArticlesStore(homepageLoader: { _ in
            homeCalls += 1
            return homeCalls == 1 ? seed(0..<50) : seed(100..<150)
        }, pageLoader: { cursor, _ in
            requests.append(cursor.nextPage)
            if requests.count == 1 {
                return await withCheckedContinuation { pending = $0 }
            }
            return (rows(150..<200), false)
        }, loadsSupplementalData: false)
        await store.loadArticles()
        let older = Task { await store.loadMore(excluding: excluded) }
        for _ in 0..<1_000 {
            if pending != nil { break }
            await Task.yield()
        }
        guard let completion = pending else {
            Issue.record("Load-more request did not start")
            older.cancel()
            return
        }
        await store.loadArticles(ignoreCache: true)
        completion.resume(returning: (rows(50..<100), false))
        await older.value
        #expect(!store.isLoading)
        #expect(store.homeTimelineArticles(excluding: []).allSatisfy { Int($0.id)! >= 100 })
        await store.loadMore(excluding: ["100", "101", "102", "103"])
        #expect(requests == [2, 2])
        #expect(store.homeTimelineArticles(excluding: ["100", "101", "102", "103"]).count == 50)
    }
}
