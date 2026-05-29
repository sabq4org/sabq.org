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
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(progress.current.color.opacity(0.18))
                        .frame(width: 28, height: 28)
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(progress.current.color)
                }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(progress.current.nameAr)
                            .font(.system(size: 13, weight: .heavy, design: .rounded))
                            .foregroundStyle(progress.current.color)
                        if summary.weekPoints > 0 {
                            HStack(spacing: 2) {
                                Text("+\(summary.weekPoints)")
                                    .font(.system(size: 11, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color.orange)
                                Text("هذا الأسبوع")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                            }
                        }
                        if summary.streakDays >= 3 {
                            HStack(spacing: 2) {
                                Image(systemName: "flame.fill").font(.system(size: 9))
                                Text("\(summary.streakDays)")
                                    .font(.system(size: 11, weight: .bold))
                            }
                            .foregroundStyle(Color.orange)
                        }
                    }
                    if let next = progress.next {
                        GeometryReader { geo in
                            ZStack(alignment: .topLeading) {
                                Capsule()
                                    .fill(SabqTheme.outline.opacity(0.25))
                                    .frame(height: 4)
                                Capsule()
                                    .fill(progress.current.color)
                                    .frame(width: geo.size.width * progress.fraction, height: 4)
                            }
                        }
                        .frame(height: 4)
                        Text("\(progress.pointsToNext.formatted(.number.locale(Locale(identifier: "ar_SA")))) نقطة لـ \(next.nameAr)")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    } else {
                        Text("وصلت إلى أعلى مستوى ✨")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.backward")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(progress.current.color.opacity(0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(progress.current.color.opacity(0.25), lineWidth: 0.5)
            )
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
