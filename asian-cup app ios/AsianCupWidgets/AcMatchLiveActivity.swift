import ActivityKit
import SwiftUI
import WidgetKit

struct AcMatchLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AcMatchActivityAttributes.self) { context in
            VStack(spacing: 12) {
                HStack { Text(context.attributes.competition).font(.caption.bold()).foregroundStyle(.yellow); Spacer(); Text(context.state.statusLabel).font(.caption) }
                HStack {
                    team(context.attributes.homeName)
                    score(context).frame(minWidth: 90)
                    team(context.attributes.awayName)
                }
                if let event = context.state.lastEvent, !event.isEmpty { Text(event).font(.caption.bold()) }
            }
            .padding(16)
            .foregroundStyle(.white)
            .activityBackgroundTint(Color(red: 0.03, green: 0.12, blue: 0.18))
            .environment(\.layoutDirection, .rightToLeft)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { team(context.attributes.homeName) }
                DynamicIslandExpandedRegion(.trailing) { team(context.attributes.awayName) }
                DynamicIslandExpandedRegion(.center) { score(context) }
            } compactLeading: {
                Text(short(context.attributes.homeName)).font(.caption.bold())
            } compactTrailing: {
                Text("\(context.state.homeScore)-\(context.state.awayScore)").font(.caption.bold()).monospacedDigit()
            } minimal: {
                Text("\(context.state.homeScore)-\(context.state.awayScore)").font(.caption2.bold()).monospacedDigit()
            }
            .keylineTint(.yellow)
        }
    }

    private func team(_ name: String) -> some View {
        VStack(spacing: 4) {
            Text(short(name)).font(.headline.bold()).frame(width: 38, height: 38).background(Circle().fill(.green.opacity(0.7)))
            Text(name).font(.caption2.bold()).lineLimit(1)
        }.frame(maxWidth: .infinity)
    }

    @ViewBuilder private func score(_ context: ActivityViewContext<AcMatchActivityAttributes>) -> some View {
        if !context.state.isLive && !context.state.isFinished && context.attributes.kickoff > Date() {
            Text(timerInterval: Date()...context.attributes.kickoff, countsDown: true).font(.title3.bold()).monospacedDigit()
        } else {
            Text("\(context.state.homeScore) - \(context.state.awayScore)").font(.title2.bold()).monospacedDigit().environment(\.layoutDirection, .leftToRight)
        }
    }

    private func short(_ name: String) -> String { String(name.replacingOccurrences(of: "ال", with: "").prefix(2)) }
}
