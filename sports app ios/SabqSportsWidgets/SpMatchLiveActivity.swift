import ActivityKit
import WidgetKit
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// MARK: - واجهة Live Activity للمباراة (شاشة القفل + الجزيرة الديناميكية)
//
// ثيم فاتح (أبيض/أخضر) على شاشة القفل، وداكن في الجزيرة (طبيعتها سوداء).
// تعرض: شعارات الأندية (من الحاوية المشتركة)، النتيجة أو عدّادًا تنازليًّا قبل
// الانطلاق، الشوط/الاستراحة/بدل الضائع/انتهت، وآخر هدف/بطاقة أسفل البطاقة.

struct SpMatchLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SpMatchActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(SpLA.cardBG)
                .activitySystemActionForegroundColor(SpLA.green)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    teamBadge(context.attributes, side: .home, dark: true)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    teamBadge(context.attributes, side: .away, dark: true)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        centerValue(context, dark: true)
                        liveStatusContent(context.state, kickoff: context.attributes.kickoff)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.white.opacity(0.85))
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let ev = context.state.lastEvent, !ev.isEmpty {
                        Text(ev)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.9))
                            .frame(maxWidth: .infinity)
                    }
                }
            } compactLeading: {
                Text(SpLA.shortName(context.attributes.homeName))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(SpLA.green)
            } compactTrailing: {
                compactValue(context)
            } minimal: {
                if isUpcoming(context) {
                    Image(systemName: "clock.fill").foregroundStyle(SpLA.green)
                } else {
                    Text("\(context.state.homeScore)-\(context.state.awayScore)")
                        .font(.system(size: 12, weight: .heavy, design: .rounded))
                        .foregroundStyle(SpLA.green)
                }
            }
            .widgetURL(URL(string: "sabqsports://match/\(context.attributes.fixtureId)"))
            .keylineTint(SpLA.green)
        }
    }

    // شارة الفريق في الجزيرة (شعار إن توفّر، وإلا أحرف).
    @ViewBuilder private func teamBadge(_ a: SpMatchActivityAttributes, side: SpSide, dark: Bool) -> some View {
        let name = side == .home ? a.homeName : a.awayName
        let file = side == .home ? a.homeLogoFile : a.awayLogoFile
        VStack(spacing: 4) {
            SpLogoView(fileName: file, name: name, size: 32, dark: dark)
            Text(name)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle((dark ? Color.white : SpLA.ink).opacity(0.8))
                .lineLimit(1)
        }
    }

    @ViewBuilder private func centerValue(_ context: ActivityViewContext<SpMatchActivityAttributes>, dark: Bool) -> some View {
        if isUpcoming(context) {
            Text(timerInterval: Date()...context.attributes.kickoff, countsDown: true)
                .font(.system(size: 20, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .multilineTextAlignment(.center)
                .foregroundStyle(dark ? .white : SpLA.ink)
                .frame(maxWidth: 90)
        } else {
            Text("\(context.state.homeScore) - \(context.state.awayScore)")
                .font(.system(size: 22, weight: .heavy, design: .rounded))
                .foregroundStyle(dark ? .white : SpLA.ink)
        }
    }

    @ViewBuilder private func compactValue(_ context: ActivityViewContext<SpMatchActivityAttributes>) -> some View {
        if isUpcoming(context) {
            Text(timerInterval: Date()...context.attributes.kickoff, countsDown: true)
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.white)
                .frame(maxWidth: 56)
        } else {
            Text("\(context.state.homeScore)-\(context.state.awayScore)")
                .font(.system(size: 13, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
        }
    }

    private func isUpcoming(_ context: ActivityViewContext<SpMatchActivityAttributes>) -> Bool {
        !context.state.isLive && !context.state.isFinished && context.attributes.kickoff > Date()
    }
}

// نصّ الحالة: انتهت / الشوط+الدقيقة (بدل الضائع) / استراحة / لم تبدأ.
func statusText(_ s: SpMatchActivityAttributes.ContentState, kickoff: Date) -> String {
    if s.isFinished { return "انتهت" }
    if s.isLive {
        if s.minute.isEmpty { return s.statusLabel.isEmpty ? "مباشر" : s.statusLabel }
        // صياغة تطبيق سبق: «45' · الشوط الأول».
        return s.statusLabel.isEmpty ? s.minute : "\(s.minute) · \(s.statusLabel)"
    }
    if kickoff > Date() { return s.statusLabel.isEmpty ? "لم تبدأ" : s.statusLabel }
    return s.statusLabel.isEmpty ? "قريبًا" : s.statusLabel
}

// عرض الحالة الحيّة: حين تتوفّر مرساة الساعة والمباراة تجري، نعرض ساعةً **تتحرّك
// ذاتيًّا على الجهاز** عبر `Text(timerInterval:)` بلا أي دفعة — و`showsHours:false`
// يُبقي الصياغة «63:45» (لا «1:03:45») حتى بعد تجاوز 59 دقيقة. عند التوقّف/قبل البدء
// نسقط على النصّ المدفوع `statusText` (الدقيقة المُجمّدة). يرث الخطّ واللون من الحاوية.
@ViewBuilder
func liveStatusContent(_ s: SpMatchActivityAttributes.ContentState, kickoff: Date) -> some View {
    if s.isLive, !s.isFinished, let epoch = s.clockStartEpoch {
        HStack(spacing: 4) {
            Text(timerInterval: Date(timeIntervalSince1970: epoch)...Date.distantFuture,
                 countsDown: false, showsHours: false)
                .monospacedDigit()
                .fixedSize()
            if !s.statusLabel.isEmpty {
                Text("· \(s.statusLabel)").lineLimit(1)
            }
        }
    } else {
        Text(statusText(s, kickoff: kickoff)).lineLimit(1)
    }
}

enum SpSide { case home, away }

// شاشة القفل / البانر — ثيم فاتح.
private struct LockScreenView: View {
    let context: ActivityViewContext<SpMatchActivityAttributes>

    private var upcoming: Bool {
        !context.state.isLive && !context.state.isFinished && context.attributes.kickoff > Date()
    }

    var body: some View {
        VStack(spacing: 9) {
            HStack {
                if !context.attributes.competition.isEmpty {
                    Text(context.attributes.competition)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(SpLA.green)
                        .lineLimit(1)
                }
                Spacer(minLength: 6)
                statusBadge
            }
            HStack(alignment: .center, spacing: 8) {
                teamColumn(.home)
                centerBlock
                teamColumn(.away)
            }
            if let ev = context.state.lastEvent, !ev.isEmpty {
                Text(ev)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(SpLA.ink.opacity(0.85))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .lineLimit(1)
            }
        }
        .padding(14)
    }

    @ViewBuilder private var centerBlock: some View {
        if upcoming {
            VStack(spacing: 2) {
                Text(timerInterval: Date()...context.attributes.kickoff, countsDown: true)
                    .font(.system(size: 26, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .multilineTextAlignment(.center)
                    .foregroundStyle(SpLA.green)
                    .frame(maxWidth: 120)
                Text("تبدأ بعد")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(SpLA.ink.opacity(0.6))
            }
        } else {
            HStack(spacing: 8) {
                Text("\(context.state.homeScore)")
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                    .foregroundStyle(SpLA.ink)
                Text("-").font(.system(size: 20, weight: .heavy)).foregroundStyle(SpLA.ink.opacity(0.4))
                Text("\(context.state.awayScore)")
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                    .foregroundStyle(SpLA.ink)
            }
        }
    }

    @ViewBuilder private var statusBadge: some View {
        HStack(spacing: 5) {
            if context.state.isLive {
                Circle().fill(Color.red).frame(width: 7, height: 7)
            }
            liveStatusContent(context.state, kickoff: context.attributes.kickoff)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(context.state.isLive ? SpLA.green : SpLA.ink.opacity(0.7))
                .lineLimit(1)
        }
        .padding(.horizontal, 9).padding(.vertical, 4)
        .background(Capsule().fill(SpLA.green.opacity(0.12)))
    }

    @ViewBuilder private func teamColumn(_ side: SpSide) -> some View {
        let name = side == .home ? context.attributes.homeName : context.attributes.awayName
        let file = side == .home ? context.attributes.homeLogoFile : context.attributes.awayLogoFile
        VStack(spacing: 5) {
            SpLogoView(fileName: file, name: name, size: 42, dark: false)
            Text(name)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(SpLA.ink.opacity(0.85))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }
}

// عرض شعار الفريق: صورة من الحاوية المشتركة إن توفّرت، وإلا أحرف في دائرة.
private struct SpLogoView: View {
    let fileName: String?
    let name: String
    let size: CGFloat
    let dark: Bool

    var body: some View {
        #if canImport(UIKit)
        if let ui = SpSharedContainer.image(named: fileName) {
            Image(uiImage: ui)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .background(Circle().fill(dark ? Color.white.opacity(0.0) : Color.white))
                .clipShape(Circle())
        } else {
            initials
        }
        #else
        initials
        #endif
    }

    private var initials: some View {
        Text(SpLA.shortName(name))
            .font(.system(size: size * 0.36, weight: .heavy))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Circle().fill(SpLA.green.opacity(dark ? 0.85 : 1)))
    }
}

// ألوان وأدوات الإضافة (مستقلّة عن هدف التطبيق).
enum SpLA {
    static let green = Color(red: 0.09, green: 0.52, blue: 0.36)
    static let ink = Color(red: 0.07, green: 0.13, blue: 0.10)
    static let cardBG = Color(red: 0.97, green: 0.98, blue: 0.97)

    /// أوّل حرفين بارزين من اسم الفريق (يتخطّى أداة التعريف «ال»).
    static func shortName(_ name: String) -> String {
        var t = name.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("ال"), t.count > 3 { t = String(t.dropFirst(2)) }
        let words = t.split(separator: " ")
        if let first = words.first { return String(first.prefix(2)) }
        return String(t.prefix(2))
    }
}
