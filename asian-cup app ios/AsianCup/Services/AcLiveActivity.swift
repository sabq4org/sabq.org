import ActivityKit
import Foundation
import Observation
import SwiftUI

private nonisolated struct AcLiveActivityBody: Encodable {
    let fixtureId: Int
    let token: String
    let bundleId: String
}
private nonisolated struct AcLiveActivityEndBody: Encodable { let token: String }

extension APIClient {
    fileprivate func registerAcLiveActivity(fixtureId: Int, token: String) async throws {
        _ = try await post(
            AcSuccessResponse.self,
            path: "/live-activity/register",
            body: AcLiveActivityBody(
                fixtureId: fixtureId,
                token: token,
                bundleId: Bundle.main.bundleIdentifier ?? "com.sabq.asiancup"
            ),
            apiRoot: URLConstants.mobileAPI
        )
    }

    fileprivate func endAcLiveActivity(token: String) async throws {
        _ = try await post(
            AcSuccessResponse.self,
            path: "/live-activity/end",
            body: AcLiveActivityEndBody(token: token),
            apiRoot: URLConstants.mobileAPI
        )
    }
}

@MainActor
@Observable
final class AcLiveActivityStore {
    static let shared = AcLiveActivityStore()
    private init() { adoptExisting() }

    private(set) var activeFixtureIds: Set<Int> = []
    private var activities: [Int: Activity<AcMatchActivityAttributes>] = [:]
    private var pushTokens: [Int: String] = [:]

    var isSupported: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }
    func isActive(_ id: Int) -> Bool { activeFixtureIds.contains(id) }

    func toggle(_ fixture: AcFixture) {
        if isActive(fixture.id) { end(fixture.id) } else { start(fixture) }
    }

    func start(_ fixture: AcFixture) {
        guard isSupported, activities[fixture.id] == nil else { return }
        let attributes = AcMatchActivityAttributes(
            fixtureId: fixture.id,
            homeName: fixture.home.name,
            awayName: fixture.away.name,
            homeLogo: fixture.home.logo,
            awayLogo: fixture.away.logo,
            competition: AsianCupConstants.tournamentName,
            kickoff: fixture.kickoff ?? Date(timeIntervalSince1970: TimeInterval(fixture.timestamp))
        )
        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: .init(state: state(fixture), staleDate: staleDate(fixture)),
                pushType: .token
            )
            activities[fixture.id] = activity
            activeFixtureIds.insert(fixture.id)
            observeToken(activity)
        } catch {
            // ActivityKit may be disabled by the device or parental policy.
        }
    }

    func update(_ fixture: AcFixture, lastEvent: String? = nil) {
        guard let activity = activities[fixture.id] else { return }
        var value = state(fixture)
        value.lastEvent = lastEvent
        Task { await activity.update(.init(state: value, staleDate: staleDate(fixture))) }
        if fixture.status.finished { end(fixture.id, final: value) }
    }

    func end(_ fixtureId: Int, final: AcMatchActivityAttributes.ContentState? = nil) {
        guard let activity = activities.removeValue(forKey: fixtureId) else { return }
        let content = final.map { ActivityContent(state: $0, staleDate: nil) }
        Task { await activity.end(content, dismissalPolicy: .after(.now + 4 * 3600)) }
        if let token = pushTokens.removeValue(forKey: fixtureId) {
            Task { try? await APIClient.shared.endAcLiveActivity(token: token) }
        }
        activeFixtureIds.remove(fixtureId)
    }

    private func adoptExisting() {
        for activity in Activity<AcMatchActivityAttributes>.activities {
            activities[activity.attributes.fixtureId] = activity
            activeFixtureIds.insert(activity.attributes.fixtureId)
            observeToken(activity)
        }
    }

    private func observeToken(_ activity: Activity<AcMatchActivityAttributes>) {
        let id = activity.attributes.fixtureId
        Task {
            for await data in activity.pushTokenUpdates {
                let token = data.map { String(format: "%02x", $0) }.joined()
                pushTokens[id] = token
                try? await APIClient.shared.registerAcLiveActivity(fixtureId: id, token: token)
            }
        }
    }

    private func state(_ fixture: AcFixture) -> AcMatchActivityAttributes.ContentState {
        .init(
            homeScore: fixture.goals.home ?? 0,
            awayScore: fixture.goals.away ?? 0,
            homePenaltyScore: nil,
            awayPenaltyScore: nil,
            minute: fixture.status.elapsed.map { "\($0)'" } ?? "",
            statusLabel: fixture.status.label,
            isLive: fixture.status.live,
            isFinished: fixture.status.finished,
            lastEvent: nil,
            clockStartEpoch: nil
        )
    }

    private func staleDate(_ fixture: AcFixture) -> Date? {
        fixture.status.live ? Date().addingTimeInterval(180) : fixture.kickoff?.addingTimeInterval(120)
    }
}

struct AcLiveActivityButton: View {
    let fixture: AcFixture
    @State private var store = AcLiveActivityStore.shared

    var body: some View {
        let active = store.isActive(fixture.id)
        Button { store.toggle(fixture) } label: {
            Label(active ? "Live Activity ✓" : "Live Activity", systemImage: active ? "iphone.radiowaves.left.and.right" : "iphone")
                .font(AsianCupFonts.app(size: 12, weight: .bold))
        }
        .buttonStyle(.bordered)
        .disabled(!store.isSupported || fixture.status.finished)
    }
}
