import Combine
import SwiftUI

// MARK: - «مواعيدك» — نقل MawaeedPage.tsx
//
// رأس الصفحة، شريط اختيار الخدمة، البطل بعدّاد حي، «مواعيد الصرف الأخرى»،
// التقويم الدراسي بإدارة التعليم، و«عن المواعيد». المنطقة تُحفظ بالمفتاح نفسه.

struct MawaeedView: View {
    @State private var payload: MawaeedViewPayload?
    @State private var loadError: String?
    @State private var isLoading = false
    @State private var region = MawaeedPrefs.region
    @State private var selectedSlug: String?
    @State private var loadedDay = MawaeedLogic.riyadhDateISO(.now)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SabqLayout.sectionGap) {
                if let payload {
                    content(payload)
                } else if let loadError {
                    EmptyStateView(
                        icon: "calendar.badge.exclamationmark",
                        tint: SabqTheme.textSecondary,
                        title: "تعذر تحميل المواعيد",
                        subtitle: loadError,
                        action: { Task { await load() } },
                        actionTitle: "أعد المحاولة"
                    )
                } else {
                    SkeletonBox(height: 360, radius: SabqRadius.medium)
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, 120)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .navigationTitle("مواعيدك")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(SabqTheme.background, for: .navigationBar)
        .refreshable { await load() }
        .sabqRTL()
        .task { await load() }
        .navigationDestination(item: $serviceRoute) { route in
            MawaeedServiceView(route: route, region: region)
                .duoContentInsets()
        }
        // يوم جديد بتوقيت الرياض يعيد الجلب كما يفعل الويب.
        .onReceive(Timer.publish(every: 60, on: .main, in: .common).autoconnect()) { now in
            let today = MawaeedLogic.riyadhDateISO(now)
            if today != loadedDay { loadedDay = today; Task { await load() } }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            payload = try await APIClient.shared.fetchMawaeed(region: region)
            loadError = nil
        } catch {
            if payload == nil {
                loadError = ReaderErrorMessage.message(for: error, fallback: "الخدمة لم تستجب الآن. أعد المحاولة بعد لحظات.")
            }
        }
    }

    private func pickRegion(_ id: String) {
        region = id
        MawaeedPrefs.region = id
        Task { await load() }
    }

    @ViewBuilder
    private func content(_ view: MawaeedViewPayload) -> some View {
        let nearest = MawaeedLogic.nearestCard(view.series)
        let pulse = MawaeedLogic.pulseBlocks(view.series)
        let school = MawaeedLogic.schoolBlock(view.series)
        let activeBlock: MawaeedSeriesBlock? = {
            if let selectedSlug, let found = view.series.first(where: { $0.slug == selectedSlug && $0.next != nil }) { return found }
            if let nearest { return view.series.first { $0.slug == nearest.seriesSlug } }
            return pulse.first
        }()
        let activeCard = activeBlock?.next ?? nearest
        let financial = MawaeedLogic.boardBlocks(view.series, hero: activeCard)
        let rows = MawaeedLogic.schoolRows(school).filter { $0.id != activeCard?.id }.prefix(5)
        let regionLabel = view.regions.first { $0.id == view.region }?.label ?? ""

        header(view)

        if !pulse.isEmpty {
            pulseStrip(pulse, active: activeBlock, nearest: nearest)
        }

        if let activeCard {
            MawaeedHero(
                card: activeCard,
                kicker: activeCard.id == nearest?.id ? "الموعد الأقرب" : "الموعد المختار",
                regionLabel: activeCard.kind == .schoolHoliday ? regionLabel : nil,
                cta: activeBlock.map { block in { openService(block) } }
            )
            .id(activeCard.id)
            .transition(.opacity)
        }

        if !financial.isEmpty {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                sectionHeading("مواعيد الصرف الأخرى", sub: "الرواتب والدعم الشهري، مرتبة حسب الأقرب")
                MawaeedClock { now in
                    VStack(spacing: SabqLayout.space8) {
                        ForEach(financial) { block in boardCard(block, now: now) }
                    }
                }
            }
        }

        if let school {
            schoolSection(school, view: view, rows: Array(rows), activeCard: activeCard)
        }

        methodBox
    }

    // MARK: Sections

    private func header(_ view: MawaeedViewPayload) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text(view.page?.h1 ?? "مواعيدك")
                .sabqText(SabqType.articleTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            if let description = view.page?.description {
                Text(description.replacingOccurrences(of: " ورابط المصدر الرسمي", with: ""))
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let updated = view.dateModifiedLabel {
                HStack(spacing: 6) {
                    Circle().fill(SabqTheme.success).frame(width: 6, height: 6).accessibilityHidden(true)
                    Text("آخر تحديث: \(updated) بتوقيت السعودية")
                }
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textTertiary)
            }
        }
    }

    private func pulseStrip(_ pulse: [MawaeedSeriesBlock], active: MawaeedSeriesBlock?, nearest: MawaeedCard?) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text("اختر الخدمة").font(SabqType.metaEmphasis.font).foregroundStyle(SabqTheme.textSecondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SabqLayout.space8) {
                    ForEach(pulse) { block in
                        let isSelected = active?.slug == block.slug
                        let isEarliest = block.next != nil && block.next?.id == nearest?.id
                        Button {
                            SabqHaptics.light()
                            withAnimation(.snappy(duration: 0.25)) { selectedSlug = block.slug }
                        } label: {
                            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                                MawaeedKindChip(kind: block.kind)
                                Text(MawaeedLogic.shortTitle(block))
                                    .font(SabqType.metaEmphasis.font)
                                    .foregroundStyle(SabqTheme.textPrimary)
                                    .lineLimit(1)
                                Text(block.next == nil ? "لا موعد معلن" : (isEarliest ? "الأقرب" : " "))
                                    .font(SabqType.tag.font)
                                    .foregroundStyle(isEarliest ? block.kind.tone : SabqTheme.textTertiary)
                            }
                            .padding(SabqLayout.space12)
                            .frame(width: 128, alignment: .leading)
                            .background(isSelected ? block.kind.fill.opacity(0.12) : SabqTheme.surfaceMuted,
                                        in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                .stroke(isSelected ? block.kind.tone : .clear, lineWidth: 1.5))
                        }
                        .buttonStyle(.plain)
                        .disabled(block.next == nil)
                        .accessibilityAddTraits(isSelected ? .isSelected : [])
                    }
                }
            }
            .scrollClipDisabled()
        }
    }

    private func boardCard(_ block: MawaeedSeriesBlock, now: Date) -> some View {
        Button { openService(block) } label: {
            HStack(alignment: .top, spacing: SabqLayout.space12) {
                MawaeedKindChip(kind: block.kind, size: 36)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
                        Text(block.next.map(MawaeedLogic.overviewTitle) ?? block.title)
                            .font(SabqType.rowTitle.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if let next = block.next { MawaeedBadge(card: next) }
                    }
                    Text(block.next.map { "\($0.gregorianLabel) · \($0.hijriLabel)" } ?? block.answerLine)
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let next = block.next {
                        Text(MawaeedLogic.countdown(next, now: now))
                            .font(SabqType.metaEmphasis.font)
                            .foregroundStyle(block.kind.tone)
                    }
                }
            }
            .padding(SabqLayout.space12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func schoolSection(_ school: MawaeedSeriesBlock, view: MawaeedViewPayload, rows: [MawaeedCard], activeCard: MawaeedCard?) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space12) {
                MawaeedKindChip(kind: .schoolHoliday, size: 36)
                sectionHeading(school.title, sub: "الإجازات الرسمية موحّدة، والإضافية حسب المنطقة التعليمية")
            }

            HStack {
                Text("إدارة التعليم").font(SabqType.metaEmphasis.font).foregroundStyle(SabqTheme.textSecondary)
                Spacer()
                Menu {
                    Picker("إدارة التعليم", selection: Binding(get: { region }, set: { pickRegion($0); selectedSlug = school.slug })) {
                        ForEach(view.regions) { Text($0.label).tag($0.id) }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(view.regions.first { $0.id == region }?.label ?? "الرياض")
                        Image(systemName: "chevron.down").font(SabqType.tag.font)
                    }
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(MawaeedKind.schoolHoliday.tone)
                    .padding(.horizontal, SabqLayout.space12)
                    .frame(minHeight: SabqLayout.touchTarget)
                    .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                }
                .overlay(alignment: .leading) { if isLoading { ProgressView().offset(x: -28) } }
            }

            if !school.upcoming.contains(where: { !$0.isPast && $0.regionGroup != "all" }) {
                Text("المعروض هو التقويم الدراسي العام. لم تُعتمد في الخدمة إجازات إضافية خاصة بهذه المنطقة بعد.")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if rows.isEmpty {
                Text(activeCard?.kind == .schoolHoliday ? "لا توجد إجازات لاحقة منشورة حاليًا." : school.answerLine)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
            } else {
                MawaeedClock { now in
                    VStack(spacing: 0) {
                        ForEach(rows) { card in
                            if card.id != rows.first?.id { Rectangle().fill(SabqTheme.separator).frame(height: 1) }
                            MawaeedRow(card: card, now: now)
                        }
                    }
                }
                .opacity(isLoading ? 0.5 : 1)
            }

            Button { openService(school) } label: {
                HStack(spacing: SabqLayout.space4) {
                    Text("كل إجازات العام")
                    Image(systemName: "chevron.left")
                }
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(MawaeedKind.schoolHoliday.tone)
                .frame(minHeight: SabqLayout.touchTarget)
            }
            .buttonStyle(.plain)
        }
        .padding(SabqLayout.space16)
        .background(SabqTheme.skyTint, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).stroke(SabqTheme.skyOutline, lineWidth: 1))
    }

    private var methodBox: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Label("عن المواعيد", systemImage: "checkmark.shield")
                .font(SabqType.rowTitle.font)
                .foregroundStyle(SabqTheme.textPrimary)
            HStack(spacing: SabqLayout.space12) {
                legend(label: "مؤكد", text: "إعلان رسمي من الجهة", ink: SabqTheme.adaptive(0x0D6B4D, 0x72D4AE), fill: SabqTheme.adaptive(0xE4F5EC, 0x12372D))
                legend(label: "متوقع", text: "محسوب من الجدول المعتاد", ink: SabqTheme.adaptive(0x8A5A00, 0xE8BD6A), fill: SabqTheme.adaptive(0xFFF2CF, 0x3A2F14))
            }
            Text("جميع الأوقات بتوقيت السعودية. تُعرض التواريخ بالميلادي والهجري وفق تقويم أم القرى، ويتحدّث العدّاد تلقائيًا.")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private func legend(label: String, text: String, ink: Color, fill: Color) -> some View {
        HStack(spacing: 6) {
            Text(label)
                .font(SabqType.tag.font)
                .foregroundStyle(ink)
                .padding(.horizontal, 6)
                .background(fill, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
            Text(text).font(SabqType.tag.font).foregroundStyle(SabqTheme.textSecondary)
        }
    }

    private func sectionHeading(_ title: String, sub: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(SabqType.sectionHeading.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text(sub)
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @State private var serviceRoute: MawaeedServiceRoute?

    private func openService(_ block: MawaeedSeriesBlock) {
        serviceRoute = MawaeedServiceRoute(slug: block.slug, title: block.title)
    }
}
