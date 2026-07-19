import SwiftUI

// بحث موحّد — بطولات + أندية/منتخبات من النقاط العامة (لا توجد نقطة بحث خادمية):
// البطولات من /sports/competitions، والفرق من ترتيب روشن + مجموعات المونديال.
// المطابقة بتطبيع عربي خفيف (همزات/تاء مربوطة/ألف مقصورة + إسقاط «ال»).
struct SpSearchView: View {
    @State private var query = ""
    @State private var comps: [SpCompetition] = []
    @State private var teams: [SpSearchTeam] = []
    @State private var loading = true
    @State private var selectedTeam: IDBox?
    @State private var selectedComp: SpCompetition?
    @FocusState private var focused: Bool

    private var trimmed: String { query.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                searchField

                if loading {
                    SpLoading()
                } else if trimmed.isEmpty {
                    hint
                } else {
                    let mc = matchedComps
                    let mt = matchedTeams
                    if mc.isEmpty && mt.isEmpty {
                        SpEmptyState(icon: "magnifyingglass", title: L("لا نتائج"),
                                     subtitle: L("جرّب اسمًا آخر — نبحث في البطولات وأندية روشن ومنتخبات المونديال"))
                    } else {
                        if !mt.isEmpty {
                            sectionHeader(L("أندية ومنتخبات"))
                            flatList(mt.indices.map { i in AnyView(teamRow(mt[i])) })
                        }
                        if !mc.isEmpty {
                            sectionHeader(L("بطولات"))
                            flatList(mc.indices.map { i in AnyView(compRow(mc[i])) })
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(SpAmbientBackground())
        .navigationTitle(L("بحث"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .navigationDestination(item: $selectedTeam) { box in SpTeamPage(teamId: box.id) }
        .navigationDestination(item: $selectedComp) { c in CompetitionDetailView(comp: c) }
    }

    // MARK: - الواجهة

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").foregroundStyle(SpTheme.onDarkFaint)
            TextField("", text: $query,
                      prompt: Text(L("ابحث عن نادٍ أو منتخب أو بطولة")).foregroundStyle(SpTheme.onDarkFaint))
                .font(SportsFonts.app(size: 15)).foregroundStyle(SpTheme.onDark).tint(SpTheme.green)
                .autocorrectionDisabled()
                .focused($focused)
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(SpTheme.onDarkFaint)
                }
                .accessibilityLabel(L("مسح البحث"))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
            .fill(SpTheme.card)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1)))
        .onAppear { focused = true }
    }

    private var hint: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L("اكتب للبحث في:"))
                .font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
            ForEach(["كل البطولات المتاحة", "أندية دوري روشن", "منتخبات كأس العالم 2026"], id: \.self) { line in
                HStack(spacing: 7) {
                    Circle().fill(SpTheme.green).frame(width: 5, height: 5)
                    Text(L(line)).font(SportsFonts.app(size: 12.5)).foregroundStyle(SpTheme.onDarkDim)
                }
            }
        }
        .padding(.top, 6)
    }

    private func sectionHeader(_ t: String) -> some View {
        Text(t)
            .font(SportsFonts.app(size: 13, weight: .heavy))
            .foregroundStyle(SpTheme.onDarkDim)
            .padding(.top, 2)
    }

    /// قائمة مسطّحة بلا بطاقات — صفوف مفصولة بخطوط رفيعة (عرف التطبيق).
    private func flatList(_ rows: [AnyView]) -> some View {
        VStack(spacing: 0) {
            ForEach(rows.indices, id: \.self) { i in
                if i > 0 {
                    Rectangle().fill(SpTheme.outline.opacity(0.6)).frame(height: 1).padding(.horizontal, 8)
                }
                rows[i]
            }
        }
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1)))
    }

    private func teamRow(_ t: SpSearchTeam) -> some View {
        Button { selectedTeam = IDBox(id: t.id) } label: {
            HStack(spacing: 10) {
                SpTeamLogo(logo: t.logo, size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark)
                    Text(t.context).font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkFaint)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.left").font(.system(size: 11, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    private func compRow(_ c: SpCompetition) -> some View {
        Button { selectedComp = c } label: {
            HStack(spacing: 10) {
                if let l = c.logo, !l.isEmpty {
                    SpRemoteImage(url: l).frame(width: 28, height: 28)
                } else {
                    Image(systemName: "trophy.fill").font(.system(size: 15)).foregroundStyle(SpTheme.green)
                        .frame(width: 28, height: 28)
                }
                Text(c.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                Image(systemName: "chevron.left").font(.system(size: 11, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: - المطابقة والتحميل

    private var matchedComps: [SpCompetition] {
        let q = SpArabicNorm.normalize(trimmed)
        guard !q.isEmpty else { return [] }
        return comps.filter { SpArabicNorm.normalize($0.name).contains(q) }
    }

    private var matchedTeams: [SpSearchTeam] {
        let q = SpArabicNorm.normalize(trimmed)
        guard !q.isEmpty else { return [] }
        return teams.filter { SpArabicNorm.normalize($0.name).contains(q) }
    }

    private func load() async {
        async let compsOpt = try? APIClient.shared.fetchCompetitions()
        async let roshnOpt = try? APIClient.shared.fetchStandings(comp: SportsConstants.defaultComp)
        async let wcOpt = try? APIClient.shared.fetchWorldCupStandings()
        comps = (await compsOpt)?.competitions ?? []
        var t: [SpSearchTeam] = []
        for r in (await roshnOpt)?.standings ?? [] {
            t.append(SpSearchTeam(id: r.team.id, name: r.team.name, logo: r.team.logo, context: L("دوري روشن")))
        }
        for g in (await wcOpt)?.groups ?? [] {
            for r in g.rows {
                t.append(SpSearchTeam(id: r.team.id, name: r.team.name, logo: r.team.logo, context: L("كأس العالم 2026")))
            }
        }
        teams = t
        loading = false
    }
}

struct SpSearchTeam: Identifiable {
    let id: Int
    let name: String
    let logo: String
    let context: String
}

/// تطبيع عربي خفيف للمطابقة: توحيد الهمزات/التاء المربوطة/الألف المقصورة،
/// حذف التشكيل والتطويل، وإسقاط «ال» من بداية الكلمات.
nonisolated enum SpArabicNorm {
    static func normalize(_ s: String) -> String {
        var out = String.UnicodeScalarView()
        for scalar in s.lowercased().unicodeScalars {
            switch scalar {
            case "أ", "إ", "آ": out.append("ا")
            case "ة": out.append("ه")
            case "ى": out.append("ي")
            case "ؤ": out.append("و")
            case "ئ": out.append("ي")
            case "\u{0640}": continue                       // تطويل
            case let x where (0x064B...0x0652).contains(x.value): continue // تشكيل
            default: out.append(scalar)
            }
        }
        // إسقاط «ال» من بداية كل كلمة («الهلال» تطابق «هلال»).
        let words = String(out).split(separator: " ").map { w -> Substring in
            w.hasPrefix("ال") && w.count > 3 ? w.dropFirst(2) : w
        }
        return words.joined(separator: " ")
    }
}
