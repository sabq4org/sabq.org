import SwiftUI

/// لوحة «سياق الخبر» (نموذج Duo المعتمد 2026-10-15): الموجز الذكي، «القصة حتى
/// الآن»، أخبار مرتبطة، كلمات مفتاحية؛ وللرأي «للكاتب نفسه».
///
/// تُعرض في عمود «الرئيسية» على الشاشة المفتوحة، وفي ورقة سفلية على الشاشة
/// الخارجية. لا تحمل منطق تنقّل: من يعرضها يقرر ماذا يفعل اللمس.
struct ArticleContextView: View {
    let context: ArticleContext
    var onOpenArticle: (Article) -> Void
    var onOpenOpinion: (OpinionArticle) -> Void
    var onOpenKeyword: (String) -> Void

    @Environment(LiteModeManager.self) private var liteManager

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space24) {
            if context.isEmpty {
                emptyState
            }
            if !context.summaryPoints.isEmpty {
                summarySection
            }
            if !context.storySoFar.isEmpty {
                storySection
            }
            if !context.authorOpinions.isEmpty {
                authorSection
            }
            if !context.related.isEmpty {
                relatedSection
            }
            if !context.keywords.isEmpty {
                keywordsSection
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("articleContext")
    }

    // MARK: - Sections

    private var summarySection: some View {
        section(context.kind == .opinion ? "خلاصة المقال" : "الموجز الذكي",
                note: "\(context.summaryPoints.count == 1 ? "نقطة واحدة" : context.summaryPoints.count == 2 ? "نقطتان" : "ثلاث نقاط")") {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                ForEach(Array(context.summaryPoints.enumerated()), id: \.offset) { _, point in
                    HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
                        Circle()
                            .fill(SabqTheme.primary)
                            .frame(width: 5, height: 5)
                            .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
                        Text(point)
                            .sabqText(SabqType.excerpt)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(SabqLayout.cardInset)
            .frame(maxWidth: .infinity, alignment: .leading)
            .sabqBlockSurface()
        }
    }

    private var storySection: some View {
        section("القصة حتى الآن", note: nil) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(context.storySoFar.enumerated()), id: \.element.id) { index, item in
                    let isLast = index == context.storySoFar.count - 1
                    Button {
                        guard !item.isCurrent else { return }
                        SabqHaptics.light()
                        onOpenArticle(item.article)
                    } label: {
                        timelineRow(item, isLast: isLast)
                    }
                    .buttonStyle(.plain)
                    .disabled(item.isCurrent)
                    .accessibilityLabel(timelineAccessibility(item))
                }
            }
        }
    }

    private func timelineRow(_ item: ArticleContextTimelineItem, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            Text(Self.dayMonth.string(from: item.article.publishDate))
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(width: 64, alignment: .leading)
                .padding(.top, 1)

            VStack(spacing: 0) {
                Circle()
                    .fill(item.isCurrent ? SabqTheme.primary : SabqTheme.outline)
                    .frame(width: 10, height: 10)
                    .padding(.top, 4)
                if !isLast {
                    Rectangle()
                        .fill(SabqTheme.separator)
                        .frame(width: 1.5)
                        .frame(maxHeight: .infinity)
                }
            }
            .frame(width: 14)

            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(item.article.title)
                    .font(item.isCurrent ? SabqType.rowTitle.font : SabqType.excerpt.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                if item.isCurrent {
                    Text("هذا الخبر")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.primary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, isLast ? 0 : SabqLayout.space16)
        }
        .contentShape(Rectangle())
    }

    private var relatedSection: some View {
        section("أخبار مرتبطة", note: nil) {
            VStack(spacing: 0) {
                ForEach(Array(context.related.enumerated()), id: \.element.id) { index, article in
                    if index > 0 { SidebarRowDivider() }
                    Button {
                        SabqHaptics.light()
                        onOpenArticle(article)
                    } label: {
                        relatedRow(title: article.title,
                                   meta: "\(article.categoryTitle) · \(HomeSidebarNewsRow.relativeTime(article.publishDate))",
                                   imageURL: article.imageURL,
                                   focalPoint: article.imageFocalPoint,
                                   tint: article.category.tint)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var authorSection: some View {
        section("للكاتب نفسه", note: context.authorName) {
            VStack(spacing: 0) {
                ForEach(Array(context.authorOpinions.enumerated()), id: \.element.id) { index, opinion in
                    if index > 0 { SidebarRowDivider() }
                    Button {
                        SabqHaptics.light()
                        onOpenOpinion(opinion)
                    } label: {
                        relatedRow(title: opinion.title,
                                   meta: HomeSidebarNewsRow.relativeTime(opinion.publishDate),
                                   imageURL: opinion.imageURL,
                                   focalPoint: opinion.imageFocalPoint,
                                   tint: SabqTheme.primary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var keywordsSection: some View {
        section("كلمات مفتاحية", note: nil) {
            FlowLayout(spacing: SabqLayout.space8) {
                ForEach(context.keywords, id: \.self) { keyword in
                    Button {
                        SabqHaptics.light()
                        onOpenKeyword(keyword)
                    } label: {
                        Text(keyword)
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .padding(.horizontal, SabqLayout.space12)
                            .frame(minHeight: 32)
                            .background(
                                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                    .fill(SabqTheme.surfaceMuted)
                            )
                            .frame(minHeight: SabqLayout.touchTarget)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var emptyState: some View {
        Text("لا سياق إضافيًا لهذا الخبر بعد.")
            .font(SabqType.meta.font)
            .foregroundStyle(SabqTheme.textSecondary)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, SabqLayout.space24)
    }

    // MARK: - Building blocks

    private func section<Content: View>(_ title: String, note: String?, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
                Text(title)
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                if let note, !note.isEmpty {
                    Text(note)
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .lineLimit(1)
                }
            }
            .accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func relatedRow(title: String, meta: String, imageURL: String?, focalPoint: ImageFocalPoint?, tint: Color) -> some View {
        // صف بلا بطاقة على الصفحة، والمصغّرة في طرف السطر كـ`CompactArticleRow`.
        // `tint` لم يعد يلوّن الخانة: الخانة الموحّدة لكل الصور.
        _ = tint
        return HStack(alignment: .top, spacing: SabqLayout.space12) {
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                Text(meta)
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !liteManager.isLiteActive {
                Group {
                    if let imageURL, let url = URL(string: imageURL) {
                        FocalCachedAsyncImage(url: url, focalPoint: focalPoint, maxPixelSize: 240) {
                            SabqImagePlaceholder()
                        }
                    } else {
                        SabqImagePlaceholder()
                            .environment(\.sabqImageLoadFailed, true)
                    }
                }
                .frame(width: 80, height: 45)
                .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
            }
        }
        .padding(.vertical, SabqLayout.space12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func timelineAccessibility(_ item: ArticleContextTimelineItem) -> String {
        let date = Self.dayMonth.string(from: item.article.publishDate)
        return item.isCurrent ? "\(date)، \(item.article.title)، هذا الخبر" : "\(date)، \(item.article.title)"
    }

    /// «2 سبتمبر» بأرقام لاتينية وبتوقيت الرياض، كبقية تواريخ التطبيق.
    private static let dayMonth: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar-SA-u-ca-gregory-nu-latn")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = "d MMMM"
        return f
    }()
}

/// ورقة «سياق الخبر» على الشاشة الخارجية لـ Duo: المحتوى نفسه في ورقة سفلية.
struct ArticleContextSheet: View {
    let context: ArticleContext
    var onOpenArticle: (Article) -> Void
    var onOpenOpinion: (OpinionArticle) -> Void
    var onOpenKeyword: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("سياق الخبر")
                        .font(SabqType.sectionHeading.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(SabqFonts.app(size: 16, weight: .semibold))
                            .foregroundStyle(SabqTheme.textSecondary)
                            .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("إغلاق")
                }
                ArticleContextView(
                    context: context,
                    onOpenArticle: onOpenArticle,
                    onOpenOpinion: onOpenOpinion,
                    onOpenKeyword: onOpenKeyword
                )
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, SabqLayout.space24)
        }
        .background(SabqTheme.background)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .sabqRTL()
    }
}
