import SwiftUI

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
        Group {
            if let block = loader.block, block.isVisible {
                content(block: block)
            } else {
                EmptyView()
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
            // Warm ivory → gold gradient — same palette as the web
            // block. Keeps it visually distinct from the surrounding
            // SabqTheme cards without competing with the breaking-
            // news red.
            LinearGradient(
                colors: [
                    Color(red: 0.97, green: 0.95, blue: 0.92),
                    Color(red: 0.93, green: 0.89, blue: 0.83),
                    Color(red: 0.88, green: 0.83, blue: 0.69),
                ],
                startPoint: .topTrailing,
                endPoint: .bottomLeading
            ),
            in: RoundedRectangle(cornerRadius: 20, style: .continuous)
        )
        .overlay(alignment: .topLeading) {
            // Decorative crescent — kept subtle so it reads as texture.
            Image(systemName: "moon.fill")
                .font(.system(size: 36, weight: .ultraLight))
                .foregroundStyle(Color(red: 0.55, green: 0.35, blue: 0.05).opacity(0.12))
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
                    .foregroundStyle(Color(red: 0.30, green: 0.18, blue: 0.04))
                if let subtitle = block.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Color(red: 0.30, green: 0.18, blue: 0.04).opacity(0.70))
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
                .foregroundStyle(Color(red: 0.45, green: 0.30, blue: 0.10).opacity(0.75))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(.white.opacity(0.45), in: Capsule())
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
                    .foregroundStyle(isCurrent
                        ? .white
                        : Color(red: 0.45, green: 0.30, blue: 0.10).opacity(0.75))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        isCurrent
                            ? AnyShapeStyle(Color(red: 0.55, green: 0.35, blue: 0.05))
                            : AnyShapeStyle(.white.opacity(0.45)),
                        in: Capsule()
                    )
                }
                // "Days to Arafat" pill at the end when we're before
                // it — gives the reader a countdown without crowding
                // the title row.
                if phase == "before", let d = daysToArafat, d > 0 {
                    Text(d == 1 ? "غدًا يوم عرفة" : "\(d) أيام حتى يوم عرفة")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(Color(red: 0.45, green: 0.30, blue: 0.10))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                        .background(.white.opacity(0.60), in: Capsule())
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
                            .foregroundStyle(Color(red: 0.55, green: 0.35, blue: 0.05).opacity(0.85))
                    }
                }
                .foregroundStyle(Color(red: 0.45, green: 0.30, blue: 0.10))
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(
                    Color(red: 0.91, green: 0.81, blue: 0.55).opacity(0.55),
                    in: Capsule()
                )

                Text(article.title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Color(red: 0.20, green: 0.12, blue: 0.02))
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)

                if let published = article.publishedAt,
                   let date = SabqFormatters.parseISO8601(published) {
                    Text(relativeTime(date))
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(Color(red: 0.45, green: 0.30, blue: 0.10).opacity(0.60))
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
        .background(.white.opacity(0.55), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(.white.opacity(0.60), lineWidth: 0.5)
        )
    }

    private var thumbPlaceholder: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.91, green: 0.81, blue: 0.55),
                    Color(red: 0.85, green: 0.72, blue: 0.42),
                ],
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
