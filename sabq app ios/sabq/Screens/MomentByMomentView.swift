import SwiftUI

/// Moment-by-moment news feed — a reverse-chronological stream of recently
/// published articles. Mirrors the web's `/moment-by-moment` page
/// (`client/src/pages/MomentByMoment.tsx`). Distinct from `LiveCoverageView`
/// which renders the separate live-events table.
struct MomentByMomentView: View {
    @Environment(BookmarksStore.self) private var bookmarksStore
    @State private var items: [APILiveUpdate] = []
    @State private var nextCursor: String? = nil
    @State private var isLoading = true
    @State private var isLoadingMore = false
    @State private var loadError: String? = nil
    @State private var filter: Filter = .all
    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    enum Filter: String, CaseIterable, Identifiable {
        case all
        case breaking

        var id: String { rawValue }
        var label: String {
            switch self {
            case .all: return "كل الأخبار"
            case .breaking: return "عاجل فقط"
            }
        }

        /// `filter=breaking` is the only query param the backend supports —
        /// other values are dropped server-side.
        var apiValue: String? {
            switch self {
            case .all: return nil
            case .breaking: return "breaking"
            }
        }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                header
                // Extra breathing room between the page title and the
                // filter tabs — `spacing: 16` alone left them feeling
                // glued to the title row.
                filterRow
                    .padding(.top, SabqLayout.space8)

                if isLoading && items.isEmpty {
                    loadingSkeleton
                } else if let loadError, items.isEmpty {
                    errorState(message: loadError)
                } else if items.isEmpty {
                    emptyState
                } else {
                    // صفوف CompactArticleRow بفواصل رفيعة داخل سطح أخبار أبيض
                    // واحد (قاعدة #2040)، وزر «تحميل المزيد» صريح تحته.
                    VStack(alignment: .leading, spacing: SabqLayout.space16) {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                                if index > 0 {
                                    SidebarRowDivider()
                                }
                                let article = articleFromUpdate(item)
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

                        if nextCursor != nil {
                            Button {
                                Task { await loadMore() }
                            } label: {
                                HStack(spacing: SabqLayout.space8) {
                                    if isLoadingMore {
                                        ProgressView().tint(SabqTheme.primary)
                                    }
                                    Text("تحميل المزيد")
                                        .font(SabqType.button.font)
                                        .foregroundStyle(SabqTheme.primary)
                                }
                                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                        .fill(SabqTheme.surface)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                        .strokeBorder(SabqTheme.outline, lineWidth: 1)
                                )
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .disabled(isLoadingMore)
                        }
                    }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, SabqLayout.tabBarClearance)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .refreshable {
            SabqHaptics.medium()
            await reload()
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("لحظة بلحظة")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await reload()
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 1.4).repeatForever(autoreverses: false)) {
                pulse = true
            }
        }
        .onChange(of: filter) { _, _ in
            Task { await reload() }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: SabqLayout.space12) {
            // لوحة أيقونة بلون العاجل الخفيف، والحلقة النابضة تبقى فوقها.
            ZStack {
                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                    .fill(SabqTheme.breaking.opacity(0.12))
                Image(systemName: "dot.radiowaves.left.and.right")
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(SabqTheme.breaking)
                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                    .stroke(SabqTheme.breaking.opacity(0.4), lineWidth: 2)
                    .scaleEffect(pulse ? 1.3 : 1)
                    .opacity(pulse ? 0 : 0.8)
            }
            .frame(width: 40, height: 40)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                HStack(spacing: SabqLayout.space8) {
                    Text("مباشر")
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.breaking)
                    Text("\(items.count) خبر")
                        .sabqText(SabqType.meta)
                        .monospacedDigit()
                        .foregroundStyle(SabqTheme.textTertiary)
                }
                .accessibilityElement(children: .combine)
                Text("أحدث الأخبار لحظة بلحظة")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.top, SabqLayout.space8)
    }

    // MARK: - Filter

    private var filterRow: some View {
        SabqSegmentedPicker(
            "الأخبار المعروضة",
            selection: $filter,
            options: Filter.allCases.map { ($0, $0.label) }
        )
    }

    // MARK: - Empty / Loading / Error

    private var loadingSkeleton: some View {
        // بمقاس CompactArticleRow وعلى سطح الأخبار نفسه كي لا تقفز القائمة عند وصولها.
        DiscoveryListSkeleton()
            .padding(.horizontal, SabqLayout.space12)
            .sabqNewsSurface()
            .accessibilityElement()
            .accessibilityLabel("جارٍ تحميل الأخبار")
    }

    private var emptyState: some View {
        EmptyStateView(
            icon: "tray",
            tint: SabqTheme.textSecondary,
            title: "لا توجد أخبار حالياً",
            subtitle: filter == .breaking
                ? "لا أخبار عاجلة الآن، وستظهر هنا فور نشرها."
                : "ستظهر هنا أحدث الأخبار فور نشرها."
        )
        .padding(.top, SabqLayout.space16)
    }

    private func errorState(message: String) -> some View {
        ErrorStateView(message: message) {
            Task { await reload() }
        }
        .padding(.top, SabqLayout.space16)
    }

    // MARK: - Data

    private func reload() async {
        await MainActor.run {
            isLoading = true
            loadError = nil
        }
        do {
            let response = try await APIClient.shared.fetchMomentByMomentUpdates(
                cursor: nil,
                filter: filter.apiValue
            )
            await MainActor.run {
                items = response.items
                nextCursor = response.nextCursor
                isLoading = false
            }
        } catch {
            // نص بحسب نوع الفشل (انقطاع/مهلة/429/5xx) لا «خطأ في الخادم (500)».
            let message = ReaderErrorMessage.message(for: error, fallback: "تعذر تحميل الأخبار")
            await MainActor.run {
                loadError = message
                isLoading = false
            }
        }
    }

    private func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        await MainActor.run { isLoadingMore = true }
        do {
            let response = try await APIClient.shared.fetchMomentByMomentUpdates(
                cursor: cursor,
                filter: filter.apiValue
            )
            await MainActor.run {
                items.append(contentsOf: response.items)
                nextCursor = response.nextCursor
                isLoadingMore = false
            }
        } catch {
            await MainActor.run { isLoadingMore = false }
        }
    }

    // MARK: - Helpers

    /// Convert an `APILiveUpdate` into the `Article` shape the navigation
    /// destination expects. The detail screen refetches the full article via
    /// `fetchArticle(slug:)` anyway, so we only need enough fields to render
    /// the initial hero/title while the full payload loads.
    private func articleFromUpdate(_ u: APILiveUpdate) -> Article {
        Article(
            id: u.id,
            title: u.title,
            excerpt: u.summary,
            aiSummary: "",
            body: u.summary,
            bodyHTML: "",
            category: ArticleCategory(fromSection: u.categoryNameAr),
            author: "سبق",
            // Use SabqFormatters.parseISO8601 (handles both fractional and
            // basic ISO formats) — the default ISO8601DateFormatter rejects
            // `.234Z` fractional suffixes, which made every update fall
            // back to `Date()` (now). Result: every item rendered as "now"
            // regardless of actual publish time.
            publishDate: SabqFormatters.parseISO8601(u.publishedAt) ?? Date(),
            isBreaking: u.isBreaking,
            isFeatured: false,
            tags: [],
            imageURL: u.imageUrl,
            slug: u.slug,
            articleURL: "https://sabq.org/article/\(u.slug)"
        )
    }

    private static func relativeTime(_ raw: String) -> String {
        // Parse via the shared helper so fractional-seconds ISO timestamps
        // ("2026-05-16T18:23:45.234Z") aren't silently rejected — that was
        // making every item read "just now". Latin digits via `-u-nu-latn`
        // so the editorial team's Latin-digit convention is honoured here
        // too.
        guard let date = SabqFormatters.parseISO8601(raw) else { return raw }
        return SabqFormatters.arabicRelative(date)
    }
}
