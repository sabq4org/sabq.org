import Foundation
import ActivityKit
import SwiftUI

@MainActor
@Observable
final class GcLiveActivityManager {
    static let shared = GcLiveActivityManager()
    private init() { adoptExisting() }

    private(set) var activeFixtureIds: Set<Int> = []
    private var activities: [Int: Activity<GcMatchActivityAttributes>] = [:]
    private var pushTokens: [Int: String] = [:]

    var isSupported: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }
    func isActive(_ fixtureId: Int) -> Bool { activeFixtureIds.contains(fixtureId) }

    func toggle(for fixture: GcFixture) {
        if isActive(fixture.id) { end(fixtureId: fixture.id) }
        else { start(for: fixture) }
    }

    func start(for fixture: GcFixture) {
        guard isSupported, activities[fixture.id] == nil else { return }
        activeFixtureIds.insert(fixture.id)
        Task { await startAsync(for: fixture) }
    }

    private func startAsync(for fixture: GcFixture) async {
        guard activities[fixture.id] == nil else { return }
        async let homeFile = GcSharedContainer.cacheLogo(from: fixture.home.logo)
        async let awayFile = GcSharedContainer.cacheLogo(from: fixture.away.logo)
        let (hFile, aFile) = await (homeFile, awayFile)

        let attrs = GcMatchActivityAttributes(
            fixtureId: fixture.id,
            homeName: fixture.home.name,
            awayName: fixture.away.name,
            homeLogo: fixture.home.logo,
            awayLogo: fixture.away.logo,
            homeLogoFile: hFile,
            awayLogoFile: aFile,
            competition: GulfCupConstants.tournamentName,
            kickoff: fixture.kickoffDate
        )
        let state = makeState(from: fixture)
        do {
            let activity = try Activity.request(
                attributes: attrs,
                content: .init(state: state, staleDate: staleDate(for: fixture)),
                pushType: .token
            )
            activities[fixture.id] = activity
            activeFixtureIds.insert(fixture.id)
            observePushToken(activity)
        } catch {
            activeFixtureIds.remove(fixture.id)
        }
    }

    func update(with fixture: GcFixture, lastEvent: String? = nil) {
        guard let activity = activities[fixture.id] else { return }
        var state = makeState(from: fixture)
        if let lastEvent { state.lastEvent = lastEvent }
        Task {
            await activity.update(.init(state: state, staleDate: staleDate(for: fixture)))
            if fixture.status.finished {
                try? await Task.sleep(nanoseconds: 200_000_000)
                end(fixtureId: fixture.id, final: state)
            }
        }
    }

    func end(fixtureId: Int, final: GcMatchActivityAttributes.ContentState? = nil) {
        guard let activity = activities[fixtureId] else {
            activeFixtureIds.remove(fixtureId)
            return
        }
        let content: ActivityContent<GcMatchActivityAttributes.ContentState>? =
            final.map { .init(state: $0, staleDate: nil) }
        Task {
            await activity.end(content, dismissalPolicy: .after(.now + 4 * 3600))
        }
        if let token = pushTokens[fixtureId] {
            Task { try? await APIClient.shared.endLiveActivity(pushToken: token) }
        }
        activities[fixtureId] = nil
        pushTokens[fixtureId] = nil
        activeFixtureIds.remove(fixtureId)
    }

    private func adoptExisting() {
        for activity in Activity<GcMatchActivityAttributes>.activities {
            let id = activity.attributes.fixtureId
            activities[id] = activity
            activeFixtureIds.insert(id)
            observePushToken(activity)
        }
    }

    private func makeState(from f: GcFixture) -> GcMatchActivityAttributes.ContentState {
        var minute = ""
        if f.status.live, let m = f.status.elapsed, m > 0 { minute = "\(m)'" }
        return .init(
            homeScore: f.goals.home ?? 0,
            awayScore: f.goals.away ?? 0,
            minute: minute,
            statusLabel: f.status.finished ? "انتهت" : f.status.label,
            isLive: f.status.live,
            isFinished: f.status.finished,
            lastEvent: nil,
            clockStartEpoch: Self.clockStartEpoch(for: f.status)
        )
    }

    static func clockStartEpoch(for s: GcStatus) -> Double? {
        guard s.live, !s.finished, let m = s.elapsed, m > 0, isClockRunning(code: s.code) else { return nil }
        return Date().timeIntervalSince1970 - Double(m * 60)
    }

    private static func isClockRunning(code: String) -> Bool {
        !["HT", "BT", "P", "PEN", "BREAK", "INT", "SUSP", "HALF_TIME"].contains(code.uppercased())
    }

    private func staleDate(for f: GcFixture) -> Date? {
        if f.status.live { return Date().addingTimeInterval(180) }
        if !f.status.finished, f.kickoffDate > Date() { return f.kickoffDate.addingTimeInterval(120) }
        return nil
    }

    private func observePushToken(_ activity: Activity<GcMatchActivityAttributes>) {
        let fixtureId = activity.attributes.fixtureId
        Task {
            for await tokenData in activity.pushTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                pushTokens[fixtureId] = token
                try? await APIClient.shared.registerLiveActivity(fixtureId: fixtureId, pushToken: token)
            }
        }
    }
}
