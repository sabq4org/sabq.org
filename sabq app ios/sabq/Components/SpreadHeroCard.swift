import SwiftUI

/// الخبر البارز في رئيسية Duo مفتوحًا: العنوان فوق الصورة كخبر الويب البارز
/// (طلب المالك 2026-10-18). الصورة 16:9 بعرض العمود، وتظليل سفلي يحمل
/// القسم والعنوان بالأبيض.
struct SpreadHeroCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let article: Article
    let onBookmark: () -> Void
    let isBookmarked: Bool

    var body: some View {
        Color.clear
            .frame(maxWidth: .infinity)
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .fixedSize(horizontal: false, vertical: true)
            .overlay {
                Group {
                    if let urlString = article.imageURL, let url = URL(string: urlString) {
                        FocalCachedAsyncImage(url: url, focalPoint: article.imageFocalPoint, fitsMismatchedAspect: true) {
                            SabqImagePlaceholder()
                        }
                    } else {
                        SabqImagePlaceholder()
                            .environment(\.sabqImageLoadFailed, true)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .overlay(alignment: .bottom) {
                LinearGradient(
                    colors: [.black.opacity(0), .black.opacity(0.55), .black.opacity(0.82)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(maxHeight: .infinity)
                .mask(alignment: .bottom) {
                    Rectangle().frame(height: 220).frame(maxHeight: .infinity, alignment: .bottom)
                }
                .allowsHitTesting(false)
            }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    Text(article.categoryTitle)
                        .font(SabqType.tag.font)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2.5)
                        .background(Capsule(style: .continuous).fill(SabqTheme.primary))
                    SabqRTLText(
                        article.title,
                        uiFont: SabqType.leadTitle.uiFont,
                        color: .white,
                        lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 3,
                        lineSpacing: SabqType.leadTitle.lineSpacing,
                        textStyle: SabqType.leadTitle.uiTextStyle
                    )
                }
                .padding(SabqLayout.space16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            .aiImageBadgeOverlay(
                isVisible: article.isAiGeneratedImage,
                model: article.aiImageModel,
                inset: 10
            )
            .contentShape(Rectangle())
            .contextMenu {
                Button(action: onBookmark) {
                    Label(
                        isBookmarked ? "إزالة من المحفوظات" : "حفظ المقال",
                        systemImage: isBookmarked ? "bookmark.slash" : "bookmark"
                    )
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityAction(named: isBookmarked ? "إزالة من المحفوظات" : "حفظ الخبر", onBookmark)
    }
}
