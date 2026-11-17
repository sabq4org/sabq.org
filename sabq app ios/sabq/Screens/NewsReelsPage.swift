import SwiftUI

struct NewsReelsPage: View {
    let article: Article
    let nextArticle: Article?
    let bottomInset: CGFloat
    let topInset: CGFloat
    let canRestart: Bool
    let read: () -> Void
    let next: () -> Void
    let restart: () -> Void
    @Environment(BookmarksStore.self) private var bookmarks
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var showsImage = false

    private var imageURL: URL? {
        (article.imageURL ?? article.videoThumbnailURL).flatMap(URL.init(string:))
    }
    private var shareURL: URL? {
        if let raw = article.articleURL, let url = URL(string: raw),
           ["https", "http"].contains(url.scheme?.lowercased() ?? "") { return url }
        return article.slug.flatMap { URL(string: URLConstants.articleURL(slug: $0)) }
    }
    private var excerpt: String {
        article.excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottom) {
                FocalCachedAsyncImage(url: imageURL, focalPoint: article.imageFocalPoint) {
                    ZStack {
                        Color(red: 0.1, green: 0.14, blue: 0.18)
                        Image("SabqLogo").renderingMode(.template).resizable().scaledToFit()
                            .frame(width: 90).foregroundStyle(.white.opacity(0.16))
                    }
                }
                .frame(width: geometry.size.width, height: geometry.size.height)
                .accessibilityHidden(true)
                LinearGradient(stops: [
                    .init(color: .black.opacity(0.23), location: 0),
                    .init(color: .clear, location: 0.28),
                    .init(color: .black.opacity(0.18), location: 0.46),
                    .init(color: .black.opacity(0.87), location: 0.72),
                    .init(color: .black.opacity(0.97), location: 1)
                ], startPoint: .top, endPoint: .bottom)
                .allowsHitTesting(false)
                VStack(spacing: 18) {
                    HStack(alignment: .bottom, spacing: 16) {
                        actions
                        if dynamicTypeSize.isAccessibilitySize {
                            ScrollView { caption }
                                .frame(maxHeight: max(160, geometry.size.height - topInset - 150))
                        } else {
                            caption
                        }
                    }
                    .environment(\.layoutDirection, .leftToRight)
                    nextPreview
                }
                .padding(.horizontal, 18)
                .padding(.bottom, bottomInset + 8)
                if article.isAiGeneratedImage {
                    VStack {
                        AIImageBadge(model: article.aiImageModel)
                            .padding(.top, topInset)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.horizontal, 18)
                }
            }
            .foregroundStyle(.white)
        }
        .fullScreenCover(isPresented: $showsImage) {
            ImageLightbox(url: imageURL)
                .accessibilityIdentifier("newsReels.imageViewer.\(article.id)")
                .overlay(alignment: .bottom) {
                    if article.isAiGeneratedImage {
                        AIImageBadge(model: article.aiImageModel).padding(.bottom, 30)
                    }
                }
        }
    }

    private var caption: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Rectangle().fill(Color(red: 0.82, green: 0.7, blue: 0.49))
                    .frame(width: 14, height: 2).accessibilityHidden(true)
                Text(article.categoryTitle)
                Text("·").accessibilityHidden(true)
                Text(article.publicationDate).foregroundStyle(.white.opacity(0.7))
            }
            .font(.custom(SabqFonts.regular, size: 11, relativeTo: .caption))
            .lineLimit(2)
            Text(article.title)
                .font(.custom(SabqFonts.bold, size: 28, relativeTo: .title))
                .lineSpacing(3)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 5)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("newsReels.title.\(article.id)")
            if !excerpt.isEmpty {
                Text(excerpt)
                    .font(.custom(SabqFonts.regular, size: 15, relativeTo: .body))
                    .foregroundStyle(.white.opacity(0.8))
                    .lineSpacing(3)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 3)
            }
            Button(action: read) {
                HStack(spacing: 8) {
                    Text("اقرأ الخبر كاملاً")
                    Image(systemName: "arrow.left")
                }
                .font(.custom(SabqFonts.semibold, size: 14, relativeTo: .body))
                .foregroundStyle(Color(red: 0.86, green: 0.75, blue: 0.56))
                .frame(minHeight: 44)
            }
            .accessibilityIdentifier("newsReels.read.\(article.id)")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .multilineTextAlignment(.leading)
        .environment(\.layoutDirection, .rightToLeft)
    }

    private var actions: some View {
        VStack(spacing: 8) {
            if imageURL != nil {
                Button { showsImage = true } label: { railIcon("arrow.up.left.and.arrow.down.right") }
                    .accessibilityLabel("عرض الصورة كاملة")
                    .accessibilityIdentifier("newsReels.image.\(article.id)")
            }
            if let shareURL {
                ShareLink(item: shareURL) { railIcon("square.and.arrow.up") }
                    .accessibilityLabel("مشاركة الخبر")
                    .accessibilityIdentifier("newsReels.share.\(article.id)")
            }
            Button { bookmarks.toggle(article.id, article: article) } label: {
                railIcon(bookmarks.isBookmarked(article.id) ? "bookmark.fill" : "bookmark")
            }
            .accessibilityLabel(bookmarks.isBookmarked(article.id) ? "إزالة الخبر من المحفوظات" : "حفظ الخبر")
            .accessibilityIdentifier("newsReels.bookmark.\(article.id)")
        }
        .buttonStyle(.plain)
        .padding(.bottom, 42)
    }

    private func railIcon(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 18, weight: .regular))
            .frame(width: 44, height: 44)
            .background(.black.opacity(0.18), in: Circle())
            .overlay(Circle().strokeBorder(.white.opacity(0.3), lineWidth: 0.7))
    }

    private var nextPreview: some View {
        VStack(spacing: 12) {
            Rectangle().fill(.white.opacity(0.25)).frame(height: 0.5)
            if let nextArticle {
                Button(action: next) {
                    HStack(spacing: 12) {
                        Image(systemName: "chevron.up.chevron.up")
                            .font(.system(size: 14))
                        Spacer(minLength: 0)
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("اسحب للأعلى · الخبر التالي")
                                .font(.custom(SabqFonts.regular, size: 10, relativeTo: .caption2))
                                .foregroundStyle(.white.opacity(0.55))
                            Text(nextArticle.title)
                                .font(.custom(SabqFonts.medium, size: 12, relativeTo: .caption))
                                .lineLimit(1)
                        }
                        FocalCachedAsyncImage(url: nextArticle.imageURL.flatMap(URL.init(string:)),
                                              focalPoint: nextArticle.imageFocalPoint, maxPixelSize: 160) {
                            Color.white.opacity(0.1)
                        }
                        .frame(width: 36, height: 40).clipShape(RoundedRectangle(cornerRadius: 4))
                        .accessibilityHidden(true)
                    }
                    .frame(minHeight: 44)
                }
                .accessibilityLabel("الخبر التالي: \(nextArticle.title)")
                .accessibilityIdentifier("newsReels.next")
            } else if canRestart {
                Button(action: restart) {
                    Label("وصلت إلى آخر الأخبار · العودة إلى البداية", systemImage: "arrow.counterclockwise")
                        .font(.custom(SabqFonts.regular, size: 12, relativeTo: .caption))
                        .foregroundStyle(.white.opacity(0.75))
                        .frame(minHeight: 44)
                }
                .accessibilityIdentifier("newsReels.restart")
            } else {
                Text("هذا آخر خبر متاح · اقرأ التفاصيل أو عد للرئيسية")
                    .font(.custom(SabqFonts.regular, size: 12, relativeTo: .caption))
                    .foregroundStyle(.white.opacity(0.65))
                    .frame(minHeight: 44)
            }
        }
        .environment(\.layoutDirection, .leftToRight)
        .buttonStyle(.plain)
    }
}
