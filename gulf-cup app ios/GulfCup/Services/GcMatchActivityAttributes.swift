import Foundation
import ActivityKit

// سمات Live Activity (هدف التطبيق) — لأن SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor.
// أسماء ContentState تطابق LiveActivityContentState في الخادم حرفيًّa.
struct GcMatchActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var homeScore: Int
        var awayScore: Int
        var minute: String
        var statusLabel: String
        var isLive: Bool
        var isFinished: Bool
        var lastEvent: String?
        var clockStartEpoch: Double?

        public init(homeScore: Int = 0, awayScore: Int = 0, minute: String = "",
                    statusLabel: String = "", isLive: Bool = false, isFinished: Bool = false,
                    lastEvent: String? = nil, clockStartEpoch: Double? = nil) {
            self.homeScore = homeScore
            self.awayScore = awayScore
            self.minute = minute
            self.statusLabel = statusLabel
            self.isLive = isLive
            self.isFinished = isFinished
            self.lastEvent = lastEvent
            self.clockStartEpoch = clockStartEpoch
        }
    }

    var fixtureId: Int
    var homeName: String
    var awayName: String
    var homeLogo: String
    var awayLogo: String
    var homeLogoFile: String?
    var awayLogoFile: String?
    var competition: String
    var kickoff: Date
}
