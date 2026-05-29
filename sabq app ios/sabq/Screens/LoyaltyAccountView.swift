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
                quickActions
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

    // MARK: Quick actions — gateway to the new "rewards store" and
    // "points history" screens (2026-05-20). Two side-by-side cards
    // that mirror the loyalty card's gradient so they feel like a
    // continuation of the hero rather than detached menu items.

    @ViewBuilder
    private var quickActions: some View {
        HStack(spacing: 12) {
            NavigationLink(destination: LoyaltyRewardsView()) {
                quickActionCard(
                    title: "متجر المكافآت",
                    subtitle: "استبدل نقاطك بمكافآت",
                    icon: "gift.fill",
                    tint: SabqTheme.primaryEnd
                )
            }
            .buttonStyle(.plain)

            NavigationLink(destination: LoyaltyHistoryView()) {
                quickActionCard(
                    title: "سجل نقاطي",
                    subtitle: "تتبَّع نشاطك ونقاطك",
                    icon: "clock.arrow.circlepath",
                    tint: SabqTheme.coral
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func quickActionCard(title: String, subtitle: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.14))
                    .frame(width: 38, height: 38)
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(tint)
            }
            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
            Text(subtitle)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(tint.opacity(0.25), lineWidth: 0.5)
        )
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

    // MARK: Tier ladder (vertical timeline)
    //
    // Each tier renders as a node on a continuous vertical line, with
    // its real brand color regardless of locked state — locked tiers
    // are still shown in their proper hue (outlined, smaller) instead
    // of being greyed out, per editorial preference: "كل مرحلة بلونها
    // الحقيقي".

    @ViewBuilder
    private var tierLadder: some View {
        let currentLevel = loader.summary?.points?.rankLevel ?? 1
        VStack(alignment: .leading, spacing: 14) {
            Text("المستويات الخمسة")
                .font(.system(size: 14, weight: .heavy, design: .rounded))
                .foregroundStyle(SabqTheme.ink)
            VStack(spacing: 0) {
                ForEach(Array(LoyaltyTiers.all.enumerated()), id: \.element.id) { idx, tier in
                    tierTimelineRow(
                        tier: tier,
                        currentLevel: currentLevel,
                        isFirst: idx == 0,
                        isLast: idx == LoyaltyTiers.all.count - 1
                    )
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

    private func tierTimelineRow(tier: LoyaltyTier, currentLevel: Int, isFirst: Bool, isLast: Bool) -> some View {
        let reached = tier.level <= currentLevel
        let isCurrent = tier.level == currentLevel
        let nextReached = tier.level < currentLevel  // the connector below is "filled" only if the next tier is also reached
        let nodeColumnWidth: CGFloat = 36

        return HStack(alignment: .top, spacing: 14) {
            // ── Timeline column: top connector ─ node ─ bottom connector
            VStack(spacing: 0) {
                Rectangle()
                    .fill(reached ? tier.color : tier.color.opacity(0.25))
                    .frame(width: 2, height: 14)
                    .opacity(isFirst ? 0 : 1)

                node(for: tier, isCurrent: isCurrent, reached: reached)

                Rectangle()
                    .fill(nextReached ? tier.color : tier.color.opacity(0.25))
                    .frame(width: 2)
                    .frame(maxHeight: .infinity)
                    .opacity(isLast ? 0 : 1)
            }
            .frame(width: nodeColumnWidth)

            // ── Tier info
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(tier.nameAr)
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundStyle(tier.color)
                    if isCurrent {
                        Text("مستواك الآن")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(tier.color))
                    }
                }
                Text("يبدأ من \(tier.minLifetimePoints.formatted(.number.locale(Locale(identifier: "ar_SA")))) نقطة")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            .padding(.top, 14)   // align text baseline with the node center
            .padding(.bottom, isLast ? 4 : 18)

            Spacer(minLength: 0)
        }
    }

    /// The colored circle node on the timeline. Current tier = large
    /// filled disc with a soft halo; reached-but-past = medium filled
    /// disc with a small checkmark; locked = outlined ring at full
    /// tier-color opacity so the brand color remains visible.
    @ViewBuilder
    private func node(for tier: LoyaltyTier, isCurrent: Bool, reached: Bool) -> some View {
        ZStack {
            if isCurrent {
                Circle()
                    .fill(tier.color.opacity(0.18))
                    .frame(width: 32, height: 32)
            }
            if reached {
                Circle()
                    .fill(tier.color)
                    .frame(width: isCurrent ? 20 : 14, height: isCurrent ? 20 : 14)
                if !isCurrent {
                    Image(systemName: "checkmark")
                        .font(.system(size: 8, weight: .heavy))
                        .foregroundStyle(.white)
                }
            } else {
                Circle()
                    .strokeBorder(tier.color, lineWidth: 2)
                    .frame(width: 14, height: 14)
                    .background(Circle().fill(Color.white))
            }
        }
        .frame(width: 32, height: 32)
    }
}
