import SwiftUI

// Redesigned "writer page" — fetches a full author profile from
// `/api/v1/authors/by-name` (avatar, role, bio, lifetime stats, top
// categories, recent articles) and lays it out as:
//
//   1. Unboxed header — avatar + name + role tag + bio.
//   2. Stats strip — articles count / total reads / time on sabq.
//   3. Top-categories chip row — the 3 areas the author writes in most.
//   4. Articles list — the latest 30 publications, classic compact rows.
//
// Falls back to the legacy in-memory filter if the API call fails (no
// network / unknown name) so the page still renders something useful.
struct AuthorArticlesView: View {
    let authorName: String
    /// من سطر الكاتب في الخبر: يظهر بهما الرأس فورًا قبل رد الخادم.
    var initialAvatarURL: String? = nil
    var initialRole: String? = nil

    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore

    @State private var page: APIAuthorPage? = nil
    @State private var isLoading = true
    @State private var hasFetched = false

    init(authorName: String, initialAvatarURL: String? = nil, initialRole: String? = nil) {
        self.authorName = authorName
        self.initialAvatarURL = initialAvatarURL
        self.initialRole = initialRole
        // آخر نسخة محفوظة تظهر من أول إطار؛ التحديث يصل فوقها بصمت.
        _page = State(initialValue: AuthorPageStore.cached(authorName))
        _isLoading = State(initialValue: AuthorPageStore.cached(authorName) == nil)
    }

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
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                heroCard

                if !isLoading || page != nil {
                    statsStrip
                }

                if let cats = page?.topCategories, !cats.isEmpty {
                    topCategoriesRow(cats)
                }

                articlesSection
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.tabBarClearance)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle(authorName)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard !hasFetched else { return }
            hasFetched = true
            await load()
        }
    }

    // MARK: - Hero

    private var heroCard: some View {
        VStack(spacing: SabqLayout.space12) {
            avatar

            VStack(spacing: SabqLayout.space8) {
                Text(page?.author.name ?? authorName)
                    .sabqText(SabqType.leadTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .multilineTextAlignment(.center)

                if let role = page?.author.role ?? initialRole, !role.isEmpty {
                    StatusChip(title: role, tint: SabqTheme.primary)
                }
            }

            if let bio = page?.author.bio, !bio.isEmpty {
                Text(bio)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var avatar: some View {
        let avatarURL = (page?.author.avatarUrl ?? initialAvatarURL)
            .flatMap { $0.isEmpty ? nil : URL(string: $0) }

        return CachedAsyncImage(url: avatarURL, contentMode: .fill) {
            avatarInitial
        }
        .frame(width: 88, height: 88)
        .clipShape(Circle())
        // Re-load when the profile payload arrives (page starts nil).
        .id(avatarURL?.absoluteString ?? "author-avatar-\(authorName)")
    }

    private var avatarInitial: some View {
        ZStack {
            Circle()
                .fill(SabqTheme.surface)
                .frame(width: 88, height: 88)
                .overlay(Circle().strokeBorder(SabqTheme.separator, lineWidth: 0.75))
            Text(String((page?.author.name ?? authorName).prefix(1)))
                .font(SabqType.articleTitle.font)
                .foregroundStyle(SabqTheme.textSecondary)
        }
    }

    // MARK: - Stats

    private var statsStrip: some View {
        HStack(spacing: SabqLayout.space8) {
            statTile(
                value: SabqFormatters.compactViewCount(page?.stats.articleCount ?? articles.count),
                label: "مقال",
                icon: "doc.text.fill",
                tint: SabqTheme.primary
            )
            statTile(
                value: SabqFormatters.compactViewCount(page?.stats.totalViews ?? 0),
                label: "قراءة",
                icon: "eye.fill",
                tint: SabqTheme.primary
            )
            statTile(
                value: timeOnSabq(),
                label: "مع سبق",
                icon: "calendar",
                tint: SabqTheme.primary
            )
        }
    }

    private func statTile(value: String, label: String, icon: String, tint: Color) -> some View {
        VStack(spacing: SabqLayout.space4) {
            Text(value)
                .font(SabqType.sectionHeading.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)

            HStack(spacing: SabqLayout.space4) {
                Image(systemName: icon)
                    .foregroundStyle(tint)
                    .accessibilityHidden(true)
                Text(label)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            .font(SabqType.meta.font)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space12)
        .sabqBlockSurface()
        .accessibilityElement(children: .combine)
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
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            DiscoverySectionHeading(title: "التصنيفات الأبرز")

            FlowLayout(spacing: SabqLayout.space8) {
                ForEach(cats, id: \.id) { cat in
                    categoryChip(cat)
                }
            }
        }
    }

    /// ألوان التصنيفات لا تلوّن النص ولا الخلفية؛ شريحة بيضاء بحدّ رفيع على الخلفية الرمادية.
    private func categoryChip(_ cat: APIAuthorCategory) -> some View {
        HStack(spacing: SabqLayout.space4) {
            Image(systemName: cat.icon ?? "circle.fill")
                .foregroundStyle(SabqTheme.textSecondary)
                .accessibilityHidden(true)
            Text(cat.nameAr)
                .foregroundStyle(SabqTheme.textPrimary)
            Text("\(cat.count)")
                .foregroundStyle(SabqTheme.textSecondary)
                .monospacedDigit()
        }
        .font(SabqType.tag.font)
        .padding(.horizontal, SabqLayout.space12)
        .frame(minHeight: 36)
        .background(Capsule(style: .continuous).fill(SabqTheme.surface))
        .overlay(Capsule(style: .continuous).strokeBorder(SabqTheme.separator, lineWidth: 0.75))
        .accessibilityElement(children: .combine)
    }

    // MARK: - Articles

    private var articlesSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(alignment: .center, spacing: SabqLayout.space8) {
                DiscoverySectionHeading(title: "أحدث المنشورات")
                if !articles.isEmpty {
                    Text("\(articles.count)")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .monospacedDigit()
                }
            }

            if isLoading && articles.isEmpty {
                DiscoveryListSkeleton(count: 3)
                    .padding(.horizontal, SabqLayout.space12)
                    .sabqNewsSurface()
            } else if articles.isEmpty {
                EmptyStateView(
                    icon: "person.crop.circle.badge.questionmark",
                    tint: SabqTheme.tertiaryInk,
                    title: "لا توجد مقالات بعد",
                    subtitle: "لم نجد أي محتوى منشور لهذا الكاتب حالياً."
                )
            } else {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(articles.enumerated()), id: \.element.id) { index, article in
                        if index > 0 { SidebarRowDivider() }
                        NavigationLink(value: article) {
                            CompactArticleRow(
                                article: article,
                                onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                                isBookmarked: bookmarksStore.isBookmarked(article.id)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, SabqLayout.space12)
                .sabqNewsSurface()
            }
        }
    }

    // MARK: - Loader

    private func load() async {
        // مع نسخة محفوظة لا هيكل تحميل: التحديث يحلّ محلها عند وصوله.
        if page == nil { isLoading = true }
        defer { isLoading = false }
        do {
            let fresh = try await APIClient.shared.fetchAuthorPageWithData(name: authorName)
            page = fresh.page
            AuthorPageStore.save(fresh.data, page: fresh.page, for: authorName)
        } catch {
            // Soft-fail: keep the saved copy if any; otherwise the local
            // fallback (articlesStore filter) keeps the screen useful.
        }
    }
}

// MARK: - On-device copy

/// آخر صفحة لكل كاتب: في الذاكرة طوال الجلسة وعلى القرص (Caches) لأسبوع،
/// فتُفتح صفحة الكاتب المزار سابقًا فورًا ثم تتحدّث. النظام يمسح Caches عند
/// ضيق المساحة، فلا خطر من تراكمها.
enum AuthorPageStore {
    private static let maxAge: TimeInterval = 7 * 24 * 3600
    private static let lock = NSLock()
    nonisolated(unsafe) private static var memory: [String: APIAuthorPage] = [:]

    private static func key(_ name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
            .joined(separator: " ").lowercased()
    }

    private static func fileURL(_ name: String) -> URL? {
        guard let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        let folder = dir.appendingPathComponent("author-pages-v1", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let safe = key(name).unicodeScalars.map { String(format: "%04x", $0.value) }.joined()
        return folder.appendingPathComponent(String(safe.prefix(200)) + ".json")
    }

    static func cached(_ name: String) -> APIAuthorPage? {
        let k = key(name)
        lock.lock(); let hit = memory[k]; lock.unlock()
        if let hit { return hit }
        guard let url = fileURL(name),
              let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let modified = attrs[.modificationDate] as? Date,
              Date().timeIntervalSince(modified) < maxAge,
              let data = try? Data(contentsOf: url),
              let page = try? JSONDecoder().decode(APIAuthorPage.self, from: data) else { return nil }
        lock.lock(); memory[k] = page; lock.unlock()
        return page
    }

    static func save(_ data: Data, page: APIAuthorPage, for name: String) {
        lock.lock(); memory[key(name)] = page; lock.unlock()
        guard let url = fileURL(name) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
