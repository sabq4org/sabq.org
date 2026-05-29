import SwiftUI

/// Local accent palette for the revisions surface — warm amber works
/// better than `SabqTheme.coral` (which reads as "error" in this app)
/// to communicate "needs your attention, not your panic".
enum RevisionPalette {
    static let accent = Color(red: 0.95, green: 0.62, blue: 0.20)
}

/// Lists articles the editorial team sent back to the writer for
/// revision. Each row shows the title + the editor's note in a soft
/// orange banner + a tap target that opens the full revision form.
/// The list auto-collapses to zero as the writer resubmits.
struct ArticleRevisionsListView: View {
    @Environment(ArticleRevisionsStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 16) {
                header

                if store.isLoading && store.items.isEmpty {
                    VStack(spacing: 10) {
                        ProgressView().tint(SabqTheme.primaryEnd)
                        Text("نجلب المقالات…")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 40)
                } else if store.items.isEmpty {
                    emptyState
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(store.items) { item in
                            NavigationLink(value: DraftDeepLinkRoute(articleId: item.id)) {
                                revisionCard(item)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 60)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("مقالات تنتظر التعديل")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
            }
        }
        .task { await store.refresh() }
        .refreshable { await store.refresh() }
    }

    // MARK: Header

    private var header: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(RevisionPalette.accent.opacity(0.12))
                    .frame(width: 80, height: 80)
                Image(systemName: "pencil.and.list.clipboard")
                    .font(.system(size: 34, weight: .regular))
                    .foregroundStyle(RevisionPalette.accent)
            }
            Text("ملاحظات هيئة التحرير")
                .font(SabqFonts.headline(size: 20))
                .foregroundStyle(SabqTheme.ink)
            Text("اضغط أي مقال لقراءة الملاحظة وإعادة الإرسال")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    // MARK: Empty state

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 48, weight: .regular))
                .foregroundStyle(SabqTheme.leaf)
            Text("لا توجد مقالات بانتظار التعديل")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
            Text("ستظهر هنا أي مقالات يطلب فريق التحرير تعديلها.")
                .font(.system(size: 13))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal, 20)
    }

    // MARK: Card

    private func revisionCard(_ item: ArticleRevisionSummary) -> some View {
        SurfaceCard(accent: RevisionPalette.accent) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    if let urlStr = item.imageURL, let url = URL(string: urlStr) {
                        CachedAsyncImage(url: url, contentMode: .fill) {
                            placeholderThumb
                        }
                        .frame(width: 84, height: 84)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    } else {
                        placeholderThumb
                            .frame(width: 84, height: 84)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 6) {
                            Image(systemName: item.isOpinion ? "text.quote" : "newspaper.fill")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(RevisionPalette.accent)
                            Text(item.isOpinion ? "مقال رأي" : "خبر")
                                .font(.system(size: 11, weight: .heavy))
                                .foregroundStyle(RevisionPalette.accent)
                        }
                        Text(item.title)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(SabqTheme.ink)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)

                        if let when = relativeDate(item.requestedAt) {
                            Text(when)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(SabqTheme.tertiaryInk)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                if !item.reviewNotes.isEmpty {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "quote.opening")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(RevisionPalette.accent)
                            .padding(.top, 2)
                        Text(item.reviewNotes)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(SabqTheme.ink)
                            .lineLimit(4)
                            .multilineTextAlignment(.leading)
                            .lineSpacing(3)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(RevisionPalette.accent.opacity(0.10))
                    )
                }

                HStack(spacing: 6) {
                    Text("افتح وعدّل")
                        .font(.system(size: 14, weight: .bold))
                    Image(systemName: "arrow.left")
                        .font(.system(size: 12, weight: .heavy))
                }
                .foregroundStyle(SabqTheme.primaryEnd)
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
    }

    private var placeholderThumb: some View {
        LinearGradient(
            colors: [RevisionPalette.accent.opacity(0.20), RevisionPalette.accent.opacity(0.05)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .overlay {
            Image(systemName: "doc.text")
                .font(.system(size: 22, weight: .ultraLight))
                .foregroundStyle(RevisionPalette.accent.opacity(0.55))
        }
    }

    private func relativeDate(_ iso: String?) -> String? {
        guard let iso, let date = SabqFormatters.parseISO8601(iso) else { return nil }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "ar")
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
