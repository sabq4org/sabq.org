import SwiftUI

// Visual press / press-equivalent membership card. Used as the hero
// preview inside PressCardActivationView so the user sees what they're
// about to drop into Apple Wallet. Mirrors the layout of the real
// .pkpass template — same primary fields (name + role), same
// secondary line (job title / department), same role-color accent —
// so the preview reads as "this is your actual card", not a mockup.
struct PressCardView: View {
    let userName: String
    let roleAr: String
    let jobTitle: String?
    let department: String?
    let pressIdNumber: String?
    let validUntil: Date?
    let profileImageUrl: String?

    private var accent: Color {
        // The .pkpass template uses sabq deep red as the strip color
        // for editorial roles. Keep the visual preview consistent.
        Color(red: 0.60, green: 0.10, blue: 0.16)
    }

    private var gradient: LinearGradient {
        LinearGradient(
            colors: [
                Color(red: 0.07, green: 0.10, blue: 0.16),
                Color(red: 0.13, green: 0.16, blue: 0.24),
                Color(red: 0.16, green: 0.21, blue: 0.31),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var validUntilLabel: String? {
        guard let validUntil else { return nil }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "ar_SA")
        fmt.dateFormat = "yyyy/MM"
        return "صالحة حتى " + fmt.string(from: validUntil)
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                gradient

                // Soft accent stripe top + radial highlight
                VStack(spacing: 0) {
                    Rectangle()
                        .fill(accent)
                        .frame(height: 4)
                    Spacer()
                }

                RadialGradient(
                    colors: [accent.opacity(0.18), .clear],
                    center: .topTrailing,
                    startRadius: 5,
                    endRadius: geo.size.width * 0.7
                )

                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .top, spacing: 10) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("سبق · بطاقة صحفية")
                                .font(.system(size: 10, weight: .medium, design: .rounded))
                                .tracking(2)
                                .foregroundStyle(.white.opacity(0.7))
                            Text(roleAr)
                                .font(.system(size: 18, weight: .heavy, design: .rounded))
                                .foregroundStyle(accent.opacity(0.95))
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "checkmark.seal.fill")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(accent)
                    }

                    Spacer(minLength: 0)

                    // Identity block
                    HStack(spacing: 14) {
                        avatarView
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(Color.white.opacity(0.25), lineWidth: 1)
                            )

                        VStack(alignment: .leading, spacing: 3) {
                            Text("الاسم")
                                .font(.system(size: 9, weight: .medium))
                                .tracking(1.5)
                                .foregroundStyle(.white.opacity(0.6))
                            Text(userName)
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(.white)
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                            if let jobTitle, !jobTitle.isEmpty {
                                Text(jobTitle)
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.8))
                                    .lineLimit(1)
                            }
                            if let department, !department.isEmpty {
                                Text(department)
                                    .font(.system(size: 10, weight: .regular))
                                    .foregroundStyle(.white.opacity(0.6))
                                    .lineLimit(1)
                            }
                        }
                    }

                    Spacer(minLength: 0)

                    // Bottom row: ID + validity
                    HStack(alignment: .bottom, spacing: 12) {
                        if let pressIdNumber, !pressIdNumber.isEmpty {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("رقم البطاقة")
                                    .font(.system(size: 9, weight: .medium))
                                    .tracking(1.5)
                                    .foregroundStyle(.white.opacity(0.55))
                                Text(pressIdNumber)
                                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                    .tracking(2)
                                    .foregroundStyle(.white)
                            }
                        }
                        Spacer(minLength: 0)
                        if let validUntilLabel {
                            Text(validUntilLabel)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(.white.opacity(0.65))
                        }
                    }
                }
                .padding(16)
            }
        }
        .aspectRatio(1.586, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: accent.opacity(0.45), radius: 18, x: 0, y: 10)
        .environment(\.layoutDirection, .rightToLeft)
    }

    @ViewBuilder
    private var avatarView: some View {
        if let urlString = profileImageUrl, let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .failure, .empty:
                    fallbackAvatar
                @unknown default:
                    fallbackAvatar
                }
            }
        } else {
            fallbackAvatar
        }
    }

    private var fallbackAvatar: some View {
        ZStack {
            Color.white.opacity(0.12)
            Image(systemName: "person.fill")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(.white.opacity(0.7))
        }
    }
}
