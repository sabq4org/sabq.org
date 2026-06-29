import SwiftUI

// MARK: - ذكاء VARA السلوكي (AI Behavioral Insights)
//
// عبارات ذكية مخصّصة تظهر للمستخدم بناءً على سلوكه: فريقه المفضّل، فِرقه المتابَعة،
// تفضيلات تنبيهاته، وحالة جلسته — لتقديم مقترحات وتذكيرات مهمّة في الوقت المناسب.
// المحرّك حتميّ (يرتّب العبارات حسب الأولوية)؛ الوقت يُمرَّر من الواجهة فقط للصياغة.

nonisolated struct VaraInsight: Identifiable, Equatable {
    let id: String
    let icon: String
    let text: String
    let accent: InsightAccent

    nonisolated enum InsightAccent { case green, gold, crimson }
}

nonisolated struct VaraInsightContext {
    var isLoggedIn: Bool = false
    var favoriteName: String? = nil
    var followsCount: Int = 0
    var activeAlerts: Int = 0
    /// عنوان مباراة الفريق المفضّل القادمة (مثل «النصر × الهلال») إن عُرفت.
    var favoriteNextTitle: String? = nil
    /// موعد انطلاق مباراة المفضّل القادمة — للصياغة الزمنية.
    var favoriteNextKickoff: Date? = nil
    var favoriteIsLive: Bool = false
}

nonisolated enum VaraInsightsEngine {
    /// يولّد عبارات ذكية مرتّبة حسب الأولوية (الأهمّ أولًا). `now` للصياغة الزمنية.
    static func generate(_ c: VaraInsightContext, now: Date) -> [VaraInsight] {
        var out: [VaraInsight] = []

        // 1) مباراة المفضّل جارية الآن — الأعلى أولوية.
        if c.favoriteIsLive, let fav = c.favoriteName {
            out.append(.init(id: "fav-live", icon: "dot.radiowaves.left.and.right",
                             text: "مباراة \(fav) جارية الآن — افتح مركز المباراة وتابعها لحظة بلحظة.",
                             accent: .crimson))
        }

        // 2) مباراة المفضّل قادمة قريبًا — تذكير + دعوة للتوقّع.
        if !c.favoriteIsLive, let kickoff = c.favoriteNextKickoff {
            let secs = kickoff.timeIntervalSince(now)
            if secs > 0, secs <= 48 * 3600 {
                let title = c.favoriteNextTitle ?? "مباراة فريقك المفضّل"
                out.append(.init(id: "fav-soon", icon: "alarm",
                                 text: "\(title) \(relative(secs)) — هل سجّلت توقّعك في VARA؟",
                                 accent: .gold))
            }
        }

        // 3) لا فريق مفضّل — اقتراح التخصيص.
        if c.favoriteName == nil {
            out.append(.init(id: "no-fav", icon: "star",
                             text: "اجعل VARA لك: اختر فريقك المفضّل من نجمة صفحة أي نادٍ ليتصدّر شاشتك.",
                             accent: .green))
        } else if c.favoriteNextKickoff == nil && !c.favoriteIsLive {
            out.append(.init(id: "fav-watch", icon: "sparkles",
                             text: "أنت من مشجّعي \(c.favoriteName!) — نُبرز مبارياته وأخباره أولًا في VARA.",
                             accent: .green))
        }

        // 4) متابعة وتنبيهات — حسب الحالة.
        if c.isLoggedIn {
            if c.followsCount == 0 {
                out.append(.init(id: "follow", icon: "heart",
                                 text: "تابع فِرقك المفضّلة لتصلك تنبيهات مبارياتها اللحظية.",
                                 accent: .green))
            } else if c.activeAlerts == 0 {
                out.append(.init(id: "alerts-off", icon: "bell.badge",
                                 text: "تتابع \(c.followsCount) فِرق لكن التنبيهات متوقّفة — فعّلها لئلّا تفوتك أهدافهم.",
                                 accent: .gold))
            } else {
                out.append(.init(id: "watching", icon: "bell.fill",
                                 text: "نراقب \(c.followsCount) من فِرقك — ستصلك تنبيهات الأهداف والنتائج فور وقوعها.",
                                 accent: .green))
            }
        } else {
            out.append(.init(id: "login", icon: "person.crop.circle.badge.plus",
                             text: "سجّل الدخول ليتذكّر VARA فِرقك وتوقّعاتك على كل أجهزتك.",
                             accent: .green))
        }

        // 5) تلميح عام عن خوارزمية التوقّع (دائمًا كخيار أخير).
        out.append(.init(id: "tip-pred", icon: "chart.bar.xaxis",
                         text: "«توقّع VARA» يحلّل الترتيب والفورمة وأفضلية الأرض لكل مباراة — جرّبه قبل الصافرة.",
                         accent: .green))

        return out
    }

    private static func relative(_ secs: TimeInterval) -> String {
        let h = Int(secs / 3600)
        if h >= 24 { return "بعد \(h / 24) يوم" }
        if h >= 1 { return "بعد \(h) ساعة" }
        let m = max(1, Int(secs / 60))
        return "بعد \(m) دقيقة"
    }
}

// MARK: - بطاقة ذكاء VARA

extension VaraInsight.InsightAccent {
    var color: Color {
        switch self {
        case .green: return SpTheme.green
        case .gold: return SpTheme.gold
        case .crimson: return SpTheme.crimson
        }
    }
}

/// بطاقة عبارات ذكاء VARA — تعرض عبارة واحدة بارزة مع تمرير أفقيّ بين العبارات
/// (نقاط مؤشّر). تختفي تمامًا إن لم تتوفّر عبارات. تصميم أبيض/أخضر مسطّح.
struct VaraInsightCard: View {
    let context: VaraInsightContext
    @State private var index = 0

    var body: some View {
        TimelineView(.everyMinute) { tl in
            let insights = VaraInsightsEngine.generate(context, now: tl.date)
            if !insights.isEmpty {
                let items = Array(insights.prefix(4))
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkles").font(.system(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)
                        Text("ذكاء VARA").font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(SpTheme.green)
                            .environment(\.layoutDirection, .leftToRight)
                        Spacer(minLength: 0)
                        if items.count > 1 {
                            HStack(spacing: 4) {
                                ForEach(0..<items.count, id: \.self) { i in
                                    Circle()
                                        .fill(i == (index % items.count) ? SpTheme.green : SpTheme.onDarkFaint.opacity(0.35))
                                        .frame(width: 5, height: 5)
                                }
                            }
                        }
                    }
                    TabView(selection: $index) {
                        ForEach(Array(items.enumerated()), id: \.offset) { i, ins in
                            insightRow(ins).tag(i).padding(.trailing, 2)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    .frame(height: 52)
                }
                .padding(14)
                .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
                    .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.green.opacity(0.28), lineWidth: 1)))
            }
        }
    }

    private func insightRow(_ ins: VaraInsight) -> some View {
        HStack(spacing: 12) {
            Image(systemName: ins.icon)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(ins.accent.color)
                .frame(width: 38, height: 38)
                .background(Circle().fill(ins.accent.color.opacity(0.12)))
            Text(ins.text)
                .font(SportsFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(SpTheme.onDark)
                .fixedSize(horizontal: false, vertical: true)
                .lineLimit(3)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
