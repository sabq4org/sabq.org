import Foundation
import Observation
import SwiftUI

nonisolated struct AcSportsFollow: Decodable, Hashable {
    let kind: String
    let refId: String
    let refName: String
    let refLogo: String?
    let notify: Bool
}

private nonisolated struct AcFollowsResponse: Decodable { let follows: [AcSportsFollow] }
private nonisolated struct AcFollowResponse: Decodable { let follow: AcSportsFollow }
private nonisolated struct AcFollowMutation: Encodable {
    let kind: String
    let refId: String
    let refName: String
    let refLogo: String?
}
private nonisolated struct AcUnfollowMutation: Encodable { let kind: String; let refId: String }
nonisolated struct AcSuccessResponse: Decodable { let success: Bool? }

extension APIClient {
    fileprivate func fetchSportsFollows() async throws -> [AcSportsFollow] {
        try await get(
            AcFollowsResponse.self,
            path: "/sports/follows",
            ignoreCache: true,
            apiRoot: URLConstants.mobileAPI
        ).follows
    }

    fileprivate func addSportsFollow(kind: String, refId: String, refName: String, refLogo: String?) async throws -> AcSportsFollow {
        try await post(
            AcFollowResponse.self,
            path: "/sports/follows",
            body: AcFollowMutation(kind: kind, refId: refId, refName: refName, refLogo: refLogo),
            apiRoot: URLConstants.mobileAPI
        ).follow
    }

    fileprivate func removeSportsFollow(kind: String, refId: String) async throws {
        _ = try await delete(
            AcSuccessResponse.self,
            path: "/sports/follows",
            body: AcUnfollowMutation(kind: kind, refId: refId),
            apiRoot: URLConstants.mobileAPI
        )
    }
}

@MainActor
@Observable
final class AcFollowsStore {
    static let shared = AcFollowsStore()
    private init() {}

    private(set) var follows: Set<String> = []
    private(set) var loadingKeys: Set<String> = []
    var errorMessage: String?

    func isFollowing(kind: String, refId: String) -> Bool { follows.contains(key(kind, refId)) }
    func isLoading(kind: String, refId: String) -> Bool { loadingKeys.contains(key(kind, refId)) }

    func reload() async {
        guard AcAuthStore.shared.isLoggedIn else { follows = []; return }
        do {
            let items = try await APIClient.shared.fetchSportsFollows()
            follows = Set(items.map { key($0.kind, $0.refId) })
            errorMessage = nil
        } catch {
            errorMessage = LError(error)
        }
    }

    func toggle(kind: String, refId: String, refName: String, refLogo: String? = nil) async {
        let itemKey = key(kind, refId)
        guard !loadingKeys.contains(itemKey) else { return }
        loadingKeys.insert(itemKey)
        defer { loadingKeys.remove(itemKey) }
        do {
            if follows.contains(itemKey) {
                try await APIClient.shared.removeSportsFollow(kind: kind, refId: refId)
                follows.remove(itemKey)
            } else {
                _ = try await APIClient.shared.addSportsFollow(kind: kind, refId: refId, refName: refName, refLogo: refLogo)
                follows.insert(itemKey)
            }
            errorMessage = nil
        } catch {
            errorMessage = LError(error)
        }
    }

    func clear() { follows = [] }
    private func key(_ kind: String, _ refId: String) -> String { "\(kind):\(refId)" }
}

struct AcFollowButton: View {
    let kind: String
    let refId: String
    let refName: String
    var refLogo: String? = nil
    @Environment(AcAuthStore.self) private var auth
    @State private var store = AcFollowsStore.shared

    var body: some View {
        let following = store.isFollowing(kind: kind, refId: refId)
        Button {
            if auth.isLoggedIn {
                Task { await store.toggle(kind: kind, refId: refId, refName: refName, refLogo: refLogo) }
            } else {
                auth.startAppleSignIn()
            }
        } label: {
            Label(
                L(following ? "follow.following" : "follow.action"),
                systemImage: following ? "bell.fill" : "bell.badge"
            )
            .font(AsianCupFonts.app(size: 12, weight: .bold))
        }
        .buttonStyle(.borderedProminent)
        .tint(following ? AcTheme.emerald : AcTheme.goldDeep)
        .disabled(store.isLoading(kind: kind, refId: refId))
    }
}
