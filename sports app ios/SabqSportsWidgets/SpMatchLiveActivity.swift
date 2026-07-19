import ActivityKit
import WidgetKit
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// MARK: - واجهة Live Activity للمباراة (شاشة القفل + الجزيرة الديناميكية)
//
// ثيم داكن على شاشة القفل والجزيرة لضمان وضوح القراءة فوق الخلفيات المختلفة.
// تعرض: شعارات الأندية (من الحاوية المشتركة)، النتيجة أو عدّادًا تنازليًّا قبل
// الانطلاق، الشوط/الاستراحة/بدل الضائع/انتهت، وآخر هدف/بطاقة أسفل البطاقة.

struct SpMatchLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SpMatchActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(SpLA.background)
                .activitySystemActionForegroundColor(.white)
                .environment(\.layoutDirection, .rightToLeft)
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
                        if let pens = penaltyScoreText(context.state) {
                            Text(pens)
                                .font(.system(size: 10.5, weight: .heavy))
                                .foregroundStyle(SpLA.liveDot)
                                .lineLimit(1)
                        }
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
                if isUpcoming(context) {
                    Text(SpLA.shortName(context.attributes.homeName))
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                } else {
                    compactSide(name: context.attributes.homeName, score: context.state.homeScore)
                }
            } compactTrailing: {
                if isUpcoming(context) {
                    compactValue(context)
                } else {
                    compactSide(name: context.attributes.awayName, score: context.state.awayScore)
                }
            } minimal: {
                if isUpcoming(context) {
                    Image(systemName: "clock.fill").foregroundStyle(SpLA.accent)
                } else {
                    scoreText(context.state)
                        .font(.system(size: 12, weight: .heavy, design: .rounded))
                        .foregroundStyle(SpLA.accent)
                }
            }
            .widgetURL(URL(string: "sabqsports://match/\(context.attributes.fixtureId)"))
            .keylineTint(SpLA.accent)
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
                .foregroundStyle(.white)
                .lineLimit(1)
        }
    }

    @ViewBuilder private func centerValue(_ context: ActivityViewContext<SpMatchActivityAttributes>, dark: Bool) -> some View {
        if isUpcoming(context) {
            Text(timerInterval: Date()...context.attributes.kickoff, countsDown: true)
                .font(.system(size: 20, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .multilineTextAlignment(.center)
                .foregroundStyle(dark ? SpLA.ink : SpLA.ink)
                .frame(maxWidth: 90)
        } else {
            scoreText(context.state)
                .font(.system(size: 22, weight: .heavy, design: .rounded))
                .foregroundStyle(dark ? SpLA.ink : SpLA.ink)
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
            Text(verbatim: "\(context.state.homeScore)-\(context.state.awayScore)")
                .font(.system(size: 13, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
        }
    }

    private func compactSide(name: String, score: Int) -> some View {
        HStack(spacing: 3) {
            Text(SpLA.shortName(name))
                .font(.system(size: 11, weight: .bold))
            Text(verbatim: "\(score)")
                .font(.system(size: 15, weight: .black, design: .rounded))
                .monospacedDigit()
        }
        .foregroundStyle(.white)
    }

    private func isUpcoming(_ context: ActivityViewContext<SpMatchActivityAttributes>) -> Bool {
        !context.state.isLive && !context.state.isFinished && context.attributes.kickoff > Date()
    }
}

// نصّ الحالة: انتهت / الشوط+الدقيقة (بدل الضائع) / استراحة / لم تبدأ.
func statusText(_ s: SpMatchActivityAttributes.ContentState, kickoff: Date) -> String {
    if s.isFinished { return SpWidgetL("انتهت") }
    if s.isLive {
        if s.minute.isEmpty { return s.statusLabel.isEmpty ? SpWidgetL("مباشر") : s.statusLabel }
        // صياغة تطبيق سبق: «45' · الشوط الأول».
        return s.statusLabel.isEmpty ? s.minute : "\(s.minute) · \(s.statusLabel)"
    }
    if kickoff > Date() { return s.statusLabel.isEmpty ? SpWidgetL("لم تبدأ") : s.statusLabel }
    return s.statusLabel.isEmpty ? SpWidgetL("قريبًا") : s.statusLabel
}

// عرض الحالة الحيّة على الجزيرة الديناميكية — الدقيقة من المرساة `clockStartEpoch`
// **لحظة كل رسم** (نفس دالة شاشة القفل حرفيًّا)، والنصّ المدفوع للاستراحة/الترجيح/
// بدل الضائع («45+2'»). لا TimelineView هنا: واجهة Live Activity تُرسَم فقط عند
// وصول تحديث محتوى ولا تُنفَّذ دوريًّا (ثبت ميدانيًّا 2026-07-09 — تجمّد العدّاد)،
// فدفعات الدقيقة (~كل 60ث) هي ما يعيد الرسم، والمرساة تضبط القيمة لحظته.
@ViewBuilder
func liveStatusContent(_ s: SpMatchActivityAttributes.ContentState, kickoff: Date) -> some View {
    if s.isLive, !s.isFinished,
       let epoch = s.clockStartEpoch, epoch > 0,
       !s.minute.contains("+") {
        let minute = SpLA.tickingMinute(epoch: epoch, at: Date(), fallback: s.minute)
        let label = s.statusLabel.isEmpty ? minute : "\(minute) · \(s.statusLabel)"
        Text(label)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .center)
    } else {
        Text(statusText(s, kickoff: kickoff))
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .center)
    }
}

// البطاقة RTL: المضيف يمينًا والضيف يسارًا. نرسم النتيجة LTR بترتيب
// "الضيف - المضيف" حتى تقع الأرقام تحت أماكن الفرق كما في ويدجت سبق.
private func scoreText(_ state: SpMatchActivityAttributes.ContentState) -> some View {
    Text(verbatim: "\(state.awayScore) - \(state.homeScore)")
        .foregroundStyle(.white)
        .environment(\.layoutDirection, .leftToRight)
}

private func penaltyScoreText(_ state: SpMatchActivityAttributes.ContentState) -> String? {
    guard let home = state.homePenaltyScore, let away = state.awayPenaltyScore else { return nil }
    return "ترجيح \(away)-\(home)"
}

enum SpSide { case home, away }

// شاشة القفل / مركز الإشعارات — نفس توزيع ويدجت سبق، بثيم رياضي داكن.
private struct LockScreenView: View {
    let context: ActivityViewContext<SpMatchActivityAttributes>

    private var upcoming: Bool {
        !context.state.isLive && !context.state.isFinished && context.attributes.kickoff > Date()
    }

    var body: some View {
        VStack(spacing: 14) {
            headerRow

            HStack(alignment: .top, spacing: 10) {
                teamSide(.home, alignment: .trailing)
                centerPanel
                    .frame(minWidth: 104)
                    .padding(.top, 8)
                teamSide(.away, alignment: .leading)
            }

            eventRow
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
    }

    private var headerRow: some View {
        HStack {
            competitionTitle
            Spacer()
            roundText
        }
    }

    private var competitionTitle: some View {
        HStack(spacing: 6) {
            Image(systemName: "trophy.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(SpLA.accent)
            Text(context.attributes.competition.isEmpty ? SpWidgetL("مباراة مباشرة") : context.attributes.competition)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(SpLA.accent)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
    }

    @ViewBuilder private var roundText: some View {
        if !context.attributes.competition.isEmpty {
            Text(context.state.isLive ? SpWidgetL("مباشر الآن") : context.state.statusLabel)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(SpLA.dim)
                .lineLimit(1)
        }
    }

    @ViewBuilder private var centerPanel: some View {
        if upcoming {
            VStack(spacing: 4) {
                Text(timerInterval: Date()...context.attributes.kickoff, countsDown: true)
                    .font(.system(size: 34, weight: .black, design: .rounded))
                    .monospacedDigit()
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)
                Text(SpWidgetL("على انطلاق المباراة"))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(SpLA.accent)
            }
        } else {
            VStack(spacing: 4) {
                scoreText(context.state)
                    .font(.system(size: 38, weight: .black, design: .rounded))
                if let pens = penaltyScoreText(context.state) {
                    Text(pens)
                        .font(.system(size: 14, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(SpLA.liveDot)
                        .lineLimit(1)
                        .environment(\.layoutDirection, .leftToRight)
                }
                statusBadge
            }
        }
    }

    // سطران: رقم الدقيقة (مع نقطة البث) فوق، ورقم الشوط/استراحة أسفله. كلاهما
    // موسّط أفقيًّا تحت النتيجة (frame maxWidth: .infinity + محاذاة وسط) كي لا
    // ينزلق النصّ لأحد الجانبين حين تتغيّر قيمة الدقيقة.
    @ViewBuilder private var statusBadge: some View {
        VStack(spacing: 3) {
            HStack(spacing: 5) {
                if context.state.isLive {
                    Circle().fill(SpLA.liveDot).frame(width: 7, height: 7)
                }
                liveClockOrText
                    .font(.system(size: 13, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(context.state.isLive ? SpLA.liveDot : SpLA.dim)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .center)
            if let sub = secondaryStatusLine {
                Text(sub)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(SpLA.dim)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
    }

/// السطر الأوّل من شارة الحالة: الدقيقة من المرساة `clockStartEpoch` لحظة الرسم
/// حين تجري الساعة، وإلا النصّ المدفوع (استراحة/ترجيح/بدل ضائع). تُعرض دقائق
/// (`72'`) لا صيغة ساعات — بخلاف `Text(timerInterval:)`. (لا TimelineView —
/// لا يتكتك داخل Live Activity؛ إعادة الرسم تأتي من دفعات الدقيقة.)
@ViewBuilder private var liveClockOrText: some View {
    let s = context.state
    if s.isLive, !s.isFinished,
       let epoch = s.clockStartEpoch, epoch > 0,
       !s.minute.contains("+") {
        Text(SpLA.tickingMinute(epoch: epoch, at: Date(), fallback: s.minute))
    } else {
        Text(primaryStatusLine)
    }
}

/// السطر الأول: العدّاد إن وُجد، وإلا نصّ الحالة («مباشر»/«انتهت»/«قريبًا»).
private var primaryStatusLine: String {
    let s = context.state
    if s.isFinished { return SpWidgetL("انتهت") }
    if s.isLive {
        if !s.minute.isEmpty { return s.minute }
        return s.statusLabel.isEmpty ? SpWidgetL("مباشر") : s.statusLabel
    }
    return s.statusLabel.isEmpty ? SpWidgetL("قريبًا") : s.statusLabel
}

    /// السطر الثاني: رقم الشوط/استراحة — يظهر فقط حين يكون السطر الأول عدّادًا
    /// (كي لا يتكرّر نصّ الحالة في السطرين).
    private var secondaryStatusLine: String? {
        let s = context.state
        guard s.isLive, !s.minute.isEmpty, !s.statusLabel.isEmpty else { return nil }
        return s.statusLabel
    }

    @ViewBuilder private func teamSide(_ side: SpSide, alignment: HorizontalAlignment) -> some View {
        let name = side == .home ? context.attributes.homeName : context.attributes.awayName
        let file = side == .home ? context.attributes.homeLogoFile : context.attributes.awayLogoFile
        VStack(spacing: 8) {
            SpLogoView(fileName: file, name: name, size: 52, dark: true)
            Text(name)
                .font(.system(size: 16, weight: .heavy))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private var eventRow: some View {
        if let ev = context.state.lastEvent, !ev.isEmpty {
            Text(ev)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(SpLA.dim)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .center)
        }
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
                .padding(size * 0.12)
                .background(Circle().fill(dark ? SpLA.logoSurface : Color.white))
                .overlay(Circle().stroke(dark ? SpLA.border : Color.clear, lineWidth: 1))
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
            .background(Circle().fill(SpLA.accent.opacity(dark ? 0.9 : 1)))
            .overlay(Circle().stroke(dark ? SpLA.border : Color.clear, lineWidth: 1))
    }
}

// ألوان وأدوات الإضافة (مستقلّة عن هدف التطبيق).
enum SpLA {
    // داكن رياضي مختلف عن ويدجت سبق الرئيسي: أخضر/فحمي أعمق مع لمعة نعناع.
    static let accent = Color(red: 0.22, green: 0.84, blue: 0.64)
    static let ink = Color.white
    static let subInk = Color.white.opacity(0.72)
    static let dim = Color.white.opacity(0.66)
    static let background = Color(red: 0.015, green: 0.045, blue: 0.037)
    static let surface = Color(red: 0.045, green: 0.10, blue: 0.085)
    static let logoSurface = Color(red: 0.93, green: 0.97, blue: 0.95)
    static let border = Color.white.opacity(0.14)
    static let liveDot = Color(red: 1.0, green: 0.43, blue: 0.34)
    static let green = accent

    /// دقيقة العرض الموحّدة (شاشة القفل + الجزيرة): m = floor((now−epoch)/60)+1
    /// تُحسب **لحظة كل رسم** — المرساة `clockStartEpoch` من matchClock على الخادم،
    /// نفس مصدر عدّاد التطبيق (SpMatchClock) فيتطابق الرقمان عند كل تحديث.
    /// سقف الأمان مطلق (130 دقيقة) لا نسبيّ للدقيقة المدفوعة — السقف النسبي
    /// القديم (+2) كان يجمّد العدّاد كلما تقادم نصّ الدفعة.
    static func tickingMinute(epoch: Double, at date: Date, fallback: String) -> String {
        let elapsed = date.timeIntervalSince1970 - epoch
        guard elapsed >= 0 else { return fallback.isEmpty ? "1'" : fallback }
        let m = max(1, Int(elapsed / 60.0) + 1)
        guard m <= 130 else {
            return fallback.isEmpty ? SpWidgetL("مباشر") : fallback
        }
        return "\(m)'"
    }

    /// أوّل حرفين بارزين من اسم الفريق (يتخطّى أداة التعريف «ال»).
    static func shortName(_ name: String) -> String {
        var t = name.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("ال"), t.count > 3 { t = String(t.dropFirst(2)) }
        let words = t.split(separator: " ")
        if let first = words.first { return String(first.prefix(2)) }
        return String(t.prefix(2))
    }
}
