import SwiftUI

// Slim horizontal strip placed inside personalJourneyBlock on the home
// feed. Mirrors the web LoyaltyStrip.tsx visual: tier dot + tier name +
// week points + streak chip + progress fragment + chevron. Tapping it
// dismisses to the LoyaltyAccountView. Renders nothing for signed-out
// users.
struct LoyaltyStripView: View {
    @State private var loader = LoyaltySummaryLoader()
    let onTap: () -> Void

    var body: some View {
        Group {
            if let summary = loader.summary {
                content(summary: summary)
            } else {
                EmptyView()
            }
        }
        .task {
            await loader.load()
        }
    }

    @ViewBuilder
    private func content(summary: LoyaltySummary) -> some View {
        let progress = summary.progressToNext
        Button(action: onTap) {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "trophy.fill")
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(progress.current.color)
                    .frame(width: 32, height: 32)
                    .background(progress.current.color.opacity(0.14), in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    HStack(spacing: SabqLayout.space8) {
                        Text(progress.current.nameAr)
                            .font(SabqType.button.font)
                            .foregroundStyle(progress.current.color)
                        if summary.weekPoints > 0 {
                            HStack(spacing: 2) {
                                Text("+\(summary.weekPoints)")
                                    .font(SabqType.metaEmphasis.font)
                                    .foregroundStyle(SabqTheme.warning)
                                Text("هذا الأسبوع")
                                    .font(SabqType.tag.font)
                                    .foregroundStyle(SabqTheme.textSecondary)
                            }
                        }
                        if summary.streakDays >= 3 {
                            HStack(spacing: 2) {
                                Image(systemName: "flame.fill").font(SabqType.tag.font)
                                Text("\(summary.streakDays)")
                                    .font(SabqType.metaEmphasis.font)
                            }
                            .foregroundStyle(SabqTheme.warning)
                        }
                    }
                    if let next = progress.next {
                        GeometryReader { geo in
                            ZStack(alignment: .topLeading) {
                                Capsule()
                                    .fill(SabqTheme.surfaceStrong)
                                    .frame(height: 4)
                                Capsule()
                                    .fill(progress.current.color)
                                    .frame(width: geo.size.width * progress.fraction, height: 4)
                            }
                        }
                        .frame(height: 4)
                        Text("\(progress.pointsToNext.formatted(.number.locale(Locale(identifier: "ar_SA")))) نقطة لـ \(next.nameAr)")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textSecondary)
                    } else {
                        Text("وصلت إلى أعلى مستوى ✨")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, SabqLayout.space12)
            .padding(.vertical, SabqLayout.space12)
            .frame(minHeight: SabqLayout.touchTarget)
            .background(
                // يقع داخل بلوك «رحلتك المعرفية» الرمادي، فيأخذ سطح البطاقة.
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(SabqTheme.surface)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// Observation-macro-backed loader (matches the project's AuthStore /
// ArticlesStore convention — the app uses Swift 5.9 @Observable
// throughout, not the older ObservableObject + @Published).
@MainActor
@Observable
final class LoyaltySummaryLoader {
    var summary: LoyaltySummary?
    var isLoading = false

    func load() async {
        guard summary == nil else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            summary = try await APIClient.shared.fetchLoyaltySummary()
        } catch {
            // Silent — strip just stays hidden if we can't reach the API.
        }
    }

    func refresh() async {
        do {
            summary = try await APIClient.shared.fetchLoyaltySummary()
        } catch { /* keep last good value */ }
    }
}
