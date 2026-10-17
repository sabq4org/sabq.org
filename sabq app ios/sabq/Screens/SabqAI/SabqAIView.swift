import SwiftUI

// MARK: - عقل سبق — نقل صفحة /sabq-ai (SabqAI.tsx، التصميم المعتمد 2026-10-16)
//
// دماغ بشري حي في الواجهة، ثم رحلة الخبر في خمسة فصول تتوقف عند «عين المحرر»،
// فخريطة المجالات، والبطولات، وفريق سبق الذكي، والأرقام الحية، و«ما لن يفعله
// عقل سبق»، والميثاق، وعام الذكاء الاصطناعي. النصوص منقولة حرفيًا من الويب.
//
// قاعدة مصداقية ملزمة: لا أرقام لحظية وهمية. الأرقام من /api/public/ai-stats
// و/api/public/ai-team؛ إن تعذّر الجلب تظهر حقائق ثابتة بدلها ويسقط قسم الفريق بصمت.

struct SabqAIRoute: Hashable {}

struct SabqAIView: View {
    @State private var stats: APIAIPublicStats?
    @State private var team: APIAITeam?
    @State private var viewport: CGFloat = 800

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                SAIHero(stats: stats, team: team)
                SAITicker()
                SAIManifesto()
                SAIJourney(stats: stats)
                SAIDomains()
                SAISports()
                if let team, !team.team.isEmpty { SAITeam(team: team) }
                SAILiveNumbers(stats: stats, team: team)
                SAIGovernance()
                SAICharter()
                SAIFinale()
            }
            .padding(.bottom, 120)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { viewport = $0 }
        .environment(\.saiViewport, viewport)
        .background(SAI.void.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .navigationTitle("عقل سبق")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(SAI.void, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .sabqRTL()
        .task { await loadTeam() }
        .task { await refreshStatsLoop() }
    }

    private func loadTeam() async {
        guard let payload = try? await APIClient.shared.fetchAITeam(), !payload.team.isEmpty else { return }
        team = payload
    }

    /// الويب يعيد الجلب كل دقيقة؛ المهمة تنتهي تلقائيًا بمغادرة الشاشة.
    private func refreshStatsLoop() async {
        while !Task.isCancelled {
            if let s = try? await APIClient.shared.fetchAIPublicStats(), s.ai.totalOps > 0 {
                stats = s
            }
            try? await Task.sleep(for: .seconds(60))
        }
    }
}

// MARK: - Shared section pieces

private let saiMargin: CGFloat = 20

private struct SAIEyebrow: View {
    let text: String
    var color: Color = SAI.ai
    var body: some View {
        Text(text).font(SAI.font(13, .semibold)).foregroundStyle(color)
    }
}

private struct SAIH2: View {
    let text: String
    var body: some View {
        Text(text)
            .font(SAI.font(30, .bold, relativeTo: .title))
            .foregroundStyle(SAI.text)
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 12)
            .padding(.bottom, 16)
            .accessibilityAddTraits(.isHeader)
    }
}

private struct SAISub: View {
    let text: String
    var alignment: Alignment = .center
    var body: some View {
        Text(text)
            .font(SAI.font(18))
            .foregroundStyle(SAI.soft)
            .lineSpacing(7)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: 660, alignment: alignment)
    }
}

/// شبكة عمودين بخطوط فاصلة رفيعة (`.sai-dgrid` و`.sai-cgrid` و`.sai-horizon` في الجوال).
private struct SAITwoColumnGrid<Item, Cell: View>: View {
    let items: [Item]
    var topBorder = true
    @ViewBuilder let cell: (Item) -> Cell

    var body: some View {
        VStack(spacing: 0) {
            if topBorder { Rectangle().fill(SAI.faint).frame(height: 1) }
            ForEach(Array(stride(from: 0, to: items.count, by: 2)), id: \.self) { i in
                HStack(alignment: .top, spacing: 0) {
                    cell(items[i]).frame(maxWidth: .infinity, alignment: .leading)
                    Rectangle().fill(SAI.faint).frame(width: 1)
                    Group {
                        if i + 1 < items.count { cell(items[i + 1]) } else { Color.clear }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .fixedSize(horizontal: false, vertical: true)
                Rectangle().fill(SAI.faint).frame(height: 1)
            }
        }
    }
}

private func saiOpenWeb(_ path: String) {
    guard let url = URL(string: URLConstants.webOrigin + path) else { return }
    UIApplication.shared.open(url)
}

// MARK: - Hero

private struct SAIHero: View {
    let stats: APIAIPublicStats?
    let team: APIAITeam?

    private var teamCount: Int {
        guard let team else { return 0 }
        return team.counters?.teamCount ?? team.team.count
    }

    var body: some View {
        VStack(spacing: 0) {
            SabqAIBrain()
                .aspectRatio(1.18, contentMode: .fit)
                .frame(maxWidth: 520)
                .padding(.horizontal, saiMargin)
                .saiReveal(1)

            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    SAIBlinkDot()
                    Text("عقل سبق يعمل الآن")
                }
                .font(SAI.font(14))
                .foregroundStyle(SAI.rgb(0xA9D6FF))
                .padding(.horizontal, 15)
                .padding(.vertical, 8)
                .background(SAI.ai.opacity(0.07), in: Capsule())
                .overlay(Capsule().stroke(SAI.ai.opacity(0.28), lineWidth: 1))
                .saiReveal()

                VStack(spacing: 4) {
                    Text("عقلٌ لا ينام.")
                        .foregroundStyle(LinearGradient(colors: [SAI.rgb(0xBFE3FF), SAI.ai, SAI.ai2],
                                                        startPoint: .trailing, endPoint: .leading))
                    Text("وقرارٌ لا يُفوَّض.")
                        .foregroundStyle(SAI.human)
                        .shadow(color: SAI.human.opacity(0.35), radius: 20)
                }
                .font(SAI.font(40, .bold, relativeTo: .largeTitle))
                .multilineTextAlignment(.center)
                .padding(.top, 24)
                .padding(.bottom, 20)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
                .saiReveal(1)

                Text("أول منظومة ذكاء تحريري متكاملة في صحيفة سعودية وعربية. ترصد وتحلل وتكتب بالعربية على مدار الساعة، ثم تتوقف عند محرر يقرّر.")
                    .font(SAI.font(17))
                    .foregroundStyle(SAI.rgb(0xB4C2D3))
                    .lineSpacing(7)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: 540)
                    .saiReveal(2)

                strip
                    .padding(.top, 36)
                    .saiReveal(3)
            }
            .padding(.horizontal, saiMargin)
        }
        .padding(.top, 24)
        .padding(.bottom, 64)
        .frame(maxWidth: .infinity)
        .background(
            ZStack {
                EllipticalGradient(colors: [SAI.ai.opacity(0.13), .clear], center: UnitPoint(x: 0.28, y: 0.5),
                                   startRadiusFraction: 0, endRadiusFraction: 0.75)
                EllipticalGradient(colors: [SAI.human.opacity(0.07), .clear], center: UnitPoint(x: 0.36, y: 0.42),
                                   startRadiusFraction: 0, endRadiusFraction: 0.45)
            }
            // مواضع التدرج في الويب محسوبة من اليسار.
            .environment(\.layoutDirection, .leftToRight)
        )
    }

    /// شريط الأرقام الأربعة؛ كل رقم حي له بديل ثابت إن تعذّر الجلب.
    private var strip: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                if let stats {
                    cell(value: AnyView(SAICountUp(value: stats.ai.todayOps)), label: "عملية ذكاء اليوم", now: true)
                } else {
                    cell(value: AnyView(numeral("+60")), label: "خدمة ذكية", now: true)
                }
                Rectangle().fill(SAI.faint).frame(width: 1)
                if teamCount > 0 {
                    cell(value: AnyView(numeral("\(teamCount)")), label: "زميلًا رقميًا")
                } else {
                    cell(value: AnyView(numeral("3")), label: "لغات نشر")
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            Rectangle().fill(SAI.faint).frame(height: 1)
            HStack(spacing: 0) {
                if let stats {
                    cell(value: AnyView(numeral(SAIFormat.number(stats.ai.successRate, decimals: 1) + "%")), label: "نجاح العمليات")
                } else {
                    cell(value: AnyView(numeral("5")), label: "بطولات")
                }
                Rectangle().fill(SAI.faint).frame(width: 1)
                cell(value: AnyView(numeral("24/7")), label: "بلا انقطاع")
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: 360)
        .background(SAI.deep.opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(SAI.faint, lineWidth: 1))
    }

    private func numeral(_ s: String) -> some View {
        Text(verbatim: s).monospacedDigit().environment(\.layoutDirection, .leftToRight)
    }

    private func cell(value: AnyView, label: String, now: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            value
                .font(SAI.font(26, .semibold, relativeTo: .title2))
                .foregroundStyle(now ? SAI.ai : SAI.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label).font(SAI.font(12)).foregroundStyle(SAI.mute)
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Ticker

private struct SAITicker: View {
    /// عبارات «من داخل المنظومة» — قدرات حقيقية بصيغة وصفية، لا أحداث لحظية.
    static let items: [(tag: String, text: String)] = [
        ("رياضة", "تقرير المباراة يصدر بعد دقائق من صافرة النهاية — بعد إجازة المحرر"),
        ("الرادار", "رصد المصادر العالمية وتقييم أهمية الخبر وتحويل المهم إلى مسودة عربية"),
        ("صوت", "نشرات صوتية تُنتج بأصوات عربية وتُدقّق قبل بثّها"),
        ("لغات", "النسخ الإنجليزية والأردية تصدر من المنظومة نفسها بعد التدقيق"),
        ("عُمق", "تحليلات معمّقة تُبنى بعدة نماذج وتُراجع تحريريًا قبل النشر"),
        ("مباشر", "تعليق المباريات يُعرّب لحظة بلحظة من بيانات المباراة الرسمية"),
    ]

    var body: some View {
        HStack(spacing: 0) {
            Text("من داخل المنظومة")
                .font(SAI.font(13, .bold))
                .foregroundStyle(SAI.rgb(0x04121F))
                .padding(.horizontal, 18)
                .padding(.vertical, 11)
                .background(SAI.ai)
                .fixedSize()
                .zIndex(1)
            SAITickerBelt(items: Self.items)
        }
        .background(SAI.deep.opacity(0.7))
        .overlay(alignment: .top) { Rectangle().fill(SAI.faint).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(SAI.faint).frame(height: 1) }
        .accessibilityHidden(true)
    }
}

// MARK: - Manifesto

private struct SAIManifesto: View {
    var body: some View {
        Text(SAI.rich([
            .plain("الآلة "), .strong("تسرّع", SAI.text), .plain(". الآلة "), .strong("ترتّب", SAI.text),
            .plain(". الآلة "), .strong("تكتب المسودة", SAI.text), .plain(".\nلكن في سبق، "),
            .strong("المسؤولية تحريرية كاملة", SAI.human), .plain(" عن كل ما يصل إليك."),
        ], size: 24, base: SAI.rgb(0x5F7189)))
        .lineSpacing(12)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, saiMargin)
        .padding(.top, 80)
        .padding(.bottom, 40)
        .saiReveal()
    }
}

// MARK: - Journey

private struct SAIJourney: View {
    let stats: APIAIPublicStats?

    static let signalSources = ["وكالات الأنباء", "رادار المصادر العالمية", "بيانات المباريات الرسمية",
                                "مراسلون عبر واتساب والبريد", "منصة X", "أرشيف سبق"]
    static let providers: [(name: String, desc: String, saudi: Bool)] = [
        ("OpenAI", "التحرير والتضمين", false),
        ("Anthropic", "التحليل والصياغة", false),
        ("Google Gemini", "البصريات والصوت", false),
        ("ElevenLabs", "الأصوات العربية", false),
        ("HUMAIN", "صوت سعودي", true),
    ]
    static let controls: [(name: String, desc: String)] = [
        ("توجيه مستقل لكل خدمة", "لكل مهمة نموذج أساسي وسلسلة بدائل"),
        ("تحويل تلقائي عند التعثر", "يتدخل البديل دون توقف الخدمة"),
        ("قاطع دائرة", "النموذج المتعثر يُعزل مؤقتًا ويُعاد فحصه آليًا"),
        ("ميزانيات وسجل كامل", "قيد لكل عملية: نجاحها وزمنها وتكلفتها"),
    ]

    var body: some View {
        let radar = stats?.radar?.totalItems ?? 0
        let tokensM = stats.map { ($0.ai.totalTokens / 1_000_000).rounded() } ?? 0
        VStack(spacing: 0) {
            chapter(idx: "01 · الرصد", title: "يسمع العالم") {
                body("«راصد» و«سبّاق» يلتقطان الإشارة قبل أن تصير خبرًا، من ست بوابات:")
                chips(Self.signalSources.map { ($0, false) })
            } figure: {
                if radar > 0 {
                    SAIFigure(caption: "مادة التقطها رادار المصادر العالمية") { SAICountUp(value: radar) }
                } else {
                    SAIFigure(caption: "بوابات رصد تعمل على مدار الساعة") { Text(verbatim: "6") }
                }
            }

            chapter(idx: "02 · الفهم", title: "يفرز ويُقيّم") {
                body("تصنيف آلي، ودرجة أهمية، وتحقق من البيانات. ليس كل ما يحدث خبرًا، والعقل يقرر ما يستحق وقت المحرر.")
            } figure: {
                if let stats, stats.stories.total > 0 {
                    SAIFigure(caption: "قصة متابعة ذكية تربط الخبر بما سبقه") { SAICountUp(value: stats.stories.total) }
                } else {
                    SAIFigure(caption: "أهمية لكل إشارة قبل أن تصل المحرر") { Text("درجة") }
                }
            }

            chapter(idx: "03 · الكتابة", title: "يكتب بلسان سبق") {
                body("عربية أولًا بأسلوب الدار، وبلا معلومة مخترعة — عبر بوابة واحدة لكل عملية ذكاء، لا نداء يخرج عنها.")
                chips(Self.providers.map { ("\($0.name) · \($0.desc)", $0.saudi) })
                gate
            } figure: {
                if tokensM > 0 {
                    SAIFigure(caption: stats?.ai.sinceDate.map { "توكن عالجها العقل منذ \(SAIFormat.arabicDate($0, withYear: true))" } ?? "توكن عالجها العقل") {
                        SAICountUp(value: tokensM, suffix: "M")
                    }
                } else {
                    SAIFigure(caption: "مزوّدي ذكاء خلف بوابة واحدة") { Text(verbatim: "5") }
                }
            }

            chapter(idx: "04 · التوقف", title: "ثم يتوقف.", human: true) {
                Text("هنا تنتهي صلاحيات الآلة.")
                    .font(SAI.font(22, .medium))
                    .foregroundStyle(SAI.rgb(0xE9FFF5))
                    .padding(.bottom, 14)
                body("«عين المحرر»: مراجعة وإجازة أو ردّ — والمحتوى الآلي يمرّ ببوابة جودة ووسم واضح. الآلة تقترح، والمحرر يوقّع.")
            } figure: {
                SAIFigure(caption: "صاحب القرار الأخير", human: true) { Text("المحرر") }
            }

            chapter(idx: "05 · النشر والقياس", title: "يصل إليك") {
                body("على الويب والتطبيقات، وبالصوت والبودكاست، وبثلاث لغات من منظومة واحدة.")
                Text(SAI.rich([
                    .strong("حلقة القياس:", SAI.text, .semibold),
                    .plain(" كل عملية تُسجَّل لحظة وقوعها — نجحت أم أخفقت، كم استغرقت، كم كلّفت — ثم تعود لتضبط اختيار النماذج وإعداداتها. المنظومة تقيس نفسها وتتحسن بها."),
                ], size: 14.5, base: SAI.soft))
                .lineSpacing(6)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(SAI.ai.opacity(0.45), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                .padding(.top, 20)
            } figure: {
                if let stats, stats.articles.totalPublished > 0 {
                    SAIFigure(caption: "خبر في أرشيف سبق") { SAICountUp(value: stats.articles.totalPublished) }
                } else {
                    SAIFigure(caption: "لغات نشر من منظومة واحدة") { Text(verbatim: "3") }
                }
            }
        }
        .padding(.top, 30)
        .padding(.bottom, 70)
    }

    private func body(_ text: String) -> some View {
        Text(text)
            .font(SAI.font(18))
            .foregroundStyle(SAI.soft)
            .lineSpacing(8)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func chips(_ items: [(String, Bool)]) -> some View {
        FlowLayout(spacing: 8) {
            ForEach(items, id: \.0) { item in
                Text(item.0)
                    .font(SAI.font(13))
                    .foregroundStyle(item.1 ? SAI.rgb(0x9FF0CD) : SAI.rgb(0xC7D3E1))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.03), in: Capsule())
                    .overlay(Capsule().stroke(item.1 ? SAI.human.opacity(0.45) : SAI.faint, lineWidth: 1))
            }
        }
        .padding(.top, 20)
    }

    private var gate: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("كيف تُدار البوابة").font(SAI.font(14, .semibold)).foregroundStyle(SAI.rgb(0xBFE3FF))
            ForEach(Self.controls, id: \.name) { c in
                Text(SAI.rich([.strong(c.name, SAI.text, .semibold), .plain(" — \(c.desc)")], size: 14, base: SAI.soft))
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .background(SAI.ai.opacity(0.04), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(SAI.ai.opacity(0.3), lineWidth: 1))
        .padding(.top, 22)
    }

    private func chapter<Copy: View, Fig: View>(
        idx: String, title: String, human: Bool = false,
        @ViewBuilder copy: () -> Copy, @ViewBuilder figure: () -> Fig
    ) -> some View {
        VStack(alignment: .leading, spacing: 26) {
            VStack(alignment: .leading, spacing: 0) {
                Text(idx)
                    .font(SAI.font(13, .semibold))
                    .foregroundStyle(human ? SAI.human : SAI.ai)
                Text(title)
                    .font(SAI.font(38, .bold, relativeTo: .largeTitle))
                    .foregroundStyle(human ? SAI.human : SAI.text)
                    .shadow(color: human ? SAI.human.opacity(0.25) : .clear, radius: 30)
                    .padding(.top, 10)
                    .padding(.bottom, 14)
                    .accessibilityAddTraits(.isHeader)
                copy()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .saiReveal()
            figure()
        }
        .padding(.horizontal, saiMargin)
        .padding(.vertical, 60)
        .overlay(alignment: .top) { Rectangle().fill(SAI.faint).frame(height: 1) }
    }
}

/// `.sai-fig`: رقم كبير متدرّج من الأبيض إلى الأزرق الرمادي، وتحته شرحه. في الفصل الرابع أخضر متوهج.
private struct SAIFigure<Value: View>: View {
    let caption: String
    var human = false
    @ViewBuilder let value: () -> Value

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Group {
                if human {
                    value()
                        .font(SAI.font(52, .bold, relativeTo: .largeTitle))
                        .foregroundStyle(SAI.human)
                        .shadow(color: SAI.human.opacity(0.3), radius: 25)
                } else {
                    value()
                        .font(SAI.font(52, .semibold, relativeTo: .largeTitle))
                        .foregroundStyle(LinearGradient(colors: [.white, SAI.rgb(0x7FA3C9)], startPoint: .top, endPoint: .bottom))
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            Text(caption)
                .font(SAI.font(15))
                .foregroundStyle(human ? SAI.rgb(0x9FF0CD) : SAI.mute)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .saiReveal(2)
    }
}

// MARK: - Domains

private struct SAIDomains: View {
    static let domains: [(kicker: String, title: String, desc: String)] = [
        ("تحرير", "التحرير الذكي", "تحليلات «عُمق»، رادار المصادر العالمية، توليد المقالات، التصنيف والروابط الذكية"),
        ("رياضة", "الرياضة اللحظية", "تقارير فور الصافرة، معاينات المباريات، التعليق المعرّب لحظة بلحظة"),
        ("صوت", "الأخبار المسموعة", "نشرات وموجز صوتي بأصوات عربية طبيعية"),
        ("بصري", "الاستوديو البصري", "صور وإنفوجرافيك ومصغّرات وأوصاف بديلة بهوية سبق"),
        ("تخصيص", "لكل قارئ صحيفته", "الموجز اليومي والتوصيات الذكية حسب اهتماماتك الحقيقية"),
        ("جودة", "الجودة والإشراف", "فلترة التعليقات وفحص معايير النشر وتحليل الأسلوب"),
        ("لغات", "ثلاث لغات", "عربي وإنجليزي وأردو من منظومة تحريرية واحدة"),
        ("بنية", "البوابة الموحدة", "توجيه النماذج بين المزوّدين وقياس الجودة والتكلفة باستمرار"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            SAIEyebrow(text: "خريطة العقل").saiReveal()
            SAIH2(text: "ثمانية مجالات، أكثر من ستين خدمة").multilineTextAlignment(.center).saiReveal(1)
            SAISub(text: "كل مجال قسم من أقسام الدماغ، وكلها تمر عبر البوابة نفسها.").multilineTextAlignment(.center).saiReveal(2)

            SAITwoColumnGrid(items: Self.domains) { d in
                VStack(alignment: .leading, spacing: 8) {
                    Text(d.kicker).font(SAI.font(12, .semibold)).foregroundStyle(SAI.ai)
                    Text(d.title).font(SAI.font(20, .bold)).foregroundStyle(SAI.text)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(d.desc).font(SAI.font(14)).foregroundStyle(SAI.mute).lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 18)
                .padding(.top, 28)
                .padding(.bottom, 30)
                .saiReveal()
            }
            .padding(.top, 56)

            HStack(alignment: .top, spacing: 26) {
                ForEach(SAIStaticFacts.all.prefix(3), id: \.label) { f in
                    VStack(spacing: 4) {
                        Text(verbatim: f.value).font(SAI.font(44, .semibold)).foregroundStyle(SAI.ai)
                            .environment(\.layoutDirection, .leftToRight)
                        Text(f.label).font(SAI.font(14)).foregroundStyle(SAI.mute)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.top, 44)
            .saiReveal()
        }
        .padding(.horizontal, saiMargin)
        .padding(.vertical, 110)
    }
}

private enum SAIStaticFacts {
    static let all: [(value: String, label: String)] = [
        ("+60", "خدمة ذكية تعمل في المنظومة"),
        ("5", "بطولات تُغطّى بمحرّكات آلية"),
        ("3", "لغات نشر من منظومة واحدة"),
        ("100%", "مسؤولية تحريرية عن كل ما يُنشر — بشريًا كان أو آليًا"),
    ]
}

// MARK: - Sports

private struct SAISports: View {
    private enum Target { case worldCup, asianCup, gulfCupWeb, roshn, kingsCup }
    private static let tournaments: [(label: String, target: Target)] = [
        ("كأس العالم 2026", .worldCup),
        ("كأس آسيا 2027", .asianCup),
        ("خليجي 27", .gulfCupWeb),
        ("دوري روشن", .roshn),
        ("كأس الملك", .kingsCup),
    ]
    private static let facts: [(value: String, label: String)] = [
        ("دقائق", "تقرير المباراة يصدر بعد صافرة النهاية بدقائق معدودة"),
        ("معاينات", "معاينة ذكية قبل كل مباراة: أرقام المواجهات والتشكيلة المتوقعة"),
        ("لحظي", "تعليق المباريات يُعرّب فور وقوع الحدث"),
        ("0", "معلومة مخترعة — المصدر بيانات المباراة الرسمية فقط"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 36) {
            VStack(alignment: .leading, spacing: 0) {
                SAIEyebrow(text: "البطولات نموذجًا").saiReveal()
                SAIH2(text: "من المونديال\nإلى دوري روشن").saiReveal(1)
                SAISub(text: "واكبنا كأس العالم بتقارير تصدر مع صافرة النهاية — واليوم تعمل المحرّكات نفسها في البطولات القارية والمحلية.", alignment: .leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .saiReveal(2)
                FlowLayout(spacing: 10) {
                    ForEach(Self.tournaments, id: \.label) { t in chip(t.label, t.target) }
                }
                .padding(.top, 26)
                .saiReveal(3)
            }

            SAITwoColumnGrid(items: Self.facts) { f in
                VStack(alignment: .leading, spacing: 4) {
                    Text(verbatim: f.value).font(SAI.font(32, .bold)).foregroundStyle(SAI.ai)
                    Text(f.label).font(SAI.font(14.5)).foregroundStyle(SAI.soft).lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 26)
                .accessibilityElement(children: .combine)
            }
            .saiReveal(2)
        }
        .padding(.horizontal, saiMargin)
        .padding(.vertical, 110)
        .background(
            LinearGradient(stops: [
                .init(color: SAI.void, location: 0), .init(color: SAI.rgb(0x061322), location: 0.3),
                .init(color: SAI.rgb(0x061322), location: 0.7), .init(color: SAI.void, location: 1),
            ], startPoint: .top, endPoint: .bottom)
        )
    }

    @ViewBuilder
    private func chip(_ label: String, _ target: Target) -> some View {
        let content = Text(label)
            .font(SAI.font(14.5, .semibold))
            .foregroundStyle(SAI.text)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .overlay(Capsule().stroke(Color.white.opacity(0.2), lineWidth: 1))
            .contentShape(Capsule())
        switch target {
        case .worldCup: NavigationLink(value: WorldCupRoute()) { content }.buttonStyle(.plain)
        case .asianCup: NavigationLink(value: AsianCupRoute()) { content }.buttonStyle(.plain)
        case .roshn: NavigationLink(value: RoshnRoute()) { content }.buttonStyle(.plain)
        case .kingsCup: NavigationLink(value: KingsCupRoute()) { content }.buttonStyle(.plain)
        case .gulfCupWeb: Button { saiOpenWeb("/gulf-cup") } label: { content }.buttonStyle(.plain)
        }
    }
}

// MARK: - Team

/// فريق سبق الذكي: الزملاء الرقميون بأسمائهم، وهيئة التحرير في المركز. أي فشل في الجلب يُسقط القسم.
private struct SAITeam: View {
    let team: APIAITeam

    var body: some View {
        let teamCount = team.counters?.teamCount ?? team.team.count
        VStack(spacing: 0) {
            SAIEyebrow(text: "داخل عقل سبق").saiReveal()
            SAIH2(text: "فريق سبق الذكي").saiReveal(1)
            SAISub(text: "أول غرفة أخبار سعودية تعرّفك بزملائها الرقميين بأسمائهم وأدوارهم وأقسامهم — يعملون على مدار الساعة، وفي المركز دائمًا هيئة التحرير.")
                .multilineTextAlignment(.center)
                .saiReveal(2)

            VStack(spacing: 18) {
                core
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 18) {
                    ForEach(team.team) { m in mate(m) }
                }
            }
            .padding(.top, 50)
            .saiReveal(3)

            HStack(alignment: .top, spacing: 26) {
                if let ops = team.counters?.monthOps, ops > 0 {
                    footStat(AnyView(SAICountUp(value: Double(ops))), "عملًا هذا الشهر")
                }
                footStat(AnyView(Text(verbatim: "\(teamCount)").environment(\.layoutDirection, .leftToRight)), "زميلًا رقميًا")
                footStat(AnyView(Text(verbatim: "100%").environment(\.layoutDirection, .leftToRight)), "تحت إشراف بشري")
            }
            .padding(.top, 36)
            .saiReveal()

            Text("🛡 الإنسان يعتمد كل شيء — سياسة سبق للذكاء الاصطناعي")
                .font(SAI.font(13.5))
                .foregroundStyle(SAI.rgb(0xDCF1FE))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 18)
                .padding(.vertical, 8)
                .background(SAI.ai.opacity(0.07), in: Capsule())
                .overlay(Capsule().stroke(SAI.ai.opacity(0.35), lineWidth: 1))
                .padding(.top, 28)
                .saiReveal()
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, saiMargin)
        .padding(.vertical, 120)
    }

    private var core: some View {
        VStack(spacing: 2) {
            Text("هيئة التحرير").font(SAI.font(19, .bold)).foregroundStyle(SAI.human)
            Text("القرار الأخير").font(SAI.font(12.5)).foregroundStyle(SAI.rgb(0xB8F5DA))
        }
        .frame(width: 170, height: 170)
        .background(
            Circle().fill(SAI.void)
                .overlay(Circle().fill(RadialGradient(colors: [SAI.human.opacity(0.22), SAI.human.opacity(0.05)],
                                                      center: .center, startRadius: 0, endRadius: 60)))
        )
        .overlay(Circle().stroke(SAI.human.opacity(0.6), lineWidth: 1.5))
        .shadow(color: SAI.human.opacity(0.25), radius: 40)
        .accessibilityElement(children: .combine)
    }

    private func mate(_ m: APIAITeamMember) -> some View {
        VStack(spacing: 5) {
            ZStack {
                Circle().fill(SAI.rgb(0x0B1A2C))
                if let url = m.absoluteAvatarURL {
                    CachedAsyncImage(url: url, contentMode: .fill) { Color.clear }
                        .clipShape(Circle())
                }
            }
            .frame(width: 50, height: 50)
            .overlay(Circle().stroke(SAI.ai.opacity(0.5), lineWidth: 1.5))
            .shadow(color: SAI.ai.opacity(0.25), radius: 11)
            Text(m.nameAr)
                .font(SAI.font(13.5, .bold))
                .foregroundStyle(SAI.text)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(m.nameAr)، \(m.titleAr)، \(m.departmentAr)")
    }

    private func footStat(_ value: AnyView, _ label: String) -> some View {
        VStack(spacing: 2) {
            value.font(SAI.font(34, .semibold)).foregroundStyle(SAI.text).lineLimit(1).minimumScaleFactor(0.6)
            Text(label).font(SAI.font(14)).foregroundStyle(SAI.mute)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Live numbers

/// الأرقام الحية — أي فشل أو نقص بيانات يعرض الحقائق الثابتة بدلها.
private struct SAILiveNumbers: View {
    let stats: APIAIPublicStats?
    let team: APIAITeam?

    var body: some View {
        Group {
            if let stats { live(stats) } else { fallback }
        }
        .padding(.horizontal, saiMargin)
        .padding(.top, 130)
        .padding(.bottom, 110)
        .frame(maxWidth: .infinity)
        .background(alignment: .top) {
            Circle()
                .fill(RadialGradient(colors: [SAI.ai.opacity(0.15), .clear], center: .center, startRadius: 0, endRadius: 270))
                .frame(width: 900, height: 900)
                .offset(y: 30)
                .allowsHitTesting(false)
        }
        .clipped()
    }

    private var fallback: some View {
        VStack(spacing: 0) {
            SAIEyebrow(text: "الأرقام تتحدث").saiReveal()
            SAITwoColumnGrid(items: SAIStaticFacts.all) { f in
                VStack(alignment: .leading, spacing: 4) {
                    Text(verbatim: f.value).font(SAI.font(36, .bold)).foregroundStyle(SAI.ai)
                        .environment(\.layoutDirection, .leftToRight)
                    Text(f.label).font(SAI.font(14)).foregroundStyle(SAI.soft).lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 26)
            }
            .padding(.top, 50)
            .saiReveal(1)
        }
    }

    private struct Tile { let value: AnyView; let label: String }

    private func tiles(_ s: APIAIPublicStats) -> [Tile] {
        let commentsPct: Double? = s.comments.total > 0 ? (100 * s.comments.aiAnalyzed / s.comments.total).rounded() : nil
        let audio = s.audio?.totalMinutes ?? 0
        let radar = s.radar?.totalItems ?? 0
        let sports = s.sports?.totalOps ?? 0
        let monthOps = Double(team?.counters?.monthOps ?? 0)
        let all: [(AnyView, String, Bool)] = [
            (AnyView(SAICountUp(value: s.ai.successRate, decimals: 1, suffix: "%")), "معدل نجاح العمليات", true),
            (AnyView(SAICountUp(value: s.ai.totalTokens / 1_000_000, decimals: 1, suffix: "M")), "توكن معالج منذ الإطلاق", s.ai.totalTokens > 0),
            (AnyView(SAICountUp(value: commentsPct ?? 0, suffix: "%")), "تعليقات تُفحص آليًا", commentsPct != nil),
            (AnyView(SAICountUp(value: s.stories.total)), "قصة متابعة ذكية", true),
            (AnyView(SAICountUp(value: s.articles.todayPublished)), "خبرًا نُشر اليوم", true),
            (AnyView(SAICountUp(value: s.articles.totalPublished)), "خبرًا في الأرشيف", true),
            (AnyView(SAICountUp(value: audio)), "دقيقة صوت أُنتجت آليًا", audio > 0),
            (AnyView(SAICountUp(value: radar)), "مادة رصدها رادار المصادر", radar > 0),
            (AnyView(SAICountUp(value: sports)), "عملية في التغطيات الرياضية", sports > 0),
            (AnyView(SAICountUp(value: s.comments.aiAnalyzed)), "تعليقًا حلّله «حارس»", s.comments.aiAnalyzed > 0),
            (AnyView(SAICountUp(value: monthOps)), "عملًا للفريق هذا الشهر", monthOps > 0),
            (AnyView(SAICountUp(value: s.ai.todayOps)), "عملية اليوم حتى الآن", true),
        ]
        return all.filter(\.2).map { Tile(value: $0.0, label: $0.1) }
    }

    private func live(_ s: APIAIPublicStats) -> some View {
        let daily = s.dailySeries
        let dailyMax = max(1, daily.map(\.count).max() ?? 1)
        let rows: [(String, Double)] = s.ai.todayByDomain.map { d in
            [("رياضة", d.sports), ("تحرير", d.editorial), ("بصري", d.visual), ("صوت", d.audio)].sorted { $0.1 > $1.1 }
        } ?? []
        let domainTotal = max(1, rows.reduce(0) { $0 + $1.1 })

        return VStack(spacing: 0) {
            HStack(spacing: 8) {
                SAIBlinkDot(size: 7)
                Text("مباشر من قاعدة البيانات")
            }
            .font(SAI.font(13))
            .foregroundStyle(SAI.rgb(0x9EE6BF))
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .overlay(Capsule().stroke(SAI.human.opacity(0.35), lineWidth: 1))
            .saiReveal()

            SAICountUp(value: s.ai.totalOps)
                .font(SAI.font(66, .bold, relativeTo: .largeTitle))
                .foregroundStyle(LinearGradient(stops: [.init(color: .white, location: 0.2), .init(color: SAI.ai, location: 1.2)],
                                                startPoint: .top, endPoint: .bottom))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .padding(.top, 18)
                .saiReveal(1)

            Text("عملية ذكاء اصطناعي نفّذتها المنظومة" + (s.ai.sinceDate.map { " منذ \(SAIFormat.arabicDate($0, withYear: true))" } ?? ""))
                .font(SAI.font(22))
                .foregroundStyle(SAI.text)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 16)
                .saiReveal(2)
            Text("لا أرقام تقديرية ولا وهمية — كل رقم يُقرأ لحظة فتح الصفحة من أنظمة سبق، ويتحدّث تلقائيًا")
                .font(SAI.font(14))
                .foregroundStyle(SAI.mute)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
                .saiReveal(2)

            SAITwoColumnGrid(items: tiles(s)) { tile in
                VStack(spacing: 4) {
                    tile.value.font(SAI.font(30, .semibold)).foregroundStyle(SAI.text)
                        .lineLimit(1).minimumScaleFactor(0.6)
                    Text(tile.label).font(SAI.font(13.5)).foregroundStyle(SAI.mute)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 10)
                .padding(.vertical, 24)
                .accessibilityElement(children: .combine)
            }
            .padding(.top, 70)
            .saiReveal(3)

            if (!rows.isEmpty && s.ai.todayOps > 0) || daily.count >= 3 {
                VStack(alignment: .leading, spacing: 36) {
                    if !rows.isEmpty && s.ai.todayOps > 0 {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("عمليات اليوم حسب المجال").font(SAI.font(15, .semibold)).foregroundStyle(SAI.rgb(0xC3D0DE))
                                .padding(.bottom, 6)
                            ForEach(rows, id: \.0) { row in
                                HStack(spacing: 12) {
                                    Text(row.0).frame(width: 56, alignment: .leading)
                                    GeometryReader { g in
                                        ZStack(alignment: .leading) {
                                            Capsule().fill(Color.white.opacity(0.07))
                                            Capsule()
                                                .fill(LinearGradient(colors: [SAI.ai, SAI.ai2], startPoint: .leading, endPoint: .trailing))
                                                .frame(width: g.size.width * row.1 / domainTotal)
                                        }
                                    }
                                    .frame(height: 7)
                                    Text(verbatim: SAIFormat.number(row.1))
                                        .font(SAI.font(14, .semibold))
                                        .foregroundStyle(.white)
                                        .monospacedDigit()
                                        .frame(width: 60, alignment: .trailing)
                                }
                                .font(SAI.font(14))
                                .foregroundStyle(SAI.rgb(0xC3D0DE))
                                .accessibilityElement(children: .combine)
                            }
                        }
                    }
                    if daily.count >= 3 {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("النشاط اليومي — آخر \(daily.count) يومًا").font(SAI.font(15, .semibold))
                                .foregroundStyle(SAI.rgb(0xC3D0DE))
                                .padding(.bottom, 10)
                            // الأعمدة والتاريخ بالاتجاه الزمني من اليسار إلى اليمين كما في الويب (dir="ltr").
                            VStack(spacing: 8) {
                            HStack(alignment: .bottom, spacing: 7) {
                                ForEach(Array(daily.enumerated()), id: \.element.date) { i, d in
                                    let today = i == daily.count - 1
                                    UnevenRoundedRectangle(topLeadingRadius: 4, topTrailingRadius: 4)
                                        .fill(LinearGradient(colors: [today ? SAI.human : SAI.ai,
                                                                      (today ? SAI.human : SAI.ai).opacity(0.15)],
                                                             startPoint: .top, endPoint: .bottom))
                                        .frame(height: max(3, 130 * d.count / dailyMax))
                                        .frame(maxWidth: .infinity)
                                }
                            }
                            .frame(height: 130, alignment: .bottom)
                            .accessibilityElement()
                            .accessibilityLabel("رسم أعمدة لعمليات الذكاء الاصطناعي اليومية، الذروة \(SAIFormat.number(dailyMax))")
                            HStack {
                                Text(SAIFormat.arabicDate(daily[0].date))
                                Spacer()
                                Text("اليوم")
                            }
                            .font(SAI.font(11.5))
                            .foregroundStyle(SAI.rgb(0x6D8199))
                            }
                            .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 56)
                .saiReveal()
            }

            Text("آخر تحديث: \(SAIFormat.updatedAgo(s.generatedAt))")
                .font(SAI.font(13))
                .foregroundStyle(SAI.rgb(0x6D8199))
                .padding(.top, 30)
        }
    }
}

// MARK: - Governance

private struct SAIGovernance: View {
    /// «ما لن يفعله عقل سبق» — آليات مبرمجة فعلًا في المنظومة، لا وعود.
    static let items: [(title: String, body: [SAISpan])] = [
        ("يحلّ محل المحرر", [.strong("الذكاء يقترح، والإنسان يقرّر."), .plain(" المحرر يملك الإجازة والرد والتعديل، وسبق تتحمّل مسؤولية كل ما تنشره.")]),
        ("يتعثر بصمت", [.plain("ثلاثة إخفاقات متتالية تعزل النموذج وتحوّل المسار لبديله، ويُعاد فحصه آليًا كل خمس دقائق. وأي تدهور في مزوّد ذكاء "), .strong("يصل رئيس التحرير برسالة فورية"), .plain(".")]),
        ("يضيف رقمًا من عنده", [.plain("في التغطيات الرياضية: "), .strong("كل رقم في النص المولّد يجب أن يرد حرفيًا"), .plain(" في بيانات المباراة الرسمية.")]),
        ("يُخفي أن الصورة مولّدة", [.plain("كل صورة يولّدها الذكاء الاصطناعي تحمل داخل ملفها "), .strong("وسمًا معياريًا (IPTC)"), .plain(" يعلن أنها مولّدة خوارزميًا، ويُعاد كتابته بعد كل معالجة.")]),
        ("يعمل في الظل", [.plain("سجل تدقيق يفصل ما فعله "), .strong("إنسان"), .plain(" عمّا فعله "), .strong("النظام"), .plain(" عمّا فعله "), .strong("الذكاء الاصطناعي"), .plain(". وكل تغيير في إعدادات النماذج مقيّد: من غيّر، وماذا، ومتى.")]),
        ("ينفق بلا رقابة", [.plain("حدود إنفاق شهرية لكل مزوّد وكل خدمة، وتكلفة كل عملية تُقيَّد وتُراقب من لوحة موحّدة.")]),
        ("يحكم على التعليقات وحده", [.plain("قرارات المشرفين على التعليقات تعود أمثلةً "), .strong("تضبط بها الرقابة الذكية أحكامها التالية"), .plain(".")]),
        ("يسمح بتدريب الآلات على صحافتنا", [.plain("ملف"), .code("robots.txt"), .plain("يغلق الباب أمام زواحف تدريب النماذج — GPTBot وClaudeBot وCCBot وغيرها — ويبقيه مفتوحًا لمحركات البحث.")]),
        ("يترجم بدل أن يكتب", [.plain("أسلوب الدار وقواعد اللغة مكتوبة داخل كل نموذج توليد، وأسماء اللاعبين والملاعب والمدربين تُعرّب عبر طبقات تحقق بمراجعة تحريرية — فلا يصل القارئ حرف أجنبي.")]),
    ]

    var body: some View {
        VStack(spacing: 0) {
            SAIEyebrow(text: "الحوكمة", color: SAI.warn).saiReveal()
            SAIH2(text: "ما لن يفعله عقل سبق").saiReveal(1)

            VStack(spacing: 0) {
                ForEach(Self.items, id: \.title) { g in
                    VStack(alignment: .leading, spacing: 10) {
                        Text(SAI.rich([.strong("لن", SAI.warn, .semibold), .plain(" \(g.title)")], size: 22, base: SAI.text, baseWeight: .semibold))
                            .lineSpacing(3)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                        Text(SAI.rich(g.body, size: 16, base: SAI.soft))
                            .lineSpacing(7)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .multilineTextAlignment(.leading)
                    .padding(.vertical, 28)
                    .overlay(alignment: .top) { Rectangle().fill(SAI.faint).frame(height: 1) }
                    .saiReveal()
                }
            }
            .padding(.top, 64)
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, saiMargin)
        .padding(.vertical, 120)
        .background(
            LinearGradient(stops: [
                .init(color: SAI.void, location: 0), .init(color: SAI.deep, location: 0.25),
                .init(color: SAI.deep, location: 0.75), .init(color: SAI.void, location: 1),
            ], startPoint: .top, endPoint: .bottom)
        )
    }
}

// MARK: - Charter

private struct SAICharter: View {
    /// ميثاق سبق للذكاء الاصطناعي — ثماني مواد معتمدة من الإدارة.
    static let articles: [(no: String, title: String, desc: String)] = [
        ("1", "الإنسان يقرّر", "كل مادة تمرّ بمراجعة بشرية قبل النشر، أو تصدر موسومةً كمحتوى آلي تحت بوابات جودة مبرمجة وإشراف تحريري."),
        ("2", "لا اختلاق", "النموذج يصوغ من بيانات ومصادر موثّقة فقط، ولا يضيف معلومة من عنده."),
        ("3", "الشفافية", "نُبيّن للقارئ دور الذكاء حيث يكون جوهريًا في إنتاج المادة."),
        ("4", "الرأي للإنسان", "الذكاء لا يكتب رأيًا ولا يتبنّى موقفًا؛ الموقف لكتّابنا."),
        ("5", "مسؤوليتنا كاملة", "سبق تتحمّل مسؤولية كل ما تنشره، أيًّا كانت الأداة."),
        ("6", "خصوصية القارئ", "بيانات القرّاء تُستخدم لخدمتهم، ولا شيء غير ذلك."),
        ("7", "قياس دائم", "جودة كل نموذج وتكلفته تُراقبان عبر بوابة موحّدة، والأفضل يبقى."),
        ("8", "عربيةٌ أولًا", "نُطوّع النماذج للغة العربية وسياقها السعودي — لا العكس."),
    ]

    var body: some View {
        VStack(spacing: 0) {
            SAIEyebrow(text: "الميثاق").saiReveal()
            SAIH2(text: "ميثاق سبق للذكاء الاصطناعي").multilineTextAlignment(.center).saiReveal(1)
            SAISub(text: "ثماني مواد تحكم كل نموذج يعمل في غرفة أخبارنا.").multilineTextAlignment(.center).saiReveal(2)

            SAITwoColumnGrid(items: Self.articles) { art in
                VStack(alignment: .leading, spacing: 0) {
                    SAIOutlinedText(text: art.no, size: 46, color: UIColor(SAI.ai.opacity(0.6)))
                    Text(art.title).font(SAI.font(18, .bold)).foregroundStyle(SAI.text)
                        .padding(.top, 12).padding(.bottom, 8)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(art.desc).font(SAI.font(14)).foregroundStyle(SAI.mute).lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 18)
                .padding(.top, 28)
                .padding(.bottom, 30)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("المادة \(art.no): \(art.title). \(art.desc)")
                .saiReveal()
            }
            .padding(.top, 56)
        }
        .padding(.horizontal, saiMargin)
        .padding(.vertical, 110)
    }
}

// MARK: - Finale

/// الاصطفاف الوطني — عام الذكاء الاصطناعي 2026 بلغة وقائع لا شعارات.
private struct SAIFinale: View {
    private enum Door { case web(String), moments }
    private static let doors: [(title: String, desc: String, cta: String, door: Door)] = [
        ("استوديو البرومبت", "أداة مجانية لكل زائر لتحسين صياغة أوامره للذكاء الاصطناعي — مساهمة في رفع الوعي التقني.", "جرّب الأداة ←", .web("/prompt-studio")),
        ("المباريات الآن", "تغطية حية وتعريب فوري لكل مباراة.", "ادخل ←", .web("/sports/live")),
        ("لحظة بلحظة", "الأحداث كما يرصدها العقل ويجيزها المحرر.", "ادخل ←", .moments),
        // علامة RLM تبقي ترتيب السطر من اليمين رغم أنه يبدأ بكلمة إنجليزية، كما في الصفحة.
        ("سبق بثلاث لغات", "العقل نفسه بالإنجليزية والأردية.", "\u{200F}English · اردو ←", .web("/en")),
    ]

    var body: some View {
        VStack(spacing: 0) {
            SAIOutlinedText(text: "2026", size: 90, color: UIColor(SAI.ai.opacity(0.45)))
                .accessibilityHidden(true)
                .saiReveal()
            VStack(spacing: 4) {
                Text("عام الذكاء الاصطناعي.").foregroundStyle(SAI.text)
                Text("في سبق، بدأ قبل ذلك.").foregroundStyle(SAI.ai)
            }
            .font(SAI.font(30, .bold, relativeTo: .title))
            .multilineTextAlignment(.center)
            .padding(.top, -30)
            .padding(.bottom, 16)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            .saiReveal(1)
            SAISub(text: "اعتمدت المملكة 2026 عامًا للذكاء الاصطناعي. منظومة إعلامية سعودية تخدم أهداف الاستراتيجية الوطنية للبيانات والذكاء الاصطناعي — بقرار بشري في كل مادة.")
                .multilineTextAlignment(.center)
                .saiReveal(2)

            VStack(spacing: 14) {
                ForEach(Array(Self.doors.enumerated()), id: \.element.title) { i, d in
                    door(d.title, d.desc, d.cta, d.door).saiReveal(i)
                }
            }
            .padding(.top, 60)
        }
        .padding(.horizontal, saiMargin)
        .padding(.top, 130)
        .padding(.bottom, 120)
    }

    @ViewBuilder
    private func door(_ title: String, _ desc: String, _ cta: String, _ target: Door) -> some View {
        let card = VStack(alignment: .leading, spacing: 8) {
            Text(title).font(SAI.font(18, .bold)).foregroundStyle(SAI.text)
            Text(desc).font(SAI.font(14)).foregroundStyle(SAI.mute).lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
            Text(cta).font(SAI.font(14)).foregroundStyle(SAI.ai).padding(.top, 6)
        }
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(24)
        .background(
            LinearGradient(colors: [Color.white.opacity(0.04), Color.white.opacity(0.01)], startPoint: .top, endPoint: .bottom),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(SAI.faint, lineWidth: 1))
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        switch target {
        case .moments:
            NavigationLink(value: MomentByMomentRoute()) { card }.buttonStyle(.plain)
        case .web(let path):
            Button { saiOpenWeb(path) } label: { card }.buttonStyle(.plain)
        }
    }
}
