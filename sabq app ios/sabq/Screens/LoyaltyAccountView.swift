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
            VStack(spacing: SabqLayout.space24) {
                heroCard
                statsTriplet
                quickActions
                tierLadder
            }
            .padding(SabqLayout.pageMargin)
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
        HStack(spacing: SabqLayout.space12) {
            NavigationLink(destination: LoyaltyRewardsView()) {
                quickActionCard(
                    title: "متجر المكافآت",
                    subtitle: "استبدل نقاطك بمكافآت",
                    icon: "gift.fill",
                    tint: SabqTheme.primary
                )
            }
            .buttonStyle(.plain)

            NavigationLink(destination: LoyaltyHistoryView()) {
                quickActionCard(
                    title: "سجل نقاطي",
                    subtitle: "تتبَّع نشاطك ونقاطك",
                    icon: "clock.arrow.circlepath",
                    tint: SabqTheme.primary
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func quickActionCard(title: String, subtitle: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 16, weight: .semibold))
                .foregroundStyle(SabqTheme.primary)
                .frame(width: 36, height: 36)
                .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                .accessibilityHidden(true)
            Text(title)
                .font(SabqType.button.font)
                .foregroundStyle(SabqTheme.textPrimary)
            Text(subtitle)
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(SabqLayout.space16)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
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
        HStack(spacing: SabqLayout.space12) {
            statTile(label: "هذا الأسبوع", value: summary?.weekPoints ?? 0, accent: true, icon: "bolt.fill")
            statTile(label: "هذا الشهر", value: summary?.monthPoints ?? 0, accent: false, icon: "star.fill")
            statTile(label: "streak", value: summary?.streakDays ?? 0, accent: false, icon: "flame.fill", suffix: "يوم")
        }
    }

    private func statTile(label: String, value: Int, accent: Bool, icon: String, suffix: String? = nil) -> some View {
        VStack(spacing: SabqLayout.space4) {
            HStack(spacing: SabqLayout.space4) {
                Image(systemName: icon).font(SabqType.tag.font)
                    .foregroundStyle(accent ? SabqTheme.primary : SabqTheme.textSecondary)
                    .accessibilityHidden(true)
                Text(label).font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space4) {
                Text("\(value)")
                    .font(SabqType.leadTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                if let suffix {
                    Text(suffix)
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space12)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
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
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func tierTimelineRow(tier: LoyaltyTier, currentLevel: Int, isFirst: Bool, isLast: Bool) -> some View {
        let reached = tier.level <= currentLevel
        let isCurrent = tier.level == currentLevel
        let nextReached = tier.level < currentLevel  // the connector below is "filled" only if the next tier is also reached
        let nodeColumnWidth: CGFloat = 36

        return HStack(alignment: .top, spacing: SabqLayout.space12) {
            // ── Timeline column: top connector ─ node ─ bottom connector
            VStack(spacing: 0) {
                Rectangle()
                    .fill(reached ? tier.color : SabqTheme.separator)
                    .frame(width: 2, height: 12)
                    .opacity(isFirst ? 0 : 1)

                node(for: tier, isCurrent: isCurrent, reached: reached)

                Rectangle()
                    .fill(nextReached ? tier.color : SabqTheme.separator)
                    .frame(width: 2)
                    .frame(maxHeight: .infinity)
                    .opacity(isLast ? 0 : 1)
            }
            .frame(width: nodeColumnWidth)

            // ── Tier info
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                HStack(spacing: SabqLayout.space8) {
                    Text(tier.nameAr)
                        .font(SabqType.rowTitle.font)
                        .foregroundStyle(reached ? SabqTheme.textPrimary : SabqTheme.textSecondary)
                    if isCurrent {
                        Text("مستواك الآن")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.onAction)
                            .padding(.horizontal, SabqLayout.space8)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(SabqTheme.actionFill))
                    }
                }
                Text("يبدأ من \(tier.minLifetimePoints.formatted(.number.locale(Locale(identifier: "ar_SA")))) نقطة")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            .padding(.top, SabqLayout.space8)   // align text baseline with the node center
            .padding(.bottom, isLast ? SabqLayout.space4 : SabqLayout.space16)

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
