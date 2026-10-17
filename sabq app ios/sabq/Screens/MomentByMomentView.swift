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
                    // Match the homepage "آخر الأخبار" pattern: SurfaceCard +
                    // CompactArticleRow with dividers, and an explicit
                    // "Load More" button at the bottom instead of the
                    // previous timeline rail + infinite-scroll behaviour.
                    // قائمة بلا صندوق: صفوف بفواصل رفيعة على الصفحة (النموذج المعتمد).
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
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                        .stroke(SabqTheme.outline, lineWidth: 1)
                                )
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .disabled(isLoadingMore)
                            .padding(.top, SabqLayout.space16)
                        }
                    }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, SabqLayout.space40)
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
            ZStack {
                Image(systemName: "dot.radiowaves.left.and.right")
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(SabqTheme.breaking)
                Circle()
                    .stroke(SabqTheme.breaking.opacity(0.4), lineWidth: 2)
                    .frame(width: 32, height: 32)
                    .scaleEffect(pulse ? 1.4 : 1)
                    .opacity(pulse ? 0 : 0.8)
            }
            .frame(width: 32, height: 32)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                HStack(spacing: SabqLayout.space8) {
                    Text("مباشر")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.breaking)
                    Text("\(items.count) خبر")
                        .font(SabqType.meta.font)
                        .monospacedDigit()
                        .foregroundStyle(SabqTheme.textTertiary)
                }
                Text("أحدث الأخبار لحظة بلحظة")
                    .font(SabqType.excerpt.font)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            Spacer(minLength: 0)
        }
        .padding(.top, SabqLayout.space8)
    }

    // MARK: - Filter

    private var filterRow: some View {
        Picker("الأخبار المعروضة", selection: $filter) {
            ForEach(Filter.allCases) { filter in
                Text(filter.label).tag(filter)
            }
        }
        .modifier(SabqAdaptivePickerStyle())
    }

    // MARK: - Empty / Loading / Error

    private var loadingSkeleton: some View {
        // Match the new CompactArticleRow layout (thumbnail + text column)
        // so the skeleton doesn't visually jump when real content lands.
        VStack(alignment: .leading, spacing: 0) {
            ForEach(0..<5, id: \.self) { index in
                if index > 0 { SidebarRowDivider() }
                HStack(alignment: .top, spacing: SabqLayout.space12) {
                    VStack(alignment: .leading, spacing: SabqLayout.space8) {
                        RoundedRectangle(cornerRadius: 4).fill(SabqTheme.surfaceMuted).frame(maxWidth: .infinity).frame(height: 16)
                        RoundedRectangle(cornerRadius: 4).fill(SabqTheme.surfaceMuted).frame(width: 200, height: 14)
                        RoundedRectangle(cornerRadius: 4).fill(SabqTheme.surfaceMuted).frame(width: 80, height: 12)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    RoundedRectangle(cornerRadius: SabqRadius.small)
                        .fill(SabqTheme.surfaceMuted)
                        .frame(width: NewsRowStyle.thumbnailWidth, height: NewsRowStyle.thumbnailHeight)
                }
                .padding(.vertical, SabqLayout.rowPadding)
            }
        }
        .redacted(reason: .placeholder)
    }

    private var emptyState: some View {
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: "tray")
                .font(SabqFonts.app(size: 26, weight: .regular))
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(width: 56, height: 56)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium))
                .accessibilityHidden(true)
            Text("لا توجد أخبار حالياً")
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, SabqLayout.space40)
    }

    private func errorState(message: String) -> some View {
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: "wifi.exclamationmark")
                .font(SabqFonts.app(size: 26, weight: .regular))
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(width: 56, height: 56)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium))
                .accessibilityHidden(true)
            Text(message)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
            Button {
                Task { await reload() }
            } label: {
                Text("إعادة المحاولة")
                    .font(SabqType.button.font)
                    .foregroundStyle(SabqTheme.onAction)
                    .padding(.horizontal, SabqLayout.space24)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .fill(SabqTheme.actionFill)
                    )
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, SabqLayout.space40)
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
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        formatter.locale = Locale(identifier: "ar-u-nu-latn")
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
