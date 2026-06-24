import SwiftUI

// MARK: - مسابقة توقّعات كأس العالم 2026
//
// تكافؤ مع صفحة /world-cup/predictions على الويب: ثلاثة تبويبات —
// «مباريات اليوم» (إدخال التوقّع قبل القفل)، «توقّعاتي» (سجلّي ونتائجه)،
// و«المتصدّرون». المصادقة بجلسة العضو (Bearer) عبر /api/v1/world-cup/predictions/*.
// كل مباراة يُصيب نتيجتها بالضبط تمنح حصّة من 500 نقطة ولاء.

// MARK: زر الدعوة في الهب

struct WCPredictCTA: View {
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
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(WCTheme.heroTop)
                }
                .shadow(color: WCTheme.gold.opacity(0.45), radius: 6, y: 2)

                VStack(alignment: .leading, spacing: 3) {
                    Text("توقّع واربح")
                        .font(SabqFonts.app(size: 16, weight: .black)).foregroundStyle(.white)
                    Text("أصِب النتيجة بالضبط واكسب من 500 نقطة لكل مباراة")
                        .font(SabqFonts.app(size: 11)).foregroundStyle(.white.opacity(0.85))
                        .lineLimit(2)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.left")
                    .font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.gold)
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

// MARK: الشاشة الكاملة

struct WCPredictionsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    enum Tab: String, CaseIterable { case today = "مباريات اليوم", mine = "توقّعاتي", board = "المتصدّرون" }
    @State private var tab: Tab = .today
    @State private var showLogin = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                tabBar
                ScrollView(showsIndicators: false) {
                    Group {
                        switch tab {
                        case .today: WCPredTodayTab(showLogin: $showLogin)
                        case .mine: WCPredMineTab(showLogin: $showLogin)
                        case .board: WCPredLeaderboardTab()
                        }
                    }
                    .padding(16)
                }
            }
            .background(WCTheme.sectionBackground.ignoresSafeArea())
            .navigationTitle("مسابقة التوقّعات")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(WCTheme.stadiumTop, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white) }
                }
            }
            .sheet(isPresented: $showLogin) { LoginSheet() }
        }
        // شريط حالة أبيض على الرأس الأخضر: نفرض تفضيل النمط الداكن (يبيّض ساعة/
        // بطارية النظام) مع تثبيت بيئة الألوان على «فاتح» للمحتوى داخليًا — فتبقى
        // البطاقات بيضاء كما هي ولا تتأثّر بألوان WCTheme الديناميكية.
        .environment(\.colorScheme, .light)
        .preferredColorScheme(.dark)
        .sabqRTL()
    }

    private var tabBar: some View {
        HStack(spacing: 8) {
            ForEach(Tab.allCases, id: \.self) { t in
                Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                    Text(t.rawValue)
                        .font(SabqFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(tab == t ? .white : WCTheme.onDarkDim)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(Capsule().fill(tab == t ? WCTheme.emeraldDeep : WCTheme.chipFill))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 4)
        .background(WCTheme.stadiumTop)
    }
}

// MARK: - تبويب: مباريات اليوم

private struct WCPredTodayTab: View {
    @Binding var showLogin: Bool
    @Environment(AuthStore.self) private var authStore

    @State private var matches: [WCPredictableMatch] = []
    @State private var loading = true
    @State private var inputs: [Int: ScoreInput] = [:]
    @State private var submitting: Set<Int> = []
    @State private var toast: String?

    struct ScoreInput: Equatable { var home: Int; var away: Int }

    var body: some View {
        VStack(spacing: 14) {
            if let toast {
                Text(toast)
                    .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 12).fill(WCTheme.emeraldDeep))
            }
            if loading {
                WCLoading().padding(.top, 30)
            } else if matches.isEmpty {
                emptyText("لا توجد مباريات قابلة للتوقّع اليوم أو غدًا — تابع الجدول لاحقًا")
            } else {
                ForEach(matches) { m in card(m) }
            }
        }
        .task { await load() }
    }

    private func load() async {
        if let r = try? await APIClient.shared.fetchWCPredictionsToday(ignoreCache: true) {
            await MainActor.run {
                matches = r
                for m in r {
                    let seed = m.myPrediction
                    inputs[m.fixture.id] = ScoreInput(home: seed?.predHome ?? 0, away: seed?.predAway ?? 0)
                }
                loading = false
            }
        } else { await MainActor.run { loading = false } }
    }

    @ViewBuilder private func card(_ m: WCPredictableMatch) -> some View {
        let f = m.fixture
        VStack(spacing: 12) {
            // الترويسة: المنتخبان + الموعد
            HStack {
                teamSide(f.home)
                VStack(spacing: 3) {
                    Text(WCFormat.time(f))
                        .font(SabqFonts.app(size: 13, weight: .black)).foregroundStyle(WCTheme.onDark)
                    Text(f.round).font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                }
                .frame(minWidth: 70)
                teamSide(f.away)
            }

            if m.locked {
                lockedView(m)
            } else if authStore.isLoggedIn {
                inputView(m)
            } else {
                Button { showLogin = true } label: {
                    Text("سجّل الدخول للتوقّع")
                        .font(SabqFonts.app(size: 13, weight: .heavy)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity).padding(.vertical, 11)
                        .background(Capsule().fill(WCTheme.emeraldDeep))
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 6) {
                Image(systemName: "person.2.fill").font(.system(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                Text("\(m.predictionsCount) مشارك").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                Spacer()
                Text("الجائزة 500 نقطة").font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.gold)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }

    private func teamSide(_ team: WCTeam) -> some View {
        VStack(spacing: 6) {
            WCTeamLogo(team: team, size: 42, ring: WCTheme.cardStroke)
            Text(team.name).font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDark)
                .lineLimit(1).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // إدخال التوقّع (مضيف يمينًا في RTL — نعرض المضيف ثم الضيف)
    @ViewBuilder private func inputView(_ m: WCPredictableMatch) -> some View {
        let id = m.fixture.id
        let input = inputs[id] ?? ScoreInput(home: 0, away: 0)
        VStack(spacing: 10) {
            HStack(spacing: 16) {
                stepper(value: input.home) { setHome(id, $0) }
                Text("-").font(SabqFonts.app(size: 20, weight: .black)).foregroundStyle(WCTheme.onDarkDim)
                stepper(value: input.away) { setAway(id, $0) }
            }
            .environment(\.layoutDirection, .leftToRight)

            Button { Task { await submit(m) } } label: {
                HStack(spacing: 6) {
                    if submitting.contains(id) {
                        ProgressView().controlSize(.small).tint(.white)
                    } else {
                        Image(systemName: m.myPrediction != nil ? "checkmark.circle.fill" : "paperplane.fill")
                            .font(.system(size: 13))
                    }
                    Text(m.myPrediction != nil ? "تحديث التوقّع" : "حفظ التوقّع")
                        .font(SabqFonts.app(size: 13, weight: .heavy))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity).padding(.vertical, 11)
                .background(Capsule().fill(WCTheme.emeraldDeep))
            }
            .buttonStyle(.plain)
            .disabled(submitting.contains(id))
        }
    }

    private func stepper(value: Int, set: @escaping (Int) -> Void) -> some View {
        HStack(spacing: 10) {
            stepBtn("minus") { if value > 0 { set(value - 1) } }
            Text("\(value)")
                .font(SabqFonts.app(size: 22, weight: .black).monospacedDigit())
                .foregroundStyle(WCTheme.onDark).frame(minWidth: 30)
            stepBtn("plus") { if value < 20 { set(value + 1) } }
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.chipFill))
    }

    private func stepBtn(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .heavy)).foregroundStyle(.white)
                .frame(width: 34, height: 34)
                .background(Circle().fill(WCTheme.emeraldDeep))
                .shadow(color: WCTheme.emeraldDeep.opacity(0.3), radius: 3, y: 1)
        }
        .buttonStyle(.plain)
    }

    private func setHome(_ id: Int, _ v: Int) {
        var cur = inputs[id] ?? ScoreInput(home: 0, away: 0); cur.home = v; inputs[id] = cur
    }
    private func setAway(_ id: Int, _ v: Int) {
        var cur = inputs[id] ?? ScoreInput(home: 0, away: 0); cur.away = v; inputs[id] = cur
    }

    // عرض المباراة المقفلة: توقّعي + النتيجة النهائية إن سُوّيت
    @ViewBuilder private func lockedView(_ m: WCPredictableMatch) -> some View {
        VStack(spacing: 8) {
            if let s = m.settlement, let fh = s.finalHome, let fa = s.finalAway {
                HStack(spacing: 6) {
                    Text("النتيجة").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                    Text("\(fa) - \(fh)")
                        .font(SabqFonts.app(size: 15, weight: .black).monospacedDigit()).foregroundStyle(WCTheme.onDark)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            if let mine = m.myPrediction {
                HStack(spacing: 8) {
                    Text("توقّعك: \(mine.predAway) - \(mine.predHome)")
                        .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDark)
                        .environment(\.layoutDirection, .leftToRight)
                    statusBadge(mine.status, points: mine.pointsAwarded)
                }
            } else {
                Text("أُغلق التوقّع — انطلقت المباراة")
                    .font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 12).fill(WCTheme.chipFill))
    }

    private func submit(_ m: WCPredictableMatch) async {
        let id = m.fixture.id
        guard let input = inputs[id] else { return }
        await MainActor.run { submitting.insert(id) }
        do {
            _ = try await APIClient.shared.submitWCPrediction(fixtureId: id, predHome: input.home, predAway: input.away)
            await MainActor.run {
                submitting.remove(id)
                SabqHaptics.success()
                showToast("حُفظ توقّعك بنجاح")
            }
            await load()
        } catch {
            await MainActor.run {
                submitting.remove(id)
                showToast("تعذّر حفظ التوقّع — قد تكون المباراة أُغلقت")
            }
        }
    }

    private func showToast(_ msg: String) {
        toast = msg
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            await MainActor.run { if toast == msg { toast = nil } }
        }
    }
}

// MARK: - شارة حالة التوقّع (مشتركة)

@ViewBuilder
func statusBadge(_ status: String, points: Int) -> some View {
    switch status {
    case "correct":
        Text("أصبت +\(points)")
            .font(SabqFonts.app(size: 10, weight: .black)).foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(WCTheme.emeraldDeep))
    case "incorrect":
        Text("لم تُصب")
            .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(WCTheme.liveRed))
    default:
        Text("بانتظار النتيجة")
            .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(WCTheme.chipFill))
    }
}

// MARK: - تبويب: توقّعاتي

private struct WCPredMineTab: View {
    @Binding var showLogin: Bool
    @Environment(AuthStore.self) private var authStore

    @State private var items: [WCPredictionHistoryItem] = []
    @State private var loading = true

    var body: some View {
        VStack(spacing: 12) {
            if !authStore.isLoggedIn {
                loginPrompt
            } else if loading {
                WCLoading().padding(.top, 30)
            } else if items.isEmpty {
                emptyText("لم تضع أي توقّع بعد — ابدأ من تبويب «مباريات اليوم»")
            } else {
                summaryBar
                ForEach(items) { row($0) }
            }
        }
        .task(id: authStore.isLoggedIn) { if authStore.isLoggedIn { await load() } }
    }

    private var loginPrompt: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(.system(size: 40)).foregroundStyle(WCTheme.onDarkDim)
            Text("سجّل الدخول لعرض توقّعاتك ونقاطك")
                .font(SabqFonts.app(size: 14)).foregroundStyle(WCTheme.onDarkDim)
            Button { showLogin = true } label: {
                Text("تسجيل الدخول")
                    .font(SabqFonts.app(size: 13, weight: .heavy)).foregroundStyle(.white)
                    .padding(.horizontal, 24).padding(.vertical, 11)
                    .background(Capsule().fill(WCTheme.emeraldDeep))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 40)
    }

    private var summaryBar: some View {
        let total = items.reduce(0) { $0 + $1.pointsAwarded }
        let correct = items.filter { $0.status == "correct" }.count
        let played = items.filter { $0.status != "pending" }.count
        return HStack(spacing: 8) {
            tile("\(total)", "نقاطك", WCTheme.gold)
            tile("\(correct)", "إصابات", WCTheme.emeraldDeep)
            tile("\(played)", "مباريات", nil)
        }
    }

    private func tile(_ value: String, _ label: String, _ accent: Color?) -> some View {
        VStack(spacing: 2) {
            Text(value).font(SabqFonts.app(size: 18, weight: .black).monospacedDigit())
                .foregroundStyle(accent ?? WCTheme.onDark)
                .environment(\.layoutDirection, .leftToRight)
            Text(label).font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
    }

    private func row(_ item: WCPredictionHistoryItem) -> some View {
        HStack(spacing: 10) {
            logo(item.homeTeamLogo)
            VStack(spacing: 2) {
                Text("\(item.predAway) - \(item.predHome)")
                    .font(SabqFonts.app(size: 14, weight: .black).monospacedDigit()).foregroundStyle(WCTheme.onDark)
                    .environment(\.layoutDirection, .leftToRight)
                if let fh = item.finalHome, let fa = item.finalAway {
                    Text("النتيجة \(fa)-\(fh)")
                        .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            .frame(minWidth: 64)
            logo(item.awayTeamLogo)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(item.homeTeamName ?? "") × \(item.awayTeamName ?? "")")
                    .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                statusBadge(item.status, points: item.pointsAwarded)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
    }

    @ViewBuilder private func logo(_ url: String?) -> some View {
        if let url, !url.isEmpty {
            WCRemoteImage(url: url).frame(width: 28, height: 28)
        } else {
            Circle().fill(WCTheme.chipFill).frame(width: 28, height: 28)
        }
    }

    private func load() async {
        if let r = try? await APIClient.shared.fetchWCMyPredictions() {
            await MainActor.run { items = r; loading = false }
        } else { await MainActor.run { loading = false } }
    }
}

// MARK: - تبويب: المتصدّرون

private struct WCPredLeaderboardTab: View {
    @State private var leaders: [WCPredLeader] = []
    @State private var loading = true

    var body: some View {
        VStack(spacing: 8) {
            if loading {
                WCLoading().padding(.top, 30)
            } else if leaders.isEmpty {
                emptyText("لا متصدّرين بعد — كن أول من يصيب نتيجة مباراة!")
            } else {
                ForEach(leaders) { row($0) }
            }
        }
        .task { await load() }
    }

    private func row(_ l: WCPredLeader) -> some View {
        HStack(spacing: 12) {
            rankBadge(l.rank)
            avatar(l.avatar)
            VStack(alignment: .leading, spacing: 2) {
                Text(l.name).font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                Text("\(l.correctCount) إصابة من \(l.playedCount)")
                    .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
            }
            Spacer()
            VStack(spacing: 1) {
                Text("\(l.totalPoints)")
                    .font(SabqFonts.app(size: 16, weight: .black).monospacedDigit()).foregroundStyle(WCTheme.gold)
                    .environment(\.layoutDirection, .leftToRight)
                Text("نقطة").font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
    }

    private func rankBadge(_ rank: Int) -> some View {
        let color: Color = rank == 1 ? WCTheme.gold : (rank == 2 ? WCTheme.onDarkDim : (rank == 3 ? WCTheme.leaf : WCTheme.chipFill))
        let fg: Color = rank <= 3 ? .white : WCTheme.onDarkDim
        return Text("\(rank)")
            .font(SabqFonts.app(size: 13, weight: .black).monospacedDigit()).foregroundStyle(fg)
            .frame(width: 30, height: 30)
            .background(Circle().fill(rank <= 3 ? color : WCTheme.chipFill))
            .environment(\.layoutDirection, .leftToRight)
    }

    @ViewBuilder private func avatar(_ url: String?) -> some View {
        if let url, !url.isEmpty {
            WCRemoteImage(url: url, contentMode: .fill).frame(width: 34, height: 34).clipShape(Circle())
        } else {
            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: 30)).foregroundStyle(WCTheme.onDarkDim)
                .frame(width: 34, height: 34)
        }
    }

    private func load() async {
        if let r = try? await APIClient.shared.fetchWCLeaderboard() {
            await MainActor.run { leaders = r; loading = false }
        } else { await MainActor.run { loading = false } }
    }
}
