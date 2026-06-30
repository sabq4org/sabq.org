import SwiftUI

// مكوّنات UI أساسية ل«خليجي 27» — هوية أخضر خليجي عميق + ذهبي.

struct GcLatticePattern: View {
    var spacing: CGFloat = 26
    var body: some View {
        Canvas { ctx, size in
            var path = Path()
            var x: CGFloat = -size.height
            while x < size.width {
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x + size.height, y: size.height))
                x += spacing
            }
            ctx.stroke(path, with: .color(.white), lineWidth: 1)
        }
        .allowsHitTesting(false)
    }
}

struct GcAmbientBackground: View {
    @State private var drift = false
    var body: some View {
        ZStack {
            GcTheme.screenGradient
            Circle()
                .fill(GcTheme.emerald.opacity(0.14))
                .frame(width: 420, height: 420)
                .blur(radius: 120)
                .offset(x: drift ? 40 : -30, y: -280)
            Circle()
                .fill(GcTheme.gold.opacity(0.10))
                .frame(width: 300, height: 300)
                .blur(radius: 110)
                .offset(x: 140, y: 360)
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeInOut(duration: 9).repeatForever(autoreverses: true)) { drift = true }
        }
    }
}

struct GcEmblem: View {
    var height: CGFloat = 120
    @State private var pulse = false
    @State private var entered = false

    var body: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(colors: [GcTheme.gold.opacity(0.45), .clear], center: .center, startRadius: 4, endRadius: height * 0.75))
                .frame(width: height * 1.3, height: height * 1.3)
                .blur(radius: 28)
                .scaleEffect(pulse ? 1.1 : 0.88)

            Image(systemName: "trophy.fill")
                .font(.system(size: height * 0.42, weight: .bold))
                .foregroundStyle(GcTheme.goldTitleGradient)
                .symbolRenderingMode(.palette)
            .frame(height: height)
            .shadow(color: GcTheme.emeraldDeep.opacity(0.35), radius: 16, y: 8)
            .scaleEffect(entered ? 1 : 0.82)
        }
        .onAppear {
            withAnimation(.spring(response: 0.7, dampingFraction: 0.62)) { entered = true }
            withAnimation(.easeInOut(duration: 3.5).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}

struct GcHeroBadge: View {
    let icon: String
    let text: String
    var tint: Color = GcTheme.gold
    var onDark: Bool = true

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 11, weight: .semibold))
            Text(text).font(GulfCupFonts.app(size: 12, weight: .semibold))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(Capsule().fill(tint.opacity(onDark ? 0.16 : 0.12)))
        .overlay(Capsule().stroke(tint.opacity(0.32), lineWidth: 1))
    }
}

struct GcRemoteImage: View {
    let url: String
    var body: some View {
        AsyncImage(url: URL(string: url)) { phase in
            if case .success(let img) = phase { img.resizable().aspectRatio(contentMode: .fit) }
            else { Color.clear }
        }
    }
}

struct GcTeamLogo: View {
    let logo: String
    var size: CGFloat = 40
    var body: some View {
        GcRemoteImage(url: logo)
            .padding(size * 0.14)
            .frame(width: size, height: size)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(GcTheme.outline, lineWidth: 1.5))
    }
}

struct GcStatusPill: View {
    let fixture: GcFixture
    var body: some View {
        if fixture.status.live {
            HStack(spacing: 4) {
                Circle().fill(.white).frame(width: 5, height: 5)
                Text(fixture.status.elapsed.map { "\($0)'" } ?? fixture.status.label)
            }
            .font(GulfCupFonts.app(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(GcTheme.crimson))
        } else if fixture.status.finished {
            Text(fixture.status.label)
                .font(GulfCupFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(GcTheme.onDarkDim)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(GcTheme.chipFill))
        } else {
            Text(GcFormat.kickoffTime(fixture.date))
                .font(GulfCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(GcTheme.goldDeep)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(GcTheme.gold.opacity(0.16)))
        }
    }
}

struct GcSectionHeader: View {
    let icon: String
    let title: String
    var subtitle: String? = nil
    var count: Int? = nil
    var tint: Color = GcTheme.emerald

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(GulfCupFonts.app(size: 18, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 38, height: 38)
                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(tint.opacity(0.14)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(GulfCupFonts.headline(size: 20)).foregroundStyle(GcTheme.onDark)
                if let subtitle {
                    Text(subtitle).font(GulfCupFonts.app(size: 12)).foregroundStyle(GcTheme.onDarkDim)
                }
            }
            Spacer(minLength: 0)
            if let count {
                Text("\(count)")
                    .font(GulfCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(tint)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Capsule().fill(tint.opacity(0.14)))
            }
        }
    }
}

struct GcEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(GulfCupFonts.app(size: 30)).foregroundStyle(GcTheme.emerald)
            Text(title).font(GulfCupFonts.subhead(size: 15)).foregroundStyle(GcTheme.onDark)
            Text(subtitle).font(GulfCupFonts.app(size: 12)).foregroundStyle(GcTheme.onDarkDim).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 28)
    }
}

struct GcLoadingPanel: View {
    let title: String
    var body: some View {
        HStack(spacing: 10) {
            ProgressView().tint(GcTheme.emerald)
            Text(title).font(GulfCupFonts.app(size: 13)).foregroundStyle(GcTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 20)
    }
}

struct GcScreenScaffold<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        ZStack {
            GcAmbientBackground()
            ScrollView {
                content.padding(.horizontal, 16).padding(.bottom, 28)
            }
        }
    }
}

struct GcMatchCard: View {
    let fixture: GcFixture
    @State private var showDetail = false

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text(fixture.round).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.onDarkDim).lineLimit(1)
                Spacer()
                GcStatusPill(fixture: fixture)
            }
            HStack(spacing: 8) {
                teamSide(fixture.home, leading: true)
                scoreBox
                teamSide(fixture.away, leading: false)
            }
            if !fixture.venue.name.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "mappin.and.ellipse").font(.system(size: 10))
                    Text("\(fixture.venue.name) — \(fixture.venue.city)")
                        .font(GulfCupFonts.app(size: 11)).lineLimit(1)
                    Spacer()
                    Image(systemName: "chevron.left").font(.system(size: 10, weight: .semibold))
                }
                .foregroundStyle(GcTheme.onDarkFaint)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: GcTheme.cardRadius, style: .continuous).fill(GcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: GcTheme.cardRadius, style: .continuous).stroke(GcTheme.outline, lineWidth: 1))
        .onTapGesture { showDetail = true }
        .sheet(isPresented: $showDetail) { GcMatchDetailSheet(fixture: fixture) }
    }

    private func teamSide(_ team: GcTeam, leading: Bool) -> some View {
        HStack(spacing: 8) {
            if leading {
                GcTeamLogo(logo: team.logo, size: 30)
                Text(team.name).font(GulfCupFonts.app(size: 13, weight: .semibold)).foregroundStyle(GcTheme.onDark).lineLimit(1)
            } else {
                Text(team.name).font(GulfCupFonts.app(size: 13, weight: .semibold)).foregroundStyle(GcTheme.onDark).lineLimit(1)
                GcTeamLogo(logo: team.logo, size: 30)
            }
        }
        .frame(maxWidth: .infinity, alignment: leading ? .leading : .trailing)
    }

    private var scoreBox: some View {
        Group {
            if fixture.status.live || fixture.status.finished {
                Text("\(fixture.goals.away ?? 0) - \(fixture.goals.home ?? 0)")
                    .font(GulfCupFonts.app(size: 20, weight: .bold))
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text("VS").font(GulfCupFonts.app(size: 12, weight: .bold)).foregroundStyle(GcTheme.onDarkFaint)
            }
        }
        .frame(minWidth: 52)
    }
}

struct GcMatchDetailSheet: View {
    let fixture: GcFixture
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    GcMatchCard(fixture: fixture)
                    VStack(alignment: .leading, spacing: 8) {
                        labelRow("الجولة", fixture.round)
                        labelRow("الملعب", "\(fixture.venue.name) — \(fixture.venue.city)")
                        labelRow("التاريخ", GcFormat.kickoffDay(fixture.date))
                        labelRow("الوقت", GcFormat.kickoffTime(fixture.date))
                        if let no = fixture.matchNo {
                            labelRow("رقم المباراة", "#\(no)")
                        }
                    }
                    .padding(16)
                    .background(RoundedRectangle(cornerRadius: GcTheme.cardRadius).fill(GcTheme.cardFillStrong))
                    .overlay(RoundedRectangle(cornerRadius: GcTheme.cardRadius).stroke(GcTheme.outline, lineWidth: 1))
                }
                .padding(16)
            }
            .background(GcAmbientBackground())
            .navigationTitle("تفاصيل المباراة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("إغلاق") { dismiss() }.foregroundStyle(GcTheme.emerald)
                }
            }
        }
        .gulfCupRTL()
    }

    private func labelRow(_ k: String, _ v: String) -> some View {
        HStack {
            Text(k).font(GulfCupFonts.app(size: 12)).foregroundStyle(GcTheme.onDarkDim)
            Spacer()
            Text(v).font(GulfCupFonts.app(size: 13, weight: .semibold)).foregroundStyle(GcTheme.onDark)
        }
    }
}

struct GcGroupCard: View {
    let group: GcGroup
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(group.name).font(GulfCupFonts.app(size: 15, weight: .bold)).foregroundStyle(GcTheme.onDark)
                Spacer()
                Text("التأهل: 1–2").font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.emeraldSoft)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(GcTheme.emerald.opacity(0.08))

            ForEach(group.rows) { row in
                HStack(spacing: 8) {
                    Text("\(row.rank)").font(GulfCupFonts.app(size: 12, weight: .bold)).foregroundStyle(row.rank <= 2 ? GcTheme.emerald : GcTheme.onDarkDim).frame(width: 18)
                    GcTeamLogo(logo: row.team.logo, size: 24)
                    Text(row.team.name).font(GulfCupFonts.app(size: 13, weight: row.rank <= 2 ? .bold : .regular)).foregroundStyle(GcTheme.onDark).lineLimit(1)
                    Spacer()
                    Text("\(row.played)").frame(width: 24)
                    Text(row.goalsDiff >= 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)").frame(width: 32).foregroundStyle(row.goalsDiff >= 0 ? GcTheme.emerald : GcTheme.crimson)
                    Text("\(row.points)").font(GulfCupFonts.app(size: 14, weight: .bold)).foregroundStyle(GcTheme.goldDeep).frame(width: 28)
                }
                .font(GulfCupFonts.app(size: 12))
                .foregroundStyle(GcTheme.onDarkDim)
                .padding(.horizontal, 14).padding(.vertical, 10)
                if row.id != group.rows.last?.id {
                    Divider().padding(.leading, 52)
                }
            }
        }
        .background(RoundedRectangle(cornerRadius: GcTheme.cardRadius, style: .continuous).fill(GcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: GcTheme.cardRadius, style: .continuous).stroke(GcTheme.outline, lineWidth: 1))
    }
}

struct GcFooterSignature: View {
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "newspaper.fill").font(.system(size: 11))
            Text("منصة سبق · \(GulfCupConstants.tournamentName)")
                .font(GulfCupFonts.app(size: 11, weight: .semibold))
        }
        .foregroundStyle(GcTheme.onDarkFaint)
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }
}
