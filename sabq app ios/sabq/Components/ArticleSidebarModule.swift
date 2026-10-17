import SwiftUI

/// الحاوية الموحدة لكل بلوك قائمة بجوار/تحت الخبر أو المقال — نقل
/// `ArticleSidebarModule` من الويب (#1610). بعد النموذج المعتمد (#1913) صارت
/// قسمًا بلا صندوق كـ`HomeSectionCard`: عنوان 20 عريض، وصف قصير، رابط إجراء
/// اختياري، ثم صفوف بفواصل رفيعة على الصفحة مباشرة.
struct ArticleSidebarModule<Content: View, Action: View>: View {
    let title: String
    let description: String
    /// محفوظ للتوافق مع النداءات القائمة؛ الرأس الموحّد بلا مربع أيقونة.
    let icon: String
    /// محفوظ للتوافق؛ القسم لم يعد يرسم سطحًا خلفه.
    var fill: Color = SabqTheme.background
    @ViewBuilder let action: () -> Action
    @ViewBuilder let content: () -> Content

    init(
        title: String,
        description: String,
        icon: String,
        fill: Color = SabqTheme.background,
        @ViewBuilder action: @escaping () -> Action,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.description = description
        self.icon = icon
        self.fill = fill
        self.action = action
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            heading
                .padding(.bottom, SabqLayout.space4)
            VStack(alignment: .leading, spacing: 0) {
                content()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }

    private var heading: some View {
        HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space12) {
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(title)
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text(description)
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            action()
                .font(SabqType.tag.font)
                .foregroundStyle(SabqTheme.primary)
        }
    }

}

/// الخط الشعري بين صفوف القائمة داخل الحاوية الموحدة.
struct SidebarRowDivider: View {
    var body: some View {
        Rectangle()
            .fill(SabqTheme.separator)
            .frame(height: 1)
    }
}

extension ArticleSidebarModule where Action == EmptyView {
    init(
        title: String,
        description: String,
        icon: String,
        fill: Color = SabqTheme.background,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.init(title: title, description: description, icon: icon, fill: fill, action: { EmptyView() }, content: content)
    }
}

/// صف بشكل `CompactArticleRow` داخل الحاوية الموحدة: عنوان 16 في سطرين،
/// سطر بيانات (صورة الكاتب الصغيرة + اسمه · الوقت)، والمصغّرة 112×63 في طرف
/// السطر. نقل `SidebarArticleCard` من الويب (#1610/#1612/#1624).
struct SidebarArticleRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let title: String
    var imageURL: String? = nil
    /// اسم الكاتب لمقالات الرأي أو اسم القسم للتوصيات.
    var byline: String? = nil
    /// صورة دائرية صغيرة (20) قبل الاسم — لمقالات الرأي.
    var bylineAvatarURL: String? = nil
    /// الوقت النسبي؛ nil لبلوك الرأي داخل الخبر (يُقرأ كقائمة كتّاب لا خطًّا زمنيًا).
    var date: String? = nil
    /// محفوظان للتوافق؛ الخانة الموحّدة (`SabqImagePlaceholder`) لكل الصور.
    var placeholderIcon: String = "newspaper"
    var placeholderTint: Color = SabqTheme.primary

    var body: some View {
        HStack(alignment: .top, spacing: NewsRowStyle.thumbnailGap) {
            VStack(alignment: .leading, spacing: NewsRowStyle.textStackSpacing) {
                SabqRTLText(
                    title,
                    uiFont: SabqType.rowTitle.uiFont,
                    color: SabqTheme.textPrimary,
                    lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 2,
                    lineSpacing: NewsRowStyle.titleLineSpacing,
                    textStyle: SabqType.rowTitle.uiTextStyle
                )

                if byline != nil || date != nil {
                    HStack(spacing: SabqLayout.space4) {
                        if let byline {
                            HStack(spacing: SabqLayout.space8) {
                                if let bylineAvatarURL, !bylineAvatarURL.isEmpty {
                                    OpinionAuthorAvatar(name: byline, imageURL: bylineAvatarURL, size: 20)
                                }
                                Text(byline)
                                    .lineLimit(1)
                                    .foregroundStyle(SabqTheme.textSecondary)
                            }
                        }
                        if byline != nil, date != nil {
                            Text("·")
                        }
                        if let date {
                            Text(date)
                        }
                    }
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            thumbnail
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var thumbnail: some View {
        Group {
            if let imageURL, !imageURL.isEmpty, let url = URL(string: imageURL) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    SabqImagePlaceholder()
                }
            } else {
                SabqImagePlaceholder()
                    .environment(\.sabqImageLoadFailed, true)
            }
        }
        .frame(width: NewsRowStyle.thumbnailWidth, height: NewsRowStyle.thumbnailHeight)
        .clipShape(RoundedRectangle(cornerRadius: NewsRowStyle.thumbnailRadius, style: .continuous))
    }
}
