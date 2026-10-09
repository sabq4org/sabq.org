import SwiftUI

// MARK: - رأس القسم الموحّد في الرئيسية
//
// سطر واحد لكل أقسام الرئيسية: العنوان، ثم سياق قصير اختياري، ثم رابط
// «الكل». بلا مربع أيقونة ولا جملة فرعية — كان لكل قسم رأس بشكل مختلف
// (نموذج الرئيسية المعتمد 2026-10-09).

struct HomeSectionHeader<Link: View>: View {
    let title: String
    var context: String? = nil
    var showsLiveDot: Bool = false
    @ViewBuilder var link: () -> Link

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(title)
                .font(SabqFonts.app(size: 20, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)

            if let context {
                HStack(spacing: 6) {
                    if showsLiveDot {
                        Circle()
                            .fill(SabqTheme.leaf)
                            .frame(width: 7, height: 7)
                    }
                    Text(context)
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            link()
        }
    }
}

extension HomeSectionHeader where Link == EmptyView {
    init(title: String, context: String? = nil, showsLiveDot: Bool = false) {
        self.init(title: title, context: context, showsLiveDot: showsLiveDot) { EmptyView() }
    }
}

/// نص رابط «الكل ‹» في رأس القسم.
struct HomeSectionLinkLabel: View {
    var title: String = "الكل"

    var body: some View {
        HStack(spacing: 2) {
            Text(title)
                .font(SabqFonts.app(size: 14, weight: .semibold))
            Image(systemName: "chevron.left")
                .font(SabqFonts.app(size: 11, weight: .semibold))
        }
        .foregroundStyle(SabqTheme.primaryEnd)
        .fixedSize()
    }
}

/// حاوية الأقسام المنتقاة (مُقترب، الأكثر تداولًا، الرأي): الرأس الموحّد ثم
/// الصفوف بفواصل شعرية داخل بطاقة واحدة.
struct HomeSectionCard<Link: View, Content: View>: View {
    let title: String
    var context: String? = nil
    var fill: Color = SabqTheme.surface
    var showsShadow: Bool = true
    @ViewBuilder var link: () -> Link
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HomeSectionHeader(title: title, context: context, link: link)
                .padding(.bottom, 6)
            VStack(alignment: .leading, spacing: 0) {
                content()
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(fill)
                .shadow(color: showsShadow ? SabqTheme.shadow : .clear, radius: 12, x: 0, y: 4)
        )
        .accessibilityElement(children: .contain)
    }
}

// MARK: - الشريط الزمني لـ«آخر الأخبار»
//
// خط عمودي على يمين القائمة، وعلى كل خبر نقطة بلون تصنيفه ووقت نشره
// بالدقيقة. بمعدل 15 خبرًا في الساعة يبقى لكل خبر وقت ثابت يميّزه بدل
// «قبل X دقيقة» المتغيّر. فاصل «أمس» يظهر فقط حين يتغيّر اليوم.

enum LatestTimelineStyle {
    static let railWidth: CGFloat = 15
    static let railLine: CGFloat = 2
    static let dotSize: CGFloat = 9
    static let gap: CGFloat = 12
    static let thumbnailWidth: CGFloat = 96
    static let thumbnailHeight: CGFloat = 72
    /// بداية الفاصل بين الصفوف: بعد عمود الخط مباشرة.
    static var dividerInset: CGFloat { railWidth + gap }
}

/// الخط العمودي خلف نقاط الشريط الزمني — يوضع خلف القائمة كاملة.
struct LatestTimelineRail: View {
    var body: some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(SabqTheme.outline)
                .frame(width: LatestTimelineStyle.railLine)
                .frame(width: LatestTimelineStyle.railWidth)
            Spacer(minLength: 0)
        }
        .padding(.top, 14)
        .accessibilityHidden(true)
    }
}

/// سطر «الآن 10:58 ص · تتحدّث تلقائيًا» أعلى الخط.
struct LatestTimelineNowRow: View {
    var body: some View {
        TimelineView(.everyMinute) { context in
            HStack(spacing: LatestTimelineStyle.gap - 2) {
                PulsingDot(color: SabqTheme.leaf)
                    .frame(width: LatestTimelineStyle.railWidth, height: 18)
                Text("الآن \(SabqFormatters.riyadhHourMinute.string(from: context.date)) \(SabqFormatters.riyadhPeriod.string(from: context.date)) · تتحدّث تلقائيًا")
                    .font(SabqFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(SabqTheme.leaf)
                    .monospacedDigit()
                Spacer(minLength: 0)
            }
            .padding(.bottom, 2)
        }
    }
}

/// فاصل اليوم داخل الشريط: «أمس · الخميس 8 أكتوبر».
struct LatestTimelineDayDivider: View {
    let date: Date

    private var label: String {
        let cal = SabqFormatters.riyadhCalendar
        let full = SabqFormatters.riyadhWeekdayDay.string(from: date)
        if cal.isDateInYesterday(date) { return "أمس · \(full)" }
        return full
    }

    var body: some View {
        HStack(spacing: LatestTimelineStyle.gap) {
            Circle()
                .strokeBorder(SabqTheme.tertiaryInk, lineWidth: 2)
                .background(Circle().fill(SabqTheme.background))
                .frame(width: 11, height: 11)
                .frame(width: LatestTimelineStyle.railWidth)
            Text(label)
                .font(SabqFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(SabqTheme.secondaryInk)
                .fixedSize()
            Rectangle()
                .fill(SabqTheme.outline)
                .frame(height: 1)
        }
        .padding(.top, 14)
        .padding(.bottom, 2)
        .accessibilityElement(children: .combine)
    }
}

/// صف خبر في الشريط الزمني: نقطة التصنيف، ثم الوقت والتصنيف والعنوان، ثم الصورة.
struct LatestTimelineRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let article: Article
    var isNew: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: LatestTimelineStyle.gap) {
            Circle()
                .fill(article.category.tint)
                .frame(width: LatestTimelineStyle.dotSize, height: LatestTimelineStyle.dotSize)
                .overlay(Circle().stroke(SabqTheme.background, lineWidth: 3))
                .frame(width: LatestTimelineStyle.railWidth)
                .padding(.top, 5)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 5) {
                kicker
                SabqRTLText(
                    article.title,
                    uiFont: SabqFonts.uiSubhead(size: NewsRowStyle.compactTitleSize),
                    color: SabqTheme.ink,
                    lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : NewsRowStyle.compactTitleLines,
                    lineSpacing: NewsRowStyle.titleLineSpacing
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            thumbnail
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private var kicker: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(SabqFormatters.riyadhHourMinute.string(from: article.publishDate))
                    .font(SabqFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .monospacedDigit()
                Text(SabqFormatters.riyadhPeriod.string(from: article.publishDate))
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            if isNew {
                Text("جديد")
                    .font(SabqFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(SabqTheme.leaf)
            }
            Text(article.categoryTitle)
                .font(SabqFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(article.category.tint)
                .lineLimit(1)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var thumbnail: some View {
        Group {
            if let urlString = article.imageURL, let url = URL(string: urlString) {
                FocalCachedAsyncImage(url: url, focalPoint: article.imageFocalPoint, maxPixelSize: 260) {
                    placeholder
                }
            } else {
                placeholder
            }
        }
        .frame(width: LatestTimelineStyle.thumbnailWidth, height: LatestTimelineStyle.thumbnailHeight)
        .clipShape(RoundedRectangle(cornerRadius: NewsRowStyle.thumbnailRadius, style: .continuous))
        .aiImageBadgeOverlay(
            isVisible: article.isAiGeneratedImage,
            model: article.aiImageModel,
            inset: 4,
            sizeScale: 0.65
        )
        .padding(.top, 2)
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: NewsRowStyle.thumbnailRadius, style: .continuous)
            .fill(article.category.tint.opacity(0.10))
            .overlay {
                Image(systemName: article.category.icon)
                    .font(SabqFonts.app(size: 22, weight: .light))
                    .foregroundStyle(article.category.tint.opacity(0.5))
            }
    }
}

// MARK: - صف الرأي

/// صف رأي يقوده الكاتب: صورته، ثم اسمه الكامل والوقت، ثم العنوان في سطرين.
/// كل الصفوف متساوية بلا مقال بارز (قرار المالك 2026-10-09).
struct OpinionWriterRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let opinion: OpinionArticle

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            OpinionAuthorAvatar(name: opinion.authorName, imageURL: opinion.authorImageURL, size: 52)
                .overlay(Circle().stroke(SabqTheme.surface, lineWidth: 2))

            VStack(alignment: .leading, spacing: 3) {
                Text("\(nameText)\(timeText)")
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)

                SabqRTLText(
                    opinion.title,
                    uiFont: SabqFonts.uiSubhead(size: NewsRowStyle.compactTitleSize),
                    color: SabqTheme.ink,
                    lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 2,
                    lineSpacing: NewsRowStyle.titleLineSpacing
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 14)
        .contentShape(Rectangle())
    }

    private var nameText: Text {
        Text(opinion.authorName)
            .font(SabqFonts.app(size: 13, weight: .semibold))
            .foregroundStyle(SabqTheme.brandBlue)
    }

    private var timeText: Text {
        Text(" · \(opinion.relativeDate)")
            .font(SabqFonts.app(size: 12, weight: .regular))
            .foregroundStyle(SabqTheme.tertiaryInk)
    }
}

/// فاصل صفوف الرأي على البطاقة السماوية.
struct OpinionRowDivider: View {
    var body: some View {
        Rectangle()
            .fill(SabqTheme.primaryEnd.opacity(0.18))
            .frame(height: 0.5)
    }
}
