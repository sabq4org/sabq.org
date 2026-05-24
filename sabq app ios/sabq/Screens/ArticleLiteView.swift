import SwiftUI

/// Stripped-down article reader for "سبق Lite" — Phase 2 of #81.
///
/// Renders ONLY the essentials:
///   - Title + meta line (category + date)
///   - Hero image (single load, no carousel)
///   - Article body text
///   - Share button + back chevron in the toolbar
///
/// NOT rendered (vs. `ArticleDetailView`):
///   - Related articles, comments, author follow, social reactions
///   - "Read also" / inline carousels, weekly photos grid
///   - Behavior tracking (no `BehaviorTracker.startSession`)
///   - AI insights / sentiment pill
///   - Audio summary, font controls, reader settings sheet
///
/// `SabqAnalytics.articleView` STILL fires once the canonical id lands —
/// editorial metrics shouldn't drop just because the reader chose a
/// lighter UI.
struct ArticleLiteView: View {
    let article: Article

    @Environment(\.dismiss) private var dismiss
    @Environment(BookmarksStore.self) private var bookmarksStore

    @State private var fullArticle: Article?
    @State private var isLoading = false

    /// Same fall-back pattern as `ArticleDetailView`: prefer the
    /// freshly-fetched detail (canonical id, full body) and fall back
    /// to the placeholder/list-row Article while we wait.
    private var displayArticle: Article { fullArticle ?? article }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                titleBlock
                heroImage
                bodyText
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .navigationBarBackButtonHidden(true)
        .toolbar { liteToolbar }
        .task(id: displayArticle.id) {
            // Skip the placeholder phase so we don't ship the slug
            // to anything that expects a canonical id (mirrors the
            // ArticleDetailView guard added in #72).
            guard displayArticle.id != displayArticle.slug else { return }
            SabqAnalytics.articleView(
                id: displayArticle.id,
                title: displayArticle.title,
                category: displayArticle.category.title
            )
        }
        .task {
            // Hydrate the body content. Lite mode doesn't pull related
            // / audio / AI insights — just the article bundle.
            if let slug = article.slug, fullArticle == nil {
                isLoading = true
                let bundle = await NewsService.fetchArticleDetail(slug: slug)
                if let bundle { fullArticle = bundle.article }
                isLoading = false
            }
        }
    }

    // MARK: - Sub-views

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(displayArticle.category.title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(displayArticle.category.tint)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        Capsule().fill(displayArticle.category.tint.opacity(0.12))
                    )
                Text(SabqFormatters.relativeArabic.localizedString(for: displayArticle.publishDate, relativeTo: Date()))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            Text(displayArticle.title)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(SabqTheme.ink)
                .lineSpacing(4)
                .multilineTextAlignment(.leading)
        }
    }

    @ViewBuilder
    private var heroImage: some View {
        if let urlString = displayArticle.imageURL, let url = URL(string: urlString) {
            // Single fetch, no carousel — Lite stays light. Re-uses
            // the existing FocalCachedAsyncImage so cached bytes from
            // the home list aren't refetched.
            FocalCachedAsyncImage(url: url, focalPoint: displayArticle.imageFocalPoint) {
                Color(.systemGray6)
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(16.0 / 10.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    @ViewBuilder
    private var bodyText: some View {
        if isLoading && fullArticle == nil {
            HStack {
                Spacer()
                ProgressView().tint(SabqTheme.primaryEnd)
                Spacer()
            }
            .padding(.vertical, 30)
        } else {
            Text(displayArticle.body.isEmpty ? displayArticle.excerpt : displayArticle.body)
                .font(.system(size: 17))
                .foregroundStyle(SabqTheme.ink)
                .lineSpacing(8)
                .multilineTextAlignment(.leading)
        }
    }

    @ToolbarContentBuilder
    private var liteToolbar: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button {
                SabqHaptics.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .padding(8)
                    .background(Circle().fill(.ultraThinMaterial))
            }
        }
        ToolbarItem(placement: .primaryAction) {
            HStack(spacing: 8) {
                Button {
                    SabqHaptics.medium()
                    bookmarksStore.toggle(displayArticle.id, article: displayArticle)
                } label: {
                    Image(systemName: bookmarksStore.isBookmarked(displayArticle.id) ? "bookmark.fill" : "bookmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(
                            bookmarksStore.isBookmarked(displayArticle.id)
                                ? SabqTheme.primaryEnd
                                : SabqTheme.secondaryInk
                        )
                        .padding(8)
                        .background(Circle().fill(.ultraThinMaterial))
                }
                Button {
                    SabqHaptics.light()
                    share()
                } label: {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                        .padding(8)
                        .background(Circle().fill(.ultraThinMaterial))
                }
            }
        }
    }

    // MARK: - Share

    private func share() {
        guard let urlString = displayArticle.articleURL ?? displayArticle.slug.map({ "https://sabq.org/article/\($0)" }),
              let url = URL(string: urlString) else { return }
        let activity = UIActivityViewController(activityItems: [displayArticle.title, url], applicationActivities: nil)
        if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let root = scene.windows.first?.rootViewController {
            // Walk to topmost presented controller so we don't try to
            // present on a parent that already has a sheet up.
            var presenter: UIViewController = root
            while let next = presenter.presentedViewController { presenter = next }
            presenter.present(activity, animated: true)
        }
        SabqAnalytics.articleShare(id: displayArticle.id, platform: "ios_lite_share")
    }
}
