import SwiftUI

// MARK: - Admin dashboard components
//
// Reusable building blocks for `AdminDashboardView`. They lean entirely on the
// shared `SabqTheme` palette + radii so they match the rest of the app and
// flip correctly under `.sabqRTL()`.

// MARK: Stat tile

/// Compact KPI block for the 2-column "نظرة عامة" grid (icon + number + title +
/// a small breakdown line). Quiet muted fill, no border or shadow.
struct AdminStatGridCard: View {
    let card: AdminStatCard
    var onTap: (() -> Void)? = nil

    var body: some View {
        Button { onTap?() } label: { cardBody }
            .buttonStyle(.plain)
            .disabled(onTap == nil)
    }

    private var cardBody: some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            Image(systemName: card.icon)
                .font(SabqFonts.app(size: 16, weight: .semibold))
                .foregroundStyle(card.tint)
                .frame(width: 24, height: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(card.value)
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(card.title)
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(1)
                if let breakdown = card.breakdown {
                    Text(breakdown)
                        .sabqText(SabqType.tag)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, minHeight: 80, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
    }
}

// MARK: Status badge

/// Compact borderless capsule that colour-codes an item's editorial state.
struct AdminStatusBadge: View {
    let status: AdminArticleStatus

    var body: some View {
        HStack(spacing: SabqLayout.space4) {
            Image(systemName: status.icon)
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .accessibilityHidden(true)
            Text(status.badgeLabel)
                .sabqText(SabqType.tag)
        }
        .foregroundStyle(status.tint)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(
            Capsule(style: .continuous)
                .fill(status.tint.opacity(0.12))
        )
    }
}

// MARK: Segmented control

/// Three-way capsule switcher used both on the dashboard (section filter) and
/// in the editor (status picker).
struct AdminSegmentedControl: View {
    let selected: AdminArticleStatus
    let onSelect: (AdminArticleStatus) -> Void

    var body: some View {
        HStack(spacing: SabqLayout.space8) {
            ForEach(AdminArticleStatus.allCases) { status in
                let isActive = status == selected
                Button { onSelect(status) } label: {
                    Text(status.label)
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(isActive ? SabqTheme.onAction : SabqTheme.textPrimary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: SabqLayout.touchTarget)
                        .background(
                            Capsule(style: .continuous)
                                .fill(isActive ? SabqTheme.actionFill : SabqTheme.surfaceMuted)
                        )
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isActive ? [.isSelected] : [])
            }
        }
    }
}

// MARK: News row

/// One news item with its metadata and the Edit / Publish actions. Unboxed:
/// the parent list separates rows with thin separators.
struct AdminNewsRow: View {
    let item: AdminNewsItem
    let isPublishing: Bool
    let onPublish: () -> Void
    var onRequestRevision: () -> Void = {}
    var onArchive: () -> Void = {}
    var onPermanentDelete: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(alignment: .center, spacing: SabqLayout.space8) {
                AdminStatusBadge(status: item.status)
                Spacer(minLength: 0)
                HStack(spacing: 4) {
                    Text("\(rowTimestampLabel):")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textTertiary)
                    Text(SabqFormatters.riyadhDateTime.string(from: rowTimestampDate))
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            }

            Text(item.title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            if item.awaitingRevision {
                revisionCue
            }

            if let schedule = item.schedulePresentation() {
                scheduleCue(schedule)
            }

            if !item.excerpt.isEmpty {
                Text(item.excerpt)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }

            HStack(spacing: SabqLayout.space16) {
                metaLabel(icon: "person", text: item.author)
                metaLabel(icon: "eye", text: SabqFormatters.compactViewCount(item.views))
            }

            HStack(spacing: SabqLayout.space8) {
                NavigationLink(value: AdminArticleEditorRoute(item: item)) {
                    actionLabel(title: "تعديل", systemImage: "square.and.pencil", tint: SabqTheme.primary)
                }
                .buttonStyle(.plain)

                if item.status != .published && item.status != .archived {
                    Button(action: onPublish) {
                        if isPublishing {
                            HStack(spacing: SabqLayout.space8) {
                                ProgressView().controlSize(.small)
                                Text("جارٍ النشر").sabqText(SabqType.metaEmphasis)
                            }
                            .foregroundStyle(SabqTheme.success)
                            .padding(.horizontal, SabqLayout.space12)
                            .frame(minHeight: SabqLayout.touchTarget)
                            .background(
                                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                    .fill(SabqTheme.surfaceMuted)
                            )
                        } else {
                            actionLabel(title: "نشر الآن", systemImage: "paperplane", tint: SabqTheme.success)
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(isPublishing)
                }

                Spacer(minLength: 0)

                overflowMenu
            }
            .padding(.top, SabqLayout.space4)
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// "Awaiting author revision" note — mirrors the web's
    /// EditorialDraftReviewCue, showing the editor's note inline.
    private var revisionCue: some View {
        HStack(alignment: .top, spacing: SabqLayout.space8) {
            Image(systemName: "exclamationmark.bubble")
                .font(SabqFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(SabqTheme.warning)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text("بانتظار تعديل الكاتب")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.warning)
                if let notes = item.reviewNotes, !notes.isEmpty {
                    Text(notes)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .multilineTextAlignment(.leading)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.warning.opacity(0.10))
        )
    }

    /// Shows the actual saved schedule separately from the writer's suggested
    /// weekly slot. Only saved dates can be overdue.
    private func scheduleCue(_ schedule: AdminSchedulePresentation) -> some View {
        let tint: Color = schedule.isOverdue ? SabqTheme.danger : SabqTheme.primary
        return HStack(alignment: .top, spacing: SabqLayout.space8) {
            Image(systemName: schedule.isOverdue ? "exclamationmark.triangle" : "clock")
                .font(SabqFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(schedule.title)
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(tint)
                Text(schedule.fullLabel ?? schedule.detail)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(schedule.isOverdue ? SabqTheme.danger.opacity(0.10) : SabqTheme.skyTint)
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
                .font(SabqFonts.app(size: 16, weight: .semibold))
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                .contentShape(Rectangle())
        }
    }

    private func metaLabel(icon: String, text: String) -> some View {
        HStack(spacing: SabqLayout.space4) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 12))
                .accessibilityHidden(true)
            Text(text).sabqText(SabqType.meta)
        }
        .foregroundStyle(SabqTheme.textSecondary)
    }

    private var rowTimestampLabel: String {
        item.status == .published && item.publishedAt != nil ? "نُشر" : "حُفظت"
    }

    private var rowTimestampDate: Date {
        item.status == .published ? (item.publishedAt ?? item.updatedAt) : item.updatedAt
    }

    private func actionLabel(title: String, systemImage: String, tint: Color) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: systemImage)
                .font(SabqFonts.app(size: 13, weight: .semibold))
                .accessibilityHidden(true)
            Text(title).sabqText(SabqType.metaEmphasis)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, SabqLayout.space12)
        .frame(minHeight: 38)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                .fill(tint == SabqTheme.primary ? SabqTheme.skyTint : tint.opacity(0.12))
        )
    }
}

// MARK: Skeleton

/// Placeholder row shown while the service is loading.
struct AdminNewsRowSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack {
                SkeletonBox(width: 72, height: 22, radius: SabqRadius.small)
                Spacer()
                SkeletonBox(width: 60, height: 12)
            }
            SkeletonBox(height: 18)
            SkeletonBox(width: 220, height: 14)
            SkeletonBox(width: 150, height: 12)
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
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
        case .requestRevision: return SabqTheme.actionFill
        case .archive:         return SabqTheme.danger
        case .permanentDelete: return SabqTheme.danger
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
    /// Destructive actions read as danger text on a quiet fill: a light danger
    /// fill under white text fails contrast in dark mode.
    private var isDestructive: Bool {
        if case .requestRevision = action { return false }
        return true
    }
    private var confirmInk: Color {
        guard isValid else { return SabqTheme.disabledInk }
        return isDestructive ? SabqTheme.danger : SabqTheme.onAction
    }
    private var confirmFill: Color {
        guard isValid else { return SabqTheme.disabledFill }
        return isDestructive ? SabqTheme.surfaceMuted : SabqTheme.actionFill
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SabqLayout.space16) {
                    Text(action.explanation)
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .multilineTextAlignment(.leading)

                    VStack(alignment: .leading, spacing: SabqLayout.space8) {
                        Text(action.fieldLabel)
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.textSecondary)
                        TextEditor(text: $text)
                            .sabqText(SabqType.excerpt)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .frame(minHeight: 140)
                            .scrollContentBackground(.hidden)
                            .padding(SabqLayout.space8)
                            .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surface))
                            .overlay(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
                        Text("5 أحرف على الأقل")
                            .sabqText(SabqType.tag)
                            .foregroundStyle(!trimmed.isEmpty && !isValid ? SabqTheme.danger : SabqTheme.textTertiary)
                    }

                    Button {
                        Task {
                            submitting = true
                            if await onSubmit(trimmed) { dismiss() } else { submitting = false }
                        }
                    } label: {
                        HStack(spacing: SabqLayout.space8) {
                            if submitting { ProgressView().controlSize(.small).tint(confirmInk) }
                            Text(action.confirmTitle).sabqText(SabqType.button)
                        }
                        .foregroundStyle(confirmInk)
                        .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                .fill(confirmFill)
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(!isValid || submitting)
                }
                .padding(SabqLayout.pageMargin)
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
