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

    // Matches the actual .pkpass template after the 2026-05-19 redesign:
    // white card, Sabq sky-blue accent (rgb 28,164,240 — the web primary,
    // also the iOS AccentColor source), deep navy text. The preview is
    // the user's mental anchor for "what am I about to drop into Wallet",
    // so keeping these in lock-step matters more than visual variety.
    private var accent: Color {
        Color(red: 0.11, green: 0.64, blue: 0.94)
    }

    private var inkPrimary: Color {
        Color(red: 0.10, green: 0.13, blue: 0.21)
    }

    private var inkSecondary: Color {
        Color(red: 0.34, green: 0.39, blue: 0.50)
    }

    private var inkMuted: Color {
        Color(red: 0.55, green: 0.59, blue: 0.66)
    }

    private var cardBackground: Color {
        Color(red: 1.0, green: 1.0, blue: 1.0)
    }

    private var validUntilLabel: String? {
        guard let validUntil else { return nil }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.calendar = Calendar(identifier: .gregorian)
        fmt.dateFormat = "yyyy/MM/dd"
        return "صالحة حتى " + fmt.string(from: validUntil)
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                cardBackground

                // Thin top accent stripe — Sabq sky-blue ribbon across
                // the full card width. Cleaner than a hero band; reads
                // as a brand tab rather than a backdrop.
                VStack(spacing: 0) {
                    Rectangle()
                        .fill(accent)
                        .frame(height: 3)
                    Spacer()
                }

                // Very soft accent halo in the top-right corner so the
                // card has some depth on white without leaning into a
                // colored background.
                RadialGradient(
                    colors: [accent.opacity(0.10), .clear],
                    center: .topTrailing,
                    startRadius: 5,
                    endRadius: geo.size.width * 0.55
                )

                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .top, spacing: 10) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("سبق · بطاقة صحفية")
                                .font(.system(size: 10, weight: .medium, design: .rounded))
                                .tracking(2)
                                .foregroundStyle(inkMuted)
                            Text(roleAr)
                                .font(.system(size: 18, weight: .heavy, design: .rounded))
                                .foregroundStyle(accent)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "checkmark.seal.fill")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(accent)
                    }

                    Spacer(minLength: 0)

                    HStack(spacing: 14) {
                        avatarView
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(accent.opacity(0.30), lineWidth: 1)
                            )

                        VStack(alignment: .leading, spacing: 3) {
                            Text("الاسم")
                                .font(.system(size: 9, weight: .medium))
                                .tracking(1.5)
                                .foregroundStyle(inkMuted)
                            Text(userName)
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(inkPrimary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                            if let jobTitle, !jobTitle.isEmpty {
                                Text(jobTitle)
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(inkSecondary)
                                    .lineLimit(1)
                            }
                            if let department, !department.isEmpty {
                                Text(department)
                                    .font(.system(size: 10, weight: .regular))
                                    .foregroundStyle(inkMuted)
                                    .lineLimit(1)
                            }
                        }
                    }

                    Spacer(minLength: 0)

                    HStack(alignment: .bottom, spacing: 12) {
                        if let pressIdNumber, !pressIdNumber.isEmpty {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("رقم البطاقة")
                                    .font(.system(size: 9, weight: .medium))
                                    .tracking(1.5)
                                    .foregroundStyle(inkMuted)
                                Text(pressIdNumber)
                                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                    .tracking(2)
                                    .foregroundStyle(inkPrimary)
                            }
                        }
                        Spacer(minLength: 0)
                        if let validUntilLabel {
                            Text(validUntilLabel)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(inkSecondary)
                        }
                    }
                }
                .padding(16)
            }
        }
        .aspectRatio(1.586, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.black.opacity(0.06), lineWidth: 0.5)
        )
        .shadow(color: Color.black.opacity(0.08), radius: 14, x: 0, y: 6)
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
            accent.opacity(0.08)
            Image(systemName: "person.fill")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(accent.opacity(0.55))
        }
    }
}
