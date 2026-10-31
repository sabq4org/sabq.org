import SwiftUI

/// غلاف تحريري: الخبر الرئيسي ثم عنوانان ظاهران، بروابط القراءة المعتادة.
struct FeaturedNewsCover: View {
    let articles: [Article]
    let isBookmarked: (Article) -> Bool
    let onBookmark: (Article) -> Void

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var featured: [Article] { Array(articles.prefix(3)) }

    var body: some View {
        if let lead = featured.first {
            VStack(alignment: .leading, spacing: 0) {
                articleLink(lead) {
                    VStack(alignment: .leading, spacing: 0) {
                        if imageURL(for: lead) != nil {
                            Color.clear
                                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                                .overlay { image(lead, maxPixelSize: 1200) }
                                .clipped()
                                .aiImageBadgeOverlay(
                                    isVisible: lead.isAiGeneratedImage,
                                    model: lead.aiImageModel,
                                    inset: SabqLayout.space12
                                )
                        }

                        VStack(alignment: .leading, spacing: SabqLayout.space12) {
                            metadata(lead)
                            headline(lead, role: SabqType.leadTitle, lines: 0)
                        }
                        .padding(SabqLayout.space16)
                    }
                }

                ForEach(featured.dropFirst()) { article in
                    Rectangle()
                        .fill(SabqTheme.separator)
                        .frame(height: 0.5)
                        .padding(.horizontal, SabqLayout.space16)
                        .accessibilityHidden(true)

                    articleLink(article) {
                        HStack(alignment: .top, spacing: SabqLayout.space12) {
                            if imageURL(for: article) != nil {
                                image(article, maxPixelSize: 280)
                                    .frame(width: 80, height: 64)
                                    .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small))
                                    .accessibilityHidden(true)
                            }
                            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                                metadata(article)
                                headline(article, role: SabqType.rowTitle, lines: 3)
                                if article.isAiGeneratedImage {
                                    Text("صورة مولّدة بالذكاء الاصطناعي")
                                        .font(SabqType.timestamp.font)
                                        .foregroundStyle(SabqTheme.textSecondary)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(SabqLayout.space16)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            .sabqNewsSurface()
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("home.featured.cover")
        }
    }

    private func articleLink<Content: View>(
        _ article: Article,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        ArticleLink(article: article) {
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home.featured.\(article.id)")
        .accessibilityLabel("\(article.isBreaking ? "عاجل" : article.categoryTitle)، \(article.heroWhenLabel)، \(article.title)\(article.isAiGeneratedImage ? "، صورة مولّدة بالذكاء الاصطناعي" : "")")
        .accessibilityHint("يفتح الخبر كاملًا")
        .contextMenu {
            Button { onBookmark(article) } label: {
                Label(
                    isBookmarked(article) ? "إزالة من المحفوظات" : "حفظ الخبر",
                    systemImage: isBookmarked(article) ? "bookmark.slash" : "bookmark"
                )
            }
        }
        .accessibilityAction(named: isBookmarked(article) ? "إزالة من المحفوظات" : "حفظ الخبر") {
            onBookmark(article)
        }
    }

    private func metadata(_ article: Article) -> some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SabqLayout.space4))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SabqLayout.space8))
        return layout {
            Text(article.isBreaking ? "عاجل" : article.categoryTitle)
                .font(SabqType.tag.font)
                .foregroundStyle(article.isBreaking ? SabqTheme.breaking : SabqTheme.primary)
            Text(article.isFreshlyPublished ? "جديد" : article.heroWhenLabel)
                .font(SabqType.timestamp.font)
                .foregroundStyle(article.isFreshlyPublished ? SabqTheme.success : SabqTheme.textTertiary)
                .monospacedDigit()
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func headline(_ article: Article, role: SabqTextRole, lines: Int) -> some View {
        SabqRTLText(
            article.title,
            uiFont: role.uiFont,
            color: SabqTheme.textPrimary,
            lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : lines,
            lineSpacing: role.lineSpacing,
            textStyle: role.uiTextStyle
        )
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func imageURL(for article: Article) -> URL? {
        guard let value = article.imageURL, !value.isEmpty else { return nil }
        return URL(string: value)
    }

    private func image(_ article: Article, maxPixelSize: CGFloat) -> some View {
        FocalCachedAsyncImage(
            url: imageURL(for: article),
            focalPoint: article.imageFocalPoint ?? ImageFocalPoint(x: 50, y: 30),
            maxPixelSize: maxPixelSize
        ) {
            SabqImagePlaceholder()
        }
    }
}
