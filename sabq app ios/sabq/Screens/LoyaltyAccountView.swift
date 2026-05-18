import SwiftUI

// The "حسابي / نقاطي" screen. Mirrors the web /dashboard/loyalty
// surface: hero card with tier-colored gradient + progress bar, the
// 5-tier ladder (locked icons on unreached tiers), week/month/streak
// triplet, and a recent events strip. Linked from SettingsView.
private func parseIsoDate(_ s: String?) -> Date? {
    guard let s, !s.isEmpty else { return nil }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: s) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: s)
}

struct LoyaltyAccountView: View {
    @Environment(AuthStore.self) private var authStore
    @State private var loader = LoyaltySummaryLoader()

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                heroCard
                statsTriplet
                tierLadder
            }
            .padding(16)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .navigationTitle("نقاطي والمكافآت")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loader.load() }
        .refreshable { await loader.refresh() }
        .environment(\.layoutDirection, .rightToLeft)
    }

    // MARK: Hero

    @ViewBuilder
    private var heroCard: some View {
        let summary = loader.summary
        let lifetime = summary?.points?.lifetimePoints ?? 0
        let rankLevel = summary?.points?.rankLevel
        let userName: String = {
            let first = authStore.currentUser?.firstName ?? ""
            let last = authStore.currentUser?.lastName ?? ""
            let combined = [first, last].filter { !$0.isEmpty }.joined(separator: " ")
            return combined.isEmpty ? (authStore.currentUser?.email ?? "حامل البطاقة") : combined
        }()
        LoyaltyCardView(
            userName: userName,
            userId: authStore.currentUser?.id ?? "00000000",
            lifetimePoints: lifetime,
            memberSince: parseIsoDate(authStore.currentUser?.createdAt),
            rankLevelOverride: rankLevel
        )
    }

    // MARK: Stats

    @ViewBuilder
    private var statsTriplet: some View {
        let summary = loader.summary
        HStack(spacing: 12) {
            statTile(label: "هذا الأسبوع", value: summary?.weekPoints ?? 0, accent: true, icon: "bolt.fill")
            statTile(label: "هذا الشهر", value: summary?.monthPoints ?? 0, accent: false, icon: "star.fill")
            statTile(label: "streak", value: summary?.streakDays ?? 0, accent: false, icon: "flame.fill", suffix: "يوم")
        }
    }

    private func statTile(label: String, value: Int, accent: Bool, icon: String, suffix: String? = nil) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 11))
                Text(label).font(.system(size: 11, weight: .medium))
            }
            .foregroundStyle(accent ? Color.orange : SabqTheme.secondaryInk)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\(value)")
                    .font(.system(size: 22, weight: .black, design: .rounded))
                    .foregroundStyle(accent ? Color.orange : SabqTheme.ink)
                if let suffix {
                    Text(suffix)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }

    // MARK: Tier ladder

    @ViewBuilder
    private var tierLadder: some View {
        let currentLevel = loader.summary?.points?.rankLevel ?? 1
        VStack(alignment: .leading, spacing: 10) {
            Text("المستويات الخمسة")
                .font(.system(size: 14, weight: .heavy, design: .rounded))
                .foregroundStyle(SabqTheme.ink)
            VStack(spacing: 6) {
                ForEach(LoyaltyTiers.all) { tier in
                    tierRow(tier: tier, currentLevel: currentLevel)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }

    private func tierRow(tier: LoyaltyTier, currentLevel: Int) -> some View {
        let isCurrent = tier.level == currentLevel
        let locked = tier.level > currentLevel
        return HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(locked ? Color.gray.opacity(0.15) : tier.color.opacity(0.18))
                    .frame(width: 36, height: 36)
                Image(systemName: locked ? "lock.fill" : "trophy.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(locked ? Color.gray : tier.color)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(tier.nameAr)
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(locked ? Color.gray : tier.color)
                Text("يبدأ من \(tier.minLifetimePoints.formatted(.number.locale(Locale(identifier: "ar_SA")))) نقطة")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            Spacer(minLength: 0)
            if isCurrent {
                Text("مستواك الآن")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(tier.color))
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(isCurrent ? tier.color.opacity(0.08) : Color.clear)
        )
    }
}
