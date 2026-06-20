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
                // الجهة المضيفة (تظهر يمين الـ notch في الواجهة العربية)
                if isUpcoming(context) {
                    Text(shortName(context.attributes.homeName))
                        .font(.system(size: 13, weight: .bold))
                } else {
                    compactSide(name: context.attributes.homeName, score: context.state.homeScore)
                }
            } compactTrailing: {
                // الجهة الضيفة (تظهر يسار الـ notch)
                if isUpcoming(context) {
                    Text(timerInterval: Date()...context.attributes.kickoff)
                        .font(.system(size: 13, weight: .bold).monospacedDigit())
                        .frame(maxWidth: 52)
                } else {
                    compactSide(name: context.attributes.awayName, score: context.state.awayScore)
                }
            } minimal: {
                if isUpcoming(context) {
                    Image(systemName: "clock.fill")
                } else {
                    scoreText(context.state)
                        .font(.system(size: 12, weight: .black).monospacedDigit())
                }
            }
            .widgetURL(URL(string: "sabq://match/\(context.attributes.fixtureId)"))
            .keylineTint(WidgetTheme.emerald)
        }
    }

    private func teamColumn(_ name: String) -> some View {
        VStack(spacing: 2) {
            if let flag = muqFlagEmoji(name) {
                Text(flag).font(.system(size: 22))
            }
            Text(name)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    // جهة واحدة في الـ Dynamic Island المضغوط: علم الفريق + نتيجته.
    // يُحاذى العلم للحافة الخارجية والرقم للداخل تجاه الـ notch.
    private func compactSide(name: String, score: Int) -> some View {
        HStack(spacing: 3) {
            if let flag = muqFlagEmoji(name) {
                Text(flag).font(.system(size: 15))
            }
            Text("\(score)")
                .font(.system(size: 16, weight: .black).monospacedDigit())
                .foregroundStyle(.white)
        }
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

// البطاقة RTL: المضيف يمينًا والضيف يسارًا. نرسم النتيجة LTR لكن بترتيب
// "الضيف - المضيف" كي يقع رقم المضيف يمينًا (تحت اسم المضيف) ورقم الضيف
// يسارًا — مطابقًا لمواضع الفريقين فلا تنقلب النتيجة.
private func scoreText(_ state: LiveMatchAttributes.ContentState) -> some View {
    Text("\(state.awayScore) - \(state.homeScore)")
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

// MARK: - أعلام المنتخبات (إيموجي — يُرسم نصيًا بلا شبكة)
//
// الودجت لا يُحمّل صور الشعارات من الشبكة، فنشتق علم الدولة من اسمها العربي.
// نخزّن رمز ISO ونحوّله لإيموجي علم عبر رموز Regional Indicator، مع حالات
// خاصة لأعلام إنجلترا/اسكتلندا/ويلز (تسلسلات Tag).

private let muqFlagISO: [String: String] = [
    // عربي / الشرق الأوسط
    "السعودية": "SA", "قطر": "QA", "الإمارات": "AE", "الامارات": "AE",
    "مصر": "EG", "المغرب": "MA", "تونس": "TN", "الجزائر": "DZ",
    "الأردن": "JO", "الاردن": "JO", "العراق": "IQ", "الكويت": "KW",
    "البحرين": "BH", "عُمان": "OM", "عمان": "OM", "اليمن": "YE",
    "سوريا": "SY", "لبنان": "LB", "فلسطين": "PS", "السودان": "SD",
    "ليبيا": "LY", "موريتانيا": "MR", "الصومال": "SO", "جيبوتي": "DJ",
    "جزر القمر": "KM",
    // أوروبا
    "فرنسا": "FR", "ألمانيا": "DE", "المانيا": "DE", "إسبانيا": "ES",
    "اسبانيا": "ES", "إيطاليا": "IT", "ايطاليا": "IT", "البرتغال": "PT",
    "هولندا": "NL", "بلجيكا": "BE", "كرواتيا": "HR", "السويد": "SE",
    "الدنمارك": "DK", "النرويج": "NO", "سويسرا": "CH", "النمسا": "AT",
    "بولندا": "PL", "أوكرانيا": "UA", "اوكرانيا": "UA", "روسيا": "RU",
    "تركيا": "TR", "اليونان": "GR", "صربيا": "RS", "التشيك": "CZ",
    "المجر": "HU", "رومانيا": "RO", "أيرلندا": "IE", "ايرلندا": "IE",
    "أيسلندا": "IS", "ايسلندا": "IS", "سلوفاكيا": "SK", "سلوفينيا": "SI",
    "ألبانيا": "AL", "البانيا": "AL", "فنلندا": "FI", "بلغاريا": "BG",
    // أمريكا الشمالية والوسطى
    "الولايات المتحدة": "US", "أمريكا": "US", "امريكا": "US",
    "المكسيك": "MX", "كندا": "CA", "كوستاريكا": "CR", "بنما": "PA",
    "هندوراس": "HN", "جامايكا": "JM",
    // أمريكا الجنوبية
    "البرازيل": "BR", "الأرجنتين": "AR", "الارجنتين": "AR",
    "الإكوادور": "EC", "الاكوادور": "EC", "كولومبيا": "CO",
    "أوروغواي": "UY", "اوروغواي": "UY", "أوروجواي": "UY",
    "تشيلي": "CL", "باراغواي": "PY", "باراجواي": "PY", "بيرو": "PE",
    "فنزويلا": "VE", "بوليفيا": "BO",
    // آسيا وأوقيانوسيا
    "اليابان": "JP", "كوريا الجنوبية": "KR", "كوريا": "KR", "إيران": "IR",
    "ايران": "IR", "أستراليا": "AU", "استراليا": "AU", "الصين": "CN",
    "الهند": "IN", "إندونيسيا": "ID", "اندونيسيا": "ID", "تايلاند": "TH",
    "فيتنام": "VN", "أوزبكستان": "UZ", "اوزبكستان": "UZ",
    "نيوزيلندا": "NZ", "نيوزلندا": "NZ",
    // أفريقيا
    "نيجيريا": "NG", "السنغال": "SN", "غانا": "GH", "الكاميرون": "CM",
    "ساحل العاج": "CI", "مالي": "ML", "جنوب أفريقيا": "ZA",
    "جنوب افريقيا": "ZA", "الغابون": "GA", "بوركينا فاسو": "BF",
    "الرأس الأخضر": "CV", "الرأس الاخضر": "CV", "أنغولا": "AO",
    "انغولا": "AO", "الكونغو الديمقراطية": "CD", "الكونغو": "CG",
    "زامبيا": "ZM", "أوغندا": "UG", "اوغندا": "UG", "كينيا": "KE",
]

// أعلام مناطق المملكة المتحدة (تسلسلات Tag) كإيموجي مباشر.
private let muqSubdivisionFlags: [String: String] = [
    "إنجلترا": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
    "انجلترا": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
    "اسكتلندا": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
    "ويلز": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}",
]

func muqFlagEmoji(_ rawName: String) -> String? {
    let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
    if let direct = muqSubdivisionFlags[name] { return direct }
    guard let iso = muqFlagISO[name] else { return nil }
    var emoji = ""
    for scalar in iso.unicodeScalars {
        guard scalar.value >= 65, scalar.value <= 90,
              let flag = Unicode.Scalar(0x1F1E6 + scalar.value - 65) else { return nil }
        emoji.unicodeScalars.append(flag)
    }
    return emoji
}

// MARK: - شاشة القفل / مركز الإشعارات

struct LockScreenMatchView: View {
    let context: ActivityViewContext<LiveMatchAttributes>

    var body: some View {
        VStack(spacing: 14) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 12, weight: .bold))
                    Text("كأس العالم 2026")
                        .font(.system(size: 13, weight: .heavy))
                }
                .foregroundStyle(WidgetTheme.emerald)
                Spacer()
                if let round = context.attributes.round {
                    Text(round)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(WidgetTheme.dim)
                        .lineLimit(1)
                }
            }

            HStack(alignment: .top, spacing: 10) {
                teamSide(context.attributes.homeName, alignment: .trailing)

                VStack(spacing: 4) {
                    if isUpcoming(context) {
                        Text(timerInterval: Date()...context.attributes.kickoff)
                            .font(.system(size: 34, weight: .black, design: .rounded).monospacedDigit())
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.center)
                        Text("على انطلاق المباراة")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(WidgetTheme.emerald)
                    } else {
                        scoreText(context.state)
                            .font(.system(size: 38, weight: .black, design: .rounded))
                        statusPill
                    }
                }
                .frame(minWidth: 104)
                .padding(.top, 8)

                teamSide(context.attributes.awayName, alignment: .leading)
            }

            if let ev = context.state.lastEvent {
                Text(ev)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(WidgetTheme.dim)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .activityBackgroundTint(WidgetTheme.stadium)
        .activitySystemActionForegroundColor(.white)
    }

    private func teamSide(_ name: String, alignment: HorizontalAlignment) -> some View {
        VStack(spacing: 8) {
            Group {
                if let flag = muqFlagEmoji(name) {
                    Text(flag)
                        .font(.system(size: 44))
                        .minimumScaleFactor(0.6)
                } else {
                    ZStack {
                        Circle()
                            .fill(WidgetTheme.emerald.opacity(0.18))
                        Circle()
                            .stroke(WidgetTheme.emerald.opacity(0.45), lineWidth: 1.5)
                        Text(teamInitials(name))
                            .font(.system(size: 18, weight: .black))
                            .foregroundStyle(.white)
                            .environment(\.layoutDirection, .rightToLeft)
                    }
                }
            }
            .frame(width: 52, height: 52)

            Text(name)
                .font(.system(size: 16, weight: .heavy))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private func teamInitials(_ name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        return String(trimmed.prefix(2))
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
