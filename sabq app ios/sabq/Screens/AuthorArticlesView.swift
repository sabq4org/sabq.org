import SwiftUI

// صفحة الكاتب — مطابقة للويب (/author/:name، #2257 و#2258):
//   1. رأس سماوي هادئ: الصورة، الاسم، المسمى تحته، وسطر «يكتب كل <يوم> · N مقالًا
//      منذ <شهر>» نصًا بلا كبسولات (طلب المالك 2026-11-24).
//   2. «أحدث مقال» بارزًا، ثم بقية المقالات مجمّعة بالشهر بأيقونة تقويم.
//   3. «كتّاب <اليوم>» و«موعده القادم» لكتّاب الرأي.
// بلا أعداد مشاهدات. البيانات من /api/v1/authors/by-name (الحقل `writer`).
// إن فشل الطلب نعرض المحفوظ على الجهاز أو ما في `articlesStore`.
struct AuthorArticlesView: View {
    let authorName: String
    /// من سطر الكاتب في الخبر: يظهر بهما الرأس فورًا قبل رد الخادم.
    var initialAvatarURL: String? = nil
    var initialRole: String? = nil

    @Environment(ArticlesStore.self) private var articlesStore

    @State private var page: APIAuthorPage? = nil
    @State private var isLoading = true
    @State private var hasFetched = false

    private static let selectBlue = Color(red: 30 / 255, green: 155 / 255, blue: 230 / 255)
    private static let heroTop = Color(red: 234 / 255, green: 246 / 255, blue: 1)
    private static let monthInk = Color(red: 11 / 255, green: 111 / 255, blue: 168 / 255)
    private static let monthTint = Color(red: 230 / 255, green: 244 / 255, blue: 253 / 255)

    init(authorName: String, initialAvatarURL: String? = nil, initialRole: String? = nil) {
        self.authorName = authorName
        self.initialAvatarURL = initialAvatarURL
        self.initialRole = initialRole
        // آخر نسخة محفوظة تظهر من أول إطار؛ التحديث يصل فوقها بصمت.
        _page = State(initialValue: AuthorPageStore.cached(authorName))
        _isLoading = State(initialValue: AuthorPageStore.cached(authorName) == nil)
    }

    private var articles: [Article] {
        if let recent = page?.recentArticles, !recent.isEmpty {
            return recent.map { Article.from($0) }
        }
        return articlesStore.allArticles
            .filter { $0.author == authorName }
            .sorted { $0.publishDate > $1.publishDate }
    }

    private var writer: APIWriterExtras? { page?.writer }
    private var displayName: String { page?.author.name ?? authorName }
    private var isOpinionWriter: Bool { writer != nil || articles.contains { $0.articleType == "opinion" } }

    private var weekdayName: String? {
        guard let d = writer?.weekday, (0..<7).contains(d) else { return nil }
        return OpinionText.weekdays[d]
    }

    private var role: String? {
        let r = page?.author.role ?? initialRole
        guard let r, !r.isEmpty, r != "كاتب في سبق" else { return nil }
        return r
    }

    private struct MonthGroup: Identifiable {
        let id: String
        let label: String
        var items: [Article]
    }

    private var months: [MonthGroup] {
        var groups: [MonthGroup] = []
        for article in articles.dropFirst() {
            let key = OpinionText.monthKey(article.publishDate)
            if let i = groups.firstIndex(where: { $0.id == key }) {
                groups[i].items.append(article)
            } else {
                groups.append(MonthGroup(id: key, label: OpinionText.monthYear(article.publishDate), items: [article]))
            }
        }
        return groups
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                hero

                VStack(alignment: .leading, spacing: SabqLayout.space24) {
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
                        if let first = articles.first { featured(first) }
                        ForEach(months) { month in monthSection(month) }
                    }

                    if let writer, let weekdayName, !writer.peers.isEmpty {
                        peersSection(writer.peers, weekdayName: weekdayName)
                    }
                    if let key = writer?.nextDayKey {
                        nextDayCard(key)
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.top, SabqLayout.space8)
            }
            .padding(.bottom, SabqLayout.tabBarClearance)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle(displayName)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard !hasFetched else { return }
            hasFetched = true
            await load()
        }
    }

    // MARK: - Hero

    /// رأس صفحة الكاتب (طلب المالك 2026-11-24): الصورة، الاسم، المسمى تحته
    /// مباشرة، ثم سطر يوم الكتابة وعدد المقالات. بلا «من كتّاب الرأي في سبق»،
    /// ولا «يكتب غالبًا في»، ولا زر مشاركة.
    private var hero: some View {
        VStack(spacing: SabqLayout.space8) {
            avatar
                .padding(.bottom, SabqLayout.space4)

            Text(displayName)
                .font(SabqFonts.app(size: 26, weight: .bold))
                .foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.center)

            if let title = role ?? page?.author.bio, !title.isEmpty {
                Text(title)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            chips
                .padding(.top, SabqLayout.space4)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, SabqLayout.pageMargin)
        .padding(.top, SabqLayout.space24)
        .padding(.bottom, SabqLayout.space24)
        .background(LinearGradient(colors: [Self.heroTop, SabqTheme.background], startPoint: .top, endPoint: .bottom))
    }

    /// سطر نصي واحد بلا كبسولات: يوم الكتابة بالأزرق ثم عدد المقالات.
    @ViewBuilder
    private var chips: some View {
        let count = page?.stats.articleCount ?? 0
        let since = (page?.stats.earliestPublish).flatMap { Self.parseServerDate($0) }
        let countText = count > 0
            ? OpinionText.count(count) + (since.map { " منذ \(OpinionText.monthYear($0))" } ?? "")
            : nil
        VStack(spacing: SabqLayout.space4) {
            if weekdayName != nil || countText != nil {
                (Text(weekdayName.map { "يكتب كل \($0)" } ?? "")
                    .font(SabqType.metaEmphasis.font)
                    .foregroundColor(SabqTheme.primary)
                 + Text(weekdayName != nil && countText != nil ? "  ·  " : "")
                    .font(SabqType.meta.font)
                    .foregroundColor(SabqTheme.textTertiary)
                 + Text(countText ?? "")
                    .font(SabqType.meta.font)
                    .foregroundColor(SabqTheme.textSecondary))
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
    }

    /// الخادم يرسل أحيانًا «2026-01-07 13:30:57.827» (مسافة بدل T وبلا منطقة = UTC).
    static func parseServerDate(_ raw: String) -> Date? {
        if let d = SabqFormatters.parseISO8601(raw) { return d }
        var s = raw.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: " ", with: "T")
        if !s.hasSuffix("Z") && !s.contains("+") { s += "Z" }
        if let d = SabqFormatters.parseISO8601(s) { return d }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f.date(from: String(raw.prefix(19)))
    }

    private var avatar: some View {
        let avatarURL = (page?.author.avatarUrl ?? initialAvatarURL)
            .flatMap { $0.isEmpty ? nil : URL(string: $0) }

        return CachedAsyncImage(url: avatarURL, contentMode: .fill) {
            ZStack {
                Circle().fill(SabqTheme.surface)
                Text(String(displayName.replacingOccurrences(of: "د.", with: "").trimmingCharacters(in: .whitespaces).prefix(1)))
                    .font(SabqFonts.app(size: 34, weight: .bold))
                    .foregroundStyle(Self.monthInk)
            }
        }
        .frame(width: 96, height: 96)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Color.white, lineWidth: 4))
        .shadow(color: SabqTheme.shadow, radius: 12, y: 6)
        // Re-load when the profile payload arrives (page starts nil).
        .id(avatarURL?.absoluteString ?? "author-avatar-\(authorName)")
    }

    // MARK: - Articles

    @ViewBuilder
    private func articleLink<Content: View>(_ article: Article, @ViewBuilder label: () -> Content) -> some View {
        if article.articleType == "opinion", let slug = article.slug, !slug.isEmpty {
            NavigationLink(value: OpinionArticle.placeholder(slug: slug)) { label() }
                .buttonStyle(.plain)
        } else {
            NavigationLink(value: article) { label() }
                .buttonStyle(.plain)
        }
    }

    private func metaLine(_ article: Article) -> String {
        [OpinionText.publishDay(article.publishDate), article.categoryTitle]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private func thumbnail(_ article: Article, maxPixel: CGFloat) -> some View {
        Group {
            if let urlString = article.imageURL, let url = URL(string: urlString) {
                FocalCachedAsyncImage(url: url, focalPoint: article.imageFocalPoint, maxPixelSize: maxPixel) {
                    SabqImagePlaceholder()
                }
            } else {
                SabqImagePlaceholder()
                    .environment(\.sabqImageLoadFailed, true)
            }
        }
    }

    private func featured(_ article: Article) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            Text("أحدث مقال")
                .font(SabqType.sectionHeading.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            articleLink(article) {
                VStack(alignment: .leading, spacing: 0) {
                    thumbnail(article, maxPixel: 900)
                        .aspectRatio(16 / 9, contentMode: .fill)
                        .frame(maxWidth: .infinity)
                        .clipped()

                    VStack(alignment: .leading, spacing: SabqLayout.space8) {
                        Text(metaLine(article))
                            .font(SabqType.meta.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                        Text(article.title)
                            .font(SabqFonts.newsHeadline(size: 20))
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineSpacing(3)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        if !article.excerpt.isEmpty {
                            Text(article.excerpt)
                                .sabqText(SabqType.excerpt)
                                .foregroundStyle(SabqTheme.textSecondary)
                                .lineLimit(3)
                                .multilineTextAlignment(.leading)
                        }
                        Text("اقرأ المقال")
                            .font(SabqType.metaEmphasis.font)
                            .foregroundStyle(SabqTheme.primary)
                            .padding(.top, SabqLayout.space4)
                    }
                    .padding(SabqLayout.space16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .sabqNewsSurface()
            }
        }
    }

    private func monthSection(_ month: MonthGroup) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "calendar")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Self.selectBlue)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(Self.monthTint))
                    .accessibilityHidden(true)
                Text(month.label)
                    .font(SabqFonts.app(size: 16, weight: .bold))
                    .foregroundStyle(Self.monthInk)
                    .accessibilityAddTraits(.isHeader)
                Text("·")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                Text(OpinionText.count(month.items.count))
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
            }

            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(Array(month.items.enumerated()), id: \.element.id) { index, article in
                    if index > 0 { SidebarRowDivider() }
                    articleLink(article) {
                        HStack(alignment: .center, spacing: SabqLayout.space12) {
                            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                                Text(metaLine(article))
                                    .font(SabqType.timestamp.font)
                                    .foregroundStyle(SabqTheme.textTertiary)
                                    .lineLimit(1)
                                Text(article.title)
                                    .sabqText(SabqType.rowTitle)
                                    .fontWeight(.bold)
                                    .foregroundStyle(SabqTheme.textPrimary)
                                    .lineLimit(3)
                                    .multilineTextAlignment(.leading)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)

                            thumbnail(article, maxPixel: 300)
                                .frame(width: 96, height: 72)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .padding(.vertical, 14)
                        .contentShape(Rectangle())
                    }
                }
            }
            .padding(.horizontal, SabqLayout.space16)
            .sabqNewsSurface()
        }
    }

    // MARK: - Peers + next date

    private func peersSection(_ peers: [APIWriterPeer], weekdayName: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text("كتّاب \(weekdayName)")
                .font(SabqFonts.app(size: 18, weight: .bold))
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text("اقرأ لمن يكتب معه في اليوم نفسه.")
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textTertiary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(peers) { peer in
                        NavigationLink(value: AuthorRoute(name: peer.name, avatarURL: peer.avatarUrl)) {
                            VStack(spacing: 6) {
                                OpinionAuthorAvatar(name: peer.name, imageURL: peer.avatarUrl, size: 52)
                                Text(peer.name)
                                    .font(SabqType.timestamp.font)
                                    .foregroundStyle(SabqTheme.textPrimary)
                                    .multilineTextAlignment(.center)
                                    .lineLimit(2)
                                    .frame(width: 72)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.top, SabqLayout.space4)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqNewsSurface()
    }

    private func nextDayCard(_ key: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            Text("موعده القادم")
                .font(SabqType.tag.font)
                .foregroundStyle(Self.monthInk)
            Text(OpinionText.dayLabel(key))
                .font(SabqFonts.app(size: 18, weight: .bold))
                .foregroundStyle(SabqTheme.textPrimary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Self.heroTop, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Color(red: 214 / 255, green: 236 / 255, blue: 251 / 255), lineWidth: 1)
        )
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
