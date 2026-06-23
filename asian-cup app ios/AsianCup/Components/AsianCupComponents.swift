import SwiftUI

// مكوّنات UI أساسية لكأس آسيا — مُعاد تصميمها من WorldCupComponents لكن بألوان
// AcTheme. كلها تُستعمل عبر الشاشات.

struct AcRemoteImage: View {
    let url: String
    var contentMode: ContentMode = .fit

    var body: some View {
        AsyncImage(url: URL(string: url)) { phase in
            switch phase {
            case .success(let image):
                image.resizable().aspectRatio(contentMode: contentMode)
            case .failure:
                Color.clear
            default:
                Color.clear
            }
        }
    }
}

struct AcTeamLogo: View {
    let logo: String
    var size: CGFloat = 40

    var body: some View {
        AcRemoteImage(url: logo)
            .padding(size * 0.14)
            .frame(width: size, height: size)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(AcTheme.outline, lineWidth: 1.5))
    }
}

struct AcStatusPill: View {
    let fixture: AcFixture

    var body: some View {
        if fixture.status.live {
            HStack(spacing: 4) {
                Circle().fill(.white).frame(width: 5, height: 5)
                Text(elapsedText)
            }
            .font(AsianCupFonts.app(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(AcTheme.crimson))
        } else if fixture.status.finished {
            Text(fixture.status.label)
                .font(AsianCupFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(AcTheme.chipFill))
        } else {
            Text(AcFormat.kickoffTime(fixture.date))
                .font(AsianCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(AcTheme.gold)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(AcTheme.gold.opacity(0.16)))
        }
    }

    private var elapsedText: String {
        guard let e = fixture.status.elapsed else { return fixture.status.label }
        return "\(e)'"
    }
}

struct AcSectionHeader: View {
    let icon: String
    let title: String
    let subtitle: String
    var tint: Color = AcTheme.gold

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(AsianCupFonts.app(size: 19, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 38, height: 38)
                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(tint.opacity(0.14)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AsianCupFonts.headline(size: 20))
                    .foregroundStyle(AcTheme.onDark)
                Text(subtitle)
                    .font(AsianCupFonts.app(size: 12))
                    .foregroundStyle(AcTheme.onDarkDim)
            }
            Spacer(minLength: 0)
        }
    }
}

struct AcEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(AsianCupFonts.app(size: 30))
                .foregroundStyle(AcTheme.gold)
            Text(title)
                .font(AsianCupFonts.subhead(size: 15))
                .foregroundStyle(AcTheme.onDark)
            Text(subtitle)
                .font(AsianCupFonts.app(size: 12))
                .foregroundStyle(AcTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
    }
}

struct AcLoading: View {
    var body: some View {
        HStack { Spacer(); ProgressView().tint(AcTheme.gold); Spacer() }
            .padding(.vertical, 32)
    }
}

// بطاقة مباراة واحدة — تُستعمل في الجدول واليوم.
struct AcMatchCard: View {
    let fixture: AcFixture
    var highlightsSaudi: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text(fixture.round)
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkDim)
                Spacer()
                AcStatusPill(fixture: fixture)
            }

            HStack(spacing: 12) {
                teamColumn(fixture.home, isHome: true)
                scoreColumn
                teamColumn(fixture.away, isHome: false)
            }

            if !fixture.venue.name.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 10))
                    Text("\(fixture.venue.name) — \(fixture.venue.city)")
                        .font(AsianCupFonts.app(size: 11))
                }
                .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(AcTheme.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                        .stroke(highlightsSaudi ? AcTheme.gold.opacity(0.5) : AcTheme.outline, lineWidth: highlightsSaudi ? 1.5 : 1)
                )
        )
    }

    private func teamColumn(_ team: AcTeam, isHome: Bool) -> some View {
        VStack(spacing: 6) {
            AcTeamLogo(logo: team.logo, size: 44)
            Text(team.name)
                .font(AsianCupFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(AcTheme.onDark)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(height: 32)
        }
        .frame(maxWidth: .infinity)
    }

    private var scoreColumn: some View {
        VStack(spacing: 4) {
            if fixture.status.live || fixture.status.finished {
                HStack(spacing: 8) {
                    Text("\(fixture.goals.home ?? 0)")
                    Text("—").foregroundStyle(AcTheme.onDarkFaint)
                    Text("\(fixture.goals.away ?? 0)")
                }
                .font(AsianCupFonts.app(size: 24, weight: .bold))
                .foregroundStyle(AcTheme.onDark)
            } else {
                Text("vs")
                    .font(AsianCupFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkFaint)
                    .padding(.vertical, 4)
            }
        }
        .frame(width: 72)
    }
}

// صفّ ترتيب واحد داخل المجموعة.
struct AcStandingRowView: View {
    let row: AcStandingRow
    var highlightsSaudi: Bool = false

    var body: some View {
        HStack(spacing: 10) {
            Text("\(row.rank)")
                .font(AsianCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(row.rank <= 2 ? AcTheme.gold : AcTheme.onDarkDim)
                .frame(width: 20)

            AcTeamLogo(logo: row.team.logo, size: 26)

            Text(row.team.name)
                .font(AsianCupFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(highlightsSaudi ? AcTheme.gold : AcTheme.onDark)
                .lineLimit(1)

            Spacer()

            stat("\(row.win)-\(row.draw)-\(row.lose)", dim: true)
            stat("\(row.goalsFor):\(row.goalsAgainst)", dim: true)
            Text("\(row.points)")
                .font(AsianCupFonts.app(size: 14, weight: .bold))
                .foregroundStyle(AcTheme.onDark)
                .frame(width: 28)
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(highlightsSaudi ? AcTheme.gold.opacity(0.10) : Color.clear)
        )
    }

    private func stat(_ s: String, dim: Bool) -> some View {
        Text(s)
            .font(AsianCupFonts.app(size: 12))
            .foregroundStyle(dim ? AcTheme.onDarkDim : AcTheme.onDark)
            .frame(width: 52)
    }
}
