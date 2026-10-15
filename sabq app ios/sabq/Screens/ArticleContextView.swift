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
        VStack(alignment: .leading, spacing: 22) {
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
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(context.summaryPoints.enumerated()), id: \.offset) { _, point in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Circle()
                            .fill(SabqTheme.primaryEnd)
                            .frame(width: 5, height: 5)
                            .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
                        Text(point)
                            .font(SabqFonts.app(size: 14, weight: .regular))
                            .foregroundStyle(SabqTheme.ink)
                            .lineSpacing(4)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(card)
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
        HStack(alignment: .top, spacing: 10) {
            Text(Self.dayMonth.string(from: item.article.publishDate))
                .font(SabqFonts.app(size: 11.5, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .frame(width: 64, alignment: .leading)
                .padding(.top, 1)

            VStack(spacing: 0) {
                Circle()
                    .fill(item.isCurrent ? SabqTheme.primaryEnd : SabqTheme.outline)
                    .frame(width: 10, height: 10)
                    .overlay {
                        if item.isCurrent {
                            Circle().stroke(SabqTheme.primaryEnd.opacity(0.25), lineWidth: 4)
                        }
                    }
                    .padding(.top, 4)
                if !isLast {
                    Rectangle()
                        .fill(SabqTheme.outline)
                        .frame(width: 1.5)
                        .frame(maxHeight: .infinity)
                }
            }
            .frame(width: 14)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.article.title)
                    .font(SabqFonts.app(size: 13.5, weight: item.isCurrent ? .semibold : .regular))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                if item.isCurrent {
                    Text("هذا الخبر")
                        .font(SabqFonts.app(size: 11, weight: .medium))
                        .foregroundStyle(SabqTheme.primaryEnd)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, isLast ? 0 : 14)
        }
        .contentShape(Rectangle())
    }

    private var relatedSection: some View {
        section("أخبار مرتبطة", note: nil) {
            VStack(spacing: 8) {
                ForEach(context.related) { article in
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
            VStack(spacing: 8) {
                ForEach(context.authorOpinions) { opinion in
                    Button {
                        SabqHaptics.light()
                        onOpenOpinion(opinion)
                    } label: {
                        relatedRow(title: opinion.title,
                                   meta: HomeSidebarNewsRow.relativeTime(opinion.publishDate),
                                   imageURL: opinion.imageURL,
                                   focalPoint: opinion.imageFocalPoint,
                                   tint: SabqTheme.primaryEnd)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var keywordsSection: some View {
        section("كلمات مفتاحية", note: nil) {
            FlowLayout(spacing: 8) {
                ForEach(context.keywords, id: \.self) { keyword in
                    Button {
                        SabqHaptics.light()
                        onOpenKeyword(keyword)
                    } label: {
                        Text(keyword)
                            .font(SabqFonts.app(size: 12.5, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(SabqTheme.surface)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(SabqTheme.outline, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var emptyState: some View {
        Text("لا سياق إضافيًا لهذا الخبر بعد.")
            .font(SabqFonts.app(size: 13, weight: .regular))
            .foregroundStyle(SabqTheme.secondaryInk)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 24)
    }

    // MARK: - Building blocks

    private func section<Content: View>(_ title: String, note: String?, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(title)
                    .font(SabqFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                if let note, !note.isEmpty {
                    Text(note)
                        .font(SabqFonts.app(size: 11.5, weight: .regular))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .lineLimit(1)
                }
            }
            .accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func relatedRow(title: String, meta: String, imageURL: String?, focalPoint: ImageFocalPoint?, tint: Color) -> some View {
        HStack(alignment: .center, spacing: 10) {
            if !liteManager.isLiteActive {
                Group {
                    if let imageURL, let url = URL(string: imageURL) {
                        FocalCachedAsyncImage(url: url, focalPoint: focalPoint, maxPixelSize: 200) {
                            tint.opacity(0.10)
                        }
                    } else {
                        tint.opacity(0.10)
                    }
                }
                .frame(width: 60, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(SabqFonts.app(size: 13.5, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                Text(meta)
                    .font(SabqFonts.app(size: 11, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(10)
        .background(card)
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var card: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(SabqTheme.surface)
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
                        .font(SabqFonts.app(size: 18, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(SabqTheme.secondaryInk)
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
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .background(SabqTheme.background)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .sabqRTL()
    }
}
