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
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space12)
            .padding(.bottom, 108)
        }
        .sabqNavigationEdge()
        .sabqAutoHideTabBar()
        .background(SabqTheme.background.ignoresSafeArea())
        .navigationTitle("نقاطي والمكافآت")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(SabqTheme.background, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .task { await loader.load() }
        .refreshable { await loader.refresh() }
        .sabqRTL()
    }

    // MARK: Quick actions — gateway to the "rewards store" and
    // "points history" screens.

    @ViewBuilder
    private var quickActions: some View {
        let currentTierColor = loader.summary?.resolvedTier.color ?? SabqTheme.primary
        HStack(spacing: SabqLayout.space12) {
            NavigationLink(destination: LoyaltyRewardsView()) {
                quickActionCard(
                    title: "متجر المكافآت",
                    subtitle: "استبدل نقاطك بمكافآت",
                    icon: "gift.fill",
                    tint: currentTierColor
                )
            }
            .buttonStyle(.plain)

            NavigationLink(destination: LoyaltyHistoryView()) {
                quickActionCard(
                    title: "سجل نقاطي",
                    subtitle: "تتبَّع نشاطك ونقاطك",
                    icon: "clock.arrow.circlepath",
                    tint: currentTierColor
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func quickActionCard(title: String, subtitle: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(tint)
                    .frame(width: 36, height: 36)
                    .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                    .accessibilityHidden(true)
                Spacer(minLength: 0)
                Image(systemName: "chevron.backward")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(SabqTheme.textTertiary)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text(subtitle)
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(SabqLayout.space16)
        .sabqBlockSurface()
        .contentShape(Rectangle())
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
        HStack(spacing: 10) {
            statTile(
                label: "هذا الأسبوع",
                value: summary?.weekPoints ?? 0,
                icon: "bolt.fill",
                iconColor: SabqTheme.primary
            )
            statTile(
                label: "هذا الشهر",
                value: summary?.monthPoints ?? 0,
                icon: "star.fill",
                iconColor: SabqTheme.warning
            )
            statTile(
                label: "أيام متتالية",
                value: summary?.streakDays ?? 0,
                icon: "flame.fill",
                iconColor: SabqTheme.coral,
                suffix: "يوم"
            )
        }
    }

    private func statTile(label: String, value: Int, icon: String, iconColor: Color, suffix: String? = nil) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(SabqType.tag.font)
                    .foregroundStyle(iconColor)
                    .accessibilityHidden(true)
                Text(label)
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(value.formatted(.number.locale(Locale(identifier: "en_US"))))
                    .font(SabqType.leadTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                if let suffix {
                    Text(suffix)
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space12)
        .padding(.horizontal, SabqLayout.space8)
        .sabqBlockSurface()
    }

    // MARK: Tier ladder (vertical timeline)

    @ViewBuilder
    private var tierLadder: some View {
        let currentLevel = loader.summary?.points?.rankLevel ?? 1
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            Text("المستويات الخمسة")
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
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
            .padding(SabqLayout.space16)
            .sabqBlockSurface()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func tierTimelineRow(tier: LoyaltyTier, currentLevel: Int, isFirst: Bool, isLast: Bool) -> some View {
        let reached = tier.level <= currentLevel
        let isCurrent = tier.level == currentLevel
        let nextReached = tier.level < currentLevel
        let nodeColumnWidth: CGFloat = 32
        let pointsFormatted = tier.minLifetimePoints.formatted(.number.locale(Locale(identifier: "en_US")))

        return HStack(alignment: .top, spacing: SabqLayout.space12) {
            // ── Timeline column: top connector ─ node ─ bottom connector
            VStack(spacing: 0) {
                Rectangle()
                    .fill(reached ? tier.color : tier.color.opacity(0.25))
                    .frame(width: 2, height: 12)
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
            HStack(alignment: .center, spacing: SabqLayout.space8) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: SabqLayout.space8) {
                        Text(tier.nameAr)
                            .font(SabqType.rowTitle.font)
                            .foregroundStyle(tier.color)
                        if isCurrent {
                            Text("مستواك الآن")
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.onAction)
                                .padding(.horizontal, SabqLayout.space8)
                                .padding(.vertical, 3)
                                .background(Capsule(style: .continuous).fill(tier.color))
                        }
                    }
                    Text(tier.minLifetimePoints == 0 ? "نقطة البداية" : "يبدأ من \(pointsFormatted) نقطة")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                }

                Spacer(minLength: 0)

                Text("\(pointsFormatted)")
                    .font(SabqType.tag.font)
                    .monospacedDigit()
                    .foregroundStyle(tier.color)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(
                        Capsule(style: .continuous)
                            .fill(tier.color.opacity(0.12))
                    )
                    .environment(\.layoutDirection, .leftToRight)
            }
            .padding(.top, 6)
            .padding(.bottom, isLast ? SabqLayout.space4 : SabqLayout.space16)
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
                        .foregroundStyle(SabqTheme.onAction)
                }
            } else {
                Circle()
                    .strokeBorder(tier.color, lineWidth: 2)
                    .frame(width: 14, height: 14)
                    .background(Circle().fill(SabqTheme.background))
            }
        }
        .frame(width: 32, height: 32)
    }
}
