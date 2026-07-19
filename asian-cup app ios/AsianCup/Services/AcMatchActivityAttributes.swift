import ActivityKit
import Foundation

nonisolated struct AcMatchActivityAttributes: ActivityAttributes {
    nonisolated struct ContentState: Codable, Hashable {
        var homeScore: Int
        var awayScore: Int
        var homePenaltyScore: Int?
        var awayPenaltyScore: Int?
        var minute: String
        var statusLabel: String
        var isLive: Bool
        var isFinished: Bool
        var lastEvent: String?
        var clockStartEpoch: Double?
    }

    let fixtureId: Int
    let homeName: String
    let awayName: String
    let homeLogo: String
    let awayLogo: String
    let competition: String
    let kickoff: Date
}
