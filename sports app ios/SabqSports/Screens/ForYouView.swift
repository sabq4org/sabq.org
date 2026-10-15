import SwiftUI

// صفحة «لك» — خلاصة شخصية تجمع ما يخصّ المستخدم في مكان واحد:
// مبارياته المتابَعة (بطاقة «مبارياتي» نفسها) + فِرقه المتابَعة + آخر توقّعاته
// بنتائجها. تُفتح من جرس هيدر الرئيسية. تعيد استخدام المكوّنات القائمة.
//
// «آخر توقّعاتك» على المنصة المركزية (/api/v1/predictions/me/entries) —
// كانت على مسار sports_pool المحذوف (#938) فتبقى فارغة للأبد وتوحي بأن
// الحفظ لا يعمل.
struct SpForYouView: View {
    @Environment(SpAuthStore.self) private var auth
    @Environment(SpMatchFollows.self) private var matchFollows

    @State private var mine: [PredMyEntryItem] = []
    @State private var loadingMine = false
    @State private var mineFailed = false
    @State private var selectedTeam: IDBox?

    private var followedTeams: [SpFollow] { auth.follows.filter { $0.kind == "team" } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                // مبارياتك المتابَعة (المكوّن القائم — يختفي ذاتيًّا حين لا متابعات).
                SpMyMatchesCard()

                if !followedTeams.isEmpty {
                    SpSectionHeader(icon: "star.fill", title: L("فِرقك"))
                    teamsStrip
                }

                if auth.isLoggedIn {
                    SpSectionHeader(icon: "sparkles", title: L("آخر توقّعاتك"))
                    if loadingMine {
                        SpLoading()
                    } else if mineFailed {
                        SpEmptyState(icon: "wifi.exclamationmark", title: L("تعذّر جلب توقّعاتك"),
                                     subtitle: L("اسحب للأسفل للتحديث"))
                    } else if mine.isEmpty {
                        SpEmptyState(icon: "soccerball", title: L("لم تتوقّع بعد"),
                                     subtitle: L("ابدأ من «حسابي» ← توقّعات VARA"))
                    } else {
                        VStack(spacing: 8) {
                            ForEach(mine.prefix(6)) { item in
                                NavigationLink {
                                    PredictionContestDetailView(contestId: item.contestId)
                                } label: {
                                    SpMyEntryRowCard(item: item)
                                }
                                .buttonStyle(SpPressStyle())
                            }
                        }
                    }
                } else {
                    SpEmptyState(icon: "person.crop.circle.badge.plus", title: L("سجّل الدخول"),
                                 subtitle: L("لتظهر هنا توقّعاتك وفرقك وتنبيهاتك"))
                }
            }
            .padding(16)
        }
        .background(SpAmbientBackground())
        .navigationTitle(L("لك"))
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
        do {
            mine = try await APIClient.shared.fetchPredMyEntries(limit: 6).items
            mineFailed = false
        } catch {
            mineFailed = mine.isEmpty // أبقِ المعروض إن وُجد، وأعلن الفشل بدل الصمت
        }
        loadingMine = false
    }
}

// صف توقّع من «توقعاتي» — الفريقان وزوجا التوقّع/النتيجة المعزولان ونقاط
// التسوية إن وُجدت. ينقل لتفاصيل المسابقة نفسها.
private struct SpMyEntryRowCard: View {
    let item: PredMyEntryItem

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text("\(item.metadata?.home?.name ?? "—") × \(item.metadata?.away?.name ?? "—")")
                    .font(SportsFonts.app(size: 12.5, weight: .bold))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    if let p = item.payload, let h = p.predHome, let a = p.predAway {
                        Text(L("توقّعت") + " " + PredFormat.scorePair(home: h, away: a))
                    }
                    if let r = item.result, let fh = r.finalHome, let fa = r.finalAway {
                        Text("· " + L("النتيجة") + " " + PredFormat.scorePair(home: fh, away: fa))
                    }
                }
                .font(SportsFonts.app(size: 10.5))
                .foregroundStyle(SpTheme.onDarkDim)
                .monospacedDigit()
            }
            Spacer(minLength: 6)
            statusChip
        }
        .padding(.horizontal, 13).padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(SpTheme.cardFill)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        )
    }

    @ViewBuilder
    private var statusChip: some View {
        if item.status == "settled" {
            let points = item.totalPoints ?? 0
            Text(points > 0 ? "+\(points)" : L("بلا نقاط"))
                .font(SportsFonts.app(size: 11, weight: .heavy))
                .foregroundStyle(points > 0 ? SpTheme.gold : SpTheme.onDarkFaint)
                .monospacedDigit()
        } else if item.status == "void" {
            Text(L("أُلغيت"))
                .font(SportsFonts.app(size: 10.5, weight: .bold))
                .foregroundStyle(SpTheme.onDarkFaint)
        } else {
            Text(item.status == "open" ? L("قابل للتعديل") : L("بانتظار النتيجة"))
                .font(SportsFonts.app(size: 10.5, weight: .bold))
                .foregroundStyle(SpTheme.onDarkDim)
        }
    }
}
