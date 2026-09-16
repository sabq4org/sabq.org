import SwiftUI

// MARK: - «الاقتصاد بالأرقام» — نقل صفحة /economy (EconomyLive.tsx)
//
// ترتيب الويب: الهيرو ← شريط الأرقام (أسبوعي + 5 عملات + 5 مؤشرات) ← ليلة القرار/
// القرار القادم ← إنفاق الأسبوع ← السعوديون في شهر ← من البنك المركزي.
// قسم «أعمال» يبقى للأخبار فقط؛ الأرقام هنا وفي بلوك الرئيسية لا غير.

struct EconomyView: View {
    private let store = EconomyStore.shared

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 28) {
                hero

                if let s = store.snapshot, !s.indicators.isEmpty {
                    ticker(s)
                    decisionLine(s)
                    if store.weekly != nil || s.weekly != nil {
                        EconomyWeeklyModule(story: store.weekly, summary: s.weekly)
                    }
                    if let m = store.monthly {
                        EconomyMonthlyModule(story: m)
                    } else if let m = s.monthly {
                        EconomyMonthlyModule(summary: m)
                    }
                    samaNews(s.samaNews)
                } else if store.isLoadingSnapshot {
                    SkeletonBox(height: 112, radius: 16)
                    SkeletonBox(height: 220, radius: 16)
                } else {
                    Text("البيانات قيد التحميل من البنك المركزي — عُد بعد دقائق.")
                        .font(SabqFonts.app(size: 14, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .navigationTitle("الاقتصاد بالأرقام")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.refreshAll() }
        .task {
            await store.loadSnapshotIfNeeded(maxAge: 60)
            await store.loadStoriesIfNeeded()
        }
    }

    // MARK: الرأس

    private var hero: some View {
        VStack(spacing: 14) {
            Image(systemName: "building.columns")
                .font(SabqFonts.app(size: 24, weight: .semibold))
                .foregroundStyle(SabqTheme.primaryEnd)
                .frame(width: 56, height: 56)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(SabqTheme.primaryEnd.opacity(0.10)))

            VStack(spacing: 4) {
                Text("الاقتصاد السعودي بالأرقام…")
                    .foregroundStyle(SabqTheme.ink)
                Text("من البنك المركزي إلى شاشتك")
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
            .font(SabqFonts.app(size: 26, weight: .heavy))
            .multilineTextAlignment(.center)

            Text("إنفاق الأسبوع، السعوديون في شهر، أسعار الصرف، الفائدة والتضخم — أرقام رسمية تتحدث تلقائيًا لحظة صدورها من البنك المركزي السعودي.")
                .font(SabqFonts.app(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.ink.opacity(0.7))
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)

            NavigationLink {
                CategoryArticlesView(category: .business)
            } label: {
                HStack(spacing: 6) {
                    Text("أخبار الأعمال")
                        .font(SabqFonts.app(size: 13, weight: .bold))
                    Image(systemName: "chevron.left")
                        .font(SabqFonts.app(size: 11, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .padding(.vertical, 9)
                .background(Capsule(style: .continuous).fill(SabqTheme.primaryEnd))
            }
            .buttonStyle(.plain)

            HStack(spacing: 6) {
                Image(systemName: "dot.radiowaves.left.and.right")
                    .foregroundStyle(EconomyTone.up)
                Text(liveLine)
            }
            .font(SabqFonts.app(size: 11, weight: .regular))
            .foregroundStyle(SabqTheme.tertiaryInk)
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 6)
    }

    /// «آخر بيان» = آخر تاريخ صدر من ساما، لا وقت فحصنا (قاعدة a1f8edd).
    private var liveLine: String {
        var line = "يتحدث تلقائيًا فور صدور بيانات البنك المركزي"
        if let latest = store.snapshot?.latestAsOf {
            line += " · آخر بيان: \(EconomyFormat.fmtDateAr(latest))"
        }
        return line
    }

    // MARK: شريط الأرقام (11 بطاقة)

    private struct TickerCard: Identifiable {
        let id: String
        let label: String
        let value: String
        let unit: String
        let sub: String
        let change: Double?
        let digits: Int
        let suffix: String
    }

    private func tickerCards(_ s: EconomySnapshot) -> [TickerCard] {
        var cards: [TickerCard] = []
        if let w = s.weekly {
            cards.append(TickerCard(id: "weekly", label: "إنفاق الأسبوع", value: EconomyFormat.fmtSar(w.totalValue), unit: "ريال",
                                    sub: "نقاط البيع · \(w.weekLabelAr)", change: w.totalChangePct, digits: 1, suffix: ""))
        }
        for code in EconomyFxRate.tickerCodes {
            if let f = s.fx.first(where: { $0.code == code }) {
                cards.append(TickerCard(id: "fx-\(code)", label: f.nameAr, value: EconomyFormat.fmtRate(f.rate), unit: "ريال",
                                        sub: EconomyFormat.fmtDateAr(f.date, withYear: false), change: f.changePct, digits: 2, suffix: ""))
            }
        }
        for key in EconomyIndicator.order {
            if let i = s.indicators.first(where: { $0.key == key }) {
                let delta: Double? = i.previousValue.map { i.value - $0 }
                cards.append(TickerCard(id: "ind-\(key)", label: i.shortAr, value: EconomyFormat.trimNum(i.value, 2), unit: "%",
                                        sub: EconomyFormat.indicatorSub(i), change: delta, digits: 2, suffix: " نقطة"))
            }
        }
        return cards
    }

    private func ticker(_ s: EconomySnapshot) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(tickerCards(s)) { c in
                VStack(alignment: .leading, spacing: 4) {
                    Text(c.label)
                        .font(SabqFonts.app(size: 11, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineLimit(1)
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(c.value)
                            .font(SabqFonts.app(size: 18, weight: .heavy))
                            .foregroundStyle(SabqTheme.ink)
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Text(c.unit)
                            .font(SabqFonts.app(size: 11, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    HStack {
                        Text(c.sub)
                            .font(SabqFonts.app(size: 10, weight: .regular))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Spacer(minLength: 0)
                        EconomyChangeChip(value: c.change, digits: c.digits, suffix: c.suffix, hideEmpty: true)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(SabqTheme.surface)
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
                )
                .accessibilityElement(children: .combine)
            }
        }
        .accessibilityLabel("الاقتصاد بالأرقام")
    }

    // MARK: ليلة القرار / القرار القادم

    @ViewBuilder
    private func decisionLine(_ s: EconomySnapshot) -> some View {
        if let repo = s.indicators.first(where: { $0.key == "repo" }), let d = s.decision {
            if d.isDecisionNight {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("قرار الفائدة الليلة")
                            .font(SabqFonts.app(size: 15, weight: .bold))
                            .foregroundStyle(SabqTheme.ink)
                        Text("نتابع البنك المركزي لحظة بلحظة — الريبو الآن \(repo.valueText)، وسيتحدث هنا فور الإعلان.")
                            .font(SabqFonts.app(size: 12, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    Text("رصد كل 60 ثانية")
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                }
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(SabqTheme.primaryEnd.opacity(0.05))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SabqTheme.primaryEnd.opacity(0.4), lineWidth: 1))
                )
            } else if let next = d.nextDecisionDate {
                Text("قرار الفائدة القادم: \(EconomyFormat.fmtDateAr(next)) — الريبو ثابت عند \(repo.valueText) منذ \(EconomyFormat.fmtDateAr(repo.asOf)). المصدر: البنك المركزي السعودي.")
                    .font(SabqFonts.app(size: 11, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: من البنك المركزي

    @ViewBuilder
    private func samaNews(_ items: [EconomySamaNews]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text("من البنك المركزي")
                        .font(SabqFonts.app(size: 18, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                    Spacer(minLength: 0)
                    Text("إعلانات ساما الرسمية")
                        .font(SabqFonts.app(size: 11, weight: .regular))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                VStack(spacing: 0) {
                    ForEach(Array(items.prefix(5).enumerated()), id: \.element.stableId) { index, n in
                        if index > 0 { Divider().overlay(SabqTheme.outline) }
                        if let url = URL(string: n.url) {
                            // روابط sama.gov.sa تُفتح في المتصفح — ليست أخبار سبق.
                            Link(destination: url) {
                                HStack(alignment: .top, spacing: 10) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(n.title)
                                            .font(SabqFonts.app(size: 13, weight: .semibold))
                                            .foregroundStyle(SabqTheme.ink)
                                            .multilineTextAlignment(.leading)
                                            .fixedSize(horizontal: false, vertical: true)
                                        Text(EconomyFormat.fmtDateAr(n.publishedAt))
                                            .font(SabqFonts.app(size: 11, weight: .regular))
                                            .foregroundStyle(SabqTheme.tertiaryInk)
                                    }
                                    Spacer(minLength: 0)
                                    Image(systemName: "arrow.up.left.square")
                                        .font(SabqFonts.app(size: 12, weight: .regular))
                                        .foregroundStyle(SabqTheme.tertiaryInk)
                                }
                                .padding(.vertical, 10)
                            }
                        }
                    }
                }
                .padding(.horizontal, 14)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(SabqTheme.surface)
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
                )
            }
        }
    }
}

// MARK: - رأس قسم مشترك

private struct EconomySectionHead: View {
    let title: String
    var description: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(SabqFonts.app(size: 18, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
            if let description {
                Text(description)
                    .font(SabqFonts.app(size: 12, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private func economyCard<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 8) { content() }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(SabqTheme.surface)
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
        )
}

// MARK: - وحدة إنفاق الأسبوع (WeeklySpendingModule.tsx)

struct EconomyWeeklyModule: View {
    let story: EconomyWeeklyStory?
    let summary: EconomyWeeklySummary?

    private var weekLabel: String { story?.weekLabelAr ?? summary?.weekLabelAr ?? "" }
    private var ingestedAt: String? { story?.ingestedAt ?? summary?.ingestedAt }
    private var kpis: [EconomyKpi] { story?.kpis ?? summary?.kpis ?? [] }
    private var stories: [EconomyStoryCard] { story?.stories ?? summary?.stories ?? [] }
    private var headline: String { story?.lead.headline ?? summary?.headline ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // (أ) البطاقة القائدة
            economyCard {
                HStack(spacing: 8) {
                    Text("إنفاق الأسبوع · نقاط البيع")
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                    if EconomyFormat.isFresh(ingestedAt) { EconomyNewBadge(label: "تقرير جديد") }
                }
                Text(headline)
                    .font(SabqFonts.app(size: 20, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let intro = story?.lead.intro, !intro.isEmpty {
                    Text(intro)
                        .font(SabqFonts.app(size: 13, weight: .regular))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text("الأسبوع \(weekLabel) · المصدر: البنك المركزي السعودي — تقرير عمليات نقاط البيع الأسبوعي")
                    .font(SabqFonts.app(size: 11, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // (ب) المؤشرات الأربعة
            if !kpis.isEmpty {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(kpis) { k in kpiCard(k) }
                }
            }

            // (ج) أرقام الأسبوع
            if !stories.isEmpty {
                EconomySectionHead(title: "أرقام الأسبوع", description: "قصص يستخرجها النظام من الجدولين تلقائيًا — كل بطاقة عنوان خبر جاهز.")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(stories.prefix(6)) { st in storyCard(st) }
                }
            }

            if let story {
                // (د) القطاعات
                EconomySectionHead(title: "أين ذهب الإنفاق؟ — القطاعات", description: "القطاعات الرئيسية بخط داكن وفروعها تحتها.")
                sectorsList(story)

                // (هـ) مسار أربعة أسابيع — الزمن في RTL يجري من اليمين إلى اليسار
                EconomySectionHead(title: "إجمالي الإنفاق الأسبوعي عبر أربعة أسابيع (ريال)")
                EconomyWeeksChart(values: story.totals.series, labels: story.weeks)
                    .frame(height: 170)

                // (و) توزيع المدن
                EconomySectionHead(title: "توزيع المدن", description: "حصة كل مدينة من إجمالي الإنفاق، ثم أبرز المدن الصاعدة والهابطة.")
                citiesShare(story)
                moversLists(story)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("إنفاق السعوديين هذا الأسبوع")
    }

    private func kpiValue(_ k: EconomyKpi) -> String {
        switch k.key {
        case "total": return EconomyFormat.fmtSar(k.value)
        case "count": return EconomyFormat.fmtCount(k.value)
        case "avgTicket": return EconomyFormat.trimNum(k.value, 1)
        case "vs4w": return "\(k.value >= 0 ? "+" : "")\(EconomyFormat.trimNum(k.value, 1))%"
        default: return EconomyFormat.trimNum(k.value, 1)
        }
    }

    private func kpiCard(_ k: EconomyKpi) -> some View {
        economyCard {
            Text(k.labelAr)
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(kpiValue(k))
                    .font(SabqFonts.app(size: 18, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                    .monospacedDigit()
                    .environment(\.layoutDirection, k.key == "vs4w" ? .leftToRight : .rightToLeft)
                if k.key != "vs4w" {
                    Text(k.unitAr)
                        .font(SabqFonts.app(size: 11, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
            }
            HStack(alignment: .center, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    EconomyChangeChip(value: k.changePct, hideEmpty: true)
                    if let note = k.noteAr {
                        Text(note)
                            .font(SabqFonts.app(size: 10, weight: .regular))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
                if k.key != "vs4w", k.series.count >= 2 {
                    EconomySparkline(values: k.series, tint: (k.changePct ?? 0) >= 0 ? EconomyTone.up : EconomyTone.down)
                        .frame(width: 72, height: 26)
                }
            }
        }
    }

    private func storyCard(_ st: EconomyStoryCard) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(st.cardTitle)
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
            Text(st.headline)
                .font(SabqFonts.app(size: 14, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(st.figure)
                .font(SabqFonts.app(size: 18, weight: .heavy))
                .foregroundStyle(EconomyTone.color(st.tone) ?? SabqTheme.ink)
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(st.detailAr)
                .font(SabqFonts.app(size: 12, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .padding(.top, 3)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .economyAccentCard(tone: EconomyTone.color(st.tone) ?? SabqTheme.primaryEnd)
    }

    private func sectorsList(_ story: EconomyWeeklyStory) -> some View {
        let leafMax = story.sectors.filter { !$0.isGroup }.map { abs($0.value) }.max() ?? 1
        return VStack(spacing: 0) {
            ForEach(Array(story.sectors.enumerated()), id: \.element.id) { index, s in
                if index > 0 { Divider().overlay(SabqTheme.outline.opacity(0.6)) }
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(s.isGroup ? s.ar : "↳ \(s.ar)")
                            .font(SabqFonts.app(size: 13, weight: s.isGroup ? .bold : .regular))
                            .foregroundStyle(s.isGroup ? SabqTheme.ink : SabqTheme.secondaryInk)
                            .padding(.leading, s.isGroup ? 0 : 12)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        EconomyChangeChip(value: s.changePct, hideEmpty: true)
                    }
                    HStack(spacing: 8) {
                        GeometryReader { geo in
                            // يمتد من اليمين إلى اليسار
                            HStack {
                                Spacer(minLength: 0)
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(SabqTheme.primaryEnd.opacity(s.isGroup ? 0.9 : 0.6))
                                    .frame(width: max(2, geo.size.width * CGFloat(min(1, abs(s.value) / max(leafMax, 1)))))
                            }
                            .environment(\.layoutDirection, .leftToRight)
                        }
                        .frame(height: 6)
                        Text("\(EconomyFormat.fmtSar(s.value)) ريال")
                            .font(SabqFonts.app(size: 11, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .monospacedDigit()
                            .frame(width: 96, alignment: .leading)
                    }
                }
                .padding(.vertical, 8)
            }
        }
        .padding(.horizontal, 14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(SabqTheme.surface)
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
        )
    }

    private static let shareOpacities: [Double] = [1, 0.8, 0.62, 0.46, 0.34, 0.24]

    private func citiesShare(_ story: EconomyWeeklyStory) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            GeometryReader { geo in
                HStack(spacing: 1) {
                    ForEach(Array(story.citiesShareTop.prefix(6).enumerated()), id: \.element.id) { i, c in
                        let w = geo.size.width * CGFloat(max(0, c.share) / 100)
                        ZStack {
                            Rectangle().fill(SabqTheme.primaryEnd.opacity(Self.shareOpacities[min(i, 5)]))
                            if c.share > 6 {
                                Text(c.ar)
                                    .font(SabqFonts.app(size: 10, weight: .semibold))
                                    .foregroundStyle(i < 2 ? .white : SabqTheme.ink)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                            }
                        }
                        .frame(width: max(1, w))
                    }
                    ZStack {
                        Rectangle().fill(SabqTheme.outline.opacity(0.6))
                        Text("بقية المدن \(EconomyFormat.trimNum(story.otherCitiesShare, 0))%")
                            .font(SabqFonts.app(size: 10, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 32)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .accessibilityLabel("حصص المدن الست الكبرى من الإنفاق")

            FlowLayout(spacing: 8) {
                ForEach(Array(story.citiesShareTop.prefix(6).enumerated()), id: \.element.id) { i, c in
                    HStack(spacing: 5) {
                        Circle().fill(SabqTheme.primaryEnd.opacity(Self.shareOpacities[min(i, 5)])).frame(width: 8, height: 8)
                        Text("\(c.ar) \(EconomyFormat.fmtPct(c.share))")
                            .font(SabqFonts.app(size: 11, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .monospacedDigit()
                    }
                }
            }
        }
    }

    private func moversLists(_ story: EconomyWeeklyStory) -> some View {
        HStack(alignment: .top, spacing: 10) {
            moverList(title: "المدن الصاعدة هذا الأسبوع", items: story.risers)
            moverList(title: "المدن الهابطة هذا الأسبوع", items: story.fallers)
        }
    }

    private func moverList(title: String, items: [EconomyMover]) -> some View {
        economyCard {
            Text(title)
                .font(SabqFonts.app(size: 12, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
            ForEach(items.prefix(7)) { m in
                HStack {
                    Text(m.ar)
                        .font(SabqFonts.app(size: 12, weight: .regular))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    EconomyChangeChip(value: m.changePct)
                }
            }
        }
    }
}

/// مسار أربعة أسابيع: مساحة متدرجة + قيم فوق النقاط + تسميات الأسابيع تحتها؛ الأقدم يمينًا.
struct EconomyWeeksChart: View {
    let values: [Double]
    let labels: [String]

    var body: some View {
        VStack(spacing: 6) {
            GeometryReader { geo in
                let pts = points(in: geo.size)
                ZStack {
                    if pts.count >= 2 {
                        Path { p in
                            p.move(to: CGPoint(x: pts[0].x, y: geo.size.height))
                            for pt in pts { p.addLine(to: pt) }
                            p.addLine(to: CGPoint(x: pts[pts.count - 1].x, y: geo.size.height))
                            p.closeSubpath()
                        }
                        .fill(LinearGradient(colors: [SabqTheme.primaryEnd.opacity(0.25), SabqTheme.primaryEnd.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                        Path { p in
                            p.move(to: pts[0])
                            for pt in pts.dropFirst() { p.addLine(to: pt) }
                        }
                        .stroke(SabqTheme.primaryEnd, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                        ForEach(Array(pts.enumerated()), id: \.offset) { i, pt in
                            Circle().fill(SabqTheme.primaryEnd).frame(width: 7, height: 7).position(pt)
                            Text(EconomyFormat.fmtSar(values[i]))
                                .font(SabqFonts.app(size: 10, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)
                                .monospacedDigit()
                                .position(x: pt.x, y: max(8, pt.y - 14))
                        }
                    }
                }
            }
            HStack {
                ForEach(Array(labels.enumerated()), id: \.offset) { _, l in
                    Text(l)
                        .font(SabqFonts.app(size: 9, weight: .regular))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(SabqTheme.surface)
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
        )
    }

    private func points(in size: CGSize) -> [CGPoint] {
        let v = values.filter(\.isFinite)
        guard v.count >= 2 else { return [] }
        let minV = v.min()!, maxV = v.max()!
        let span = max(maxV - minV, 0.000001)
        let inset: CGFloat = 36
        let stepX = (size.width - inset * 2) / CGFloat(v.count - 1)
        return v.enumerated().map { i, val in
            CGPoint(x: size.width - inset - CGFloat(i) * stepX,
                    y: size.height - 8 - CGFloat((val - minV) / span) * (size.height - 40))
        }
    }
}

// MARK: - وحدة «السعوديون في شهر» (MonthlyModule.tsx)

struct EconomyMonthlyModule: View {
    private let monthLabel: String
    private let headline: String
    private let intro: String?
    private let cards: [EconomyMonthlyCard]
    private let trackers: [EconomyTracker]
    private let ingestedAt: String?

    init(story: EconomyMonthlyStory) {
        monthLabel = story.monthLabelAr
        headline = story.lead.headline
        intro = story.lead.intro
        cards = story.cards
        trackers = story.trackers
        ingestedAt = story.ingestedAt
    }

    /// من اللقطة فقط (بلا سلاسل) عندما يتأخر endpoint النشرة الكاملة.
    init(summary: EconomyMonthlySummary) {
        monthLabel = summary.monthLabelAr
        headline = summary.headline
        intro = nil
        cards = summary.cards
        trackers = []
        ingestedAt = summary.ingestedAt
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            economyCard {
                HStack(spacing: 8) {
                    Text("السعوديون في \(monthLabel) · النشرة الإحصائية الشهرية")
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    if EconomyFormat.isFresh(ingestedAt) { EconomyNewBadge(label: "نشرة جديدة") }
                }
                Text(headline)
                    .font(SabqFonts.app(size: 20, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let intro, !intro.isEmpty {
                    Text(intro)
                        .font(SabqFonts.app(size: 13, weight: .regular))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text("المصدر: البنك المركزي السعودي — النشرة الإحصائية الشهرية، \(monthLabel)")
                    .font(SabqFonts.app(size: 11, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(cards) { card in EconomyMonthlyCardView(card: card) }
            }

            if !trackers.isEmpty {
                EconomySectionHead(title: "مؤشرات تتراكم شهرًا بعد شهر", description: "آخر 13 شهرًا — تُحدَّث تلقائيًا مع كل نشرة.")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(trackers) { t in
                        economyCard {
                            Text(t.titleAr)
                                .font(SabqFonts.app(size: 11, weight: .medium))
                                .foregroundStyle(SabqTheme.secondaryInk)
                                .lineLimit(2)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(t.series.last.map { EconomyFormat.fmtUnit($0.value, unit: t.unit) } ?? "—")
                                .font(SabqFonts.app(size: 16, weight: .heavy))
                                .foregroundStyle(SabqTheme.ink)
                                .monospacedDigit()
                            EconomyMiniArea(values: t.series.map(\.value), labels: t.series.map { EconomyFormat.fmtMonthShort($0.period) })
                                .frame(height: 80)
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("السعوديون في \(monthLabel)")
    }
}
