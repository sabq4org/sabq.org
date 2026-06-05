import SwiftUI

// MARK: - Admin dashboard components
//
// Reusable building blocks for `AdminDashboardView`. They lean entirely on the
// shared `SabqTheme` palette + radii so they match the rest of the app and
// flip correctly under `.sabqRTL()`.

// MARK: Stat tile

/// Compact KPI card for the 2-column "نظرة عامة" grid (icon + number + title +
/// a small breakdown line). Smaller than the old horizontal strip cards.
struct AdminStatGridCard: View {
    let card: AdminStatCard
    var onTap: (() -> Void)? = nil

    var body: some View {
        Button { onTap?() } label: { cardBody }
            .buttonStyle(.plain)
            .disabled(onTap == nil)
    }

    private var cardBody: some View {
        HStack(alignment: .top, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(card.tint.opacity(0.14))
                    .frame(width: 34, height: 34)
                Image(systemName: card.icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(card.tint)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(card.value)
                    .font(.system(size: 20, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(card.title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(1)
                if let breakdown = card.breakdown {
                    Text(breakdown)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 78, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
                .shadow(color: SabqTheme.shadow, radius: 10, x: 0, y: 4)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }
}

// MARK: Status badge

/// Small pill that colour-codes an item's editorial state.
struct AdminStatusBadge: View {
    let status: AdminArticleStatus

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: status.icon)
                .font(.system(size: 10, weight: .bold))
            Text(status.badgeLabel)
                .font(.system(size: 11, weight: .bold))
        }
        .foregroundStyle(status.tint)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(status.tint.opacity(0.12)))
    }
}

// MARK: Segmented control

/// Three-way pill switcher used both on the dashboard (section filter) and in
/// the editor (status picker).
struct AdminSegmentedControl: View {
    let selected: AdminArticleStatus
    let onSelect: (AdminArticleStatus) -> Void

    var body: some View {
        HStack(spacing: 8) {
            ForEach(AdminArticleStatus.allCases) { status in
                let isActive = status == selected
                Button { onSelect(status) } label: {
                    Text(status.label)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(isActive ? .white : SabqTheme.secondaryInk)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background {
                            if isActive {
                                Capsule().fill(SabqTheme.brandGradient)
                            } else {
                                Capsule()
                                    .fill(SabqTheme.surface)
                                    .overlay(
                                        Capsule().stroke(SabqTheme.outline.opacity(0.6), lineWidth: 0.5)
                                    )
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: News row

/// One news item with its metadata and the Edit / Publish actions.
struct AdminNewsRow: View {
    let item: AdminNewsItem
    let isPublishing: Bool
    let onPublish: () -> Void
    var onRequestRevision: () -> Void = {}
    var onArchive: () -> Void = {}
    var onPermanentDelete: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                AdminStatusBadge(status: item.status)
                Spacer(minLength: 0)
                Text(SabqFormatters.arabicDate.string(from: item.updatedAt))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }

            Text(item.title)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            if item.awaitingRevision {
                revisionCue
            }

            if item.status == .scheduled, let scheduled = item.scheduledAt {
                scheduledCue(scheduled)
            }

            if !item.excerpt.isEmpty {
                Text(item.excerpt)
                    .font(.system(size: 13))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }

            HStack(spacing: 14) {
                metaLabel(icon: "person.fill", text: item.author)
                metaLabel(icon: "eye.fill", text: SabqFormatters.compactViewCount(item.views))
            }

            Divider().overlay(SabqTheme.outline.opacity(0.5))

            HStack(spacing: 10) {
                NavigationLink(value: AdminArticleEditorRoute(item: item)) {
                    actionLabel(title: "تعديل", systemImage: "square.and.pencil", tint: SabqTheme.sky)
                }
                .buttonStyle(.plain)

                if item.status != .published && item.status != .archived {
                    Button(action: onPublish) {
                        if isPublishing {
                            HStack(spacing: 7) {
                                ProgressView().controlSize(.small)
                                Text("جارٍ النشر").font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundStyle(SabqTheme.teal)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                    .fill(SabqTheme.teal.opacity(0.10))
                            )
                        } else {
                            actionLabel(title: "نشر", systemImage: "paperplane.fill", tint: SabqTheme.teal)
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(isPublishing)
                }

                Spacer(minLength: 0)

                overflowMenu
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(SabqTheme.surface)
                .shadow(color: SabqTheme.shadow, radius: 12, x: 0, y: 5)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }

    /// Amber "awaiting author revision" banner — mirrors the web's
    /// EditorialDraftReviewCue, showing the editor's note inline.
    private var revisionCue: some View {
        HStack(alignment: .top, spacing: 7) {
            Image(systemName: "exclamationmark.bubble.fill")
                .font(.system(size: 12, weight: .bold))
            VStack(alignment: .leading, spacing: 2) {
                Text("بانتظار تعديل الكاتب")
                    .font(.system(size: 12, weight: .heavy))
                if let notes = item.reviewNotes, !notes.isEmpty {
                    Text(notes)
                        .font(.system(size: 12, weight: .regular))
                        .multilineTextAlignment(.leading)
                }
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(SabqTheme.gold)
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(SabqTheme.gold.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(SabqTheme.gold.opacity(0.35), lineWidth: 0.5)
        )
    }

    /// Sky-tinted banner showing the scheduled publish date + time.
    private func scheduledCue(_ date: Date) -> some View {
        HStack(spacing: 7) {
            Image(systemName: "clock.fill")
                .font(.system(size: 12, weight: .bold))
            Text("مجدول للنشر: \(SabqFormatters.arabicDate.string(from: date)) — \(SabqFormatters.riyadhTime.string(from: date))")
                .font(.system(size: 12, weight: .bold))
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .foregroundStyle(SabqTheme.sky)
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(SabqTheme.sky.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(SabqTheme.sky.opacity(0.35), lineWidth: 0.5)
        )
    }

    /// Overflow (•••) menu with the editorial-workflow actions.
    private var overflowMenu: some View {
        Menu {
            if item.status == .archived {
                Button(role: .destructive, action: onPermanentDelete) {
                    Label("حذف نهائي", systemImage: "trash")
                }
            } else {
                Button(action: onRequestRevision) {
                    Label("طلب تعديل", systemImage: "exclamationmark.bubble")
                }
                Button(role: .destructive, action: onArchive) {
                    Label("أرشفة (عدم النشر)", systemImage: "archivebox")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(SabqTheme.secondaryInk)
                .frame(width: 38, height: 38)
                .background(Circle().fill(SabqTheme.background.opacity(0.6)))
        }
    }

    private func metaLabel(icon: String, text: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 10, weight: .semibold))
            Text(text).font(.system(size: 12, weight: .medium))
        }
        .foregroundStyle(SabqTheme.secondaryInk)
    }

    private func actionLabel(title: String, systemImage: String, tint: Color) -> some View {
        HStack(spacing: 7) {
            Image(systemName: systemImage).font(.system(size: 13, weight: .bold))
            Text(title).font(.system(size: 13, weight: .semibold))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .fill(tint.opacity(0.10))
        )
    }
}

// MARK: Skeleton

/// Placeholder row shown while the (mocked) service is "loading".
struct AdminNewsRowSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                SkeletonBox(width: 72, height: 22, radius: 11)
                Spacer()
                SkeletonBox(width: 60, height: 12)
            }
            SkeletonBox(height: 18)
            SkeletonBox(width: 220, height: 14)
            SkeletonBox(width: 150, height: 12)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }
}

// MARK: - Editorial workflow action + reason sheet

/// A pending editorial action awaiting a reason/note before it runs.
enum AdminWorkflowAction: Identifiable {
    case requestRevision(AdminNewsItem)
    case archive(AdminNewsItem)
    case permanentDelete(AdminNewsItem)

    var id: String {
        switch self {
        case .requestRevision(let i): return "rev-\(i.id)"
        case .archive(let i):         return "arc-\(i.id)"
        case .permanentDelete(let i): return "del-\(i.id)"
        }
    }

    var item: AdminNewsItem {
        switch self {
        case .requestRevision(let i), .archive(let i), .permanentDelete(let i): return i
        }
    }

    var title: String {
        switch self {
        case .requestRevision: return "طلب تعديل"
        case .archive:         return "أرشفة (عدم النشر)"
        case .permanentDelete: return "حذف نهائي"
        }
    }

    var explanation: String {
        switch self {
        case .requestRevision:
            return "يُرسل للكاتب/المراسل مع الملاحظات، ويعود المحتوى لمسوداته ليعدّله ثم يُرسله."
        case .archive:
            return "قرار نهائي بعدم النشر — يُرسل للكاتب/المراسل مع السبب (إشعار + إيميل). ليس طلب تعديل."
        case .permanentDelete:
            return "حذف نهائي للمحتوى من قبل فريق التحرير، ويُشعر الكاتب/المراسل بالسبب."
        }
    }

    var fieldLabel: String {
        switch self {
        case .requestRevision: return "الملاحظات"
        default:               return "السبب"
        }
    }

    var confirmTitle: String {
        switch self {
        case .requestRevision: return "إرسال طلب التعديل"
        case .archive:         return "تأكيد الأرشفة"
        case .permanentDelete: return "حذف نهائي"
        }
    }

    var tint: Color {
        switch self {
        case .requestRevision: return SabqTheme.gold
        case .archive:         return SabqTheme.coral
        case .permanentDelete: return SabqTheme.coral
        }
    }
}

/// Captures the mandatory reason/note (≥5 chars) for a workflow action.
struct AdminReasonSheet: View {
    let action: AdminWorkflowAction
    /// Returns true on success so the sheet can dismiss.
    let onSubmit: (String) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var submitting = false

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var isValid: Bool { trimmed.count >= 5 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(action.explanation)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .multilineTextAlignment(.leading)

                    VStack(alignment: .leading, spacing: 8) {
                        Text(action.fieldLabel)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(SabqTheme.secondaryInk)
                        TextEditor(text: $text)
                            .font(.system(size: 15))
                            .foregroundStyle(SabqTheme.ink)
                            .frame(minHeight: 140)
                            .scrollContentBackground(.hidden)
                            .padding(10)
                            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.surface))
                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SabqTheme.outline.opacity(0.6), lineWidth: 0.5))
                        Text("5 أحرف على الأقل")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(!trimmed.isEmpty && !isValid ? SabqTheme.coral : SabqTheme.tertiaryInk)
                    }

                    Button {
                        Task {
                            submitting = true
                            if await onSubmit(trimmed) { dismiss() } else { submitting = false }
                        }
                    } label: {
                        HStack(spacing: 8) {
                            if submitting { ProgressView().controlSize(.small) }
                            Text(action.confirmTitle).font(.system(size: 16, weight: .bold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous).fill(action.tint))
                        .opacity(isValid ? 1 : 0.5)
                    }
                    .buttonStyle(.plain)
                    .disabled(!isValid || submitting)
                }
                .padding(16)
            }
            .background(SabqTheme.background)
            .navigationTitle(action.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
            }
            .sabqRTL()
        }
    }
}
