import SwiftUI

/// Moment-by-moment news feed — a reverse-chronological stream of recently
/// published articles. Mirrors the web's `/moment-by-moment` page
/// (`client/src/pages/MomentByMoment.tsx`). Distinct from `LiveCoverageView`
/// which renders the separate live-events table.
struct MomentByMomentView: View {
    @Environment(\.dismiss) private var dismiss
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
                filterRow

                if isLoading && items.isEmpty {
                    loadingSkeleton
                } else if let loadError, items.isEmpty {
                    errorState(message: loadError)
                } else if items.isEmpty {
                    emptyState
                } else {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                            timelineRow(item: item, isLast: index == items.count - 1)
                                .onAppear {
                                    if index >= items.count - 3 {
                                        Task { await loadMore() }
                                    }
                                }
                        }

                        if isLoadingMore {
                            HStack {
                                Spacer()
                                ProgressView()
                                    .tint(SabqTheme.primaryEnd)
                                Spacer()
                            }
                            .padding(.vertical, 16)
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
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }
                .buttonStyle(.plain)
            }
            ToolbarItem(placement: .principal) {
                Text("لحظة بلحظة")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
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
                    .font(.system(size: 16, weight: .semibold))
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
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(SabqTheme.coral))
                    Text("\(items.count) خبر")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                Text("أحدث الأخبار لحظة بلحظة")
                    .font(.system(size: 13, weight: .medium))
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
                        .font(.system(size: 13, weight: filter == f ? .bold : .medium))
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

    // MARK: - Timeline Row

    private func timelineRow(item: APILiveUpdate, isLast: Bool) -> some View {
        NavigationLink(value: articleFromUpdate(item)) {
            HStack(alignment: .top, spacing: 12) {
                // Timeline rail — dot per row, connecting line between them.
                VStack(spacing: 0) {
                    ZStack {
                        Circle()
                            .fill(item.isBreaking ? SabqTheme.coral : SabqTheme.primaryEnd)
                            .frame(width: 12, height: 12)
                        if item.isBreaking {
                            Image(systemName: "bolt.fill")
                                .font(.system(size: 6, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                    if !isLast {
                        Rectangle()
                            .fill(SabqTheme.outline.opacity(0.5))
                            .frame(width: 1.5)
                            .frame(minHeight: 60)
                    }
                }
                .frame(width: 16)

                rowContent(item: item)
                    .padding(.bottom, isLast ? 0 : 16)
            }
        }
        .buttonStyle(.plain)
    }

    private func rowContent(item: APILiveUpdate) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                if item.isBreaking {
                    Text("عاجل")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(SabqTheme.coral))
                }
                Text(item.categoryNameAr)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Text("·")
                    .foregroundStyle(SabqTheme.tertiaryInk)
                Text(Self.relativeTime(item.publishedAt))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                Spacer(minLength: 0)
            }

            Text(item.title)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .multilineTextAlignment(.leading)
                .lineLimit(3)

            if let urlString = item.imageUrl, let url = URL(string: urlString) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    Rectangle()
                        .fill(SabqTheme.paleFill)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 140)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous))
            }

            HStack(spacing: 12) {
                statChip(icon: "eye.fill", value: item.viewsCount)
                statChip(icon: "bubble.left.fill", value: item.commentsCount)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func statChip(icon: String, value: Int) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .semibold))
            Text("\(value)")
                .font(.system(size: 11, weight: .semibold))
                .monospacedDigit()
        }
        .foregroundStyle(SabqTheme.tertiaryInk)
    }

    // MARK: - Empty / Loading / Error

    private var loadingSkeleton: some View {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(0..<4, id: \.self) { _ in
                HStack(alignment: .top, spacing: 12) {
                    Circle()
                        .fill(SabqTheme.paleFill)
                        .frame(width: 12, height: 12)
                    VStack(alignment: .leading, spacing: 8) {
                        RoundedRectangle(cornerRadius: 4).fill(SabqTheme.paleFill).frame(width: 120, height: 10)
                        RoundedRectangle(cornerRadius: 4).fill(SabqTheme.paleFill).frame(maxWidth: .infinity).frame(height: 16)
                        RoundedRectangle(cornerRadius: 4).fill(SabqTheme.paleFill).frame(width: 240, height: 16)
                    }
                }
            }
        }
        .redacted(reason: .placeholder)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 32, weight: .light))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text("لا توجد أخبار حالياً")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private func errorState(message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text(message)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
            Button {
                Task { await reload() }
            } label: {
                Text("إعادة المحاولة")
                    .font(.system(size: 13, weight: .bold))
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
            publishDate: ISO8601DateFormatter().date(from: u.publishedAt) ?? Date(),
            isBreaking: u.isBreaking,
            isFeatured: false,
            tags: [],
            imageURL: u.imageUrl,
            slug: u.slug,
            articleURL: "https://sabq.org/article/\(u.slug)"
        )
    }

    private static func relativeTime(_ raw: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: raw) else { return raw }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        formatter.locale = Locale(identifier: "ar")
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
