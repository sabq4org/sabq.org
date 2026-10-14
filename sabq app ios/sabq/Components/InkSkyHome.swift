import SwiftUI

// MARK: - «حبر وسماء»: مكوّنات الرئيسية
//
// هيرو بعرض الشاشة بأسلوب القصص، ثم شريط «الآن في سبق» على الحبر، ثم ورقة
// المحتوى تتراكب فوقه بزوايا 28. النموذج المعتمد: Design canvas
// «سبق iOS — الاتجاه الجديد» (2026-10-14).

enum InkFormat {
    /// «31 ألف قراءة» / «5 آلاف قراءة» / «840 قراءة».
    static func views(_ n: Int) -> String? {
        guard n > 0 else { return nil }
        if n >= 1_000_000 {
            let m = (Double(n) / 1_000_000 * 10).rounded() / 10
            let s = m == m.rounded() ? String(Int(m)) : String(m)
            return "\(s) مليون قراءة"
        }
        if n >= 1_000 {
            let k = Int((Double(n) / 1_000).rounded())
            return (3...10).contains(k) ? "\(k) آلاف قراءة" : "\(k) ألف قراءة"
        }
        return "\(n) قراءة"
    }

    /// «11:42» بتوقيت الرياض بلا ص/م — الشريط الزمني يقرأ بالدقيقة.
    static func clock(_ date: Date) -> String {
        SabqFormatters.riyadhHourMinute.string(from: date)
    }

    /// «قبل 13 د» مختصرة لبطاقات «الآن».
    static func ago(_ date: Date, now: Date = Date()) -> String {
        let minutes = max(0, Int(now.timeIntervalSince(date) / 60))
        if minutes < 1 { return "الآن" }
        if minutes < 60 { return "قبل \(minutes) د" }
        let hours = minutes / 60
        if hours == 1 { return "قبل ساعة" }
        if hours == 2 { return "قبل ساعتين" }
        if hours < 24 { return "قبل \(hours) \(hours <= 10 ? "ساعات" : "ساعة")" }
        return SabqFormatters.riyadhWeekdayDay.string(from: date)
    }
}

// MARK: - الهيرو

struct InkSkyHero<Header: View>: View {
    let articles: [Article]
    @Binding var index: Int
    let topInset: CGFloat
    let height: CGFloat
    let isBookmarked: (Article) -> Bool
    let onBookmark: (Article) -> Void
    let onListen: (Article) -> Void
    let isPlaying: (Article) -> Bool
    @ViewBuilder let header: () -> Header

    var body: some View {
        ZStack(alignment: .top) {
            InkSky.ink

            TabView(selection: $index) {
                ForEach(Array(articles.enumerated()), id: \.element.id) { i, article in
                    page(article, position: i)
                        .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            VStack(spacing: 16) {
                header()
                if articles.count > 1 { progress }
            }
            .padding(.top, topInset + 6)
            .padding(.horizontal, SabqLayout.pageInset)
        }
        .frame(height: height)
        .clipped()
    }

    /// أشرطة القصص: المقروء ممتلئ، والحالي ممتلئ، والباقي شفاف.
    private var progress: some View {
        HStack(spacing: 5) {
            ForEach(articles.indices, id: \.self) { i in
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(.white.opacity(i <= index ? 1 : 0.28))
                    .frame(height: 3)
            }
        }
        .animation(.easeOut(duration: 0.25), value: index)
        .accessibilityElement()
        .accessibilityLabel("الخبر \(index + 1) من \(articles.count)")
    }

    private func page(_ article: Article, position: Int) -> some View {
        ZStack(alignment: .bottom) {
            NavigationLink(value: article) {
                ZStack(alignment: .bottom) {
                    Color.clear
                        .overlay {
                            if let s = article.imageURL, let url = URL(string: s) {
                                FocalCachedAsyncImage(url: url, focalPoint: article.imageFocalPoint, maxPixelSize: 1600) {
                                    InkSky.inkRaised
                                }
                            } else {
                                InkSky.inkRaised
                            }
                        }
                        .clipped()

                    scrim

                    VStack(alignment: .leading, spacing: 12) {
                        kicker(article)
                        SabqRTLText(
                            article.title,
                            uiFont: SabqFonts.uiDisplay(size: 26, weight: .heavy),
                            color: .white,
                            lineLimit: 4,
                            lineSpacing: 6,
                            textStyle: .title2
                        )
                        if !article.excerpt.isEmpty {
                            SabqRTLText(
                                article.excerpt,
                                uiFont: SabqFonts.uiApp(size: 15, weight: .regular),
                                color: .white.opacity(0.8),
                                lineLimit: 2,
                                lineSpacing: 5
                            )
                        }
                        // مساحة صف الإجراءات المرسوم فوق الرابط.
                        Color.clear.frame(height: 48)
                    }
                    .padding(.horizontal, SabqLayout.pageInset)
                    .padding(.bottom, 26)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // الشارة تحت الرأس وأشرطة القصص لا فوقها.
            .overlay(alignment: .top) {
                Color.clear
                    .frame(maxWidth: .infinity, maxHeight: 1)
                    .padding(.top, topInset + 92)
                    .aiImageBadgeOverlay(isVisible: article.isAiGeneratedImage, model: article.aiImageModel, inset: 6)
                    .allowsHitTesting(false)
            }

            actions(article, position: position)
                .padding(.horizontal, SabqLayout.pageInset)
                .padding(.bottom, 26)
        }
    }

    private var scrim: some View {
        LinearGradient(
            stops: [
                .init(color: InkSky.ink.opacity(0.66), location: 0),
                .init(color: InkSky.ink.opacity(0), location: 0.26),
                .init(color: InkSky.ink.opacity(0), location: 0.34),
                .init(color: InkSky.ink.opacity(0.84), location: 0.64),
                .init(color: InkSky.ink, location: 1),
            ],
            startPoint: .top, endPoint: .bottom
        )
        .allowsHitTesting(false)
    }

    private func kicker(_ article: Article) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 1)
                    .fill(InkSky.sky)
                    .frame(width: 4, height: 14)
                Text(article.categoryTitle)
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(InkSky.sky)
            }
            Text(([InkFormat.ago(article.publishDate)] + [InkFormat.views(article.viewsCount)].compactMap { $0 })
                .joined(separator: " · "))
                .font(SabqFonts.app(size: 13, weight: .regular))
                .foregroundStyle(.white.opacity(0.72))
                .monospacedDigit()
        }
        .lineLimit(1)
    }

    private func actions(_ article: Article, position: Int) -> some View {
        HStack(spacing: 10) {
            if article.slug?.isEmpty == false {
                Button {
                    onListen(article)
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: isPlaying(article) ? "pause.fill" : "headphones")
                            .font(.system(size: 15, weight: .bold))
                        Text(isPlaying(article) ? "إيقاف" : "استمع للملخص")
                            .font(SabqFonts.app(size: 14, weight: .bold))
                    }
                    .foregroundStyle(InkSky.ink)
                    .padding(.horizontal, 16)
                    .frame(height: 44)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(InkSky.sky))
                }
                .buttonStyle(.plain)
            }

            Button {
                SabqHaptics.light()
                onBookmark(article)
            } label: {
                squareIcon(isBookmarked(article) ? "bookmark.fill" : "bookmark")
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isBookmarked(article) ? "إزالة من المحفوظات" : "حفظ الخبر")

            if let s = article.articleURL, let url = URL(string: s) {
                ShareLink(item: url, subject: Text(article.title)) {
                    squareIcon("square.and.arrow.up")
                }
                .accessibilityLabel("مشاركة")
            }

            Spacer(minLength: 0)

            if articles.count > 1 {
                Text("\(position + 1) / \(articles.count)")
                    .font(SabqFonts.display(size: 13, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.6))
                    .monospacedDigit()
                    .accessibilityHidden(true)
            }
        }
    }

    private func squareIcon(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 44, height: 44)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.white.opacity(0.08)))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(.white.opacity(0.2), lineWidth: 1))
    }
}

// MARK: - شريط «الآن في سبق»

struct InkNowStrip<Alert: View>: View {
    let articles: [Article]
    @ViewBuilder let alert: () -> Alert

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            alert()
                .padding(.horizontal, SabqLayout.pageInset)

            HStack(spacing: 10) {
                InkSkyPulse()
                Text("الآن في سبق")
                    .font(SabqFonts.display(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                if let first = articles.first {
                    Text("آخر تحديث \(InkFormat.clock(first.publishDate))")
                        .font(SabqFonts.app(size: 13, weight: .regular))
                        .foregroundStyle(.white.opacity(0.62))
                        .monospacedDigit()
                }
            }
            .padding(.horizontal, SabqLayout.pageInset)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 12) {
                    ForEach(articles) { article in
                        NavigationLink(value: article) {
                            card(article)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, SabqLayout.pageInset)
            }
        }
        .padding(.top, 6)
        .padding(.bottom, 62)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(InkSky.ink)
    }

    private func card(_ article: Article) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(InkFormat.clock(article.publishDate))
                    .font(SabqFonts.display(size: 22, weight: .bold))
                    .foregroundStyle(InkSky.sky)
                    .monospacedDigit()
                Text(InkFormat.ago(article.publishDate))
                    .font(SabqFonts.app(size: 12, weight: .regular))
                    .foregroundStyle(.white.opacity(0.62))
                Spacer(minLength: 0)
                if article.isBreaking {
                    Text("عاجل")
                        .font(SabqFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(InkSky.alertOnInk)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(RoundedRectangle(cornerRadius: 6).fill(SabqTheme.coral.opacity(0.22)))
                }
            }
            Text(article.categoryTitle)
                .font(SabqFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.64))
            SabqRTLText(
                article.title,
                uiFont: SabqFonts.uiSubhead(size: 15),
                color: .white,
                lineLimit: 3,
                lineSpacing: 4
            )
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(width: 252, height: 156, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(InkSky.inkRaised))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(InkSky.sky.opacity(0.16), lineWidth: 1))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - رأس قسم الورقة

struct InkSectionTitle: View {
    let title: String
    var context: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(title)
                .font(SabqFonts.display(size: 22, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .accessibilityAddTraits(.isHeader)
            if let context {
                Text(context)
                    .font(SabqFonts.app(size: 13, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
        }
    }
}

// MARK: - صف الشريط الزمني

struct InkTimelineRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let article: Article
    var isNew: Bool = false
    var isLast: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(InkFormat.clock(article.publishDate))
                    .font(SabqFonts.display(size: 15, weight: .bold))
                    .foregroundStyle(InkSky.accent)
                    .monospacedDigit()
                Text(isNew ? "جديد" : SabqFormatters.riyadhPeriod.string(from: article.publishDate))
                    .font(SabqFonts.app(size: 11, weight: isNew ? .semibold : .regular))
                    .foregroundStyle(isNew ? SabqTheme.leaf : SabqTheme.tertiaryInk)
            }
            .frame(width: 46, alignment: .leading)

            ZStack(alignment: .top) {
                if !isLast {
                    Rectangle()
                        .fill(InkSky.line)
                        .frame(width: 2)
                        .padding(.top, 6)
                        .padding(.bottom, -18)
                }
                Circle()
                    .strokeBorder(InkSky.accent, lineWidth: 2)
                    .background(Circle().fill(InkSky.page))
                    .frame(width: 10, height: 10)
                    .padding(.top, 5)
            }
            .frame(width: 12)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(article.categoryTitle)
                    .font(SabqFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(InkSky.accent)
                    .lineLimit(1)
                SabqRTLText(
                    article.title,
                    uiFont: SabqFonts.uiSubhead(size: 15.5),
                    color: SabqTheme.ink,
                    lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 3,
                    lineSpacing: 4
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            thumbnail
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private var thumbnail: some View {
        Group {
            if let s = article.imageURL, let url = URL(string: s) {
                FocalCachedAsyncImage(url: url, focalPoint: article.imageFocalPoint,
                                      maxPixelSize: LatestTimelineStyle.thumbnailPixels, fitsMismatchedAspect: true) {
                    InkSky.track
                }
            } else {
                InkSky.track
                    .overlay {
                        Image(systemName: article.category.icon)
                            .font(.system(size: 20, weight: .light))
                            .foregroundStyle(InkSky.accent.opacity(0.5))
                    }
            }
        }
        .frame(width: 104, height: 70)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .aiImageBadgeOverlay(isVisible: article.isAiGeneratedImage, model: article.aiImageModel, inset: 4, sizeScale: 0.6)
        .padding(.top, 2)
    }
}

// MARK: - صف «الأكثر تداولًا» بشريط القراءات

struct InkReadsRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let article: Article
    /// نسبة قراءات الخبر إلى أعلاها في القائمة (0…1).
    let share: Double
    let isTop: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            SabqRTLText(
                article.title,
                uiFont: SabqFonts.uiSubhead(size: 15),
                color: SabqTheme.ink,
                lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 2,
                lineSpacing: 4
            )
            if let views = InkFormat.views(article.viewsCount) {
                HStack(spacing: 10) {
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(InkSky.track)
                            Capsule()
                                .fill(isTop ? InkSky.accent : InkSky.accent.opacity(0.45))
                                .frame(width: max(6, g.size.width * share))
                        }
                    }
                    .frame(height: 6)
                    .accessibilityHidden(true)

                    Text(views.replacingOccurrences(of: " قراءة", with: ""))
                        .font(SabqFonts.display(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .monospacedDigit()
                        .frame(minWidth: 52, alignment: .trailing)
                        .accessibilityLabel(views)
                }
            }
        }
        .padding(.vertical, 9)
        .contentShape(Rectangle())
    }
}
