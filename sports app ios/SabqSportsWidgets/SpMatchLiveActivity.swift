import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - واجهة Live Activity للمباراة (شاشة القفل + الجزيرة الديناميكية)
//
// تعرض النتيجة الحيّة والدقيقة وآخر حدث. تتبع هوية سبق الرياضي (أخضر عميق).
// قيود ActivityKit: لا تحميل صور شبكي — نستخدم أحرف الفريقين في شارات ملوّنة.

struct SpMatchLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SpMatchActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(SpLA.bg)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    teamBadge(context.attributes.homeName)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    teamBadge(context.attributes.awayName)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text("\(context.state.homeScore) - \(context.state.awayScore)")
                            .font(.system(size: 22, weight: .heavy, design: .rounded))
                            .foregroundStyle(.white)
                        statusChip(context.state)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let ev = context.state.lastEvent, !ev.isEmpty {
                        Text(ev)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.85))
                            .frame(maxWidth: .infinity)
                    }
                }
            } compactLeading: {
                Text(shortName(context.attributes.homeName))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(SpLA.green)
            } compactTrailing: {
                Text("\(context.state.homeScore)-\(context.state.awayScore)")
                    .font(.system(size: 13, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
            } minimal: {
                Text("\(context.state.homeScore)-\(context.state.awayScore)")
                    .font(.system(size: 12, weight: .heavy, design: .rounded))
                    .foregroundStyle(SpLA.green)
            }
            .widgetURL(URL(string: "sabqsports://match/\(context.attributes.fixtureId)"))
            .keylineTint(SpLA.green)
        }
    }

    // شارة دائرية بأول حرفين من اسم الفريق.
    @ViewBuilder private func teamBadge(_ name: String) -> some View {
        VStack(spacing: 4) {
            Text(shortName(name))
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(.white)
                .frame(width: 34, height: 34)
                .background(Circle().fill(SpLA.green.opacity(0.85)))
            Text(name)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.white.opacity(0.8))
                .lineLimit(1)
        }
    }

    @ViewBuilder private func statusChip(_ s: SpMatchActivityAttributes.ContentState) -> some View {
        HStack(spacing: 4) {
            if s.isLive {
                Circle().fill(Color.red).frame(width: 6, height: 6)
            }
            Text(s.isLive && !s.minute.isEmpty ? s.minute : s.statusLabel)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white.opacity(0.9))
        }
    }
}

// شاشة القفل / البانر — تخطيط كامل للنتيجة والحالة.
private struct LockScreenView: View {
    let context: ActivityViewContext<SpMatchActivityAttributes>

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text(context.attributes.competition)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(SpLA.green)
                Spacer()
                statusBadge
            }
            HStack(alignment: .center, spacing: 10) {
                teamColumn(context.attributes.homeName)
                Text("\(context.state.homeScore)")
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                Text("-").font(.system(size: 22, weight: .heavy)).foregroundStyle(.white.opacity(0.5))
                Text("\(context.state.awayScore)")
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                teamColumn(context.attributes.awayName)
            }
            if let ev = context.state.lastEvent, !ev.isEmpty {
                Text(ev)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding(14)
    }

    @ViewBuilder private var statusBadge: some View {
        HStack(spacing: 5) {
            if context.state.isLive {
                Circle().fill(Color.red).frame(width: 7, height: 7)
            }
            Text(context.state.isLive && !context.state.minute.isEmpty
                 ? context.state.minute : context.state.statusLabel)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 9).padding(.vertical, 4)
        .background(Capsule().fill(.white.opacity(0.12)))
    }

    @ViewBuilder private func teamColumn(_ name: String) -> some View {
        VStack(spacing: 5) {
            Text(shortName(name))
                .font(.system(size: 16, weight: .heavy))
                .foregroundStyle(.white)
                .frame(width: 42, height: 42)
                .background(Circle().fill(SpLA.green.opacity(0.85)))
            Text(name)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }
}

// أداة: أول حرفين بارزين من اسم الفريق (عربي/لاتيني).
private func shortName(_ name: String) -> String {
    let trimmed = name.trimmingCharacters(in: .whitespaces)
    let words = trimmed.split(separator: " ")
    if let first = words.first {
        return String(first.prefix(2))
    }
    return String(trimmed.prefix(2))
}

// ألوان الإضافة (مستقلّة عن هدف التطبيق).
private enum SpLA {
    static let green = Color(red: 0.18, green: 0.80, blue: 0.55)
    static let bg = Color(red: 0.04, green: 0.12, blue: 0.09)
}
