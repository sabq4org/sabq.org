import SwiftUI

@Observable
@MainActor
final class AsianCupHomeStore {
    static let shared = AsianCupHomeStore()
    private init() {}

    private(set) var overview: AcOverview?
    private(set) var fixtures: [AcFixture] = []
    private var lastFetch: Date?
    private var fetching = false

    func loadIfNeeded() async {
        if fetching { return }
        if overview != nil, let last = lastFetch, Date().timeIntervalSince(last) < 30 { return }
        fetching = true
        defer { fetching = false }
        async let ov = try? APIClient.shared.fetchAsianCupOverview()
        async let fx = try? APIClient.shared.fetchAsianCupFixtures()
        overview = await ov
        fixtures = await fx ?? []
        lastFetch = Date()
    }

    func refreshLive() async {
        if fetching { return }
        fetching = true
        defer { fetching = false }
        async let ov = try? APIClient.shared.fetchAsianCupOverview(ignoreCache: true)
        async let fx = try? APIClient.shared.fetchAsianCupFixtures(ignoreCache: true)
        overview = await ov
        fixtures = await fx ?? []
        lastFetch = Date()
    }

    var featured: AcFixture? {
        if let live = fixtures.first(where: { $0.status.live }) { return live }
        return overview?.nextMatch ?? overview?.saudi.fixtures.first
    }

    var anyLive: Bool { fixtures.contains { $0.status.live } }
}

struct AsianCupHomeStrip: View {
    private let store = AsianCupHomeStore.shared

    var body: some View {
        Group {
            if store.overview?.blockHidden == true {
                EmptyView()
            } else if let ov = store.overview {
                NavigationLink(value: AsianCupRoute()) {
                    card(overview: ov)
                }
                .buttonStyle(.plain)
            }
        }
        .task { await store.loadIfNeeded() }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 12_000_000_000)
                if Task.isCancelled { return }
                if store.anyLive { await store.refreshLive() }
            }
        }
    }

    private func card(overview ov: AcOverview) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "trophy.fill")
                    .foregroundStyle(AcTheme.gold)
                Text("كأس آسيا 2027")
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer()
                Text("المزيد")
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.7))
                Image(systemName: "chevron.left")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
            }

            if let champ = ov.champion {
                HStack(spacing: 10) {
                    AcTeamLogo(team: champ.team, size: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("بطل البطولة").font(SabqFonts.app(size: 10)).foregroundStyle(.white.opacity(0.7))
                        Text(champ.team.name).font(SabqFonts.app(size: 16, weight: .bold)).foregroundStyle(.white)
                    }
                    Spacer()
                }
            } else if let fx = store.featured {
                matchRow(fx)
            } else if let starts = ov.startsAt, let ts = SabqFormatters.parseISO8601(starts)?.timeIntervalSince1970 {
                HStack {
                    Text("الانطلاقة").font(SabqFonts.app(size: 12)).foregroundStyle(.white.opacity(0.75))
                    Spacer()
                    Text(AcFormat.countdown(to: Int(ts)))
                        .font(SabqFonts.app(size: 18, weight: .bold).monospacedDigit())
                        .foregroundStyle(AcTheme.gold)
                        .environment(\.layoutDirection, .leftToRight)
                }
            } else {
                Text(ov.host)
                    .font(SabqFonts.app(size: 13))
                    .foregroundStyle(.white.opacity(0.85))
            }
        }
        .padding(16)
        .background(
            LinearGradient(colors: [AcTheme.heroTop, AcTheme.heroBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func matchRow(_ fx: AcFixture) -> some View {
        HStack(spacing: 10) {
            AcTeamLogo(team: fx.home, size: 32)
            VStack(spacing: 2) {
                if fx.started {
                    Text("\(fx.goals.home ?? 0) – \(fx.goals.away ?? 0)")
                        .font(SabqFonts.app(size: 20, weight: .bold).monospacedDigit())
                        .foregroundStyle(.white)
                        .environment(\.layoutDirection, .leftToRight)
                } else {
                    Text(AcFormat.time(fx))
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(AcTheme.gold)
                }
                AcStatusPill(fixture: fx, onDark: true)
            }
            .frame(maxWidth: .infinity)
            AcTeamLogo(team: fx.away, size: 32)
        }
    }
}
