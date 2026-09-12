import SwiftUI

/// الحاوية الموحدة لكل بلوك قائمة بجوار/تحت الخبر أو المقال — نقل
/// `ArticleSidebarModule` من الويب (#1610): سطح أزرق فاتح بدرجة الويب
/// (`SabqTheme.publicSurface`)، عنوان واحد بأيقونة في مربع، وصف، رابط إجراء
/// اختياري، ثم صفوف بشكل بطاقة الخبر المضغوطة يفصلها خط شعري — فتُقرأ
/// «اقرأ أيضاً» و«مقالات قد تهمك» و«مقالات أخرى» كعائلة واحدة.
struct ArticleSidebarModule<Content: View, Action: View>: View {
    let title: String
    let description: String
    let icon: String
    @ViewBuilder let action: () -> Action
    @ViewBuilder let content: () -> Content

    init(
        title: String,
        description: String,
        icon: String,
        @ViewBuilder action: @escaping () -> Action,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.description = description
        self.icon = icon
        self.action = action
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            heading
                .padding(.bottom, 14)
            Divider().overlay(SabqTheme.outline)
                .padding(.bottom, 2)
            VStack(alignment: .leading, spacing: 0) {
                content()
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(SabqTheme.publicSurface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(SabqTheme.outline, lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .frame(width: 34, height: 34)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(SabqTheme.primaryEnd.opacity(0.10))
                    )
                Text(title)
                    .font(SabqFonts.app(size: 20, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            HStack(alignment: .center, spacing: 8) {
                Text(description)
                    .font(SabqFonts.app(size: 14, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(2)
                Spacer(minLength: 0)
                action()
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
        }
    }

}

/// الخط الشعري بين صفوف القائمة داخل الحاوية الموحدة.
struct SidebarRowDivider: View {
    var body: some View {
        Divider().overlay(SabqTheme.outline.opacity(0.8))
    }
}

extension ArticleSidebarModule where Action == EmptyView {
    init(
        title: String,
        description: String,
        icon: String,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.init(title: title, description: description, icon: icon, action: { EmptyView() }, content: content)
    }
}

/// صف بشكل بطاقة الخبر المضغوطة داخل الحاوية الموحدة: صورة 104×84 بإطار
/// خفيف، عنوان سطرين، ثم سطر بيانات (صورة الكاتب الصغيرة + اسمه · الوقت).
/// نقل `SidebarArticleCard` من الويب (#1610/#1612/#1624).
struct SidebarArticleRow: View {
    let title: String
    var imageURL: String? = nil
    /// اسم الكاتب لمقالات الرأي أو اسم القسم للتوصيات.
    var byline: String? = nil
    /// صورة دائرية صغيرة (20) قبل الاسم — لمقالات الرأي.
    var bylineAvatarURL: String? = nil
    /// الوقت النسبي؛ nil لبلوك الرأي داخل الخبر (يُقرأ كقائمة كتّاب لا خطًّا زمنيًا).
    var date: String? = nil
    var placeholderIcon: String = "newspaper"
    var placeholderTint: Color = SabqTheme.primaryEnd

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            thumbnail

            VStack(alignment: .leading, spacing: 6) {
                SabqRTLText(
                    title,
                    uiFont: SabqFonts.uiApp(size: 15, weight: .semibold),
                    color: SabqTheme.ink,
                    lineLimit: 2,
                    lineSpacing: 3
                )

                if byline != nil || date != nil {
                    HStack(spacing: 6) {
                        if let byline {
                            HStack(spacing: 6) {
                                if let bylineAvatarURL, !bylineAvatarURL.isEmpty {
                                    OpinionAuthorAvatar(name: byline, imageURL: bylineAvatarURL, size: 20)
                                }
                                Text(byline)
                                    .lineLimit(1)
                            }
                        }
                        if byline != nil, date != nil {
                            Text("·")
                        }
                        if let date {
                            HStack(spacing: 4) {
                                Image(systemName: "clock")
                                    .font(SabqFonts.app(size: 10, weight: .regular))
                                Text(date)
                            }
                        }
                    }
                    .font(SabqFonts.app(size: 12, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var thumbnail: some View {
        Group {
            if let imageURL, !imageURL.isEmpty, let url = URL(string: imageURL) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    placeholder
                }
            } else {
                placeholder
            }
        }
        .frame(width: 104, height: 84)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(SabqTheme.ink.opacity(0.12), lineWidth: 1)
        )
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(placeholderTint.opacity(0.10))
            .overlay {
                Image(systemName: placeholderIcon)
                    .font(SabqFonts.app(size: 20, weight: .light))
                    .foregroundStyle(placeholderTint.opacity(0.45))
            }
    }
}
