import SwiftUI

/// Accent for the revisions surface — the warning status role reads as
/// "needs your attention, not your panic" and stays contrast-safe as text.
enum RevisionPalette {
    static var accent: Color { SabqTheme.warning }
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
            VStack(spacing: SabqLayout.space16) {
                header

                if store.isLoading && store.items.isEmpty {
                    VStack(spacing: SabqLayout.space8) {
                        ProgressView().tint(SabqTheme.primary)
                        Text("نجلب المقالات…")
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, SabqLayout.space40)
                } else if store.items.isEmpty {
                    emptyState
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(store.items) { item in
                            if item.id != store.items.first?.id {
                                Divider().overlay(SabqTheme.separator)
                            }
                            NavigationLink(value: DraftDeepLinkRoute(articleId: item.id)) {
                                revisionCard(item)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, 64)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("مقالات تنتظر التعديل")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
            }
        }
        .task { await store.refresh() }
        .refreshable { await store.refresh() }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            Text("ملاحظات هيئة التحرير")
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text("اضغط أي مقال لقراءة الملاحظة وإعادة الإرسال")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Empty state

    private var emptyState: some View {
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: "checkmark.seal")
                .font(SabqFonts.app(size: 40, weight: .light))
                .foregroundStyle(SabqTheme.success)
                .accessibilityHidden(true)
            Text("لا توجد مقالات بانتظار التعديل")
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
            Text("ستظهر هنا أي مقالات يطلب فريق التحرير تعديلها.")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space40)
        .padding(.horizontal, SabqLayout.space16)
    }

    // MARK: Row

    private func revisionCard(_ item: ArticleRevisionSummary) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(alignment: .top, spacing: SabqLayout.space12) {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    HStack(spacing: SabqLayout.space4) {
                        Image(systemName: item.isOpinion ? "text.quote" : "newspaper")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                            .accessibilityHidden(true)
                        Text(item.isOpinion ? "مقال رأي" : "خبر")
                            .sabqText(SabqType.tag)
                    }
                    .foregroundStyle(SabqTheme.primary)
                    Text(item.title)
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)

                    if let when = relativeDate(item.requestedAt) {
                        Text(when)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textTertiary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                thumbnail(item)
            }

            if !item.reviewNotes.isEmpty {
                HStack(alignment: .top, spacing: SabqLayout.space8) {
                    Image(systemName: "quote.opening")
                        .font(SabqFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(RevisionPalette.accent)
                        .padding(.top, 2)
                        .accessibilityHidden(true)
                    Text(item.reviewNotes)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(4)
                        .multilineTextAlignment(.leading)
                        .lineSpacing(3)
                }
                .padding(SabqLayout.space12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(SabqTheme.surfaceMuted)
                )
            }

            HStack(spacing: SabqLayout.space4) {
                Text("افتح وعدّل")
                    .sabqText(SabqType.metaEmphasis)
                Image(systemName: "arrow.left")
                    .font(SabqFonts.app(size: 12, weight: .semibold))
                    .accessibilityHidden(true)
            }
            .foregroundStyle(SabqTheme.primary)
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func thumbnail(_ item: ArticleRevisionSummary) -> some View {
        Group {
            if let urlStr = item.imageURL, let url = URL(string: urlStr) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    SabqImagePlaceholder()
                }
            } else {
                SabqImagePlaceholder()
            }
        }
        .frame(width: 112, height: 63)
        .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
        .accessibilityHidden(true)
    }

    private func relativeDate(_ iso: String?) -> String? {
        guard let iso, let date = SabqFormatters.parseISO8601(iso) else { return nil }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "ar")
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
