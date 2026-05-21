import SwiftUI
import UIKit

/// "صدى الحج" — homepage block on iOS, mirrors the web HajjBlock.tsx.
///
/// Visibility is 100% driven by the dashboard toggle + season window
/// at `/api/hajj-block`. When the endpoint returns isVisible=false the
/// view renders an EmptyView so it leaves no trace in the layout — no
/// padding, no skeleton, nothing. The same code path covers
/// "block not configured", "outside season", and "no matching
/// articles" because the backend hides all three the same way.
///
/// Sits in HomeFeedView immediately after the personal knowledge
/// journey, between it and the calendar/audio cards.
struct HajjBlockView: View {
    @State private var loader = HajjBlockLoader()

    var body: some View {
        // A zero-size Color.clear keeps the view present in the layout
        // tree even when the block is hidden — without it SwiftUI elides
        // the EmptyView branch and the .task below never fires, so the
        // loader never runs and the block can never become visible.
        ZStack {
            if let block = loader.block, block.isVisible {
                content(block: block)
            } else {
                Color.clear.frame(width: 0, height: 0)
            }
        }
        .task { await loader.load() }
    }

    @ViewBuilder
    private func content(block: APIHajjBlockResponse) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            header(block: block)
            if let phase = block.hajjPhase {
                dayStrip(phase: phase, hajjDay: block.hajjDay, daysToArafat: block.daysToArafat)
            }
            if let articles = block.articles, !articles.isEmpty {
                VStack(spacing: 10) {
                    ForEach(articles) { article in
                        NavigationLink(value: Article.placeholder(slug: article.slug ?? "")) {
                            articleCard(article)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(16)
        .background(
            // Warm ivory → gold gradient in light mode; deep neutral SabqTheme
            // surface tones in dark mode. Adaptive colors come from
            // `Palette.bg*` so SwiftUI re-renders on style change for free.
            LinearGradient(
                colors: [Palette.bg1, Palette.bg2, Palette.bg3],
                startPoint: .topTrailing,
                endPoint: .bottomLeading
            ),
            in: RoundedRectangle(cornerRadius: 20, style: .continuous)
        )
        .overlay(alignment: .topLeading) {
            // Decorative crescent — kept subtle so it reads as texture.
            Image(systemName: "moon.fill")
                .font(.system(size: 36, weight: .ultraLight))
                .foregroundStyle(Palette.moonOverlay)
                .padding(.top, 12)
                .padding(.leading, 12)
                .allowsHitTesting(false)
        }
    }

    // MARK: Header

    private func header(block: APIHajjBlockResponse) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("🕋")
                .font(.system(size: 26))
            VStack(alignment: .leading, spacing: 2) {
                Text(block.title ?? "صدى الحج")
                    .font(.system(size: 19, weight: .bold, design: .rounded))
                    .foregroundStyle(Palette.titleInk)
                if let subtitle = block.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Palette.subtitleInk)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 0)
            if let updated = block.lastUpdatedAt, let date = SabqFormatters.parseISO8601(updated) {
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.system(size: 9))
                    Text(relativeTime(date))
                        .font(.system(size: 10, weight: .medium))
                }
                .foregroundStyle(Palette.secondaryInk)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Palette.chipSurface, in: Capsule())
            }
        }
    }

    // MARK: Day strip — التروية / عرفة / النحر / التشريق, current highlighted

    private struct Phase: Identifiable {
        let id: String
        let nameAr: String
    }
    private let phases: [Phase] = [
        Phase(id: "tarwiyah", nameAr: "التروية"),
        Phase(id: "arafat",   nameAr: "عرفة"),
        Phase(id: "nahr",     nameAr: "النحر"),
        Phase(id: "tashreeq", nameAr: "التشريق"),
    ]

    @ViewBuilder
    private func dayStrip(phase: String, hajjDay: Int?, daysToArafat: Int?) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(phases) { p in
                    let isCurrent = p.id == phase
                    HStack(spacing: 5) {
                        Text("يوم")
                            .font(.system(size: 10, weight: .medium))
                            .opacity(0.7)
                        Text(p.nameAr)
                            .font(.system(size: 11, weight: .bold))
                        if isCurrent, let day = hajjDay {
                            Text("· \(day) ذو الحجة")
                                .font(.system(size: 10, weight: .medium))
                                .opacity(0.75)
                        }
                    }
                    .foregroundStyle(isCurrent ? AnyShapeStyle(.white) : AnyShapeStyle(Palette.secondaryInk))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        isCurrent
                            ? AnyShapeStyle(Palette.goldAccent)
                            : AnyShapeStyle(Palette.chipSurface),
                        in: Capsule()
                    )
                }
                // "Days to Arafat" pill at the end when we're before
                // it — gives the reader a countdown without crowding
                // the title row.
                if phase == "before", let d = daysToArafat, d > 0 {
                    Text(d == 1 ? "غدًا يوم عرفة" : "\(d) أيام حتى يوم عرفة")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(Palette.secondaryInk)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                        .background(Palette.chipSurfaceStrong, in: Capsule())
                }
            }
        }
    }

    // MARK: Article card — tag chip + title + thumbnail

    private func articleCard(_ article: APIHajjArticle) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Text(article.hajjEmoji)
                        .font(.system(size: 11))
                    Text(article.hajjTag)
                        .font(.system(size: 10, weight: .heavy))
                    if article.isPinned == true {
                        Text("★")
                            .font(.system(size: 9, weight: .heavy))
                            .foregroundStyle(Palette.pinnedStar)
                    }
                }
                .foregroundStyle(Palette.secondaryInk)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(Palette.tagChipBg, in: Capsule())

                Text(article.title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Palette.articleTitleInk)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)

                if let published = article.publishedAt,
                   let date = SabqFormatters.parseISO8601(published) {
                    Text(relativeTime(date))
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(Palette.tertiaryInk)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // Thumbnail — falls back to a tinted Kaaba glyph when the
            // article didn't ship a hero image.
            if let urlStr = article.imageUrl, let url = URL(string: urlStr) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    thumbPlaceholder
                }
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else {
                thumbPlaceholder
                    .frame(width: 72, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .padding(10)
        .background(Palette.articleCardBg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Palette.articleCardStroke, lineWidth: 0.5)
        )
    }

    private var thumbPlaceholder: some View {
        ZStack {
            LinearGradient(
                colors: [Palette.thumbStart, Palette.thumbEnd],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            Text("🕋").font(.system(size: 24)).opacity(0.55)
        }
    }

    private func relativeTime(_ date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "ar")
        f.unitsStyle = .full
        return f.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Adaptive palette
//
// Light mode keeps the exact warm ivory/gold values the block shipped
// with (web parity). Dark mode swaps to SabqTheme-aligned neutral
// surfaces with light text, but keeps a warm gold accent on the
// current-phase pill, decorative moon, and pinned star so the block
// still reads as "Hajj" rather than another generic card.
private enum Palette {
    static let bg1 = adaptive(
        light: (0.97, 0.95, 0.92, 1.0),
        dark:  (0.14, 0.14, 0.16, 1.0)
    )
    static let bg2 = adaptive(
        light: (0.93, 0.89, 0.83, 1.0),
        dark:  (0.12, 0.12, 0.14, 1.0)
    )
    static let bg3 = adaptive(
        light: (0.88, 0.83, 0.69, 1.0),
        dark:  (0.10, 0.10, 0.12, 1.0)
    )
    static let titleInk = adaptive(
        light: (0.30, 0.18, 0.04, 1.0),
        dark:  (0.95, 0.95, 0.97, 1.0)
    )
    static let articleTitleInk = adaptive(
        light: (0.20, 0.12, 0.02, 1.0),
        dark:  (0.95, 0.95, 0.97, 1.0)
    )
    static let subtitleInk = adaptive(
        light: (0.30, 0.18, 0.04, 0.70),
        dark:  (0.68, 0.68, 0.72, 1.0)
    )
    static let secondaryInk = adaptive(
        light: (0.45, 0.30, 0.10, 0.75),
        dark:  (0.78, 0.78, 0.82, 1.0)
    )
    static let tertiaryInk = adaptive(
        light: (0.45, 0.30, 0.10, 0.60),
        dark:  (0.56, 0.58, 0.64, 1.0)
    )
    /// Warm gold — current-phase pill background, decorative accents.
    static let goldAccent = adaptive(
        light: (0.55, 0.35, 0.05, 1.0),
        dark:  (0.78, 0.55, 0.18, 1.0)
    )
    /// Low-opacity decorative moon glyph in the corner.
    static let moonOverlay = adaptive(
        light: (0.55, 0.35, 0.05, 0.12),
        dark:  (0.85, 0.65, 0.30, 0.20)
    )
    /// Pill / chip surface — light mode is translucent white, dark mode
    /// is a faint white overlay on the dark base.
    static let chipSurface = adaptive(
        light: (1.0, 1.0, 1.0, 0.45),
        dark:  (1.0, 1.0, 1.0, 0.06)
    )
    static let chipSurfaceStrong = adaptive(
        light: (1.0, 1.0, 1.0, 0.60),
        dark:  (1.0, 1.0, 1.0, 0.10)
    )
    static let articleCardBg = adaptive(
        light: (1.0, 1.0, 1.0, 0.55),
        dark:  (1.0, 1.0, 1.0, 0.05)
    )
    static let articleCardStroke = adaptive(
        light: (1.0, 1.0, 1.0, 0.60),
        dark:  (1.0, 1.0, 1.0, 0.08)
    )
    /// "amber-200/55" — tag chip background behind the hajj tag label.
    static let tagChipBg = adaptive(
        light: (0.91, 0.81, 0.55, 0.55),
        dark:  (0.40, 0.30, 0.10, 0.40)
    )
    /// Pinned-article star — slightly brighter in dark.
    static let pinnedStar = adaptive(
        light: (0.55, 0.35, 0.05, 0.85),
        dark:  (0.92, 0.72, 0.30, 0.95)
    )
    /// Kaaba thumbnail placeholder gradient stops.
    static let thumbStart = adaptive(
        light: (0.91, 0.81, 0.55, 1.0),
        dark:  (0.36, 0.27, 0.10, 1.0)
    )
    static let thumbEnd = adaptive(
        light: (0.85, 0.72, 0.42, 1.0),
        dark:  (0.28, 0.20, 0.06, 1.0)
    )

    private static func adaptive(
        light: (CGFloat, CGFloat, CGFloat, CGFloat),
        dark: (CGFloat, CGFloat, CGFloat, CGFloat)
    ) -> Color {
        Color(UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(red: dark.0, green: dark.1, blue: dark.2, alpha: dark.3)
                : UIColor(red: light.0, green: light.1, blue: light.2, alpha: light.3)
        })
    }
}

// MARK: - Loader

@MainActor
@Observable
private final class HajjBlockLoader {
    private(set) var block: APIHajjBlockResponse?

    func load() async {
        // Silent failure — the block is purely cosmetic. If the
        // endpoint flakes we just don't render it.
        if let response = try? await APIClient.shared.fetchHajjBlock() {
            block = response
        }
    }
}
