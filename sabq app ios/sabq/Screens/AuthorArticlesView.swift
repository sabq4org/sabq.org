import SwiftUI

// Redesigned "writer page" — fetches a full author profile from
// `/api/v1/authors/by-name` (avatar, role, bio, lifetime stats, top
// categories, recent articles) and lays it out as:
//
//   1. Hero card with gradient — avatar + name + role pill + bio.
//   2. Stats strip — articles count / total reads / time on sabq.
//   3. Top-categories chip row — the 3 areas the author writes in most.
//   4. Articles list — the latest 30 publications, classic compact rows.
//
// Falls back to the legacy in-memory filter if the API call fails (no
// network / unknown name) so the page still renders something useful.
struct AuthorArticlesView: View {
    let authorName: String

    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(\.dismiss) private var dismiss

    @State private var page: APIAuthorPage?
    @State private var isLoading = true
    @State private var hasFetched = false

    /// Articles fed into the list. Prefers the server payload; falls back
    /// to whatever's been loaded in `articlesStore` so the screen has
    /// content even before the network round-trip resolves.
    private var articles: [Article] {
        if let recent = page?.recentArticles, !recent.isEmpty {
            return recent.map { Article.from($0) }
        }
        return articlesStore.allArticles
            .filter { $0.author == authorName }
            .sorted { $0.publishDate > $1.publishDate }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                heroCard

                if !isLoading || page != nil {
                    statsStrip
                }

                if let cats = page?.topCategories, !cats.isEmpty {
                    topCategoriesRow(cats)
                }

                articlesSection
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 60)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                        .padding(8)
                        .background(Circle().fill(.ultraThinMaterial))
                }
            }
        }
        .task {
            guard !hasFetched else { return }
            hasFetched = true
            await load()
        }
    }

    // MARK: - Hero

    private var heroCard: some View {
        VStack(spacing: 14) {
            avatar

            VStack(spacing: 8) {
                Text(page?.author.name ?? authorName)
                    .font(SabqFonts.app(size: 22, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                    .multilineTextAlignment(.center)

                if let role = page?.author.role, !role.isEmpty {
                    Text(role)
                        .font(SabqFonts.app(size: 12, weight: .heavy))
                        .tracking(0.4)
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                        .background(
                            Capsule(style: .continuous)
                                .fill(SabqTheme.primaryEnd.opacity(0.10))
                        )
                        .overlay(
                            Capsule(style: .continuous)
                                .stroke(SabqTheme.primaryEnd.opacity(0.20), lineWidth: 0.5)
                        )
                }
            }

            if let bio = page?.author.bio, !bio.isEmpty {
                Text(bio)
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .lineLimit(4)
                    .padding(.horizontal, 8)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            SabqTheme.primaryEnd.opacity(0.10),
                            SabqTheme.surface,
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .shadow(color: SabqTheme.shadow, radius: 12, x: 0, y: 4)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.primaryEnd.opacity(0.16), lineWidth: 0.6)
        )
    }

    private var avatar: some View {
        let avatarURL = page?.author.avatarUrl.flatMap { URL(string: $0) }

        return CachedAsyncImage(url: avatarURL, contentMode: .fill) {
            avatarInitial
        }
        .frame(width: 88, height: 88)
        .clipShape(Circle())
        .overlay(
            Circle().stroke(SabqTheme.primaryEnd.opacity(0.25), lineWidth: 2)
        )
        .shadow(color: SabqTheme.primaryEnd.opacity(0.18), radius: 10, y: 4)
        // Re-load when the profile payload arrives (page starts nil).
        .id(avatarURL?.absoluteString ?? "author-avatar-\(authorName)")
    }

    private var avatarInitial: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [SabqTheme.primaryEnd.opacity(0.22), SabqTheme.primaryEnd.opacity(0.10)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 88, height: 88)
            Text(String((page?.author.name ?? authorName).prefix(1)))
                .font(SabqFonts.app(size: 36, weight: .heavy))
                .foregroundStyle(SabqTheme.primaryEnd)
        }
    }

    // MARK: - Stats

    private var statsStrip: some View {
        HStack(spacing: 10) {
            statTile(
                value: SabqFormatters.compactViewCount(page?.stats.articleCount ?? articles.count),
                label: "مقال",
                icon: "doc.text.fill",
                tint: SabqTheme.primaryEnd
            )
            statTile(
                value: SabqFormatters.compactViewCount(page?.stats.totalViews ?? 0),
                label: "قراءة",
                icon: "eye.fill",
                tint: SabqTheme.teal
            )
            statTile(
                value: timeOnSabq(),
                label: "مع سبق",
                icon: "calendar",
                tint: SabqTheme.gold
            )
        }
    }

    private func statTile(value: String, label: String, icon: String, tint: Color) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 10, weight: .semibold))
                Text(label)
                    .font(SabqFonts.app(size: 10, weight: .heavy))
                    .tracking(0.2)
            }
            .foregroundStyle(tint)

            Text(value)
                .font(SabqFonts.app(size: 19, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(SabqTheme.surface)
                .shadow(color: SabqTheme.shadow, radius: 6, x: 0, y: 2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(tint.opacity(0.18), lineWidth: 0.5)
        )
    }

    /// Years/months since the author's earliest publish. Falls back to
    /// `joinedAt` (createdAt on the user row) when the publish data
    /// hasn't loaded yet.
    private func timeOnSabq() -> String {
        let iso = page?.stats.earliestPublish ?? page?.author.joinedAt
        guard let iso, let date = SabqFormatters.parseISO8601(iso) else {
            return "—"
        }
        let cal = Calendar(identifier: .gregorian)
        let comps = cal.dateComponents([.year, .month], from: date, to: Date())
        let years = comps.year ?? 0
        let months = comps.month ?? 0
        if years >= 1 {
            return years == 1 ? "سنة" : "\(years) سنوات"
        }
        if months >= 1 {
            return months == 1 ? "شهر" : "\(months) أشهر"
        }
        return "حديثاً"
    }

    // MARK: - Categories

    private func topCategoriesRow(_ cats: [APIAuthorCategory]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "tag.fill")
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Text("التصنيفات الأبرز")
                    .font(SabqFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
            }

            HStack(spacing: 8) {
                ForEach(cats, id: \.id) { cat in
                    categoryChip(cat)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func categoryChip(_ cat: APIAuthorCategory) -> some View {
        let tint = Self.colorFromHex(cat.color) ?? SabqTheme.primaryEnd
        return HStack(spacing: 6) {
            Image(systemName: cat.icon ?? "circle.fill")
                .font(SabqFonts.app(size: 10, weight: .semibold))
            Text(cat.nameAr)
                .font(SabqFonts.app(size: 12, weight: .bold))
            Text("\(cat.count)")
                .font(SabqFonts.app(size: 11, weight: .heavy))
                .monospacedDigit()
                .padding(.horizontal, 6)
                .padding(.vertical, 1)
                .background(Capsule().fill(tint.opacity(0.18)))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(
            Capsule(style: .continuous)
                .fill(tint.opacity(0.08))
        )
        .overlay(
            Capsule(style: .continuous)
                .stroke(tint.opacity(0.22), lineWidth: 0.5)
        )
    }

    // MARK: - Articles

    private var articlesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "newspaper.fill")
                    .font(SabqFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Text("أحدث المنشورات")
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                Spacer(minLength: 0)
                if !articles.isEmpty {
                    Text("\(articles.count)")
                        .font(SabqFonts.app(size: 11, weight: .heavy))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .monospacedDigit()
                }
            }

            if isLoading && articles.isEmpty {
                VStack(spacing: 10) {
                    ForEach(0..<3, id: \.self) { _ in
                        SkeletonBox(height: 92, radius: SabqTheme.chipRadius)
                    }
                }
            } else if articles.isEmpty {
                EmptyStateView(
                    icon: "person.crop.circle.badge.questionmark",
                    tint: SabqTheme.tertiaryInk,
                    title: "لا توجد مقالات بعد",
                    subtitle: "لم نجد أي محتوى منشور لهذا الكاتب حالياً."
                )
            } else {
                SurfaceCard {
                    ForEach(articles) { article in
                        NavigationLink(value: article) {
                            CompactArticleRow(
                                article: article,
                                onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                                isBookmarked: bookmarksStore.isBookmarked(article.id)
                            )
                        }
                        .buttonStyle(.plain)
                        .padding(.vertical, 4)
                    }
                }
            }
        }
    }

    // MARK: - Loader

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            page = try await APIClient.shared.fetchAuthorPage(name: authorName)
        } catch {
            // Soft-fail: the local fallback (articlesStore filter) keeps
            // the screen useful when the endpoint is unreachable.
            page = nil
        }
    }

    /// Hex string "#aabbcc" or "aabbcc" → Color, or nil if it doesn't parse.
    /// Backend stores category colors as hex; SwiftUI doesn't have a native
    /// initializer for that.
    static func colorFromHex(_ hex: String?) -> Color? {
        guard var s = hex?.trimmingCharacters(in: .whitespaces) else { return nil }
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let n = UInt32(s, radix: 16) else { return nil }
        return Color(
            red: Double((n >> 16) & 0xff) / 255,
            green: Double((n >> 8) & 0xff) / 255,
            blue: Double(n & 0xff) / 255
        )
    }
}
