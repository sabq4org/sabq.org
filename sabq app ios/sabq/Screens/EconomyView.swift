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
            VStack(alignment: .leading, spacing: SabqLayout.sectionGap) {
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
                    SkeletonBox(height: 112, radius: SabqRadius.medium)
                    SkeletonBox(height: 220, radius: SabqRadius.medium)
                } else {
                    Text("البيانات قيد التحميل من البنك المركزي — عُد بعد دقائق.")
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, SabqLayout.space40)
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, SabqLayout.space32)
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
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            Image(systemName: "building.columns")
                .font(SabqFonts.app(size: 22, weight: .regular))
                .foregroundStyle(SabqTheme.primary)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 0) {
                Text("الاقتصاد السعودي بالأرقام…")
                    .foregroundStyle(SabqTheme.textPrimary)
                Text("من البنك المركزي إلى شاشتك")
                    .foregroundStyle(SabqTheme.primary)
            }
            .sabqText(SabqType.articleTitle)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            Text("إنفاق الأسبوع، السعوديون في شهر، أسعار الصرف، الفائدة والتضخم — أرقام رسمية تتحدث تلقائيًا لحظة صدورها من البنك المركزي السعودي.")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            NavigationLink {
                CategoryArticlesView(category: .business)
            } label: {
                HStack(spacing: SabqLayout.space4) {
                    Text("أخبار الأعمال")
                        .font(SabqType.button.font)
                    Image(systemName: "chevron.left")
                        .font(SabqType.tag.font)
                }
                .foregroundStyle(SabqTheme.primary)
                .padding(.horizontal, SabqLayout.space16)
                .frame(minHeight: SabqLayout.controlHeight)
                .overlay(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .stroke(SabqTheme.outline, lineWidth: 1))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space4) {
                Image(systemName: "dot.radiowaves.left.and.right")
                    .foregroundStyle(EconomyTone.up)
                    .accessibilityHidden(true)
                Text(liveLine)
            }
            .font(SabqType.meta.font)
            .foregroundStyle(SabqTheme.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
        LazyVGrid(columns: SabqGrid.adaptive(spacing: SabqLayout.space8), spacing: SabqLayout.space8) {
            ForEach(tickerCards(s)) { c in
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text(c.label)
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(1)
                    HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space4) {
                        Text(c.value)
                            .font(SabqFonts.app(size: 18, weight: .semibold))
                            .foregroundStyle(SabqTheme.textPrimary)
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Text(c.unit)
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                    HStack {
                        Text(c.sub)
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Spacer(minLength: 0)
                        EconomyChangeChip(value: c.change, digits: c.digits, suffix: c.suffix, hideEmpty: true)
                    }
                }
                .padding(SabqLayout.space12)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
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
                HStack(alignment: .top, spacing: SabqLayout.space12) {
                    VStack(alignment: .leading, spacing: SabqLayout.space4) {
                        Text("قرار الفائدة الليلة")
                            .font(SabqType.rowTitle.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                        Text("نتابع البنك المركزي لحظة بلحظة — الريبو الآن \(repo.valueText)، وسيتحدث هنا فور الإعلان.")
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    Text("رصد كل 60 ثانية")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.primary)
                }
                .padding(SabqLayout.space16)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            } else if let next = d.nextDecisionDate {
                Text("قرار الفائدة القادم: \(EconomyFormat.fmtDateAr(next)) — الريبو ثابت عند \(repo.valueText) منذ \(EconomyFormat.fmtDateAr(repo.asOf)). المصدر: البنك المركزي السعودي.")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: من البنك المركزي

    @ViewBuilder
    private func samaNews(_ items: [EconomySamaNews]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                HStack(alignment: .firstTextBaseline) {
                    Text("من البنك المركزي")
                        .sabqText(SabqType.sectionHeading)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 0)
                    Text("إعلانات ساما الرسمية")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
                VStack(spacing: 0) {
                    ForEach(Array(items.prefix(5).enumerated()), id: \.element.stableId) { index, n in
                        if index > 0 { Rectangle().fill(SabqTheme.separator).frame(height: 1) }
                        if let url = URL(string: n.url) {
                            // روابط sama.gov.sa تُفتح في المتصفح — ليست أخبار سبق.
                            Link(destination: url) {
                                HStack(alignment: .top, spacing: SabqLayout.space12) {
                                    VStack(alignment: .leading, spacing: SabqLayout.space8) {
                                        Text(n.title)
                                            .sabqText(SabqType.rowTitle)
                                            .foregroundStyle(SabqTheme.textPrimary)
                                            .multilineTextAlignment(.leading)
                                            .fixedSize(horizontal: false, vertical: true)
                                        Text(EconomyFormat.fmtDateAr(n.publishedAt))
                                            .font(SabqType.meta.font)
                                            .foregroundStyle(SabqTheme.textTertiary)
                                    }
                                    Spacer(minLength: 0)
                                    Image(systemName: "arrow.up.left.square")
                                        .font(SabqType.meta.font)
                                        .foregroundStyle(SabqTheme.textTertiary)
                                        .accessibilityHidden(true)
                                }
                                .padding(.vertical, SabqLayout.rowPadding)
                                .contentShape(Rectangle())
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - رأس قسم مشترك

private struct EconomySectionHead: View {
    let title: String
    var description: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            Text(title)
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
                .fixedSize(horizontal: false, vertical: true)
            if let description {
                Text(description)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// بلوك هادئ: تعبئة رمادية خفيفة بزوايا 12 بلا حد.
private func economyCard<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: SabqLayout.space8) { content() }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
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
        VStack(alignment: .leading, spacing: SabqLayout.space24) {
            // (أ) البطاقة القائدة
            economyCard {
                HStack(spacing: SabqLayout.space8) {
                    Text("إنفاق الأسبوع · نقاط البيع")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.primary)
                    if EconomyFormat.isFresh(ingestedAt) { EconomyNewBadge(label: "تقرير جديد") }
                }
                Text(headline)
                    .sabqText(SabqType.leadTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if let intro = story?.lead.intro, !intro.isEmpty {
                    Text(intro)
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text("الأسبوع \(weekLabel) · المصدر: البنك المركزي السعودي — تقرير عمليات نقاط البيع الأسبوعي")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // (ب) المؤشرات الأربعة
            if !kpis.isEmpty {
                LazyVGrid(columns: SabqGrid.adaptive(spacing: SabqLayout.space8), spacing: SabqLayout.space8) {
                    ForEach(kpis) { k in kpiCard(k) }
                }
            }

            // (ج) أرقام الأسبوع
            if !stories.isEmpty {
                EconomySectionHead(title: "أرقام الأسبوع", description: "قصص يستخرجها النظام من الجدولين تلقائيًا — كل بطاقة عنوان خبر جاهز.")
                LazyVGrid(columns: SabqGrid.adaptive(spacing: SabqLayout.space8), spacing: SabqLayout.space8) {
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
                .font(SabqType.tag.font)
                .foregroundStyle(SabqTheme.textSecondary)
            HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space4) {
                Text(kpiValue(k))
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(SabqTheme.textPrimary)
                    .monospacedDigit()
                    .environment(\.layoutDirection, k.key == "vs4w" ? .leftToRight : .rightToLeft)
                if k.key != "vs4w" {
                    Text(k.unitAr)
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
            }
            HStack(alignment: .center, spacing: SabqLayout.space8) {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    EconomyChangeChip(value: k.changePct, hideEmpty: true)
                    if let note = k.noteAr {
                        Text(note)
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
                if k.key != "vs4w", k.series.count >= 2 {
                    EconomySparkline(values: k.series, tint: (k.changePct ?? 0) >= 0 ? EconomyTone.up : EconomyTone.down)
                        .frame(width: 72, height: 26)
                        .accessibilityHidden(true)
                }
            }
        }
    }

    private func storyCard(_ st: EconomyStoryCard) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text(st.cardTitle)
                .font(SabqType.tag.font)
                .foregroundStyle(SabqTheme.textSecondary)
            Text(st.headline)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Text(st.figure)
                .font(SabqFonts.app(size: 18, weight: .semibold))
                .foregroundStyle(EconomyTone.color(st.tone) ?? SabqTheme.textPrimary)
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(st.detailAr)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .economyAccentCard(tone: EconomyTone.color(st.tone) ?? SabqTheme.primary)
    }

    private func sectorsList(_ story: EconomyWeeklyStory) -> some View {
        let leafMax = story.sectors.filter { !$0.isGroup }.map { abs($0.value) }.max() ?? 1
        return VStack(spacing: 0) {
            ForEach(Array(story.sectors.enumerated()), id: \.element.id) { index, s in
                if index > 0 { Rectangle().fill(SabqTheme.separator).frame(height: 1) }
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    HStack {
                        Text(s.isGroup ? s.ar : "↳ \(s.ar)")
                            .font(s.isGroup ? SabqFonts.app(size: 15, weight: .semibold) : SabqType.meta.font)
                            .foregroundStyle(s.isGroup ? SabqTheme.textPrimary : SabqTheme.textSecondary)
                            .padding(.leading, s.isGroup ? 0 : SabqLayout.space12)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        EconomyChangeChip(value: s.changePct, hideEmpty: true)
                    }
                    HStack(spacing: SabqLayout.space8) {
                        GeometryReader { geo in
                            // يمتد من اليمين إلى اليسار
                            HStack {
                                Spacer(minLength: 0)
                                Capsule()
                                    .fill(SabqTheme.primary.opacity(s.isGroup ? 0.9 : 0.6))
                                    .frame(width: max(2, geo.size.width * CGFloat(min(1, abs(s.value) / max(leafMax, 1)))))
                            }
                            .environment(\.layoutDirection, .leftToRight)
                        }
                        .frame(height: 6)
                        Text("\(EconomyFormat.fmtSar(s.value)) ريال")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .monospacedDigit()
                            .frame(width: 96, alignment: .leading)
                    }
                }
                .padding(.vertical, SabqLayout.space12)
            }
        }
    }

    private static let shareOpacities: [Double] = [1, 0.8, 0.62, 0.46, 0.34, 0.24]

    private func citiesShare(_ story: EconomyWeeklyStory) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            GeometryReader { geo in
                HStack(spacing: 1) {
                    ForEach(Array(story.citiesShareTop.prefix(6).enumerated()), id: \.element.id) { i, c in
                        let w = geo.size.width * CGFloat(max(0, c.share) / 100)
                        ZStack {
                            Rectangle().fill(SabqTheme.primary.opacity(Self.shareOpacities[min(i, 5)]))
                            if c.share > 6 {
                                // على أغمق شريحتين: لون الصفحة (أبيض نهارًا، داكن ليلًا) يقابل الأزرق في الوضعين.
                                Text(c.ar)
                                    .font(SabqType.tag.font)
                                    .foregroundStyle(i < 2 ? SabqTheme.background : SabqTheme.textPrimary)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                            }
                        }
                        .frame(width: max(1, w))
                    }
                    ZStack {
                        Rectangle().fill(SabqTheme.surfaceStrong)
                        Text("بقية المدن \(EconomyFormat.trimNum(story.otherCitiesShare, 0))%")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 32)
            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
            .accessibilityLabel("حصص المدن الست الكبرى من الإنفاق")

            FlowLayout(spacing: SabqLayout.space8) {
                ForEach(Array(story.citiesShareTop.prefix(6).enumerated()), id: \.element.id) { i, c in
                    HStack(spacing: SabqLayout.space4) {
                        Circle().fill(SabqTheme.primary.opacity(Self.shareOpacities[min(i, 5)])).frame(width: 8, height: 8)
                        Text("\(c.ar) \(EconomyFormat.fmtPct(c.share))")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .monospacedDigit()
                    }
                }
            }
        }
    }

    private func moversLists(_ story: EconomyWeeklyStory) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space8) {
            moverList(title: "المدن الصاعدة هذا الأسبوع", items: story.risers)
            moverList(title: "المدن الهابطة هذا الأسبوع", items: story.fallers)
        }
    }

    private func moverList(title: String, items: [EconomyMover]) -> some View {
        economyCard {
            Text(title)
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(items.prefix(7)) { m in
                HStack {
                    Text(m.ar)
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    EconomyChangeChip(value: m.changePct)
                }
            }
        }
    }
}

/// مسار أربعة أسابيع: مساحة مسطحة خفيفة + قيم فوق النقاط + تسميات الأسابيع تحتها؛ الأقدم يمينًا.
struct EconomyWeeksChart: View {
    let values: [Double]
    let labels: [String]

    var body: some View {
        VStack(spacing: SabqLayout.space8) {
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
                        .fill(SabqTheme.primary.opacity(0.12))
                        Path { p in
                            p.move(to: pts[0])
                            for pt in pts.dropFirst() { p.addLine(to: pt) }
                        }
                        .stroke(SabqTheme.primary, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                        ForEach(Array(pts.enumerated()), id: \.offset) { i, pt in
                            Circle().fill(SabqTheme.primary).frame(width: 8, height: 8).position(pt)
                            Text(EconomyFormat.fmtSar(values[i]))
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .monospacedDigit()
                                .position(x: pt.x, y: max(8, pt.y - 14))
                        }
                    }
                }
            }
            HStack {
                ForEach(Array(labels.enumerated()), id: \.offset) { _, l in
                    Text(l)
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(SabqLayout.space12)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
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
        VStack(alignment: .leading, spacing: SabqLayout.space24) {
            economyCard {
                HStack(spacing: SabqLayout.space8) {
                    Text("السعوديون في \(monthLabel) · النشرة الإحصائية الشهرية")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    if EconomyFormat.isFresh(ingestedAt) { EconomyNewBadge(label: "نشرة جديدة") }
                }
                Text(headline)
                    .sabqText(SabqType.leadTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if let intro, !intro.isEmpty {
                    Text(intro)
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text("المصدر: البنك المركزي السعودي — النشرة الإحصائية الشهرية، \(monthLabel)")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textTertiary)
            }

            LazyVGrid(columns: SabqGrid.adaptive(spacing: SabqLayout.space8), spacing: SabqLayout.space8) {
                ForEach(cards) { card in EconomyMonthlyCardView(card: card) }
            }

            if !trackers.isEmpty {
                EconomySectionHead(title: "مؤشرات تتراكم شهرًا بعد شهر", description: "آخر 13 شهرًا — تُحدَّث تلقائيًا مع كل نشرة.")
                LazyVGrid(columns: SabqGrid.adaptive(spacing: SabqLayout.space8), spacing: SabqLayout.space8) {
                    ForEach(trackers) { t in
                        economyCard {
                            Text(t.titleAr)
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.textSecondary)
                                .lineLimit(2)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(t.series.last.map { EconomyFormat.fmtUnit($0.value, unit: t.unit) } ?? "—")
                                .font(SabqType.button.font)
                                .foregroundStyle(SabqTheme.textPrimary)
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
