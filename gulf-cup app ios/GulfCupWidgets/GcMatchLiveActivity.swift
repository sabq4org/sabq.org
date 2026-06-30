import ActivityKit
import WidgetKit
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct GcMatchLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GcMatchActivityAttributes.self) { context in
            GcLockScreenView(context: context)
                .activityBackgroundTint(GcLA.background)
                .activitySystemActionForegroundColor(.white)
                .environment(\.layoutDirection, .rightToLeft)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    GcTeamBadge(context.attributes, side: .home)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    GcTeamBadge(context.attributes, side: .away)
                }
                DynamicIslandExpandedRegion(.center) {
                    GcCenterScore(context, compact: false)
                }
            } compactLeading: {
                Text(GcLA.shortName(context.attributes.homeName)).font(.system(size: 13, weight: .bold))
            } compactTrailing: {
                Text("\(context.state.homeScore)-\(context.state.awayScore)")
                    .font(.system(size: 13, weight: .heavy, design: .rounded))
            } minimal: {
                Text("\(context.state.homeScore)-\(context.state.awayScore)")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(GcLA.gold)
            }
            .keylineTint(GcLA.gold)
        }
    }
}

private enum GcSide { case home, away }

private struct GcTeamBadge: View {
    let attrs: GcMatchActivityAttributes
    let side: GcSide
    init(_ attrs: GcMatchActivityAttributes, side: GcSide) { self.attrs = attrs; self.side = side }
    var body: some View {
        let name = side == .home ? attrs.homeName : attrs.awayName
        let file = side == .home ? attrs.homeLogoFile : attrs.awayLogoFile
        VStack(spacing: 4) {
            GcLogoView(fileName: file, name: name, size: 32)
            Text(name).font(.system(size: 10, weight: .semibold)).lineLimit(1)
        }
    }
}

private struct GcCenterScore: View {
    let context: ActivityViewContext<GcMatchActivityAttributes>
    let compact: Bool
    var body: some View {
        if !context.state.isLive && !context.state.isFinished && context.attributes.kickoff > Date() {
            Text(timerInterval: Date()...context.attributes.kickoff, countsDown: true)
                .font(.system(size: compact ? 13 : 22, weight: .heavy, design: .rounded))
                .monospacedDigit()
        } else {
            Text("\(context.state.awayScore) - \(context.state.homeScore)")
                .font(.system(size: compact ? 13 : 22, weight: .heavy, design: .rounded))
                .environment(\.layoutDirection, .leftToRight)
        }
    }
}

private struct GcLockScreenView: View {
    let context: ActivityViewContext<GcMatchActivityAttributes>
    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text(context.attributes.competition).font(.system(size: 13, weight: .heavy)).foregroundStyle(GcLA.gold)
                Spacer()
                Text(context.state.statusLabel).font(.system(size: 11)).foregroundStyle(GcLA.dim)
            }
            HStack(alignment: .top) {
                teamSide(.home)
                GcCenterScore(context: context, compact: false).frame(minWidth: 90)
                teamSide(.away)
            }
            if let ev = context.state.lastEvent, !ev.isEmpty {
                Text(ev).font(.system(size: 12, weight: .semibold)).foregroundStyle(GcLA.dim)
            }
        }
        .padding(16)
    }

    private func teamSide(_ side: GcSide) -> some View {
        let name = side == .home ? context.attributes.homeName : context.attributes.awayName
        let file = side == .home ? context.attributes.homeLogoFile : context.attributes.awayLogoFile
        return VStack(spacing: 6) {
            GcLogoView(fileName: file, name: name, size: 44)
            Text(name).font(.system(size: 12, weight: .bold)).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct GcLogoView: View {
    let fileName: String?
    let name: String
    let size: CGFloat
    var body: some View {
        #if canImport(UIKit)
        if let ui = GcSharedContainer.image(named: fileName) {
            Image(uiImage: ui).resizable().scaledToFit().frame(width: size, height: size)
        } else {
            initials
        }
        #else
        initials
        #endif
    }
    private var initials: some View {
        Text(GcLA.shortName(name))
            .font(.system(size: size * 0.36, weight: .heavy))
            .frame(width: size, height: size)
            .background(Circle().fill(GcLA.emerald))
    }
}

enum GcLA {
    static let gold = Color(red: 0.85, green: 0.68, blue: 0.22)
    static let emerald = Color(red: 0.05, green: 0.45, blue: 0.32)
    static let dim = Color.white.opacity(0.66)
    static let background = Color(red: 0.02, green: 0.08, blue: 0.06)

    static func shortName(_ name: String) -> String {
        var t = name.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("ال"), t.count > 3 { t = String(t.dropFirst(2)) }
        return String(t.prefix(2))
    }
}
