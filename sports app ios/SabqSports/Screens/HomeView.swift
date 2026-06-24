import SwiftUI

// الرئيسية — نظرة موحّدة سريعة: ترويسة الهوية + مباريات اليوم عبر كل البطولات
// السعودية (والخليجية/العربية) + المباشر الآن. مستقلّة عن البطولة المختارة.
struct HomeView: View {
    @State private var today: [SpFixture] = []
    @State private var live: [SpFixture] = []
    @State private var loading = true
    @State private var loadError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    hero

                    if let f = featured {
                        featuredCard(f).spReveal(delay: 0.04)
                            .padding(.horizontal, 16)
                    }

                    if !live.isEmpty {
                        liveSection.spReveal(delay: 0.08)
                    }

                    todaySection.spReveal(delay: 0.12)
                }
                .padding(.vertical, 16)
            }
            .background(SpAmbientBackground())
            .navigationTitle("")
            .toolbar(.hidden, for: .navigationBar)
        }
        .task { await loadAll() }
        .refreshable { await loadAll(force: true) }
    }

    // MARK: - الترويسة

    private var hero: some View {
        VStack(spacing: 12) {
            SpEmblem(size: 96)

            HStack(spacing: 8) {
                Text("سبق")
                    .foregroundStyle(SpTheme.onDark)
                Text("الرياضي")
                    .foregroundStyle(SpTheme.goldTitleGradient)
            }
            .font(SportsFonts.app(size: 32, weight: .heavy))

            Text("الرياضة السعودية أولًا — دوري روشن وكل البطولات")
                .font(SportsFonts.app(size: 13))
                .foregroundStyle(SpTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 16)
        .padding(.horizontal, 16)
    }

    // MARK: - بطاقة المباراة المميّزة (مباشر → أقرب قادمة اليوم → أول اليوم)

    private var featured: SpFixture? {
        if let l = live.first { return l }
        let distant = Date.distantFuture
        let upcomingToday = today
            .filter { !$0.started }
            .sorted { (SpDateMath.date(from: $0.date) ?? distant) < (SpDateMath.date(from: $1.date) ?? distant) }
        return upcomingToday.first ?? today.first
    }

    private func featuredCard(_ f: SpFixture) -> some View {
        VStack(spacing: 16) {
            HStack(spacing: 6) {
                Image(systemName: f.status.live ? "dot.radiowaves.left.and.right" : "star.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(f.status.live ? SpTheme.crimson : SpTheme.gold)
                Text(f.status.live ? "تجري الآن" : "مباراة مختارة")
                    .font(SportsFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(f.status.live ? SpTheme.crimson : SpTheme.gold)
                if let c = f.competition, !c.isEmpty {
                    Text("·").foregroundStyle(SpTheme.onDarkFaint)
                    Text(c).font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                }
                Spacer(minLength: 0)
                SpStatusPill(fixture: f)
            }

            HStack(alignment: .top, spacing: 8) {
                featuredTeam(f.home)
                VStack(spacing: 6) {
                    if f.started {
                        Text("\(f.goals.home ?? 0) - \(f.goals.away ?? 0)")
                            .font(SportsFonts.app(size: 40, weight: .heavy))
                            .foregroundStyle(SpTheme.onDark)
                            .monospacedDigit()
                            .environment(\.layoutDirection, .leftToRight)
                    } else {
                        Text(SpFormat.kickoffTime(f.date))
                            .font(SportsFonts.app(size: 30, weight: .heavy))
                            .foregroundStyle(SpTheme.gold)
                            .environment(\.layoutDirection, .leftToRight)
                        Text(SpFormat.kickoffDay(f.date))
                            .font(SportsFonts.app(size: 11))
                            .foregroundStyle(SpTheme.onDarkDim)
                    }
                }
                .frame(minWidth: 110)
                featuredTeam(f.away)
            }

            if !f.venue.name.isEmpty {
                HStack(spacing: 5) {
                    Image(systemName: "mappin.and.ellipse").font(.system(size: 10))
                    Text(f.venue.city.isEmpty ? f.venue.name : "\(f.venue.name) — \(f.venue.city)")
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .font(SportsFonts.app(size: 11))
                .foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.cardGradient)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .stroke(f.status.live ? SpTheme.crimson.opacity(0.5) : SpTheme.gold.opacity(0.30), lineWidth: 1)
        )
        .shadow(color: SpTheme.cardShadow, radius: 18, x: 0, y: 10)
    }

    private func featuredTeam(_ team: SpTeam) -> some View {
        VStack(spacing: 10) {
            SpTeamLogo(logo: team.logo, size: 60)
            Text(team.name)
                .font(SportsFonts.app(size: 15, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - المباشر الآن

    private var liveSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SpSectionHeader(icon: "dot.radiowaves.left.and.right", title: "المباشر الآن",
                            count: live.count, tint: SpTheme.crimson)
            VStack(spacing: 10) {
                ForEach(live) { f in SpMatchCard(fixture: f, showsCompetition: true) }
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - مباريات اليوم

    private var todaySection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SpSectionHeader(icon: "calendar", title: "مباريات اليوم",
                            count: today.isEmpty ? nil : today.count, tint: SpTheme.gold)

            if loading {
                SpLoading()
            } else if let loadError {
                SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
            } else if today.isEmpty {
                SpEmptyState(icon: "sportscourt", title: "لا مباريات اليوم",
                             subtitle: "تابع البطولات لأحدث المواعيد والنتائج")
            } else {
                VStack(spacing: 10) {
                    ForEach(today) { f in SpMatchCard(fixture: f, showsCompetition: true) }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - التحميل

    private func loadAll(force: Bool = false) async {
        if !force { loading = true }
        do {
            async let t = APIClient.shared.fetchToday(ignoreCache: force)
            async let l = APIClient.shared.fetchLive(ignoreCache: force)
            let (todayResp, liveResp) = try await (t, l)
            self.today = todayResp.today
            self.live = liveResp.live
            self.loadError = nil
        } catch {
            self.loadError = error.localizedDescription
        }
        self.loading = false
    }
}
