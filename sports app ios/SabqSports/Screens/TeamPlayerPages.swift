import SwiftUI
import Charts

// صفحتا النادي واللاعب — تُفتحان عند النقر على شعار نادٍ (الترتيب/مركز المباراة)
// أو على لاعب (التشكيلة/الهدّافون). مبنيّتان 1:1 على مرجع كأس العالم في تطبيق سبق
// (WCTeamSheet / WCPlayerSheet): تمرير واحد متواصل بلا تبويبات، ترويسة بطلة،
// بلاطات حقائق، وشبكات أرقام — بثيم VARA الأبيض النظيف.

// MARK: - صفحة النادي

struct SpTeamPage: View {
    let teamId: Int
    var previewName: String? = nil
    var previewLogo: String? = nil

    @Environment(\.dismiss) private var dismiss
    @Environment(SpAuthStore.self) private var auth
    @Environment(SpFavorites.self) private var favorites
    @State private var profile: SpTeamProfile?
    @State private var injuries: [SpTeamInjury] = []
    @State private var transfers: SpTeamTransfersResponse?
    @State private var loading = true
    @State private var loadError: String?
    @State private var selectedPlayer: IDBox?

    private let squadOrder = ["Goalkeeper", "Defender", "Midfielder", "Attacker"]

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                headerCard
                followBar

                if loading && profile == nil {
                    SpLoading().padding(.top, 20)
                } else if let loadError, profile == nil {
                    SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                } else if let p = profile {
                    content(p)
                }
            }
            .padding(.vertical, 8).padding(.bottom, 24)
        }
        .background(SpAmbientBackground())
        .navigationTitle(profile?.team.name ?? previewName ?? "النادي")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let url = URLConstants.teamShareURL(teamId) {
                ToolbarItem(placement: .topBarTrailing) {
                    let nm = profile?.team.name ?? previewName ?? "النادي"
                    ShareLink(item: url, subject: Text(nm), message: Text("\(nm) — عبر VARA")) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(SpTheme.green)
                    }
                }
            }
        }
        .task { await load() }
        .navigationDestination(item: $selectedPlayer) { box in
            SpPlayerPage(playerId: box.id)
        }
    }

    // MARK: الترويسة (بطاقة بيضاء نظيفة — على منوال ترويسة اللاعب)
    //
    // المركز/النقاط والمدرّب حُذفا من الترويسة — يعرضهما «أبرز الأرقام» وبطاقة
    // المدرّب أدناه أغنى. الترويسة = الشعار + الاسم + البطولة فقط.

    private var headerCard: some View {
        let info = profile?.team
        return HStack(spacing: 14) {
            SpTeamLogo(logo: info?.logo ?? previewLogo ?? "", size: 72)
            VStack(alignment: .leading, spacing: 6) {
                Text(info?.name ?? previewName ?? "—")
                    .font(SportsFonts.app(size: 23, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(2)
                if let comp = profile?.competitionName, !comp.isEmpty {
                    Label(comp, systemImage: "trophy")
                        .font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                        .labelStyle(.titleAndIcon)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous).fill(SpTheme.card)
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        )
        .padding(.horizontal, 16)
    }

    // MARK: شريط المتابعة (حبوب)

    private var followBar: some View {
        HStack(spacing: 10) {
            favoriteButton
            if auth.isLoggedIn { followButton }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
    }

    private var favoriteButton: some View {
        let fav = favorites.isFavorite(teamId)
        let info = profile?.team
        return Button {
            favorites.toggle(id: teamId, name: info?.name ?? previewName ?? "", logo: info?.logo ?? previewLogo)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: fav ? "star.fill" : "star").font(.system(size: 13, weight: .bold))
                Text(fav ? "المفضّل" : "اجعله المفضّل").font(SportsFonts.app(size: 13, weight: .heavy))
            }
            // النشط أخضر مملوء؛ الخامل مفرّغ بحدّ أخضر (لمسة محورية أهدأ).
            .foregroundStyle(fav ? .white : SpTheme.green)
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Capsule().fill(fav ? SpTheme.green : Color.clear))
            .overlay(Capsule().stroke(fav ? Color.clear : SpTheme.green.opacity(0.5), lineWidth: 1))
        }
        .buttonStyle(SpPressStyle())
    }

    private var followButton: some View {
        let following = auth.isFollowing(kind: "team", refId: "\(teamId)")
        return Button {
            let info = profile?.team
            Task {
                await auth.toggleFollow(kind: "team", refId: "\(teamId)",
                                        refName: info?.name ?? previewName ?? "",
                                        refLogo: info?.logo ?? previewLogo)
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: following ? "bell.fill" : "bell").font(.system(size: 13, weight: .semibold))
                Text(following ? "تتابع التنبيهات" : "تابع التنبيهات").font(SportsFonts.app(size: 13, weight: .heavy))
            }
            .foregroundStyle(following ? .white : SpTheme.green)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(Capsule().fill(following ? SpTheme.green : Color.clear))
            .overlay(Capsule().stroke(following ? Color.clear : SpTheme.green.opacity(0.5), lineWidth: 1))
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: المحتوى (تمرير واحد متواصل بلا تبويبات)

    @ViewBuilder private func content(_ p: SpTeamProfile) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            quickFacts(p)
            if let c = p.coach { coachCard(c) }
            if let v = p.team.venue { venueCard(v) }
            if !injuries.isEmpty { injuriesSection }
            if let st = p.stats { teamStatsGrid(st) }
            if let t = transfers, !(t.arrivals.isEmpty && t.departures.isEmpty) { transfersSection(t) }
            matchesSection(p.fixtures)
            if !p.topScorers.isEmpty { scorersSection(p.topScorers) }
            squadSection(p.squad)
        }
        .padding(.horizontal, 16)
    }

    // MARK: حقائق سريعة

    @ViewBuilder private func quickFacts(_ p: SpTeamProfile) -> some View {
        let facts: [(value: String, label: String, accent: Color?)] = [
            p.standing.map { ("#\($0.rank)", "المركز", SpTheme.green as Color?) },
            p.standing.map { ("\($0.points)", "نقطة", nil) },
            p.team.founded.map { ("\($0)", "التأسيس", nil) },
            p.squad.isEmpty ? nil : ("\(p.squad.count)", "حجم القائمة", nil),
        ].compactMap { $0 }
        if !facts.isEmpty {
            HStack(spacing: 8) {
                ForEach(facts, id: \.label) { f in
                    SpFactTile(value: f.value, label: f.label, accent: f.accent)
                }
            }
        }
    }

    // MARK: المدرّب

    private func coachCard(_ c: SpCoach) -> some View {
        HStack(spacing: 12) {
            photoCircle(c.photo, size: 52, fallback: "person.crop.square.fill")
            VStack(alignment: .leading, spacing: 3) {
                Text("المدرّب").font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)
                Text(c.name).font(SportsFonts.app(size: 15, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                let sub = [c.nationality, c.age.map { "\($0) سنة" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if !sub.isEmpty {
                    Text(sub).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14).background(softCard)
    }

    // MARK: الملعب

    private func venueCard(_ v: SpVenueInfo) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "sportscourt.fill")
                .font(.system(size: 22)).foregroundStyle(SpTheme.green)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: 12).fill(SpTheme.chipFill))
            VStack(alignment: .leading, spacing: 3) {
                Text("الملعب").font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)
                Text(v.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                HStack(spacing: 8) {
                    if !v.city.isEmpty {
                        Text(v.city).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                    }
                    if let cap = v.capacity {
                        HStack(spacing: 3) {
                            Image(systemName: "person.2.fill").font(.system(size: 9))
                            Text("\(cap.formatted())").environment(\.layoutDirection, .leftToRight)
                        }
                        .font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14).background(softCard)
    }

    // MARK: الإصابات

    private var injuriesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "bandage.fill").font(.system(size: 13)).foregroundStyle(SpTheme.crimson)
                Text("الإصابات والغيابات").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.crimson)
            }
            ForEach(injuries) { inj in
                HStack(spacing: 10) {
                    Circle().fill(SpTheme.crimson.opacity(0.8)).frame(width: 7, height: 7)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(inj.player).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        if let r = inj.reason, !r.isEmpty {
                            Text(r).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                        }
                    }
                    Spacer()
                    if let u = inj.until, !u.isEmpty {
                        Text("العودة: \(u)").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim)
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 8).background(softTile)
            }
        }
    }

    // MARK: أرقام الفريق (شبكة بلاطات)

    private func teamStatsGrid(_ st: SpTeamStats) -> some View {
        var tiles: [(String, String)] = [
            ("\(st.fixtures.played.total)", "مباريات"),
            ("\(st.fixtures.wins.total)", "فوز"),
            ("\(st.fixtures.draws.total)", "تعادل"),
            ("\(st.fixtures.loses.total)", "خسارة"),
            ("\(st.goals.for.total)", "أهداف له"),
            ("\(st.goals.against.total)", "أهداف عليه"),
            ("\(st.summary.cleanSheets.total)", "شِباك نظيفة"),
            ("\(st.summary.cards.yellowTotal)/\(st.summary.cards.redTotal)", "بطاقات"),
        ]
        if let f = st.summary.mostUsedFormation, !f.isEmpty { tiles.append((f, "التشكيل الأكثر")) }
        if let b = st.biggest, let s = b.streakWin, s > 0 { tiles.append(("\(s)", "أطول سلسلة فوز")) }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "chart.bar.fill").font(.system(size: 13)).foregroundStyle(SpTheme.green)
                Text("أرقام الفريق في الموسم").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.green)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
                ForEach(tiles, id: \.1) { t in SpFactTile(value: t.0, label: t.1) }
            }
        }
    }

    // MARK: الانتقالات

    private func transfersSection(_ t: SpTeamTransfersResponse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "arrow.left.arrow.right").font(.system(size: 13)).foregroundStyle(SpTheme.green)
                Text("آخر الانتقالات").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.green)
            }
            if !t.arrivals.isEmpty { transferGroup("واصلون", t.arrivals, toClub: true) }
            if !t.departures.isEmpty { transferGroup("مغادرون", t.departures, toClub: false) }
        }
    }

    private func transferGroup(_ title: String, _ items: [SpTeamTransferItem], toClub: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
            ForEach(items.prefix(8)) { tr in
                HStack(spacing: 10) {
                    SpTeamLogo(logo: tr.teamLogo, size: 26)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(tr.player).font(SportsFonts.app(size: 13.5, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        Text((toClub ? "من " : "إلى ") + tr.team).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    if !tr.type.isEmpty {
                        Text(tr.type).font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.green).lineLimit(1)
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 8).background(softTile)
            }
        }
    }

    // MARK: المباريات

    private func matchesSection(_ fixtures: [SpFixture]) -> some View {
        let live = fixtures.filter { $0.started && !$0.status.finished }
        let upcoming = Array(fixtures.filter { !$0.started }.prefix(6))
        let finished = Array(fixtures.filter { $0.status.finished }.suffix(8).reversed())
        return VStack(alignment: .leading, spacing: 12) {
            Text("المباريات").font(SportsFonts.app(size: 17, weight: .bold)).foregroundStyle(SpTheme.onDark)
            if fixtures.isEmpty {
                Text("لا توجد مباريات معلنة بعد")
                    .font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 20)
            } else {
                matchGroup("مباشر الآن", live)
                matchGroup("المباريات القادمة", upcoming)
                matchGroup("النتائج", finished)
            }
        }
    }

    @ViewBuilder private func matchGroup(_ label: String, _ list: [SpFixture]) -> some View {
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Circle().fill(SpTheme.green).frame(width: 7, height: 7)
                    Text(label).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark)
                    Text("(\(list.count))").font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
                }
                Rectangle().fill(SpTheme.outline).frame(height: 1).padding(.top, 8)
                SpFlatMatchList(fixtures: list)
            }
        }
    }

    // MARK: الهدّافون

    private func scorersSection(_ scorers: [SpTeamScorer]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "soccerball").font(.system(size: 13)).foregroundStyle(SpTheme.green)
                Text("هدّافو الفريق").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.green)
            }
            ForEach(scorers) { s in
                Button { selectedPlayer = IDBox(id: s.id) } label: { scorerRow(s) }.buttonStyle(SpPressStyle())
            }
        }
    }

    private func scorerRow(_ s: SpTeamScorer) -> some View {
        HStack(spacing: 12) {
            Text("\(s.rank)").font(SportsFonts.app(size: 13, weight: .bold))
                .foregroundStyle(s.rank <= 3 ? SpTheme.green : SpTheme.onDarkFaint).frame(width: 20)
            photoCircle(s.photo, size: 36, fallback: "person.fill")
            VStack(alignment: .leading, spacing: 1) {
                Text(s.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                Text("\(s.matches) مباراة · \(s.assists) صناعة").font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim)
            }
            Spacer(minLength: 0)
            HStack(spacing: 4) {
                Image(systemName: "soccerball").font(.system(size: 11)).foregroundStyle(SpTheme.green)
                Text("\(s.goals)").font(SportsFonts.app(size: 16, weight: .heavy)).foregroundStyle(SpTheme.onDark).monospacedDigit()
            }
            .environment(\.layoutDirection, .leftToRight)
        }
        .padding(.horizontal, 12).padding(.vertical, 8).background(softTile)
    }

    // MARK: القائمة (حسب المركز)

    private func squadSection(_ squad: [SpSquadPlayer]) -> some View {
        let byPos = Dictionary(grouping: squad) { $0.positionEn }
        let groups = byPos.keys.sorted { (squadOrder.firstIndex(of: $0) ?? 9) < (squadOrder.firstIndex(of: $1) ?? 9) }
        return VStack(alignment: .leading, spacing: 12) {
            Text("القائمة").font(SportsFonts.app(size: 17, weight: .bold)).foregroundStyle(SpTheme.onDark)
            if squad.isEmpty {
                Text("القائمة الرسمية لم تُعلن بعد")
                    .font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 20)
            } else {
                ForEach(groups, id: \.self) { pos in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(byPos[pos]?.first?.position ?? pos)
                            .font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.green)
                        ForEach(byPos[pos] ?? []) { pl in
                            Button { selectedPlayer = IDBox(id: pl.id) } label: { squadRow(pl) }.buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private func squadRow(_ p: SpSquadPlayer) -> some View {
        HStack(spacing: 10) {
            photoCircle(p.photo, size: 36, fallback: "person.fill")
            VStack(alignment: .leading, spacing: 1) {
                Text(p.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                if let a = p.age {
                    Text("\(a) سنة").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim)
                }
            }
            Spacer()
            Text(p.number.map { "\($0)" } ?? "—")
                .font(SportsFonts.app(size: 15, weight: .heavy)).foregroundStyle(SpTheme.onDarkDim)
                .monospacedDigit().environment(\.layoutDirection, .leftToRight)
            Image(systemName: "chevron.left")
                .font(.system(size: 10, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint.opacity(0.6))
        }
        .padding(.horizontal, 12).padding(.vertical, 8).background(softTile)
    }

    // MARK: أسطح مشتركة (مسطّحة — حدّ خفيف بلا ظلّ)
    private var softCard: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous).fill(SpTheme.card)
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(SpTheme.cardStroke.opacity(0.6), lineWidth: 1))
    }
    private var softTile: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SpTheme.cardFill)
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SpTheme.cardStroke.opacity(0.6), lineWidth: 1))
    }

    private func load() async {
        async let injOpt = (try? APIClient.shared.fetchTeamInjuries(id: teamId, comp: SportsConstants.defaultComp))
        async let trOpt = (try? APIClient.shared.fetchTeamTransfers(id: teamId))
        do { profile = try await APIClient.shared.fetchTeamProfile(id: teamId); loadError = nil }
        catch { loadError = error.localizedDescription }
        self.injuries = (await injOpt)?.injuries ?? []
        self.transfers = await trOpt
        loading = false
    }
}

// MARK: - صفحة اللاعب

struct SpPlayerPage: View {
    let playerId: Int

    @Environment(\.dismiss) private var dismiss
    @State private var card: SpPlayerCard?
    @State private var form: SpPlayerForm?
    @State private var market: SpPlayerMarket?
    @State private var loading = true
    @State private var loadError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if loading && card == nil {
                    SpLoading().padding(.top, 30)
                } else if let loadError, card == nil {
                    SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                } else if let c = card {
                    identityHeader(c)
                    factTiles(c)
                    birthLine(c)
                    if let m = market, m.available, let v = m.value, v > 0 { marketSection(m) }
                    if !c.seasonStats.isEmpty { statsSection(c.seasonStats) }
                    if let f = form, f.available, !f.matches.isEmpty { formSection(f.matches) }
                    if let h = c.history, !h.isEmpty { historySection(h) }
                    if !c.career.isEmpty { careerSection(c.career) }
                    if !c.trophies.isEmpty { trophiesSection(c.trophies) }
                }
            }
            .padding(16)
            .padding(.bottom, 16)
        }
        .background(SpAmbientBackground())
        .navigationTitle("بطاقة اللاعب")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let url = URLConstants.playerShareURL(playerId) {
                ToolbarItem(placement: .topBarTrailing) {
                    let nm = card?.name ?? "اللاعب"
                    ShareLink(item: url, subject: Text(nm), message: Text("\(nm) — عبر VARA")) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(SpTheme.green)
                    }
                }
            }
        }
        .task { await load() }
    }

    // MARK: الهوية (مسطّحة — صورة يمينًا والاسم/الشارات إلى جانبها)

    private func identityHeader(_ c: SpPlayerCard) -> some View {
        HStack(spacing: 14) {
            photoCircle(c.photo, size: 76, fallback: "person.fill", ring: true)
            VStack(alignment: .leading, spacing: 4) {
                Text(c.name).font(SportsFonts.app(size: 20, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(2)
                if let full = c.fullName, !full.isEmpty, full != c.name {
                    Text(full).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                }
                HStack(spacing: 6) {
                    if !c.position.isEmpty {
                        chip(c.position, fill: SpTheme.green.opacity(0.12), fg: SpTheme.green)
                    }
                    if let n = c.number {
                        HStack(spacing: 3) {
                            Image(systemName: "tshirt.fill").font(.system(size: 9))
                            Text("\(n)").font(SportsFonts.app(size: 11, weight: .heavy)).monospacedDigit()
                        }
                        .foregroundStyle(SpTheme.onDark)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Capsule().fill(SpTheme.chipFill))
                        .environment(\.layoutDirection, .leftToRight)
                    }
                    if let nat = c.nationality, !nat.isEmpty {
                        chip(nat, fill: SpTheme.chipFill, fg: SpTheme.onDarkDim)
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func chip(_ text: String, fill: Color, fg: Color) -> some View {
        Text(text)
            .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(fg)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(fill))
    }

    // MARK: بلاطات الحقائق (عمر/طول/وزن)

    @ViewBuilder private func factTiles(_ c: SpPlayerCard) -> some View {
        let facts: [(value: String, label: String)] = [
            c.age.map { ("\($0) سنة", "العمر") },
            c.height.map { ("\($0) سم", "الطول") },
            c.weight.map { ("\($0) كجم", "الوزن") },
        ].compactMap { $0 }
        if !facts.isEmpty {
            HStack(spacing: 8) {
                ForEach(facts, id: \.label) { f in SpFactTile(value: f.value, label: f.label) }
            }
        }
    }

    // MARK: سطر الميلاد

    @ViewBuilder private func birthLine(_ c: SpPlayerCard) -> some View {
        let date = c.birthDate.flatMap { Self.birthParser.date(from: $0) }
        let parts = [date.map { Self.birthFormatter.string(from: $0) } ?? c.birthDate, c.birthPlace]
            .compactMap { $0 }.filter { !$0.isEmpty }
        if !parts.isEmpty {
            HStack(spacing: 6) {
                Image(systemName: "birthday.cake").font(.system(size: 11))
                Text(parts.joined(separator: " — "))
            }
            .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
        }
    }

    private static let birthParser: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    private static let birthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA-u-ca-gregory-nu-latn")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "d MMMM yyyy"
        return f
    }()

    // MARK: القيمة السوقية

    private func marketSection(_ m: SpPlayerMarket) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 12, weight: .semibold)).foregroundStyle(SpTheme.green)
                Text("القيمة السوقية").font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.green)
                Spacer()
                Text(formatMoney(m.value, m.currency))
                    .font(SportsFonts.app(size: 15, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                    .environment(\.layoutDirection, .leftToRight)
            }
            if let p = m.peak, p > 0, p != m.value {
                HStack {
                    Text("الذروة").font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim)
                    Spacer()
                    Text(formatMoney(p, m.currency)).font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }

    private func formatMoney(_ v: Double?, _ cur: String?) -> String {
        guard let v, v > 0 else { return "—" }
        let c = cur ?? "€"
        if v >= 1_000_000 { return String(format: "%.1f مليون %@", v / 1_000_000, c) }
        if v >= 1_000 { return String(format: "%.0f ألف %@", v / 1_000, c) }
        return String(format: "%.0f %@", v, c)
    }

    // MARK: الأرقام (شبكة بلاطات لكل بطولة)

    private func statsSection(_ stats: [SpPlayerSeasonStats]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "chart.bar.fill").font(.system(size: 12, weight: .semibold)).foregroundStyle(SpTheme.green)
                Text("أرقام الموسم").font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.green)
            }
            ForEach(Array(stats.enumerated()), id: \.offset) { _, s in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        SpTeamLogo(logo: s.team.logo, size: 22)
                        Text(s.competition).font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        Spacer()
                        if let r = s.rating { ratingBadge(r) }
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 8)], spacing: 8) {
                        SpFactTile(value: "\(s.matches)", label: "مباريات")
                        SpFactTile(value: "\(s.minutes)", label: "دقائق")
                        SpFactTile(value: "\(s.lineups)", label: "أساسي")
                        SpFactTile(value: "\(s.goals)", label: "أهداف")
                        SpFactTile(value: "\(s.assists)", label: "صناعة")
                        if s.saves > 0 || s.conceded > 0 {
                            SpFactTile(value: "\(s.saves)", label: "تصديات")
                            SpFactTile(value: "\(s.conceded)", label: "استقبلها")
                        }
                        if s.yellow > 0 || s.red > 0 {
                            SpFactTile(value: "\(s.yellow)/\(s.red)", label: "بطاقات")
                        }
                    }
                }
            }
        }
    }

    private func ratingBadge(_ r: Double) -> some View {
        Text(String(format: "%.1f", r))
            .font(SportsFonts.app(size: 13, weight: .heavy)).foregroundStyle(.white)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(RoundedRectangle(cornerRadius: 8).fill(ratingColor(r)))
            .environment(\.layoutDirection, .leftToRight)
    }

    private func ratingColor(_ r: Double) -> Color {
        // تدرّج أخضر للتقييم المرتفع، رمادي للمتوسط، قرمزي للمنخفض — بلا ذهبي روتيني.
        if r >= 8 { return SpTheme.greenDeep }
        if r >= 7 { return SpTheme.green }
        if r >= 6 { return SpTheme.onDarkDim }
        return SpTheme.crimson
    }

    // MARK: الفورمة الأخيرة (شريط نتائج + رسم xG + صفوف)

    private func formSection(_ matches: [SpFormMatch]) -> some View {
        let hasXg = matches.contains { ($0.xg ?? 0) > 0 }
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 12, weight: .semibold)).foregroundStyle(SpTheme.green)
                Text(hasXg ? "الفورمة الأخيرة · xG" : "الفورمة الأخيرة").font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.green)
                Spacer()
                Text("آخر \(matches.count)").font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
                    .padding(.horizontal, 7).padding(.vertical, 2).background(Capsule().fill(SpTheme.chipFill))
                    .environment(\.layoutDirection, .leftToRight)
            }
            resultsStrip(matches)
            if hasXg { xgChart(matches) }
            ForEach(matches.prefix(10)) { m in formRow(m) }
        }
    }

    // شريط نتائج W/D/L — الأحدث يمينًا
    private func resultsStrip(_ matches: [SpFormMatch]) -> some View {
        HStack(spacing: 6) {
            ForEach(Array(matches.prefix(12).enumerated().reversed()), id: \.offset) { _, m in
                Text(resultAr(m.result))
                    .font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(.white)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(resultColor(m.result)))
            }
            Spacer(minLength: 0)
        }
    }

    private func xgChart(_ matches: [SpFormMatch]) -> some View {
        Chart(Array(matches.prefix(10))) { m in
            BarMark(x: .value("الخصم", m.opponent), y: .value("xG", m.xg ?? 0))
                .foregroundStyle(SpTheme.green)
                .cornerRadius(3)
        }
        .chartYAxis {
            AxisMarks(position: .leading) { value in
                AxisGridLine().foregroundStyle(SpTheme.outline)
                AxisValueLabel {
                    if let d = value.as(Double.self) {
                        Text(String(format: "%.1f", d)).font(SportsFonts.app(size: 8)).foregroundStyle(SpTheme.onDarkDim)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks { value in
                AxisValueLabel {
                    if let s = value.as(String.self) {
                        Text(s).font(SportsFonts.app(size: 7)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                    }
                }
            }
        }
        .frame(height: 96)
        .padding(.top, 2)
    }

    private func formRow(_ m: SpFormMatch) -> some View {
        HStack(spacing: 10) {
            Text(resultAr(m.result)).font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(.white)
                .frame(width: 22, height: 22).background(Circle().fill(resultColor(m.result)))
            if let logo = m.opponentLogo, !logo.isEmpty { SpTeamLogo(logo: logo, size: 24) }
            VStack(alignment: .leading, spacing: 1) {
                Text(m.opponent.isEmpty ? "—" : m.opponent).font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                HStack(spacing: 6) {
                    Text(m.homeAway == "home" ? "أرضه" : "خارج أرضه").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim)
                    if let l = m.league, !l.isEmpty {
                        Text("· \(l)").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 4)
            HStack(spacing: 8) {
                if let x = m.xg, x > 0 {
                    // الرسم أعلى القسم يعرض xG بصريًّا — هنا رقم عارٍ بلا كبسولة.
                    HStack(spacing: 3) {
                        Text("xG").font(SportsFonts.app(size: 8, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
                        Text(String(format: "%.1f", x)).font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(SpTheme.green)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                if let g = m.goals, g > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "soccerball").font(.system(size: 9)).foregroundStyle(SpTheme.green)
                        Text("\(g)").font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(SpTheme.onDark).monospacedDigit()
                    }
                }
                if let sf = m.scoreFor, let sa = m.scoreAgainst {
                    Text("\(sf)-\(sa)").font(SportsFonts.app(size: 12, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                        .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                }
                if let r = m.rating, r > 0 {
                    Text(String(format: "%.1f", r)).font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 7).fill(ratingColor(r)))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SpTheme.cardStroke.opacity(0.6), lineWidth: 1))
    }

    private func resultAr(_ r: String) -> String {
        switch r.uppercased() { case "W": return "ف"; case "L": return "خ"; default: return "ت" }
    }
    private func resultColor(_ r: String) -> Color {
        switch r.uppercased() { case "W": return SpTheme.greenDeep; case "L": return SpTheme.crimson; default: return SpTheme.onDarkFaint }
    }

    // MARK: سجل المواسم

    private func historySection(_ history: [SpPlayerHistory]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "calendar").font(.system(size: 12, weight: .semibold)).foregroundStyle(SpTheme.green)
                Text("سجل المواسم").font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.green)
            }
            ForEach(history.prefix(12)) { h in
                HStack(spacing: 10) {
                    Text("\(h.season)").font(SportsFonts.app(size: 13, weight: .heavy)).foregroundStyle(SpTheme.green)
                        .monospacedDigit().frame(width: 42).environment(\.layoutDirection, .leftToRight)
                    Text(h.competition).font(SportsFonts.app(size: 12.5, weight: .semibold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                    Spacer(minLength: 0)
                    historyStat("\(h.matches)", "مباراة")
                    historyStat("\(h.goals)", "هدف")
                    historyStat("\(h.assists)", "صناعة")
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SpTheme.card))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SpTheme.cardStroke.opacity(0.6), lineWidth: 1))
            }
        }
    }

    private func historyStat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 1) {
            Text(value).font(SportsFonts.app(size: 14, weight: .heavy)).foregroundStyle(SpTheme.onDark).monospacedDigit()
            Text(label).font(SportsFonts.app(size: 8.5)).foregroundStyle(SpTheme.onDarkFaint)
        }
        .frame(width: 42)
    }

    // MARK: المسيرة

    private func careerSection(_ career: [SpPlayerCareerStop]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "clock.arrow.circlepath").font(.system(size: 12, weight: .semibold)).foregroundStyle(SpTheme.green)
                Text("المسيرة").font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.green)
            }
            ForEach(career) { stop in
                HStack(spacing: 10) {
                    SpTeamLogo(logo: stop.logo, size: 30)
                    Text(stop.team).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                    Spacer()
                    Text(seasonsLabel(stop.seasons))
                        .font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                        .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SpTheme.card))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SpTheme.cardStroke.opacity(0.6), lineWidth: 1))
            }
        }
    }

    private func seasonsLabel(_ seasons: [Int]) -> String {
        guard let mn = seasons.min(), let mx = seasons.max() else { return "" }
        return mn == mx ? "\(mn)" : "\(mn)–\(mx)"
    }

    // MARK: الألقاب

    private func trophiesSection(_ trophies: [SpPlayerTrophy]) -> some View {
        let titles = trophies.filter(\.winner).count
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "trophy.fill").font(.system(size: 12, weight: .semibold)).foregroundStyle(SpTheme.green)
                Text("الألقاب").font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.green)
                if titles > 0 {
                    Text("\(titles) بطولة").font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
                        .padding(.horizontal, 7).padding(.vertical, 2).background(Capsule().fill(SpTheme.chipFill))
                }
            }
            ForEach(Array(trophies.prefix(24).enumerated()), id: \.offset) { _, t in
                HStack(spacing: 10) {
                    Image(systemName: "trophy.fill").font(.system(size: 13))
                        .foregroundStyle(t.winner ? SpTheme.gold : SpTheme.onDarkFaint.opacity(0.5))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(t.competition).font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        if !t.country.isEmpty {
                            Text(t.country).font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim)
                        }
                    }
                    Spacer()
                    if !t.place.isEmpty {
                        Text(t.place)
                            .font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(t.winner ? .white : SpTheme.onDarkDim)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Capsule().fill(t.winner ? SpTheme.greenDeep : SpTheme.chipFill))
                    }
                    Text(t.season).font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                        .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SpTheme.card))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SpTheme.cardStroke.opacity(0.6), lineWidth: 1))
            }
        }
    }

    private func load() async {
        async let formOpt = (try? APIClient.shared.fetchPlayerForm(id: playerId))
        async let marketOpt = (try? APIClient.shared.fetchPlayerMarket(id: playerId))
        do { card = try await APIClient.shared.fetchPlayerCard(id: playerId); loadError = nil }
        catch { loadError = error.localizedDescription }
        self.form = await formOpt
        self.market = await marketOpt
        loading = false
    }
}

// MARK: - مشترك

/// بلاطة حقيقة: قيمة كبيرة فوق وصف صغير (نظير WCFactTile).
struct SpFactTile: View {
    let value: String
    let label: String
    var accent: Color? = nil

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(SportsFonts.app(size: 15, weight: .heavy)).monospacedDigit()
                .foregroundStyle(accent ?? SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.7)
                .environment(\.layoutDirection, .leftToRight)
            Text(label)
                .font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10).padding(.horizontal, 6)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(SpTheme.cardStroke.opacity(0.6), lineWidth: 1))
    }
}

/// صورة دائرية (لاعب/مدرب) ببديل أيقوني عند الغياب.
@ViewBuilder
func photoCircle(_ url: String, size: CGFloat, fallback: String, ring: Bool = false) -> some View {
    Group {
        if url.isEmpty {
            Image(systemName: fallback)
                .font(.system(size: size * 0.42))
                .foregroundStyle(SpTheme.onDarkFaint)
                .frame(width: size, height: size)
                .background(Circle().fill(SpTheme.chipFill))
        } else {
            // SpRemoteImage (كاش @State) بدل AsyncImage — يمنع وميض الصور عند إعادة الرسم.
            SpRemoteImage(url: url, contentMode: .fill)
                .frame(width: size, height: size)
                .clipShape(Circle())
        }
    }
    .overlay(Circle().stroke(ring ? SpTheme.green : SpTheme.cardStroke, lineWidth: ring ? 3 : 1))
}

/// صندوق معرّف للاستعمال مع navigationDestination(item:) من Int اختياري.
struct IDBox: Identifiable, Hashable { let id: Int }
