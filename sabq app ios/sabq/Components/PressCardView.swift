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
    // white card, Sabq sky-blue accent stripe, deep navy text. The card is
    // always rendered in light appearance (see `.environment(\.colorScheme,
    // .light)` below) so the preview matches the printed pass in both
    // modes, while the text uses the contrast-safe Sabq roles.
    private var accent: Color { SabqTheme.brandSky }
    private var inkPrimary: Color { SabqTheme.textPrimary }
    private var inkSecondary: Color { SabqTheme.textSecondary }
    private var inkMuted: Color { SabqTheme.textTertiary }
    private var cardBackground: Color { SabqTheme.surface }

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
                        .frame(height: SabqLayout.space4)
                    Spacer()
                }

                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .top, spacing: SabqLayout.space8) {
                        VStack(alignment: .leading, spacing: SabqLayout.space4) {
                            Text("سبق · بطاقة صحفية")
                                .sabqText(SabqType.meta)
                                .foregroundStyle(inkMuted)
                            Text(roleAr)
                                .sabqText(SabqType.sectionHeading)
                                .foregroundStyle(SabqTheme.primary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "checkmark.seal.fill")
                            .font(SabqFonts.app(size: 22, weight: .semibold))
                            .foregroundStyle(SabqTheme.primary)
                            .accessibilityHidden(true)
                    }

                    Spacer(minLength: 0)

                    HStack(spacing: SabqLayout.space12) {
                        avatarView
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))

                        VStack(alignment: .leading, spacing: SabqLayout.space4) {
                            Text("الاسم")
                                .sabqText(SabqType.tag)
                                .foregroundStyle(inkMuted)
                            Text(userName)
                                .sabqText(SabqType.rowTitle)
                                .foregroundStyle(inkPrimary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                            // jobTitle is also shown as the prominent
                            // role label at the top when the server
                            // returns it as roleLabel (see
                            // pressCardRoleLabel() — jobTitle wins
                            // over the translated system role). Hide
                            // the duplicate here when they match.
                            if let jobTitle, !jobTitle.isEmpty, jobTitle != roleAr {
                                Text(jobTitle)
                                    .sabqText(SabqType.meta)
                                    .foregroundStyle(inkSecondary)
                                    .lineLimit(1)
                            }
                            if let department, !department.isEmpty {
                                Text(department)
                                    .sabqText(SabqType.meta)
                                    .foregroundStyle(inkMuted)
                                    .lineLimit(1)
                            }
                        }
                    }

                    Spacer(minLength: 0)

                    HStack(alignment: .bottom, spacing: SabqLayout.space12) {
                        if let pressIdNumber, !pressIdNumber.isEmpty {
                            VStack(alignment: .leading, spacing: 0) {
                                Text("رقم البطاقة")
                                    .sabqText(SabqType.tag)
                                    .foregroundStyle(inkMuted)
                                Text(pressIdNumber)
                                    .sabqText(SabqType.metaEmphasis)
                                    .tracking(1)
                                    .monospacedDigit()
                                    .foregroundStyle(inkPrimary)
                                    .environment(\.layoutDirection, .leftToRight)
                            }
                        }
                        Spacer(minLength: 0)
                        if let validUntilLabel {
                            Text(validUntilLabel)
                                .sabqText(SabqType.meta)
                                .foregroundStyle(inkSecondary)
                        }
                    }
                }
                .padding(SabqLayout.space16)
                .padding(.top, SabqLayout.space4)
            }
        }
        .aspectRatio(1.586, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .stroke(SabqTheme.outline, lineWidth: 1)
        )
        .environment(\.layoutDirection, .rightToLeft)
        .environment(\.colorScheme, .light)
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
            SabqTheme.surfaceMuted
            Image(systemName: "person.fill")
                .font(SabqFonts.app(size: 24, weight: .semibold))
                .foregroundStyle(SabqTheme.textTertiary)
        }
    }
}
