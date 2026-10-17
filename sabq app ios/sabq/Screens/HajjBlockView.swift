import SwiftUI

/// "صدى الحج" — homepage block on iOS, mirrors the web HajjBlock.tsx.
///
/// Visibility is 100% driven by the dashboard toggle + season window
/// at `/api/hajj-block`. When the endpoint returns isVisible=false the
/// view renders an EmptyView so it leaves no trace in the layout — no
/// padding, no skeleton, nothing. The same code path covers
/// "block not configured", "outside season", and "no matching
/// articles" because the backend hides all three the same way.
///
/// Sits in HomeFeedView immediately after the personal knowledge
/// journey, between it and the calendar/audio cards.
struct HajjBlockView: View {
    @State private var loader = HajjBlockLoader()

    var body: some View {
        // A zero-size Color.clear keeps the view present in the layout
        // tree even when the block is hidden — without it SwiftUI elides
        // the EmptyView branch and the .task below never fires, so the
        // loader never runs and the block can never become visible.
        ZStack {
            if let block = loader.block, block.isVisible {
                content(block: block)
            } else {
                HomeStripAnchor()
            }
        }
        .task { await loader.load() }
    }

    @ViewBuilder
    private func content(block: APIHajjBlockResponse) -> some View {
        // قسم غير مؤطر كبقية أقسام الرئيسية: الرأس الموحّد ثم الأيام ثم صفوف بفواصل.
        HomeSectionCard(title: block.title ?? "صدى الحج", context: updatedLabel(block)) {
            EmptyView()
        } content: {
            if let subtitle = block.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(2)
                    .padding(.bottom, SabqLayout.space12)
            }
            if let phase = block.hajjPhase {
                dayStrip(phase: phase, hajjDay: block.hajjDay, daysToArafat: block.daysToArafat)
                    .padding(.bottom, SabqLayout.space4)
            }
            if let articles = block.articles, !articles.isEmpty {
                ForEach(Array(articles.enumerated()), id: \.element.id) { index, article in
                    if index > 0 {
                        Rectangle().fill(SabqTheme.separator).frame(height: 1)
                    }
                    NavigationLink(value: Article.placeholder(slug: article.slug ?? "")) {
                        articleRow(article)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: Header context

    private func updatedLabel(_ block: APIHajjBlockResponse) -> String? {
        guard let updated = block.lastUpdatedAt, let date = SabqFormatters.parseISO8601(updated) else { return nil }
        return relativeTime(date)
    }

    // MARK: Day strip — التروية / عرفة / النحر / التشريق, current highlighted

    private struct Phase: Identifiable {
        let id: String
        let nameAr: String
    }
    private let phases: [Phase] = [
        Phase(id: "tarwiyah", nameAr: "التروية"),
        Phase(id: "arafat",   nameAr: "عرفة"),
        Phase(id: "nahr",     nameAr: "النحر"),
        Phase(id: "tashreeq", nameAr: "التشريق"),
    ]

    @ViewBuilder
    private func dayStrip(phase: String, hajjDay: Int?, daysToArafat: Int?) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SabqLayout.space8) {
                ForEach(phases) { p in
                    let isCurrent = p.id == phase
                    HStack(spacing: SabqLayout.space4) {
                        Text("يوم")
                            .font(SabqType.tag.font)
                        Text(p.nameAr)
                            .font(SabqType.tag.font)
                        if isCurrent, let day = hajjDay {
                            Text("· \(day) ذو الحجة")
                                .font(SabqType.tag.font)
                        }
                    }
                    .foregroundStyle(isCurrent ? SabqTheme.onAction : SabqTheme.textPrimary)
                    .padding(.horizontal, SabqLayout.space12)
                    .padding(.vertical, SabqLayout.space8)
                    .background(isCurrent ? SabqTheme.actionFill : SabqTheme.surfaceMuted, in: Capsule())
                    .accessibilityAddTraits(isCurrent ? .isSelected : [])
                }
                // "Days to Arafat" pill at the end when we're before
                // it — gives the reader a countdown without crowding
                // the title row.
                if phase == "before", let d = daysToArafat, d > 0 {
                    Text(d == 1 ? "غدًا يوم عرفة" : "\(d) أيام حتى يوم عرفة")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.primary)
                        .padding(.horizontal, SabqLayout.space12)
                        .padding(.vertical, SabqLayout.space8)
                }
            }
        }
    }

    // MARK: Article row — tag + title + thumbnail at the line end

    private func articleRow(_ article: APIHajjArticle) -> some View {
        HStack(alignment: .top, spacing: NewsRowStyle.thumbnailGap) {
            VStack(alignment: .leading, spacing: NewsRowStyle.textStackSpacing) {
                Text(article.title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)

                HStack(spacing: SabqLayout.space4) {
                    if article.isPinned == true {
                        Image(systemName: "pin.fill")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                            .accessibilityLabel("مثبّت")
                    }
                    if !article.hajjTag.isEmpty {
                        Text(article.hajjTag)
                            .font(SabqType.metaEmphasis.font)
                            .foregroundStyle(SabqTheme.primary)
                            .lineLimit(1)
                    }
                    if let published = article.publishedAt,
                       let date = SabqFormatters.parseISO8601(published) {
                        if !article.hajjTag.isEmpty {
                            Text("·")
                                .font(SabqType.meta.font)
                                .foregroundStyle(SabqTheme.textTertiary)
                        }
                        Text(relativeTime(date))
                            .font(SabqType.meta.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                            .lineLimit(1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Group {
                if let urlStr = article.imageUrl, let url = URL(string: urlStr) {
                    CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: LatestTimelineStyle.thumbnailPixels) {
                        SabqImagePlaceholder()
                    }
                } else {
                    SabqImagePlaceholder()
                        .environment(\.sabqImageLoadFailed, true)
                }
            }
            .frame(width: NewsRowStyle.thumbnailWidth, height: NewsRowStyle.thumbnailHeight)
            .clipShape(RoundedRectangle(cornerRadius: NewsRowStyle.thumbnailRadius, style: .continuous))
            .accessibilityHidden(true)
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .contentShape(Rectangle())
    }

    private func relativeTime(_ date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "ar")
        f.unitsStyle = .full
        return f.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Loader

@MainActor
@Observable
private final class HajjBlockLoader {
    private(set) var block: APIHajjBlockResponse?

    func load() async {
        // Silent failure — the block is purely cosmetic. If the
        // endpoint flakes we just don't render it.
        if let response = try? await APIClient.shared.fetchHajjBlock() {
            block = response
        }
    }
}
