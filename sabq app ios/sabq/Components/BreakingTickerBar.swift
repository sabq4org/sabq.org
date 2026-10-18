import SwiftUI
import Combine

/// شريط الأخبار العاجلة — the editorially-curated breaking-news strip driven by
/// the dashboard's "Breaking Ticker" manager (`GET /api/breaking-ticker/active`).
///
/// Mirrors the web `BreakingNewsTicker`: a coral bar carrying a bolt + "عاجل"
/// pill and headlines that auto-rotate every 5 seconds. Tapping a headline opens
/// its linked article (by slug, via `ArticleSlugRoute`) or external URL. Pager
/// dots appear when more than one headline is queued.
///
/// Distinct from `HomeFeedView.breakingNewsSection`, which surfaces a single
/// `newsType == "breaking"` *article*. This strip is curated copy, not an
/// article card, so it takes precedence at the top of the feed when active.
struct BreakingTickerBar: View {
    let headlines: [APIBreakingHeadline]

    @State private var index = 0
    @Environment(\.openURL) private var openURL

    /// 5s cadence matches the web ticker's auto-advance.
    private let timer = Timer.publish(every: 5, on: .main, in: .common).autoconnect()

    private var current: APIBreakingHeadline? {
        guard !headlines.isEmpty else { return nil }
        return headlines[min(index, headlines.count - 1)]
    }

    var body: some View {
        Group {
            if let current {
                link(for: current) {
                    bar(current)
                }
            }
        }
        .onReceive(timer) { _ in
            guard headlines.count > 1 else { return }
            withAnimation(.easeInOut(duration: 0.28)) {
                index = (index + 1) % headlines.count
            }
        }
        // Reset to the first headline whenever the dashboard swaps the active
        // topic (the headline set changes) so we never index past the new array.
        .onChange(of: headlines.map(\.id)) { _, _ in
            index = 0
        }
    }

    /// Wraps the bar in the right tap target: in-app article route when a slug
    /// is present, an external link when only a URL is set, otherwise plain.
    @ViewBuilder
    private func link<Content: View>(
        for headline: APIBreakingHeadline,
        @ViewBuilder content: () -> Content
    ) -> some View {
        if let slug = headline.linkedArticleSlug, !slug.isEmpty {
            // ReaderLink يخزّن مُنشئ التسمية، والمعامل غير هارب؛ نبنيها مرة هنا
            let label = content()
            ReaderLink(value: ArticleSlugRoute(slug: slug)) { label }
                .buttonStyle(.plain)
        } else if let ext = headline.externalUrl, let url = URL(string: ext) {
            Button { openURL(url) } label: { content() }
                .buttonStyle(.plain)
        } else {
            content()
        }
    }

    private func bar(_ headline: APIBreakingHeadline) -> some View {
        // كبطاقة العاجل في الرئيسية: تعبئة خفيفة بلون العاجل وحده، والنص
        // بلون النص الأساسي فيبقى تباينه سليمًا في الوضعين (لا تدرّج).
        HStack(spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space4) {
                Image(systemName: "bolt.fill")
                    .font(SabqType.tag.font)
                Text("عاجل")
                    .font(SabqType.metaEmphasis.font)
            }
            .foregroundStyle(SabqTheme.breaking)
            .fixedSize()

            Text(headline.headline)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .id(headline.id)
                .transition(.opacity)

            if headlines.count > 1 {
                HStack(spacing: SabqLayout.space4) {
                    ForEach(headlines.indices, id: \.self) { i in
                        Circle()
                            .fill(i == index ? SabqTheme.breaking : SabqTheme.outline)
                            .frame(width: 6, height: 6)
                    }
                }
                .accessibilityHidden(true)
            } else {
                Image(systemName: "chevron.left")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, SabqLayout.space16)
        .padding(.vertical, SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.breaking.opacity(0.07))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .stroke(SabqTheme.breaking.opacity(0.18), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("عاجل: \(headline.headline)")
    }
}
