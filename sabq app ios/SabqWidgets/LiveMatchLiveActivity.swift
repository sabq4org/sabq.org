import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - واجهة النشاط المباشر للمباراة
//
// تُرسم داخل امتداد الويدجت (عملية منفصلة عن التطبيق) فلا تُجري أي طلبات
// شبكة ولا تصل لشيفرة التطبيق. كل ما تعرضه يأتي من ContentState الذي
// يحدّثه التطبيق عبر ActivityKit. الشعارات شبكية فلا تُعرض هنا (الويدجت
// لا يحمّل صورًا من الشبكة) — نكتفي بالأسماء والنتيجة والشوط والوقت.

private enum WidgetTheme {
    static let stadium = Color(red: 0.02, green: 0.18, blue: 0.13)
    static let emerald = Color(red: 0.20, green: 0.83, blue: 0.60)
    static let live = Color(red: 0.90, green: 0.22, blue: 0.22)
    static let dim = Color.white.opacity(0.62)
}

struct LiveMatchLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveMatchAttributes.self) { context in
            LockScreenMatchView(context: context)
                .environment(\.layoutDirection, .rightToLeft)
        } dynamicIsland: { context in
            DynamicIsland {
                // الحالة الموسّعة (ضغط مطوّل على الجزيرة)
                DynamicIslandExpandedRegion(.leading) {
                    teamColumn(context.attributes.homeName)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    teamColumn(context.attributes.awayName)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        if isUpcoming(context) {
                            Text(timerInterval: Date()...context.attributes.kickoff)
                                .font(.system(size: 20, weight: .black, design: .rounded).monospacedDigit())
                                .foregroundStyle(.white)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: 90)
                            Text("على الانطلاق")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(WidgetTheme.dim)
                        } else {
                            scoreText(context.state)
                                .font(.system(size: 22, weight: .black, design: .rounded))
                            minutePill(context.state)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let ev = context.state.lastEvent {
                        Text(ev)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(WidgetTheme.dim)
                            .lineLimit(1)
                            .environment(\.layoutDirection, .rightToLeft)
                    }
                }
            } compactLeading: {
                Text(shortName(context.attributes.homeName))
                    .font(.system(size: 13, weight: .bold))
            } compactTrailing: {
                if isUpcoming(context) {
                    Text(timerInterval: Date()...context.attributes.kickoff)
                        .font(.system(size: 13, weight: .bold).monospacedDigit())
                        .frame(maxWidth: 52)
                } else {
                    scoreText(context.state)
                        .font(.system(size: 14, weight: .black, design: .rounded))
                }
            } minimal: {
                if isUpcoming(context) {
                    Image(systemName: "clock.fill")
                } else {
                    scoreText(context.state)
                        .font(.system(size: 12, weight: .black, design: .rounded))
                }
            }
            .widgetURL(URL(string: "sabq://match/\(context.attributes.fixtureId)"))
            .keylineTint(WidgetTheme.emerald)
        }
    }

    private func teamColumn(_ name: String) -> some View {
        Text(name)
            .font(.system(size: 13, weight: .heavy))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }

    private func minutePill(_ state: LiveMatchAttributes.ContentState) -> some View {
        HStack(spacing: 4) {
            if state.isLive {
                Circle().fill(WidgetTheme.live).frame(width: 6, height: 6)
            }
            Text(state.isFinished ? state.statusLabel : (state.minute.isEmpty ? state.statusLabel : state.minute))
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(state.isLive ? WidgetTheme.live : WidgetTheme.dim)
        }
    }
}

// النتيجة دائمًا LTR: المضيف يسارًا في صيغة الرقم لتطابق ترتيب القراءة العالمي
private func scoreText(_ state: LiveMatchAttributes.ContentState) -> some View {
    Text("\(state.homeScore) - \(state.awayScore)")
        .foregroundStyle(.white)
        .environment(\.layoutDirection, .leftToRight)
}

// قبل الانطلاق: لم تبدأ، ولم تنتهِ، وموعدها في المستقبل ← نعرض عدّادًا تنازليًا
private func isUpcoming(_ ctx: ActivityViewContext<LiveMatchAttributes>) -> Bool {
    !ctx.state.isLive && !ctx.state.isFinished && ctx.attributes.kickoff > Date()
}

private func shortName(_ name: String) -> String {
    String(name.prefix(3))
}

// MARK: - شاشة القفل / مركز الإشعارات

struct LockScreenMatchView: View {
    let context: ActivityViewContext<LiveMatchAttributes>

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("كأس العالم 2026")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(WidgetTheme.emerald)
                Spacer()
                if let round = context.attributes.round {
                    Text(round)
                        .font(.system(size: 10))
                        .foregroundStyle(WidgetTheme.dim)
                        .lineLimit(1)
                }
            }

            HStack(alignment: .center, spacing: 10) {
                Text(context.attributes.homeName)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity, alignment: .trailing)

                VStack(spacing: 3) {
                    if isUpcoming(context) {
                        Text(timerInterval: Date()...context.attributes.kickoff)
                            .font(.system(size: 24, weight: .black, design: .rounded).monospacedDigit())
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.center)
                        Text("على انطلاق المباراة")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(WidgetTheme.emerald)
                    } else {
                        scoreText(context.state)
                            .font(.system(size: 26, weight: .black, design: .rounded))
                        statusPill
                    }
                }
                .frame(minWidth: 96)

                Text(context.attributes.awayName)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let ev = context.state.lastEvent {
                Text(ev)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(WidgetTheme.dim)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding(14)
        .activityBackgroundTint(WidgetTheme.stadium)
        .activitySystemActionForegroundColor(.white)
    }

    private var statusPill: some View {
        HStack(spacing: 5) {
            if context.state.isLive {
                Circle().fill(WidgetTheme.live).frame(width: 7, height: 7)
            }
            Text(label)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(context.state.isLive ? WidgetTheme.live : WidgetTheme.dim)
        }
    }

    private var label: String {
        let s = context.state
        if s.isFinished { return s.statusLabel }
        if s.isLive && !s.minute.isEmpty { return "\(s.minute) · \(s.statusLabel)" }
        return s.statusLabel
    }
}
