import Foundation
import Testing
@testable import sabq

@MainActor
struct CommentSafetyStoreTests {
    private let blocked = APIBlockedUser(id: "blocked-reader", name: "قارئ", profileImageUrl: nil)

    @Test func failedInitialLoadRetriesAndSuccessfulLoadIsCached() async {
        var attempts = 0
        let store = CommentSafetyStore {
            attempts += 1
            if attempts == 1 { throw URLError(.notConnectedToInternet) }
            return [blocked]
        }

        await store.syncIfNeeded(userId: "reader")
        #expect(store.blockedIds.isEmpty)
        await store.syncIfNeeded(userId: "reader")
        #expect(attempts == 2)
        #expect(store.blockedIds == [blocked.id])
        await store.syncIfNeeded(userId: "reader")
        #expect(attempts == 2)
    }

    @Test func logoutDiscardsAnInFlightBlockList() async {
        let requests = BlockListRequests()
        let store = CommentSafetyStore { try await requests.fetch() }
        let loading = Task { await store.syncIfNeeded(userId: "reader") }
        await requests.waitForCount(1)

        store.clear()
        requests.succeed(0, with: [blocked])
        await loading.value

        #expect(store.blockedUsers.isEmpty)
        #expect(store.blockedIds.isEmpty)
    }

    @Test func switchingAccountsDiscardsThePreviousAccountsResponse() async {
        let requests = BlockListRequests()
        let store = CommentSafetyStore { try await requests.fetch() }
        let first = Task { await store.syncIfNeeded(userId: "first-reader") }
        await requests.waitForCount(1)
        let second = Task { await store.syncIfNeeded(userId: "second-reader") }
        await requests.waitForCount(2)

        requests.succeed(1, with: [])
        await second.value
        requests.succeed(0, with: [blocked])
        await first.value

        #expect(store.blockedUsers.isEmpty)
        await store.syncIfNeeded(userId: "second-reader")
        #expect(requests.count == 2)
    }

    @Test func failedRefreshKeepsKnownBlocksAndAllowsRetry() async {
        var attempts = 0
        let store = CommentSafetyStore {
            attempts += 1
            if attempts == 2 { throw URLError(.timedOut) }
            return attempts == 1 ? [blocked] : []
        }
        await store.syncIfNeeded(userId: "reader")
        await store.reloadBlocked()
        #expect(store.blockedIds == [blocked.id])

        await store.syncIfNeeded(userId: "reader")
        #expect(attempts == 3)
        #expect(store.blockedUsers.isEmpty)
    }

    @Test func switchingAccountsClearsThePreviousBlockListBeforeLoading() async {
        let requests = BlockListRequests()
        let store = CommentSafetyStore { try await requests.fetch() }
        let first = Task { await store.syncIfNeeded(userId: "first-reader") }
        await requests.waitForCount(1)
        requests.succeed(0, with: [blocked])
        await first.value
        #expect(store.blockedIds == [blocked.id])

        let second = Task { await store.syncIfNeeded(userId: "second-reader") }
        await requests.waitForCount(2)
        #expect(store.blockedUsers.isEmpty)
        requests.succeed(1, with: [])
        await second.value
    }
}

@MainActor
private final class BlockListRequests {
    private var requests: [CheckedContinuation<[APIBlockedUser], Error>] = []
    private var waiters: [(Int, CheckedContinuation<Void, Never>)] = []
    var count: Int { requests.count }

    func fetch() async throws -> [APIBlockedUser] {
        try await withCheckedThrowingContinuation { continuation in
            requests.append(continuation)
            let ready = waiters.filter { $0.0 <= requests.count }
            waiters.removeAll { $0.0 <= requests.count }
            ready.forEach { $0.1.resume() }
        }
    }

    func waitForCount(_ count: Int) async {
        guard requests.count < count else { return }
        await withCheckedContinuation { waiters.append((count, $0)) }
    }

    func succeed(_ index: Int, with users: [APIBlockedUser]) {
        requests[index].resume(returning: users)
    }
}
