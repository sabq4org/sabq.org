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
            NavigationLink(value: ArticleSlugRoute(slug: slug)) { content() }
                .buttonStyle(.plain)
        } else if let ext = headline.externalUrl, let url = URL(string: ext) {
            Button { openURL(url) } label: { content() }
                .buttonStyle(.plain)
        } else {
            content()
        }
    }

    private func bar(_ headline: APIBreakingHeadline) -> some View {
        HStack(spacing: 12) {
            HStack(spacing: 5) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 11, weight: .bold))
                Text("عاجل")
                    .font(.system(size: 13, weight: .heavy))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(Color.white.opacity(0.20)))

            Text(headline.headline)
                .font(.system(size: 14.5, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .id(headline.id)
                .transition(.opacity)

            if headlines.count > 1 {
                HStack(spacing: 4) {
                    ForEach(headlines.indices, id: \.self) { i in
                        Circle()
                            .fill(Color.white.opacity(i == index ? 1 : 0.4))
                            .frame(width: 5, height: 5)
                    }
                }
            } else {
                Image(systemName: "chevron.left")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [SabqTheme.coral, SabqTheme.coral.opacity(0.82)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("عاجل: \(headline.headline)")
    }
}
