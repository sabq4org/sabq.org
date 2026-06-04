import SwiftUI

// MARK: - Admin dashboard components
//
// Reusable building blocks for `AdminDashboardView`. They lean entirely on the
// shared `SabqTheme` palette + radii so they match the rest of the app and
// flip correctly under `.sabqRTL()`.

// MARK: Metric tile

/// A single KPI card in the horizontal "نظرة عامة" strip.
struct AdminMetricCard: View {
    let metric: AdminMetric

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(metric.tint.opacity(0.14))
                    .frame(width: 44, height: 44)
                Image(systemName: metric.icon)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(metric.tint)
            }
            Text(metric.value)
                .font(.system(size: 26, weight: .heavy, design: .rounded))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(metric.title)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(1)
        }
        .padding(16)
        .frame(width: 152, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
                .shadow(color: SabqTheme.shadow, radius: 12, x: 0, y: 5)
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

                if item.status != .published {
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
