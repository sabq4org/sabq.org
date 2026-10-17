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
    /// معرّف غير اختياري + Binding حي — نفس علاج الورقة البيضاء في RoshnView.
    @State private var selectedFixtureId = 0
    @State private var showMatchCenter = false

    private let positionOrder = ["Goalkeeper", "Defender", "Midfielder", "Attacker"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
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
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, SabqLayout.space32)
        }
        .background(SabqTheme.background)
        .environment(\.layoutDirection, .rightToLeft)
        .environment(\.locale, RsFormat.latinLocale)
        .navigationTitle(profile?.team.name ?? previewName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let url = URL(string: "https://sabq.org/sports/team/\(teamId)") {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: url) {
                        Image(systemName: "square.and.arrow.up")
                            .foregroundStyle(SabqTheme.textPrimary)
                    }
                }
            }
        }
        .task { await load() }
        .refreshable { await load(force: true) }
        .sheet(isPresented: $showMatchCenter) {
            RoshnMatchCenterSheet(fixtureId: $selectedFixtureId)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
    }

    // MARK: الهوية — شريط زمردي مسطّح

    private var hero: some View {
        HStack(spacing: SabqLayout.space16) {
            WCRemoteImage(url: profile?.team.logo ?? previewLogo)
                .padding(SabqLayout.space8)
                .frame(width: 80, height: 80)
                .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(.white))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                Text(profile?.team.name ?? previewName)
                    .sabqText(SabqType.leadTitle)
                    .foregroundStyle(RoshnTheme.heroOn)
                    .lineLimit(2)
                if let competition = profile?.competitionName, !competition.isEmpty {
                    Label(competition, systemImage: "trophy.fill")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(RoshnTheme.heroOn)
                } else {
                    Text("دوري روشن السعودي")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(RoshnTheme.heroOn)
                }
                if let standing = profile?.standing {
                    Text("المركز \(RsFormat.latin(standing.rank)) · \(RsFormat.latin(standing.points)) نقطة")
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(.white)
                        .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space4)
                        .overlay(Capsule().stroke(.white.opacity(0.6), lineWidth: 1))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoshnTheme.accentFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    // MARK: حقائق سريعة

    private func quickFacts(_ profile: RsTeamProfile) -> some View {
        let facts: [(String, String, String)] = [
            profile.standing.map { (RsFormat.latin($0.rank), "المركز", "list.number") },
            profile.standing.map { (RsFormat.latin($0.points), "نقطة", "star.fill") },
            profile.team.founded.map { (RsFormat.latin($0), "التأسيس", "calendar") },
            profile.squad.isEmpty ? nil : (RsFormat.latin(profile.squad.count), "لاعبًا", "person.3.fill"),
        ].compactMap { $0 }

        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: SabqLayout.space8)], spacing: SabqLayout.space8) {
            ForEach(Array(facts.enumerated()), id: \.offset) { _, fact in
                VStack(spacing: SabqLayout.space4) {
                    Image(systemName: fact.2)
                        .font(SabqType.tag.font)
                        .foregroundStyle(RoshnTheme.accentInk)
                        .accessibilityHidden(true)
                    Text(fact.0)
                        .sabqText(SabqType.sectionHeading)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .monospacedDigit()
                    Text(fact.1)
                        .sabqText(SabqType.tag)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, SabqLayout.space12)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                .accessibilityElement(children: .combine)
            }
        }
    }

    // MARK: المدرب والملعب

    private func coachCard(_ coach: RsCoach) -> some View {
        section(title: "المدرب") {
            HStack(spacing: SabqLayout.space12) {
                RoshnAvatar(url: coach.photo, size: 56)
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text(coach.name)
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                    let details = [coach.nationality, coach.age.map { "\(RsFormat.latin($0)) سنة" }]
                        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                    if !details.isEmpty {
                        Text(details)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                }
                Spacer()
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func venueCard(_ venue: RsTeamVenue) -> some View {
        section(title: "ملعب النادي") {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "mappin.and.ellipse")
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(RoshnTheme.accentInk)
                    .frame(width: 44, height: 44)
                    .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text(venue.name.isEmpty ? "يُعلن لاحقًا" : venue.name)
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                    HStack(spacing: SabqLayout.space8) {
                        if !venue.city.isEmpty { Text(venue.city) }
                        if let capacity = venue.capacity { Text("\(RsFormat.latin(capacity)) متفرج") }
                    }
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                }
                Spacer()
            }
            .accessibilityElement(children: .combine)
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
        return section(title: "أرقام الفريق في الموسم") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 82), spacing: SabqLayout.space8)], spacing: SabqLayout.space8) {
                ForEach(Array(tiles.enumerated()), id: \.offset) { _, tile in
                    VStack(spacing: SabqLayout.space4) {
                        Text(tile.0)
                            .sabqText(SabqType.sectionHeading)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .monospacedDigit()
                        Text(tile.1)
                            .sabqText(SabqType.tag)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, SabqLayout.space12)
                    .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    // MARK: المباريات

    private func matchesSection(_ fixtures: [RsFixture]) -> some View {
        let live = fixtures.filter { $0.status.live }
        let upcoming = Array(fixtures.filter { !$0.started }.prefix(5))
        let results = Array(fixtures.filter { $0.status.finished }.suffix(5).reversed())
        return section(title: "مباريات النادي") {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                matchGroup("مباشر الآن", live)
                matchGroup("القادمة", upcoming)
                matchGroup("النتائج", results)
                if fixtures.isEmpty {
                    RoshnEmptyState(icon: "calendar", text: "لا توجد مباريات معلنة بعد")
                }
            }
        }
    }

    @ViewBuilder
    private func matchGroup(_ title: String, _ fixtures: [RsFixture]) -> some View {
        if !fixtures.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Text("\(title) · \(RsFormat.latin(fixtures.count))")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(title == "مباشر الآن" ? SabqTheme.danger : RoshnTheme.accentInk)
                    .padding(.bottom, SabqLayout.space4)
                ForEach(Array(fixtures.enumerated()), id: \.element.id) { index, fixture in
                    if index > 0 { RoshnRowSeparator() }
                    RoshnMatchRow(fixture: fixture) {
                        selectedFixtureId = fixture.id
                        showMatchCenter = true
                    }
                }
            }
        }
    }

    // MARK: الهدافون والقائمة

    private func scorersSection(_ scorers: [RsTeamScorer]) -> some View {
        section(title: "هدّافو الفريق") {
            VStack(spacing: 0) {
                ForEach(Array(scorers.enumerated()), id: \.element.id) { index, scorer in
                    if index > 0 { RoshnRowSeparator() }
                    HStack(spacing: SabqLayout.space12) {
                        Text(RsFormat.latin(scorer.rank))
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(scorer.rank <= 3 ? SabqTheme.textPrimary : SabqTheme.textSecondary)
                            .frame(width: 24)
                        RoshnAvatar(url: scorer.photo, size: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(scorer.name)
                                .sabqText(SabqType.rowTitle)
                                .foregroundStyle(SabqTheme.textPrimary)
                            Text("\(RsFormat.latin(scorer.matches)) مباراة · \(RsFormat.latin(scorer.assists)) صناعة")
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.textSecondary)
                        }
                        Spacer()
                        Text(RsFormat.latin(scorer.goals))
                            .sabqText(SabqType.sectionHeading)
                            .foregroundStyle(RoshnTheme.accentInk)
                            .monospacedDigit()
                    }
                    .padding(.vertical, SabqLayout.space12)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private func squadSection(_ squad: [RsSquadPlayer]) -> some View {
        let groups = Dictionary(grouping: squad) { $0.positionEn }
        let keys = groups.keys.sorted {
            (positionOrder.firstIndex(of: $0) ?? 9) < (positionOrder.firstIndex(of: $1) ?? 9)
        }
        return section(title: "قائمة الفريق") {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                if squad.isEmpty {
                    RoshnEmptyState(icon: "person.3", text: "القائمة الرسمية لم تُعلن بعد")
                }
                ForEach(keys, id: \.self) { key in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(groups[key]?.first?.position ?? key)
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(RoshnTheme.accentInk)
                            .padding(.bottom, SabqLayout.space4)
                        ForEach(Array((groups[key] ?? []).enumerated()), id: \.element.id) { index, player in
                            if index > 0 { RoshnRowSeparator() }
                            squadRow(player)
                        }
                    }
                }
            }
        }
    }

    private func squadRow(_ player: RsSquadPlayer) -> some View {
        HStack(spacing: SabqLayout.space12) {
            ZStack(alignment: .topTrailing) {
                RoshnAvatar(url: player.photo, size: 40)
                if player.captain == true {
                    Text("C")
                        .sabqText(SabqType.tag)
                        .foregroundStyle(RoshnTheme.navy)
                        .frame(width: 18, height: 18)
                        .background(RoshnTheme.gold)
                        .clipShape(Circle())
                        .offset(x: 4, y: -4)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: SabqLayout.space4) {
                    if let flag = player.nationality?.flag, let flagURL = URL(string: flag) {
                        CachedAsyncImage(url: flagURL, contentMode: .fill, maxPixelSize: 60) {
                            SabqTheme.surfaceMuted
                        }
                        .frame(width: 16, height: 12)
                        .clipShape(RoundedRectangle(cornerRadius: 2))
                        .accessibilityHidden(true)
                    }
                    Text(player.name)
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                }
                HStack(spacing: SabqLayout.space4) {
                    if let det = player.detailedPosition, det != player.position {
                        Text(det)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                    if let age = player.age {
                        Text("\(RsFormat.latin(age)) سنة")
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                }
            }
            Spacer()
            Text(player.number.map(RsFormat.latin) ?? "—")
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textSecondary)
                .monospacedDigit()
        }
        .padding(.vertical, SabqLayout.space12)
        .accessibilityElement(children: .combine)
    }

    // MARK: أقسام وحالات

    /// قسم بلا صندوق: شريط فصل رمادي ثم عنوان 20 ثم المحتوى على الصفحة.
    private func section<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            SabqSectionBand()
                .padding(.bottom, SabqLayout.space8)
            RoshnSectionHeading(title: title)
            content()
        }
    }

    private var loadingState: some View {
        RoshnLoadingRows(count: 5, height: 72)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 28, weight: .regular))
                .foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
            Text("تعذّر تحميل صفحة النادي")
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
            Text(message)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
            RoshnPrimaryButton(title: "إعادة المحاولة", systemImage: "arrow.clockwise") {
                Task { await load(force: true) }
            }
            .frame(maxWidth: 240)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space32)
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
