import SwiftUI

/// صفحة النادي في مركز روشن داخل تطبيق سبق.
///
/// تستهلك نفس عقد الويب `/api/sports/team/:id?with=stats` وتعرض الملف
/// المتكامل في تمرير واحد: الهوية، المركز، المدرب، الملعب، أرقام الموسم،
/// المباريات، هدافو الفريق، والقائمة.
struct RoshnTeamView: View {
    let teamId: Int
    var previewName: String = "النادي"
    var previewLogo: String = ""

    @State private var profile: RsTeamProfile?
    @State private var loading = true
    @State private var loadError: String?
    @State private var selectedFixture: RsFixture?
    @State private var showMatchCenter = false

    private let positionOrder = ["Goalkeeper", "Defender", "Midfielder", "Attacker"]

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                hero

                if loading, profile == nil {
                    loadingState
                } else if let loadError, profile == nil {
                    errorState(loadError)
                } else if let profile {
                    quickFacts(profile)
                    if let coach = profile.coach { coachCard(coach) }
                    if let venue = profile.team.venue { venueCard(venue) }
                    if let stats = profile.stats { statsSection(stats) }
                    matchesSection(profile.fixtures)
                    if !profile.topScorers.isEmpty { scorersSection(profile.topScorers) }
                    squadSection(profile.squad)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .padding(.bottom, 26)
        }
        .background(RoshnTheme.canvas)
        .environment(\.layoutDirection, .rightToLeft)
        .environment(\.locale, RsFormat.latinLocale)
        .navigationTitle(profile?.team.name ?? previewName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let url = URL(string: "https://sabq.org/sports/team/\(teamId)") {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: url) {
                        Image(systemName: "square.and.arrow.up")
                            .foregroundStyle(RoshnTheme.sky)
                    }
                }
            }
        }
        .task { await load() }
        .refreshable { await load(force: true) }
        .sheet(isPresented: $showMatchCenter) {
            if let fixture = selectedFixture {
                RoshnMatchCenter(fixtureId: fixture.id)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
        }
    }

    // MARK: الهوية

    private var hero: some View {
        ZStack {
            RoshnTheme.heroGradient
            Circle()
                .stroke(RoshnTheme.sky.opacity(0.12), lineWidth: 1)
                .frame(width: 170, height: 170)
                .offset(x: -135, y: 45)

            HStack(spacing: 15) {
                WCRemoteImage(url: profile?.team.logo ?? previewLogo)
                    .padding(9)
                    .frame(width: 84, height: 84)
                    .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(.white))
                    .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(RoshnTheme.heroStroke, lineWidth: 1))
                    .shadow(color: RoshnTheme.sky.opacity(0.12), radius: 10, y: 5)

                VStack(alignment: .leading, spacing: 7) {
                    Text(profile?.team.name ?? previewName)
                        .font(SabqFonts.app(size: 24, weight: .bold))
                        .foregroundStyle(RoshnTheme.heroOn)
                        .lineLimit(2)
                    if let competition = profile?.competitionName, !competition.isEmpty {
                        Label(competition, systemImage: "trophy.fill")
                            .font(SabqFonts.app(size: 11, weight: .medium))
                            .foregroundStyle(RoshnTheme.heroOnSoft)
                    } else {
                        Text("دوري روشن السعودي")
                            .font(SabqFonts.app(size: 11))
                            .foregroundStyle(RoshnTheme.heroOnSoft)
                    }
                    if let standing = profile?.standing {
                        Text("المركز \(RsFormat.latin(standing.rank)) · \(RsFormat.latin(standing.points)) نقطة")
                            .font(SabqFonts.app(size: 12.5, weight: .semibold))
                            .foregroundStyle(RoshnTheme.sky)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(Capsule().fill(.white.opacity(0.75)))
                            .overlay(Capsule().stroke(RoshnTheme.heroStroke, lineWidth: 1))
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(18)
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(RoshnTheme.heroStroke, lineWidth: 1))
        .shadow(color: RoshnTheme.sky.opacity(0.10), radius: 14, y: 7)
    }

    // MARK: حقائق سريعة

    private func quickFacts(_ profile: RsTeamProfile) -> some View {
        let facts: [(String, String, String)] = [
            profile.standing.map { (RsFormat.latin($0.rank), "المركز", "list.number") },
            profile.standing.map { (RsFormat.latin($0.points), "نقطة", "star.fill") },
            profile.team.founded.map { (RsFormat.latin($0), "التأسيس", "calendar") },
            profile.squad.isEmpty ? nil : (RsFormat.latin(profile.squad.count), "لاعبًا", "person.3.fill"),
        ].compactMap { $0 }

        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 8)], spacing: 8) {
            ForEach(Array(facts.enumerated()), id: \.offset) { _, fact in
                VStack(spacing: 5) {
                    Image(systemName: fact.2)
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(RoshnTheme.sky)
                    Text(fact.0)
                        .font(SabqFonts.app(size: 17, weight: .bold))
                        .foregroundStyle(RoshnTheme.ink)
                        .monospacedDigit()
                    Text(fact.1)
                        .font(SabqFonts.app(size: 9.5))
                        .foregroundStyle(RoshnTheme.inkSoft)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .background(cardBackground)
            }
        }
    }

    // MARK: المدرب والملعب

    private func coachCard(_ coach: RsCoach) -> some View {
        sectionCard(title: "المدرب", icon: "person.crop.square.fill") {
            HStack(spacing: 12) {
                WCRemoteImage(url: coach.photo)
                    .frame(width: 54, height: 54)
                    .background(Circle().fill(RoshnTheme.skySoft))
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(coach.name)
                        .font(SabqFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(RoshnTheme.ink)
                    let details = [coach.nationality, coach.age.map { "\(RsFormat.latin($0)) سنة" }]
                        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                    if !details.isEmpty {
                        Text(details)
                            .font(SabqFonts.app(size: 11))
                            .foregroundStyle(RoshnTheme.inkSoft)
                    }
                }
                Spacer()
            }
        }
    }

    private func venueCard(_ venue: RsTeamVenue) -> some View {
        sectionCard(title: "ملعب النادي", icon: "sportscourt.fill") {
            HStack(spacing: 11) {
                Image(systemName: "mappin.and.ellipse")
                    .font(SabqFonts.app(size: 20, weight: .medium))
                    .foregroundStyle(RoshnTheme.pitch)
                    .frame(width: 46, height: 46)
                    .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(RoshnTheme.pitchSoft))
                VStack(alignment: .leading, spacing: 3) {
                    Text(venue.name.isEmpty ? "يُعلن لاحقًا" : venue.name)
                        .font(SabqFonts.app(size: 14, weight: .semibold))
                        .foregroundStyle(RoshnTheme.ink)
                    HStack(spacing: 8) {
                        if !venue.city.isEmpty { Text(venue.city) }
                        if let capacity = venue.capacity { Text("\(RsFormat.latin(capacity)) متفرج") }
                    }
                    .font(SabqFonts.app(size: 10.5))
                    .foregroundStyle(RoshnTheme.inkSoft)
                }
                Spacer()
            }
        }
    }

    // MARK: أرقام الموسم

    private func statsSection(_ stats: RsTeamStats) -> some View {
        let tiles: [(String, String)] = [
            (RsFormat.latin(stats.fixtures.played.total), "مباراة"),
            (RsFormat.latin(stats.fixtures.wins.total), "فوز"),
            (RsFormat.latin(stats.fixtures.draws.total), "تعادل"),
            (RsFormat.latin(stats.fixtures.loses.total), "خسارة"),
            (RsFormat.latin(stats.goals.for.total), "له"),
            (RsFormat.latin(stats.goals.against.total), "عليه"),
            (RsFormat.latin(stats.summary.cleanSheets.total), "شباك نظيفة"),
            ("\(RsFormat.latin(stats.summary.cards.yellowTotal))/\(RsFormat.latin(stats.summary.cards.redTotal))", "بطاقات"),
        ]
        return sectionCard(title: "أرقام الفريق في الموسم", icon: "chart.bar.fill") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 82), spacing: 8)], spacing: 8) {
                ForEach(Array(tiles.enumerated()), id: \.offset) { _, tile in
                    VStack(spacing: 4) {
                        Text(tile.0)
                            .font(SabqFonts.app(size: 18, weight: .bold))
                            .foregroundStyle(RoshnTheme.ink)
                            .monospacedDigit()
                        Text(tile.1)
                            .font(SabqFonts.app(size: 9.5))
                            .foregroundStyle(RoshnTheme.inkSoft)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(RoshnTheme.skySoft.opacity(0.55)))
                }
            }
        }
    }

    // MARK: المباريات

    private func matchesSection(_ fixtures: [RsFixture]) -> some View {
        let live = fixtures.filter { $0.status.live }
        let upcoming = Array(fixtures.filter { !$0.started }.prefix(5))
        let results = Array(fixtures.filter { $0.status.finished }.suffix(5).reversed())
        return sectionCard(title: "مباريات النادي", icon: "calendar") {
            VStack(spacing: 12) {
                matchGroup("مباشر الآن", live)
                matchGroup("القادمة", upcoming)
                matchGroup("النتائج", results)
                if fixtures.isEmpty {
                    Text("لا توجد مباريات معلنة بعد")
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(RoshnTheme.inkSoft)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                }
            }
        }
    }

    @ViewBuilder
    private func matchGroup(_ title: String, _ fixtures: [RsFixture]) -> some View {
        if !fixtures.isEmpty {
            VStack(alignment: .leading, spacing: 7) {
                Text("\(title) · \(RsFormat.latin(fixtures.count))")
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(title == "مباشر الآن" ? RoshnTheme.liveRed : RoshnTheme.inkSoft)
                ForEach(fixtures) { fixture in
                    RoshnMatchRow(fixture: fixture) {
                        selectedFixture = fixture
                        showMatchCenter = true
                    }
                }
            }
        }
    }

    // MARK: الهدافون والقائمة

    private func scorersSection(_ scorers: [RsTeamScorer]) -> some View {
        sectionCard(title: "هدّافو الفريق", icon: "soccerball") {
            VStack(spacing: 7) {
                ForEach(scorers) { scorer in
                    HStack(spacing: 10) {
                        Text(RsFormat.latin(scorer.rank))
                            .font(SabqFonts.app(size: 11, weight: .bold))
                            .foregroundStyle(scorer.rank <= 3 ? RoshnTheme.gold : RoshnTheme.inkSoft)
                            .frame(width: 20)
                        WCRemoteImage(url: scorer.photo)
                            .frame(width: 38, height: 38)
                            .background(Circle().fill(RoshnTheme.skySoft))
                            .clipShape(Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(scorer.name)
                                .font(SabqFonts.app(size: 13, weight: .semibold))
                                .foregroundStyle(RoshnTheme.ink)
                            Text("\(RsFormat.latin(scorer.matches)) مباراة · \(RsFormat.latin(scorer.assists)) صناعة")
                                .font(SabqFonts.app(size: 9.5))
                                .foregroundStyle(RoshnTheme.inkSoft)
                        }
                        Spacer()
                        Text(RsFormat.latin(scorer.goals))
                            .font(SabqFonts.app(size: 18, weight: .bold))
                            .foregroundStyle(RoshnTheme.pitch)
                            .monospacedDigit()
                    }
                    .padding(10)
                    .background(tileBackground)
                }
            }
        }
    }

    private func squadSection(_ squad: [RsSquadPlayer]) -> some View {
        let groups = Dictionary(grouping: squad) { $0.positionEn }
        let keys = groups.keys.sorted {
            (positionOrder.firstIndex(of: $0) ?? 9) < (positionOrder.firstIndex(of: $1) ?? 9)
        }
        return sectionCard(title: "قائمة الفريق", icon: "person.3.fill") {
            VStack(alignment: .leading, spacing: 14) {
                if squad.isEmpty {
                    Text("القائمة الرسمية لم تُعلن بعد")
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(RoshnTheme.inkSoft)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                ForEach(keys, id: \.self) { key in
                    VStack(alignment: .leading, spacing: 7) {
                        Text(groups[key]?.first?.position ?? key)
                            .font(SabqFonts.app(size: 12, weight: .bold))
                            .foregroundStyle(RoshnTheme.sky)
                        ForEach(groups[key] ?? []) { player in
                            HStack(spacing: 10) {
                                WCRemoteImage(url: player.photo)
                                    .frame(width: 38, height: 38)
                                    .background(Circle().fill(RoshnTheme.skySoft))
                                    .clipShape(Circle())
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(player.name)
                                        .font(SabqFonts.app(size: 13, weight: .semibold))
                                        .foregroundStyle(RoshnTheme.ink)
                                    if let age = player.age {
                                        Text("\(RsFormat.latin(age)) سنة")
                                            .font(SabqFonts.app(size: 9.5))
                                            .foregroundStyle(RoshnTheme.inkSoft)
                                    }
                                }
                                Spacer()
                                Text(player.number.map(RsFormat.latin) ?? "—")
                                    .font(SabqFonts.app(size: 15, weight: .bold))
                                    .foregroundStyle(RoshnTheme.inkSoft)
                                    .monospacedDigit()
                            }
                            .padding(10)
                            .background(tileBackground)
                        }
                    }
                }
            }
        }
    }

    // MARK: أسطح وحالات

    private func sectionCard<Content: View>(
        title: String,
        icon: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 7) {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(RoshnTheme.sky)
                Text(title)
                    .font(SabqFonts.app(size: 16, weight: .bold))
                    .foregroundStyle(RoshnTheme.ink)
                Spacer()
            }
            content()
        }
        .padding(14)
        .background(cardBackground)
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(RoshnTheme.card)
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
    }

    private var tileBackground: some View {
        RoundedRectangle(cornerRadius: 13, style: .continuous)
            .fill(RoshnTheme.canvas)
            .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(RoshnTheme.line.opacity(0.8), lineWidth: 1))
    }

    private var loadingState: some View {
        VStack(spacing: 10) {
            ForEach(0..<5, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 17, style: .continuous)
                    .fill(RoshnTheme.card)
                    .frame(height: 82)
                    .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
            }
        }
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(SabqFonts.app(size: 30, weight: .light))
                .foregroundStyle(RoshnTheme.gold)
            Text("تعذّر تحميل صفحة النادي")
                .font(SabqFonts.app(size: 16, weight: .bold))
                .foregroundStyle(RoshnTheme.ink)
            Text(message)
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(RoshnTheme.inkSoft)
                .multilineTextAlignment(.center)
            Button {
                Task { await load(force: true) }
            } label: {
                Label("إعادة المحاولة", systemImage: "arrow.clockwise")
                    .font(SabqFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18).padding(.vertical, 10)
                    .background(Capsule().fill(RoshnTheme.sky))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 34)
    }

    @MainActor
    private func load(force: Bool = false) async {
        if loading, profile != nil { return }
        loading = true
        defer { loading = false }
        do {
            profile = try await APIClient.shared.fetchRoshnTeamProfile(teamId: teamId, ignoreCache: force)
            loadError = nil
        } catch {
            loadError = (error as? APIError)?.errorDescription ?? "تحقق من الاتصال ثم أعد المحاولة"
        }
    }
}
