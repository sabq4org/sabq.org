import ActivityKit
import WidgetKit
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// MARK: - واجهة Live Activity للمباراة (شاشة القفل + الجزيرة الديناميكية)
//
// ثيم **متكيّف** يتبع مظهر الجهاز: فاتح ناعم نهارًا، داكن أنيق ليلًا — ألوان
// مكتومة عالية التباين لا تؤذي العين (SpLA أدناه عبر UIColor ديناميكي). الجزيرة
// الديناميكية مظهرها داكن دائمًا، فتُحلّ الألوان تلقائيًّا لنسختها الداكنة.
//
// تعرض بوضوح: (١) اسم البطولة مع أيقونة، (٢) الشوط ودقيقته (ساعة ذاتية الحركة)،
// (٣) النتيجة، (٤) آخر هدف/بطاقة كشريحة ملوّنة مرمّزة (أخضر/كهرماني/أحمر).

struct SpMatchLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SpMatchActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(SpLA.cardBG)
                .activitySystemActionForegroundColor(SpLA.green)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    teamBadge(context.attributes, side: .home)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    teamBadge(context.attributes, side: .away)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 3) {
                        if !context.attributes.competition.isEmpty {
                            Label(context.attributes.competition, systemImage: "trophy.fill")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(SpLA.green)
                                .labelStyle(.titleAndIcon)
                                .lineLimit(1)
                        }
                        centerValue(context)
                        liveStatusContent(context.state, kickoff: context.attributes.kickoff)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.white.opacity(0.9))
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let ev = context.state.lastEvent, !ev.isEmpty {
                        HStack { Spacer(); eventChip(ev); Spacer() }
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
    @ViewBuilder private func teamBadge(_ a: SpMatchActivityAttributes, side: SpSide) -> some View {
        let name = side == .home ? a.homeName : a.awayName
        let file = side == .home ? a.homeLogoFile : a.awayLogoFile
        VStack(spacing: 4) {
            SpLogoView(fileName: file, name: name, size: 32, dark: true)
            Text(name)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(1)
        }
    }

    @ViewBuilder private func centerValue(_ context: ActivityViewContext<SpMatchActivityAttributes>) -> some View {
        if isUpcoming(context) {
            Text(timerInterval: Date()...context.attributes.kickoff, countsDown: true)
                .font(.system(size: 20, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
                .frame(maxWidth: 90)
        } else {
            Text("\(context.state.homeScore) - \(context.state.awayScore)")
                .font(.system(size: 22, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
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
        // نطاق محدود (3 ساعات) لا lانهائي: distantFuture يجعل WidgetKit يحجز عرضًا
        // فلكيًّا للنص فينهار التخطيط (بطاقة سوداء). 3 ساعات تكفي أي مباراة.
        HStack(spacing: 4) {
            Text(timerInterval: Date(timeIntervalSince1970: epoch)...Date(timeIntervalSince1970: epoch + 3 * 3600),
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

// شريحة الحدث الملوّنة المرمّزة (هدف/بطاقة) — لون مكتوم بحسب نوع الحدث، يُحلّ
// تكيّفيًّا بين الفاتح والداكن. تُستخدم في شاشة القفل والجزيرة معًا.
@ViewBuilder
func eventChip(_ ev: String) -> some View {
    let tint = SpLA.eventTint(ev)
    Text(ev)
        .font(.system(size: 12.5, weight: .bold))
        .foregroundStyle(tint)
        .lineLimit(1)
        .padding(.horizontal, 11)
        .padding(.vertical, 5)
        .background(Capsule().fill(tint.opacity(0.16)))
}

// شاشة القفل / البانر — ثيم متكيّف.
private struct LockScreenView: View {
    let context: ActivityViewContext<SpMatchActivityAttributes>

    private var upcoming: Bool {
        !context.state.isLive && !context.state.isFinished && context.attributes.kickoff > Date()
    }

    var body: some View {
        VStack(spacing: 10) {
            // (١) رأس البطاقة: اسم البطولة + شارة الحالة (الشوط والدقيقة)
            HStack(spacing: 6) {
                if !context.attributes.competition.isEmpty {
                    Label(context.attributes.competition, systemImage: "trophy.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(SpLA.green)
                        .labelStyle(.titleAndIcon)
                        .lineLimit(1)
                }
                Spacer(minLength: 6)
                statusBadge
            }
            // (٢) الفريقان + النتيجة/العدّاد
            HStack(alignment: .center, spacing: 8) {
                teamColumn(.home)
                centerBlock
                teamColumn(.away)
            }
            // (٣) آخر هدف/بطاقة كشريحة ملوّنة
            if let ev = context.state.lastEvent, !ev.isEmpty {
                eventChip(ev)
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
                    .foregroundStyle(SpLA.inkSoft)
            }
        } else {
            HStack(spacing: 9) {
                Text("\(context.state.homeScore)")
                    .font(.system(size: 32, weight: .heavy, design: .rounded))
                    .foregroundStyle(SpLA.ink)
                Text("-").font(.system(size: 20, weight: .heavy)).foregroundStyle(SpLA.inkSoft)
                Text("\(context.state.awayScore)")
                    .font(.system(size: 32, weight: .heavy, design: .rounded))
                    .foregroundStyle(SpLA.ink)
            }
        }
    }

    @ViewBuilder private var statusBadge: some View {
        HStack(spacing: 5) {
            if context.state.isLive {
                Circle().fill(SpLA.liveDot).frame(width: 7, height: 7)
            }
            liveStatusContent(context.state, kickoff: context.attributes.kickoff)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(context.state.isLive ? SpLA.green : SpLA.inkSoft)
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
                .foregroundStyle(SpLA.ink.opacity(0.9))
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
//
// كل الألوان **متكيّفة**: تُبنى عبر UIColor ديناميكي يحلّ نسختين (فاتح/داكن)
// تلقائيًّا حسب مظهر الجهاز — وفي الجزيرة الديناميكية (مظهرها داكن دائمًا) تُحلّ
// للنسخة الداكنة. القيم مكتومة (لا ألوان قانية) لراحة العين وتباين كافٍ.
enum SpLA {
    static let cardBG  = adaptive(light: (0.97, 0.98, 0.97), dark: (0.106, 0.141, 0.188)) // أبيض ناعم / سليت داكن
    static let ink     = adaptive(light: (0.11, 0.16, 0.13), dark: (0.91, 0.93, 0.95))    // نص رئيسي
    static let inkSoft = adaptive(light: (0.40, 0.45, 0.42), dark: (0.64, 0.69, 0.73))    // نص ثانوي
    static let green   = adaptive(light: (0.09, 0.52, 0.36), dark: (0.20, 0.74, 0.52))    // تمييز سبق
    static let liveDot = adaptive(light: (0.84, 0.25, 0.22), dark: (0.95, 0.42, 0.38))    // نبضة «مباشر»

    // ألوان الأحداث المكتومة (هدف أخضر · صفراء كهرمانية · حمراء قانية هادئة).
    static let goalTint   = green
    static let yellowTint = adaptive(light: (0.74, 0.55, 0.07), dark: (0.96, 0.77, 0.28))
    static let redTint    = adaptive(light: (0.78, 0.26, 0.22), dark: (0.95, 0.45, 0.40))

    /// لون شريحة الحدث بحسب رمزه (يطابق رموز lastEventText: ⚽ 🟨 🟥 ❌).
    static func eventTint(_ ev: String) -> Color {
        if ev.contains("🟥") { return redTint }
        if ev.contains("🟨") { return yellowTint }
        if ev.contains("⚽") || ev.contains("🥅") { return goalTint }
        return green
    }

    /// لون متكيّف من نسختين RGB (فاتح/داكن) — يُحلّ تلقائيًّا حسب مظهر الجهاز.
    static func adaptive(light: (Double, Double, Double), dark: (Double, Double, Double)) -> Color {
        #if canImport(UIKit)
        return Color(uiColor: UIColor { traits in
            let c = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat(c.0), green: CGFloat(c.1), blue: CGFloat(c.2), alpha: 1)
        })
        #else
        return Color(red: light.0, green: light.1, blue: light.2)
        #endif
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
