import SwiftUI

// Loyalty membership card — the visual centerpiece in the Account
// (حسابي) screen and reused inside LoyaltyAccountView's hero. Mirrors
// the web LoyaltyCard.tsx layout 1:1 so a screenshot from either
// platform reads the same. Credit-card aspect ratio so we can later
// reuse the same render for an Apple Wallet pass image.
struct LoyaltyCardView: View {
    let userName: String
    let userId: String
    let lifetimePoints: Int
    let memberSince: Date?
    let rankLevelOverride: Int?

    init(userName: String,
         userId: String,
         lifetimePoints: Int,
         memberSince: Date? = nil,
         rankLevelOverride: Int? = nil) {
        self.userName = userName
        self.userId = userId
        self.lifetimePoints = lifetimePoints
        self.memberSince = memberSince
        self.rankLevelOverride = rankLevelOverride
    }

    private var tier: LoyaltyTier {
        if let level = rankLevelOverride {
            return LoyaltyTiers.tier(forLevel: level)
        }
        return LoyaltyTiers.tier(forLifetimePoints: lifetimePoints)
    }

    private var memberIdShort: String {
        let clean = userId.filter { $0.isLetter || $0.isNumber }
        let tail = String(clean.suffix(10)).uppercased()
        return tail.padding(toLength: max(10, tail.count), withPad: "0", startingAt: 0)
    }

    private var memberSinceLabel: String? {
        guard let date = memberSince else { return nil }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "ar_SA")
        fmt.dateFormat = "MMMM yyyy"
        return "عضو منذ " + fmt.string(from: date)
    }

    var body: some View {
        // بطاقة العضوية: لون هوية واحد مسطح (خلفية الأزرار، تكفي لنص أبيض في الوضعين)،
        // بلا تدرج ولا توهج ولا ظل.
        VStack(alignment: .leading, spacing: 0) {
            // Top row
            HStack(alignment: .top, spacing: SabqLayout.space12) {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text("سبق · LOYALTY")
                        .font(SabqType.tag.font)
                        .tracking(1.5)
                        .foregroundStyle(SabqTheme.onAction.opacity(0.85))
                    Text(tier.nameAr)
                        .sabqText(SabqType.leadTitle)
                        .foregroundStyle(SabqTheme.onAction)
                    Text(tier.nameEn)
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.onAction.opacity(0.85))
                }
                Spacer(minLength: 0)
                Image(systemName: "trophy.fill")
                    .font(SabqFonts.app(size: 22, weight: .semibold))
                    .foregroundStyle(SabqTheme.onAction)
                    .accessibilityHidden(true)
            }

            Spacer(minLength: SabqLayout.space8)

            // Center: lifetime points
            VStack(spacing: SabqLayout.space4) {
                Text("Lifetime Points")
                    .font(SabqType.tag.font)
                    .tracking(1.5)
                    .foregroundStyle(SabqTheme.onAction.opacity(0.85))
                Text(lifetimePoints.formatted(.number.locale(Locale(identifier: "en_US"))))
                    .font(SabqFonts.headline(size: 40))
                    .foregroundStyle(SabqTheme.onAction)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                    .environment(\.layoutDirection, .leftToRight)
                HStack(spacing: SabqLayout.space4) {
                    Image(systemName: "sparkles")
                        .font(SabqType.tag.font)
                        .accessibilityHidden(true)
                    Text("المستوى \(tier.level) من 5")
                        .font(SabqType.tag.font)
                }
                .foregroundStyle(SabqTheme.onAction.opacity(0.85))
            }
            .frame(maxWidth: .infinity)

            Spacer(minLength: SabqLayout.space8)

            // Bottom: holder + member ID
            HStack(alignment: .bottom, spacing: SabqLayout.space12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("حامل البطاقة")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.onAction.opacity(0.85))
                    Text(userName)
                        .font(SabqType.rowTitle.font)
                        .foregroundStyle(SabqTheme.onAction)
                        .lineLimit(1)
                    if let memberSinceLabel {
                        Text(memberSinceLabel)
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.onAction.opacity(0.85))
                    }
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 2) {
                    Text("رقم العضوية")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.onAction.opacity(0.85))
                    Text(memberIdShort)
                        .font(SabqType.metaEmphasis.font)
                        .tracking(1.5)
                        .foregroundStyle(SabqTheme.onAction)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(SabqTheme.actionFill)
        .aspectRatio(1.586, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        .environment(\.layoutDirection, .rightToLeft)
    }
}
