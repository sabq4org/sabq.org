import SwiftUI

/// Moment-by-moment news feed — a reverse-chronological stream of recently
/// published articles. Mirrors the web's `/moment-by-moment` page
/// (`client/src/pages/MomentByMoment.tsx`). Distinct from `LiveCoverageView`
/// which renders the separate live-events table.
struct MomentByMomentView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(BookmarksStore.self) private var bookmarksStore
    @State private var items: [APILiveUpdate] = []
    @State private var nextCursor: String? = nil
    @State private var isLoading = true
    @State private var isLoadingMore = false
    @State private var loadError: String? = nil
    @State private var filter: Filter = .all
    @State private var pulse = false

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
                    .padding(.top, 12)

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
                    SurfaceCard {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                            if index > 0 {
                                Divider().foregroundStyle(SabqTheme.outline)
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
                                HStack(spacing: 8) {
                                    if isLoadingMore {
                                        ProgressView().tint(SabqTheme.primaryEnd)
                                    }
                                    Text("تحميل المزيد")
                                        .font(SabqFonts.app(size: 14, weight: .semibold))
                                        .foregroundStyle(SabqTheme.primaryEnd)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                            }
                            .buttonStyle(.plain)
                            .disabled(isLoadingMore)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .refreshable {
            SabqHaptics.medium()
            await reload()
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarBackButtonHidden(true)
        .toolbar {
            // `.cancellationAction` is the app-wide convention for the
            // back chevron — places it on the leading edge (visual
            // right in RTL) so Article, Opinion, Settings sheets,
            // Author, Trending, OMQ, … all match. Was previously
            // `.navigationBarTrailing` which put the chevron on the
            // left edge in RTL, inconsistent with every other screen.
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(SabqFonts.app(size: 16, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }
                .buttonStyle(.plain)
            }
            ToolbarItem(placement: .principal) {
                Text("لحظة بلحظة")
                    .font(SabqFonts.app(size: 17, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
            }
        }
        .task {
            await reload()
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: false)) {
                pulse = true
            }
        }
        .onChange(of: filter) { _, _ in
            Task { await reload() }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(SabqTheme.coral.opacity(0.18))
                    .frame(width: 36, height: 36)
                Image(systemName: "dot.radiowaves.left.and.right")
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.coral)
                Circle()
                    .stroke(SabqTheme.coral.opacity(0.4), lineWidth: 2)
                    .frame(width: 36, height: 36)
                    .scaleEffect(pulse ? 1.6 : 1)
                    .opacity(pulse ? 0 : 0.8)
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text("مباشر")
                        .font(SabqFonts.app(size: 10, weight: .regular))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(SabqTheme.coral))
                    Text("\(items.count) خبر")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                Text("أحدث الأخبار لحظة بلحظة")
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 8)
    }

    // MARK: - Filter

    private var filterRow: some View {
        HStack(spacing: 8) {
            ForEach(Filter.allCases) { f in
                Button {
                    SabqHaptics.light()
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
                        filter = f
                    }
                } label: {
                    Text(f.label)
                        .font(SabqFonts.app(size: 13, weight: filter == f ? .bold : .medium))
                        .foregroundStyle(filter == f ? .white : SabqTheme.ink)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(
                            Capsule().fill(filter == f ? SabqTheme.primaryEnd : SabqTheme.paleFill)
                        )
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: - Empty / Loading / Error

    private var loadingSkeleton: some View {
        // Match the new CompactArticleRow layout (thumbnail + text column)
        // so the skeleton doesn't visually jump when real content lands.
        VStack(alignment: .leading, spacing: 16) {
            ForEach(0..<5, id: \.self) { _ in
                HStack(alignment: .top, spacing: 14) {
                    RoundedRectangle(cornerRadius: 16).fill(SabqTheme.paleFill).frame(width: 84, height: 84)
                    VStack(alignment: .leading, spacing: 8) {
                        RoundedRectangle(cornerRadius: 4).fill(SabqTheme.paleFill).frame(width: 80, height: 14)
                        RoundedRectangle(cornerRadius: 4).fill(SabqTheme.paleFill).frame(maxWidth: .infinity).frame(height: 16)
                        RoundedRectangle(cornerRadius: 4).fill(SabqTheme.paleFill).frame(width: 200, height: 14)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                Divider().foregroundStyle(SabqTheme.outline.opacity(0.3))
            }
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(SabqTheme.surface)
                .shadow(color: SabqTheme.shadow, radius: 16, x: 0, y: 6)
        )
        .redacted(reason: .placeholder)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(SabqFonts.app(size: 32, weight: .light))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text("لا توجد أخبار حالياً")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private func errorState(message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(SabqFonts.app(size: 28, weight: .light))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text(message)
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
            Button {
                Task { await reload() }
            } label: {
                Text("إعادة المحاولة")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(SabqTheme.primaryEnd))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
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
        } catch let api as APIError {
            await MainActor.run {
                loadError = api.errorDescription ?? "تعذر تحميل الأخبار"
                isLoading = false
            }
        } catch {
            await MainActor.run {
                loadError = "تعذر تحميل الأخبار"
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
