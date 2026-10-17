import SwiftUI

// MARK: - صفحة خدمة واحدة — نقل /services/* (ServiceDatePage.tsx)
//
// فوق `/api/mawaeed/:slug`: البطل بعدّاد حي، المواعيد القادمة والسابقة، والأسئلة
// الشائعة، و«أضف إلى التقويم» باشتراك webcal في ملف الويب نفسه
// (`/api/service-pages/:id/calendar.ics`) فتصل المواعيد الجديدة تلقائيًا.

struct MawaeedServiceView: View {
    let route: MawaeedServiceRoute
    let region: String
    @State private var payload: MawaeedViewPayload?
    @State private var loadError: String?
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SabqLayout.sectionGap) {
                if let payload, let block = payload.series.first {
                    content(payload, block: block)
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
                    SkeletonBox(height: 320, radius: SabqRadius.medium)
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, 120)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .navigationTitle(route.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(SabqTheme.background, for: .navigationBar)
        .refreshable { await load() }
        .sabqRTL()
        .task { await load() }
    }

    private func load() async {
        do {
            payload = try await APIClient.shared.fetchMawaeed(slug: route.slug, region: region)
            loadError = nil
        } catch {
            if payload == nil {
                loadError = ReaderErrorMessage.message(for: error, fallback: "الخدمة لم تستجب الآن. أعد المحاولة بعد لحظات.")
            }
        }
    }

    @ViewBuilder
    private func content(_ view: MawaeedViewPayload, block: MawaeedSeriesBlock) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text(view.page?.h1 ?? block.title)
                .sabqText(SabqType.articleTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            if let summary = block.summary, !summary.isEmpty {
                Text(summary)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let updated = view.dateModifiedLabel {
                Text("آخر تحديث: \(updated) بتوقيت السعودية")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
        }

        if let next = block.next {
            MawaeedHero(
                card: next,
                kicker: "الموعد القادم",
                regionLabel: next.kind == .schoolHoliday ? view.regions.first { $0.id == view.region }?.label : nil
            )
            sourceLine(next)
        } else {
            Text(block.answerLine)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
        }

        if let pageId = block.servicePageId,
           let url = URL(string: "webcal://sabq.org/api/service-pages/\(pageId)/calendar.ics") {
            Button {
                SabqHaptics.light()
                openURL(url)
            } label: {
                Label("أضف المواعيد إلى التقويم", systemImage: "calendar.badge.plus")
                    .font(SabqType.button.font)
                    .foregroundStyle(SabqTheme.onAction)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                    .background(SabqTheme.actionFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityHint("يشترك تقويمك في مواعيد الخدمة فتصله المواعيد الجديدة تلقائيًا")
        }

        ForEach(view.sections.filter { !$0.cards.isEmpty }, id: \.id) { section in
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                Text(section.title)
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                MawaeedClock { now in
                    VStack(spacing: 0) {
                        ForEach(section.cards) { card in
                            if card.id != section.cards.first?.id {
                                Rectangle().fill(SabqTheme.separator).frame(height: 1)
                            }
                            MawaeedRow(card: card, now: now)
                        }
                    }
                }
            }
        }

        if !view.faq.isEmpty {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                Text("أسئلة شائعة")
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                ForEach(view.faq, id: \.question) { item in
                    DisclosureGroup {
                        Text(item.answer)
                            .sabqText(SabqType.excerpt)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, SabqLayout.space8)
                    } label: {
                        Text(item.question)
                            .font(SabqType.rowTitle.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .tint(block.kind.tone)
                    .padding(.vertical, SabqLayout.space8)
                    Rectangle().fill(SabqTheme.separator).frame(height: 1)
                }
            }
        }
    }

    @ViewBuilder
    private func sourceLine(_ card: MawaeedCard) -> some View {
        if let raw = card.sourceUrl, let url = URL(string: raw) {
            Link(destination: url) {
                Label("المصدر: \(card.sourceTitle ?? url.host() ?? raw)", systemImage: "link")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.primary)
                    .multilineTextAlignment(.leading)
            }
        }
    }
}
