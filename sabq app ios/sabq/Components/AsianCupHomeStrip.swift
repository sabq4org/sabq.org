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
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "trophy.fill")
                    .foregroundStyle(AcTheme.gold)
                    .accessibilityHidden(true)
                Text("كأس آسيا 2027")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(.white)
                Spacer()
                Text("المزيد")
                    .font(SabqType.tag.font)
                    .foregroundStyle(.white)
                Image(systemName: "chevron.left")
                    .font(SabqType.tag.font)
                    .foregroundStyle(.white)
                    .accessibilityHidden(true)
            }

            if let champ = ov.champion {
                HStack(spacing: SabqLayout.space12) {
                    AcTeamLogo(team: champ.team, size: 40, ring: .clear)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("بطل البطولة").font(SabqFonts.app(size: 12)).foregroundStyle(.white.opacity(0.9))
                        Text(champ.team.name).sabqText(SabqType.rowTitle).foregroundStyle(.white)
                    }
                    Spacer()
                }
            } else if let fx = store.featured {
                matchRow(fx)
            } else if let starts = ov.startsAt, let ts = SabqFormatters.parseISO8601(starts)?.timeIntervalSince1970 {
                HStack {
                    Text("الانطلاقة").font(SabqType.meta.font).foregroundStyle(.white.opacity(0.9))
                    Spacer()
                    Text(AcFormat.countdown(to: Int(ts)))
                        .font(SabqType.sectionHeading.font.monospacedDigit())
                        .foregroundStyle(AcTheme.gold)
                        .environment(\.layoutDirection, .leftToRight)
                }
            } else {
                Text(ov.host)
                    .font(SabqType.meta.font)
                    .foregroundStyle(.white.opacity(0.9))
            }
        }
        .padding(SabqLayout.space16)
        .background(AcStyle.accentFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private func matchRow(_ fx: AcFixture) -> some View {
        HStack(spacing: SabqLayout.space12) {
            AcTeamLogo(team: fx.home, size: 36, ring: .clear)
            VStack(spacing: SabqLayout.space4) {
                if fx.started {
                    // الضيف أولًا داخل LTR ليقع هدف المضيف يمينًا تحت شعاره.
                    Text("\(fx.goals.away ?? 0) – \(fx.goals.home ?? 0)")
                        .font(SabqType.sectionHeading.font.monospacedDigit())
                        .foregroundStyle(.white)
                        .environment(\.layoutDirection, .leftToRight)
                } else {
                    Text(AcFormat.time(fx))
                        .font(SabqType.sectionHeading.font)
                        .foregroundStyle(AcTheme.gold)
                }
                AcStatusPill(fixture: fx, onDark: true)
            }
            .frame(maxWidth: .infinity)
            AcTeamLogo(team: fx.away, size: 36, ring: .clear)
        }
    }
}
