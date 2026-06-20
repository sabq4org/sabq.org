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
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                tier.gradient

                // Diagonal pattern overlay (subtle texture)
                Canvas { ctx, size in
                    ctx.opacity = 0.07
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

                // Soft radial highlight in the top-left corner
                RadialGradient(
                    colors: [Color.white.opacity(0.2), .clear],
                    center: .topLeading,
                    startRadius: 10,
                    endRadius: geo.size.width * 0.7
                )

                VStack(alignment: .leading, spacing: 0) {
                    // Top row
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("سبق · LOYALTY")
                                .font(SabqFonts.app(size: 10, weight: .medium))
                                .tracking(2.5)
                                .foregroundStyle(.white.opacity(0.7))
                            Text(tier.nameAr)
                                .font(SabqFonts.app(size: 22, weight: .heavy))
                                .foregroundStyle(.white)
                            Text(tier.nameEn)
                                .font(SabqFonts.app(size: 11, weight: .medium))
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        Spacer(minLength: 0)
                        ZStack {
                            Circle()
                                .fill(Color.white.opacity(0.18))
                                .frame(width: 48, height: 48)
                            Image(systemName: "trophy.fill")
                                .font(SabqFonts.app(size: 22, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                    }

                    Spacer(minLength: 0)

                    // Center: lifetime points
                    VStack(spacing: 2) {
                        Text("Lifetime Points")
                            .font(SabqFonts.app(size: 10, weight: .medium))
                            .tracking(2)
                            .foregroundStyle(.white.opacity(0.7))
                        Text(lifetimePoints.formatted(.number.locale(Locale(identifier: "en_US"))))
                            .font(SabqFonts.app(size: 44, weight: .black))
                            .foregroundStyle(.white)
                            .minimumScaleFactor(0.6)
                            .lineLimit(1)
                        HStack(spacing: 4) {
                            Image(systemName: "sparkles")
                                .font(SabqFonts.app(size: 10))
                            Text("المستوى \(tier.level) من 5")
                                .font(SabqFonts.app(size: 10, weight: .medium))
                        }
                        .foregroundStyle(.white.opacity(0.65))
                    }
                    .frame(maxWidth: .infinity)

                    Spacer(minLength: 0)

                    // Bottom: holder + member ID
                    HStack(alignment: .bottom, spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("حامل البطاقة")
                                .font(SabqFonts.app(size: 10, weight: .medium))
                                .tracking(1.5)
                                .foregroundStyle(.white.opacity(0.6))
                            Text(userName)
                                .font(SabqFonts.app(size: 16, weight: .bold))
                                .foregroundStyle(.white)
                                .lineLimit(1)
                            if let memberSinceLabel {
                                Text(memberSinceLabel)
                                    .font(SabqFonts.app(size: 10, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.6))
                            }
                        }
                        Spacer(minLength: 0)
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("رقم العضوية")
                                .font(SabqFonts.app(size: 10, weight: .medium))
                                .tracking(1.5)
                                .foregroundStyle(.white.opacity(0.6))
                            Text(memberIdShort)
                                .font(SabqFonts.app(size: 12, weight: .semibold))
                                .tracking(2)
                                .foregroundStyle(.white)
                        }
                    }
                }
                .padding(20)
            }
        }
        .aspectRatio(1.586, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: tier.color.opacity(0.35), radius: 16, x: 0, y: 8)
        .environment(\.layoutDirection, .rightToLeft)
    }
}
