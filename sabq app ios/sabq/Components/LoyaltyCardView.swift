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
        fmt.locale = Locale(identifier: "ar_SA@numbers=latn")
        fmt.dateFormat = "MMMM yyyy"
        return "عضو منذ " + fmt.string(from: date)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            // Top row: tier identity + level badge + trophy emblem
            HStack(alignment: .top, spacing: SabqLayout.space12) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text("ولاء سَبْق")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.onAction.opacity(0.85))
                        Text("·")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.onAction.opacity(0.6))
                        HStack(spacing: 4) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 10, weight: .semibold))
                            Text("المستوى \(tier.level) من 5")
                                .font(SabqType.tag.font)
                        }
                        .foregroundStyle(SabqTheme.onAction)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(
                            Capsule(style: .continuous)
                                .fill(SabqTheme.onAction.opacity(0.16))
                        )
                    }

                    Text(tier.nameAr)
                        .sabqText(SabqType.leadTitle)
                        .foregroundStyle(SabqTheme.onAction)
                }

                Spacer(minLength: 0)

                ZStack {
                    Circle()
                        .fill(SabqTheme.onAction.opacity(0.16))
                        .frame(width: 40, height: 40)
                    Image(systemName: "trophy.fill")
                        .font(SabqFonts.app(size: 18, weight: .semibold))
                        .foregroundStyle(SabqTheme.onAction)
                }
                .accessibilityHidden(true)
            }

            // Center: lifetime points (Arabic-first, clean horizontal balance)
            VStack(alignment: .leading, spacing: 2) {
                Text("إجمالي النقاط")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.onAction.opacity(0.82))
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(lifetimePoints.formatted(.number.locale(Locale(identifier: "en_US"))))
                        .font(SabqFonts.headline(size: 36))
                        .foregroundStyle(SabqTheme.onAction)
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                        .environment(\.layoutDirection, .leftToRight)
                    Text("نقطة")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.onAction.opacity(0.85))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Rectangle()
                .fill(SabqTheme.onAction.opacity(0.16))
                .frame(height: 1)

            // Bottom: holder + member ID
            HStack(alignment: .bottom, spacing: SabqLayout.space12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("حامل البطاقة")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.onAction.opacity(0.78))
                    Text(userName)
                        .font(SabqType.rowTitle.font)
                        .foregroundStyle(SabqTheme.onAction)
                        .lineLimit(1)
                    if let memberSinceLabel {
                        Text(memberSinceLabel)
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.onAction.opacity(0.82))
                    }
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 3) {
                    Text("رقم العضوية")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.onAction.opacity(0.78))
                    Text(memberIdShort)
                        .font(SabqType.tag.font)
                        .tracking(1.2)
                        .foregroundStyle(SabqTheme.onAction)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(
                            Capsule(style: .continuous)
                                .fill(SabqTheme.onAction.opacity(0.14))
                        )
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background {
            ZStack {
                tier.gradient

                // Diagonal pattern overlay (subtle membership-card texture)
                Canvas { ctx, size in
                    ctx.opacity = 0.06
                    var path = Path()
                    let spacing: CGFloat = 18
                    var x: CGFloat = -size.height
                    while x < size.width + size.height {
                        path.move(to: CGPoint(x: x, y: 0))
                        path.addLine(to: CGPoint(x: x + size.height, y: size.height))
                        x += spacing
                    }
                    ctx.stroke(path, with: .color(.white), lineWidth: 1)
                }

                // Soft radial highlight in the top-leading corner
                GeometryReader { geo in
                    RadialGradient(
                        colors: [Color.white.opacity(0.18), .clear],
                        center: .topLeading,
                        startRadius: 10,
                        endRadius: geo.size.width * 0.7
                    )
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: tier.color.opacity(0.28), radius: 14, x: 0, y: 6)
        .sabqRTL()
    }
}
