import SwiftUI

// MARK: - توقّعات كأس الملك
//
// تكافؤ مع صفحة /kings-cup/predictions على الويب فوق نظام sports_pool
// الموحّد: توقّع نتيجة المباراة (3 نقاط للدقيقة/1 للاتجاه، يُقفل عند
// الانطلاق) + «البطل والهدّاف» (مجمّع 5000/5000) + المتصدّرون. المصادقة
// بجلسة العضو (Bearer) عبر /api/v1/sports/* — نفس بنية توقعات المونديال.

/// بطاقة الدعوة في هب كأس الملك — مرآة WCPredictCTA بنص الكأس.
struct KcPredictCTA: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(LinearGradient(colors: [WCTheme.gold, WCTheme.gold.opacity(0.7)],
                                             startPoint: .top, endPoint: .bottom))
                        .frame(width: 44, height: 44)
                    Image(systemName: "target")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(WCTheme.heroTop)
                }
                .shadow(color: WCTheme.gold.opacity(0.45), radius: 6, y: 2)

                VStack(alignment: .leading, spacing: 3) {
                    Text("توقّع وتنافس")
                        .font(SabqFonts.app(size: 16, weight: .semibold)).foregroundStyle(.white)
                    Text("توقّع نتائج كأس الملك والبطل والهدّاف ونافس على الصدارة")
                        .font(SabqFonts.app(size: 11)).foregroundStyle(.white.opacity(0.85))
                        .lineLimit(2)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.left")
                    .font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.gold)
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .background(
                LinearGradient(colors: [WCTheme.heroTop, WCTheme.royal, WCTheme.heroBottom],
                               startPoint: .topTrailing, endPoint: .bottomLeading)
            )
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(WCTheme.gold.opacity(0.30), lineWidth: 1)
            )
            .shadow(color: WCTheme.royal.opacity(0.30), radius: 12, x: 0, y: 6)
        }
        .buttonStyle(.plain)
    }
}

// MARK: الشاشة

struct KcPredictionsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    enum Tab: String, CaseIterable {
        case matches = "توقّع المباريات", mine = "توقّعاتي", long = "البطل والهدّاف", leaders = "المتصدّرون"
    }
    @State private var tab: Tab = .matches
    @State private var showLogin = false

    @State private var fixtures: [KcFixture] = []
    @State private var mine: KcPoolMine?
    @State private var long: KcLongData?
    @State private var leaders: [KcPoolLeader] = []
    @State private var loading = true

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 16) {
                    tabBar
                    if loading {
                        KcLoading().padding(.top, 30)
                    } else {
                        switch tab {
                        case .matches:
                            KcPredictMatchesTab(fixtures: upcoming, mine: mine, showLogin: $showLogin) {
                                await reloadMine()
                            }
                        case .mine:
                            KcPredictMineTab(mine: mine, showLogin: $showLogin)
                        case .long:
                            KcPredictLongTab(long: long, showLogin: $showLogin) { await reloadLong() }
                        case .leaders:
                            KcPredictLeadersTab(leaders: leaders)
                        }
                    }
                }
                .padding(16)
            }
            .background(WCTheme.sectionBackground.ignoresSafeArea())
            .navigationTitle("توقّعات كأس الملك")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(WCTheme.stadiumTop, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white) }
                }
            }
            .task { await loadAll() }
            .task(id: authStore.isLoggedIn) {
                if authStore.isLoggedIn { await reloadMine(); await reloadLong() }
            }
            .refreshable { await loadAll() }
            .sheet(isPresented: $showLogin) { LoginSheet() }
        }
        .sabqRTL()
    }

    private var upcoming: [KcFixture] {
        fixtures.filter { !$0.started }.sorted { $0.timestamp < $1.timestamp }
    }

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Tab.allCases, id: \.self) { t in
                    Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                        Text(t.rawValue)
                            .font(SabqFonts.app(size: 12, weight: .medium))
                            .foregroundStyle(tab == t ? .white : WCTheme.onDarkDim)
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(Capsule().fill(tab == t ? WCTheme.emeraldDeep : WCTheme.chipFill))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func loadAll() async {
        async let f = APIClient.shared.fetchKingsCupFixtures()
        async let l = APIClient.shared.fetchKcPoolLeaderboard()
        async let lg = APIClient.shared.fetchKcPoolLong()
        let fr = (try? await f) ?? []
        let lr = (try? await l) ?? []
        let lgr = try? await lg
        var mr: KcPoolMine?
        if authStore.isLoggedIn { mr = try? await APIClient.shared.fetchKcPoolMine() }
        await MainActor.run {
            fixtures = fr; leaders = lr; long = lgr; mine = mr; loading = false
        }
    }

    private func reloadMine() async {
        guard authStore.isLoggedIn else { return }
        if let r = try? await APIClient.shared.fetchKcPoolMine() {
            await MainActor.run { mine = r }
        }
    }

    private func reloadLong() async {
        if let r = try? await APIClient.shared.fetchKcPoolLong() {
            await MainActor.run { long = r }
        }
    }
}

// MARK: تبويب توقّع المباريات

private struct KcPredictMatchesTab: View {
    let fixtures: [KcFixture]
    let mine: KcPoolMine?
    @Binding var showLogin: Bool
    let onSaved: () async -> Void

    var body: some View {
        if fixtures.isEmpty {
            WCEmptyState(icon: "calendar.badge.clock",
                         title: "لا مباريات متاحة للتوقّع حاليًا",
                         subtitle: "تُفتح التوقّعات مع إعلان جدول الجولة القادمة")
        } else {
            VStack(spacing: 12) {
                ForEach(fixtures) { f in
                    KcPredictMatchCard(
                        fixture: f,
                        saved: savedFor(f.id),
                        showLogin: $showLogin,
                        onSaved: onSaved
                    )
                }
            }
        }
    }

    private func savedFor(_ fixtureId: Int) -> KcPoolPrediction? {
        (mine?.predictions ?? []).first { $0.fixtureId == fixtureId }
    }
}

private struct KcPredictMatchCard: View {
    let fixture: KcFixture
    let saved: KcPoolPrediction?
    @Binding var showLogin: Bool
    let onSaved: () async -> Void

    @Environment(AuthStore.self) private var authStore
    @State private var home: Int = 0
    @State private var away: Int = 0
    @State private var submitting = false
    @State private var savedFlash = false

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 6) {
                Text(fixture.round).foregroundStyle(WCTheme.onDarkDim)
                Text("·").foregroundStyle(WCTheme.onDarkDim)
                Text(KcFormat.day(fixture)).foregroundStyle(WCTheme.onDarkDim)
                Spacer()
                KcStatusPill(fixture: fixture)
            }
            .font(SabqFonts.app(size: 11, weight: .regular))

            HStack(spacing: 10) {
                teamCol(fixture.home)
                stepper(value: $home)
                Text("-").font(SabqFonts.app(size: 17, weight: .semibold)).foregroundStyle(WCTheme.onDarkDim)
                stepper(value: $away)
                teamCol(fixture.away)
            }
            .environment(\.layoutDirection, .leftToRight)

            if let saved {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.seal.fill").font(.system(size: 11)).foregroundStyle(WCTheme.emeraldDeep)
                    Text("توقّعك المحفوظ: \(saved.predHome) - \(saved.predAway)")
                        .font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(WCTheme.emeraldDeep)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }

            Button {
                guard authStore.isLoggedIn else { showLogin = true; return }
                submitting = true
                Task {
                    let r = try? await APIClient.shared.submitKcPoolPrediction(fixture: fixture, home: home, away: away)
                    await onSaved()
                    await MainActor.run {
                        submitting = false
                        if r != nil { savedFlash = true }
                    }
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    await MainActor.run { savedFlash = false }
                }
            } label: {
                HStack(spacing: 6) {
                    if submitting { ProgressView().tint(.white).scaleEffect(0.8) }
                    Text(savedFlash ? "تم الحفظ ✓" : (saved != nil ? "تعديل التوقّع" : "احفظ توقّعك"))
                        .font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(.white)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(Capsule().fill(savedFlash ? WCTheme.emerald : WCTheme.royal))
            }
            .buttonStyle(.plain)
            .disabled(submitting)
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .wcElevatedCard(cornerRadius: 18)
        .onAppear {
            if let saved { home = saved.predHome; away = saved.predAway }
        }
    }

    private func teamCol(_ team: KcTeam) -> some View {
        VStack(spacing: 4) {
            KcTeamLogo(team: team, size: 40, ring: WCTheme.cardStroke)
            Text(team.name)
                .font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(WCTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity)
    }

    private func stepper(value: Binding<Int>) -> some View {
        VStack(spacing: 4) {
            Button { value.wrappedValue = min(15, value.wrappedValue + 1) } label: {
                Image(systemName: "chevron.up").font(.system(size: 12, weight: .medium)).foregroundStyle(WCTheme.emeraldDeep)
            }
            .buttonStyle(.plain)
            Text("\(value.wrappedValue)")
                .font(SabqFonts.app(size: 22, weight: .semibold).monospacedDigit()).foregroundStyle(WCTheme.onDark)
                .frame(width: 40, height: 36)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(WCTheme.chipFill))
            Button { value.wrappedValue = max(0, value.wrappedValue - 1) } label: {
                Image(systemName: "chevron.down").font(.system(size: 12, weight: .medium)).foregroundStyle(WCTheme.emeraldDeep)
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: تبويب توقّعاتي

private struct KcPredictMineTab: View {
    let mine: KcPoolMine?
    @Binding var showLogin: Bool
    @Environment(AuthStore.self) private var authStore

    var body: some View {
        if !authStore.isLoggedIn {
            loginCTA
        } else if let mine {
            VStack(spacing: 14) {
                if let stats = mine.stats { statsHeader(stats) }
                let rows = (mine.predictions ?? []).sorted { $0.kickoffTs > $1.kickoffTs }
                if rows.isEmpty {
                    WCEmptyState(icon: "list.bullet.clipboard",
                                 title: "لا توقّعات بعد",
                                 subtitle: "توقّع مباريات كأس الملك من التبويب الأول")
                } else {
                    ForEach(rows) { row(($0)) }
                }
            }
        } else {
            KcLoading()
        }
    }

    private var loginCTA: some View {
        VStack(spacing: 10) {
            WCEmptyState(icon: "person.crop.circle.badge.questionmark",
                         title: "سجّل دخولك لتشارك",
                         subtitle: "توقّعاتك ونقاطك تُحفظ بحسابك في سبق")
            Button { showLogin = true } label: {
                Text("تسجيل الدخول")
                    .font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 28).padding(.vertical, 10)
                    .background(Capsule().fill(WCTheme.emeraldDeep))
            }
            .buttonStyle(.plain)
        }
    }

    private func statsHeader(_ stats: KcPoolStats) -> some View {
        HStack(spacing: 8) {
            WCFactTile(value: "\(stats.totalPoints)", label: "نقاطي")
            WCFactTile(value: "\(stats.predictions)", label: "توقّعات")
            WCFactTile(value: "\(stats.exact)", label: "دقيقة")
            WCFactTile(value: "\(stats.correct)", label: "اتجاه صحيح")
        }
    }

    private func row(_ p: KcPoolPrediction) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(p.homeName) × \(p.awayName)")
                    .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(WCTheme.onDark)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text("توقّعك \(p.predHome)-\(p.predAway)")
                    if let ah = p.actualHome, let aa = p.actualAway {
                        Text("· النتيجة \(ah)-\(aa)")
                    }
                }
                .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                .environment(\.layoutDirection, .leftToRight)
            }
            Spacer()
            pointsChip(p.points)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .wcElevatedCard(cornerRadius: 14)
    }

    @ViewBuilder private func pointsChip(_ points: Int?) -> some View {
        if let points {
            Text(points == 3 ? "3 نقاط 🎯" : points == 1 ? "نقطة ✓" : "0")
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(points > 0 ? .white : WCTheme.onDarkDim)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Capsule().fill(points == 3 ? WCTheme.gold : points == 1 ? WCTheme.emeraldDeep : WCTheme.chipFill))
        } else {
            Text("بانتظار المباراة")
                .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Capsule().fill(WCTheme.chipFill))
        }
    }
}

// MARK: تبويب البطل والهدّاف

private struct KcPredictLongTab: View {
    let long: KcLongData?
    @Binding var showLogin: Bool
    let onSaved: () async -> Void

    @Environment(AuthStore.self) private var authStore
    @State private var submittingChampion = false
    @State private var scorerName = ""
    @State private var submittingScorer = false

    private var myChampion: KcLongMine? { long?.mine.first { $0.kind == "champion" } }
    private var myScorer: KcLongMine? { long?.mine.first { $0.kind == "top_scorer" } }

    var body: some View {
        if let long {
            VStack(alignment: .leading, spacing: 18) {
                // البطل
                VStack(alignment: .leading, spacing: 10) {
                    KcSectionHeader(icon: "trophy.fill", title: "من بطل كأس الملك؟",
                                    subtitle: "مجمّع \(long.pools.champion) نقطة يتقاسمها المصيبون",
                                    tint: WCTheme.gold)
                    if long.locked {
                        Text("أُقفلت توقّعات البطل — انطلقت البطولة")
                            .font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
                    }
                    if let mine = myChampion, let name = mine.teamName {
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.seal.fill").foregroundStyle(WCTheme.emeraldDeep)
                            Text("اختيارك: \(name)")
                                .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(WCTheme.onDark)
                        }
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
                        ForEach(long.teams) { team in
                            teamCell(team, selected: myChampion?.teamId == team.id, locked: long.locked)
                        }
                    }
                }

                // الهدّاف
                VStack(alignment: .leading, spacing: 10) {
                    KcSectionHeader(icon: "soccerball", title: "من هدّاف البطولة؟",
                                    subtitle: "مجمّع \(long.pools.topScorer) نقطة يتقاسمها المصيبون",
                                    tint: WCTheme.emeraldDeep)
                    if let mine = myScorer, let name = mine.playerName {
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.seal.fill").foregroundStyle(WCTheme.emeraldDeep)
                            Text("اختيارك: \(name)")
                                .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(WCTheme.onDark)
                        }
                    }
                    if !long.locked {
                        HStack(spacing: 8) {
                            TextField("اسم اللاعب…", text: $scorerName)
                                .font(SabqFonts.app(size: 13))
                                .padding(.horizontal, 12).padding(.vertical, 9)
                                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(WCTheme.chipFill))
                            Button {
                                guard authStore.isLoggedIn else { showLogin = true; return }
                                let name = scorerName.trimmingCharacters(in: .whitespaces)
                                guard !name.isEmpty else { return }
                                submittingScorer = true
                                Task {
                                    try? await APIClient.shared.submitKcPoolLong(kind: "top_scorer", teamId: nil, playerName: name)
                                    await onSaved()
                                    await MainActor.run { submittingScorer = false; scorerName = "" }
                                }
                            } label: {
                                if submittingScorer {
                                    ProgressView().tint(.white).frame(width: 60)
                                } else {
                                    Text("حفظ").font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(.white)
                                        .padding(.horizontal, 18)
                                }
                            }
                            .buttonStyle(.plain)
                            .padding(.vertical, 9)
                            .background(Capsule().fill(WCTheme.emeraldDeep))
                        }
                    }
                }
            }
        } else {
            WCEmptyState(icon: "trophy",
                         title: "توقّعات البطل غير متاحة حاليًا",
                         subtitle: "عُد قريبًا مع اقتراب انطلاق البطولة")
        }
    }

    private func teamCell(_ team: KcLongTeam, selected: Bool, locked: Bool) -> some View {
        Button {
            guard !locked else { return }
            guard authStore.isLoggedIn else { showLogin = true; return }
            submittingChampion = true
            Task {
                try? await APIClient.shared.submitKcPoolLong(kind: "champion", teamId: team.id, playerName: nil)
                await onSaved()
                await MainActor.run { submittingChampion = false }
            }
        } label: {
            VStack(spacing: 6) {
                WCRemoteImage(url: team.logo)
                    .padding(5).frame(width: 44, height: 44)
                    .background(Circle().fill(.white))
                    .overlay(Circle().stroke(selected ? WCTheme.gold : WCTheme.cardStroke, lineWidth: selected ? 2.5 : 1))
                Text(team.name)
                    .font(SabqFonts.app(size: 10, weight: selected ? .black : .semibold))
                    .foregroundStyle(selected ? WCTheme.gold : WCTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(selected ? WCTheme.gold.opacity(0.10) : WCTheme.chipFill)
            )
            .opacity(locked && !selected ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .disabled(locked || submittingChampion)
    }
}

// MARK: تبويب المتصدّرون

private struct KcPredictLeadersTab: View {
    let leaders: [KcPoolLeader]

    var body: some View {
        if leaders.isEmpty {
            WCEmptyState(icon: "list.number",
                         title: "لا متصدّرين بعد",
                         subtitle: "كن أول من يسجّل النقاط في مسابقة التوقّعات")
        } else {
            VStack(spacing: 8) {
                ForEach(leaders) { leader in
                    HStack(spacing: 10) {
                        Text("\(leader.rank)")
                            .font(SabqFonts.app(size: 11, weight: .regular).monospacedDigit())
                            .foregroundStyle(leader.rank <= 3 ? WCTheme.gold : WCTheme.onDarkDim)
                            .frame(width: 26)
                        if let avatar = leader.avatar, !avatar.isEmpty {
                            WCRemoteImage(url: avatar, contentMode: .fill)
                                .frame(width: 32, height: 32).clipShape(Circle())
                        } else {
                            Circle().fill(WCTheme.chipFill).frame(width: 32, height: 32)
                                .overlay(Image(systemName: "person.fill").font(.system(size: 13)).foregroundStyle(WCTheme.onDarkDim))
                        }
                        VStack(alignment: .leading, spacing: 0) {
                            Text(leader.name)
                                .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(WCTheme.onDark)
                                .lineLimit(1)
                            Text("\(leader.predictions) توقّعًا · \(leader.exact) دقيق")
                                .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                        }
                        Spacer()
                        Text("\(leader.totalPoints)")
                            .font(SabqFonts.app(size: 16, weight: .semibold).monospacedDigit())
                            .foregroundStyle(WCTheme.emeraldDeep)
                        Text("نقطة").font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .wcElevatedCard(cornerRadius: 14)
                }
            }
        }
    }
}
