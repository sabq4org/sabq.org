import SwiftUI

// صفحة «لك» — خلاصة شخصية تجمع ما يخصّ المستخدم في مكان واحد:
// مبارياته المتابَعة (بطاقة «مبارياتي» نفسها) + فِرقه المتابَعة + آخر توقّعاته
// بنتائجها. تُفتح من جرس هيدر الرئيسية. تعيد استخدام المكوّنات القائمة.
struct SpForYouView: View {
    @Environment(SpAuthStore.self) private var auth
    @Environment(SpMatchFollows.self) private var matchFollows

    @State private var mine: [SpMyPredictionRow] = []
    @State private var loadingMine = false
    @State private var selectedTeam: IDBox?

    private var followedTeams: [SpFollow] { auth.follows.filter { $0.kind == "team" } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                // موجزك من VARA (يظهر لعضو مسجّل وبوجود موجز جاهز — يختفي ذاتيًّا).
                VaraDigestCard()

                // مبارياتك المتابَعة (المكوّن القائم — يختفي ذاتيًّا حين لا متابعات).
                SpMyMatchesCard()

                // مدخل المساعد الرياضي المحادثي (RAG).
                VaraCopilotEntry()

                if !followedTeams.isEmpty {
                    SpSectionHeader(icon: "star.fill", title: "فِرقك")
                    teamsStrip
                }

                if auth.isLoggedIn {
                    SpSectionHeader(icon: "sparkles", title: "آخر توقّعاتك")
                    if loadingMine {
                        SpLoading()
                    } else if mine.isEmpty {
                        SpEmptyState(icon: "soccerball", title: "لم تتوقّع بعد",
                                     subtitle: "ابدأ من تبويب «روشن» ← التوقّعات")
                    } else {
                        SpMyPredictionsList(rows: Array(mine.prefix(6)))
                    }
                } else {
                    SpEmptyState(icon: "person.crop.circle.badge.plus", title: "سجّل الدخول",
                                 subtitle: "لتظهر هنا توقّعاتك وفرقك وتنبيهاتك")
                }
            }
            .padding(16)
        }
        .background(SpAmbientBackground())
        .navigationTitle("لك")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load(force: true) }
        .navigationDestination(item: $selectedTeam) { box in SpTeamPage(teamId: box.id) }
    }

    private var teamsStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(followedTeams) { f in
                    Button { if let id = Int(f.refId) { selectedTeam = IDBox(id: id) } } label: {
                        VStack(spacing: 6) {
                            SpTeamLogo(logo: f.refLogo ?? "", size: 44)
                            Text(f.refName)
                                .font(SportsFonts.app(size: 10.5, weight: .semibold))
                                .foregroundStyle(SpTheme.onDark)
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .frame(width: 64)
                    }
                    .buttonStyle(SpPressStyle())
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func load(force: Bool = false) async {
        await matchFollows.refresh()
        guard auth.isLoggedIn, force || mine.isEmpty else { return }
        loadingMine = mine.isEmpty
        if let r = try? await APIClient.shared.fetchPoolMine() {
            mine = r.predictions
        }
        loadingMine = false
    }
}
