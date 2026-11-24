import SwiftUI

// MARK: - تحسين الرئيسية (نموذج أولي محلي 2026-11-24)
//
// شكوى المالك: الرئيسية «بطاقات بطاقات بطاقات». التحسين داخل الهوية المعتمدة
// (الخلفية الرمادية المزرقة، الأسطح البيضاء، أزرق سبق) لكنه يقلّل الأشكال
// المؤطرة قبل أول خبر من تسعة إلى اثنين، ويكسر الإيقاع الواحد في القائمة.
// يُفعَّل بمعامل التشغيل `-homeRefresh YES` كي يُصوَّر «قبل» و«بعد» من البناء نفسه.

enum HomeRefresh {
    static var isEnabled: Bool {
        UserDefaults.standard.bool(forKey: "homeRefresh")
    }

    /// كل كم خبرًا في «آخر الأخبار» يأتي خبر بصورة عريضة. نادر عمدًا: النمط
    /// الواسع لكل الصفوف أُلغي سابقًا لأنه يأكل الشاشة.
    static let wideRowEvery = 7
}

extension EnvironmentValues {
    /// الرئيسية المحسّنة: تقرأه الصفوف والهيرو والعاجل ورأس الصفحة.
    @Entry var homeRefresh = false
    /// داخل سطح جامع: الأسطح الفرعية (رياضة، اقتصاد، دوري) ترسم بلا إطار ولا ظل.
    @Entry var sabqFlatSurface = false
}

/// سطح واحد يجمع شرائح «اليوم» (الرياضة، الاقتصاد، البطولات، روشن) بفواصل
/// رفيعة بدل ثلاث بطاقات متتالية. الشرائح التي لا بيانات لها تختفي ذاتيًا،
/// فلا يُرسم لها فاصل.
struct HomeTodayGroup<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        if #available(iOS 18.0, *) {
            Group(subviews: content) { subviews in
                if !subviews.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(subviews.enumerated()), id: \.element.id) { index, subview in
                            if index > 0 {
                                SidebarRowDivider()
                                    .padding(.horizontal, SabqLayout.space16)
                            }
                            subview
                        }
                    }
                    .environment(\.sabqFlatSurface, true)
                    .sabqNewsSurface()
                }
            }
        } else {
            VStack(spacing: SabqLayout.space16) { content }
        }
    }
}

/// وسم نصي بلا كبسولة: اسم القسم بالأزرق، و«جديد» بالأخضر بنقطة.
struct HomeTextTag: View {
    let text: String
    var tint: Color = SabqTheme.primary
    var dot = false

    var body: some View {
        HStack(spacing: 4) {
            if dot {
                Circle().fill(tint).frame(width: 6, height: 6)
                    .accessibilityHidden(true)
            }
            Text(text)
                .font(SabqType.tag.font)
                .foregroundStyle(tint)
                .lineLimit(1)
        }
        .fixedSize(horizontal: true, vertical: false)
    }
}

/// خبر بصورة عريضة يكسر إيقاع القائمة: الصورة بعرض السطح ثم العنوان.
struct HomeWideArticleRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let article: Article
    var showsCategory = true

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            Color.clear
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .overlay {
                    if let urlString = article.imageURL, let url = URL(string: urlString) {
                        FocalCachedAsyncImage(url: url, focalPoint: article.imageFocalPoint) {
                            SabqImagePlaceholder()
                        }
                    } else {
                        SabqImagePlaceholder()
                            .environment(\.sabqImageLoadFailed, true)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                .aiImageBadgeOverlay(
                    isVisible: article.isAiGeneratedImage,
                    model: article.aiImageModel,
                    inset: 8
                )

            SabqRTLText(
                article.title,
                uiFont: SabqType.leadTitle.uiFont,
                color: SabqTheme.textPrimary,
                lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 3,
                lineSpacing: SabqType.leadTitle.lineSpacing,
                textStyle: SabqType.leadTitle.uiTextStyle
            )

            HStack(spacing: SabqLayout.space8) {
                if showsCategory { HomeTextTag(text: article.categoryTitle) }
                Text(SabqFormatters.arabicRelative(article.publishDate, now: .now))
                    .font(SabqType.timestamp.font)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .contentShape(Rectangle())
    }
}
