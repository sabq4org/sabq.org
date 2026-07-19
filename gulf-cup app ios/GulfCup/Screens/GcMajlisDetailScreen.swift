import SwiftUI
import UIKit

private enum GcMajlisDetailSection: String, CaseIterable, Identifiable {
    case matchday, ranking, fantasy, champion, duels, harvest
    var id: String { rawValue }

    var title: String {
        switch self {
        case .matchday: return L("majlis.detail.matchday")
        case .ranking: return L("majlis.detail.ranking")
        case .fantasy: return L("majlis.detail.fantasy")
        case .champion: return L("majlis.detail.champion")
        case .duels: return L("majlis.detail.duels")
        case .harvest: return L("majlis.detail.harvest")
        }
    }

    var icon: String {
        switch self {
        case .matchday: return "calendar"
        case .ranking: return "list.number"
        case .fantasy: return "person.3.sequence.fill"
        case .champion: return "crown.fill"
        case .duels: return "bolt.horizontal.circle.fill"
        case .harvest: return "sparkles.rectangle.stack.fill"
        }
    }
}

private enum GcMajlisExitAction: Identifiable {
    case leave, delete
    var id: String { self == .leave ? "leave" : "delete" }
}

struct GcMajlisDetailScreen: View {
    let majlis: GcMajlisSummary
    let focusFixtureId: Int?

    @Environment(GcAuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var store: GcMajlisDetailStore
    @State private var section: GcMajlisDetailSection = .matchday
    @State private var showInvite = false
    @State private var exitAction: GcMajlisExitAction?
    @State private var mutationError: String?
    @State private var isLeaving = false

    init(majlis: GcMajlisSummary, focusFixtureId: Int? = nil) {
        self.majlis = majlis
        self.focusFixtureId = focusFixtureId
        _store = State(initialValue: GcMajlisDetailStore(majlis: majlis))
    }

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 14) {
                detailHero
                sectionBar
                sectionContent
                if let mutationError {
                    Text(mutationError)
                        .font(GulfCupFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(GcTheme.crimson)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                GcFooterSignature()
            }
        }
        .navigationTitle(majlis.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(GcTheme.appBg, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showInvite = true } label: {
                        Label(L("majlis.invite.share"), systemImage: "square.and.arrow.up")
                    }
                    Divider()
                    Button(role: .destructive) {
                        exitAction = majlis.isOwner ? .delete : .leave
                    } label: {
                        Label(
                            majlis.isOwner ? L("majlis.delete.action") : L("majlis.leave.action"),
                            systemImage: majlis.isOwner ? "trash" : "rectangle.portrait.and.arrow.right"
                        )
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .frame(width: 44, height: 44)
                        .accessibilityLabel(L("majlis.moreActions"))
                }
            }
        }
        .task { await store.loadInitial(focusFixtureId: focusFixtureId) }
        .onChange(of: section) { _, value in load(value) }
        .refreshable { await store.refreshAll() }
        .sheet(isPresented: $showInvite) { GcMajlisInviteSheet(majlis: majlis) }
        .confirmationDialog(
            majlis.isOwner ? L("majlis.delete.confirm.title") : L("majlis.leave.confirm.title"),
            isPresented: Binding(
                get: { exitAction != nil },
                set: { if !$0 { exitAction = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(
                majlis.isOwner ? L("majlis.delete.confirm.action") : L("majlis.leave.confirm.action"),
                role: .destructive
            ) { Task { await leaveOrDelete() } }
            Button(L("majlis.cancel"), role: .cancel) { exitAction = nil }
        } message: {
            Text(majlis.isOwner ? L("majlis.delete.confirm.body") : L("majlis.leave.confirm.body"))
        }
        .overlay {
            if isLeaving {
                ZStack {
                    Color.black.opacity(0.15).ignoresSafeArea()
                    ProgressView().tint(GcTheme.sky).padding(20).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
            }
        }
    }

    private var detailHero: some View {
        VStack(spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    if majlis.isOwner {
                        Label(L("majlis.owner"), systemImage: "crown.fill")
                            .font(GulfCupFonts.app(size: 10, weight: .bold))
                            .foregroundStyle(GcTheme.skyDeep)
                    }
                    Text(majlis.name)
                        .font(GulfCupFonts.headline(size: 20))
                        .foregroundStyle(GcTheme.ink)
                        .lineLimit(2)
                    Text(L("majlis.members.count", ["n": "\(majlis.membersCount)"]))
                        .font(GulfCupFonts.app(size: 12))
                        .foregroundStyle(GcTheme.inkDim)
                }
                Spacer(minLength: 8)
                Button { showInvite = true } label: {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(GcTheme.skyDeep)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(GcTheme.sky.opacity(0.14)))
                }
                .buttonStyle(GcPressStyle())
                .accessibilityLabel(L("majlis.invite.share"))
            }

            HStack(spacing: 9) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(L("majlis.invite.code"))
                        .font(GulfCupFonts.app(size: 10))
                        .foregroundStyle(GcTheme.inkFaint)
                    Text(verbatim: majlis.code)
                        .font(.system(size: 16, weight: .heavy, design: .rounded).monospaced())
                        .tracking(1.5)
                        .foregroundStyle(GcTheme.skyDeep)
                        .environment(\.layoutDirection, .leftToRight)
                }
                Spacer()
                Text(L("majlis.detail.revealPromise"))
                    .font(GulfCupFonts.app(size: 10.5, weight: .semibold))
                    .foregroundStyle(GcTheme.inkDim)
                    .multilineTextAlignment(.trailing)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(GcTheme.sky.opacity(0.08)))
        }
        .padding(16)
        .gcCard()
        .padding(.top, 4)
    }

    private var sectionBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                ForEach(GcMajlisDetailSection.allCases) { item in
                    Button {
                        withAnimation(.easeOut(duration: 0.2)) { section = item }
                    } label: {
                        Label(item.title, systemImage: item.icon)
                            .font(GulfCupFonts.app(size: 11.5, weight: .bold))
                            .foregroundStyle(section == item ? .white : GcTheme.inkDim)
                            .padding(.horizontal, 13)
                            .frame(minHeight: 44)
                            .background(
                                Capsule().fill(section == item ? GcTheme.sky : GcTheme.cardBg)
                            )
                            .overlay(Capsule().stroke(section == item ? Color.clear : GcTheme.line, lineWidth: 1))
                    }
                    .buttonStyle(GcPressStyle())
                    .accessibilityAddTraits(section == item ? .isSelected : [])
                }
            }
            .padding(.vertical, 1)
        }
    }

    @ViewBuilder private var sectionContent: some View {
        switch section {
        case .matchday:
            GcMajlisMatchdayView(store: store, focusFixtureId: focusFixtureId)
        case .ranking:
            GcMajlisRankingView(store: store)
        case .fantasy:
            GcMajlisFantasyView(store: store)
        case .champion:
            GcMajlisChampionPicksView(store: store)
        case .duels:
            GcMajlisDuelsView(store: store, viewerId: auth.member?.id)
        case .harvest:
            GcMajlisHarvestView(store: store)
        }
    }

    private func load(_ section: GcMajlisDetailSection) {
        Task {
            switch section {
            case .matchday: await store.loadMatchday()
            case .ranking: await store.loadBoard()
            case .fantasy: await store.loadFantasy()
            case .champion: await store.loadChampionPicks()
            case .duels: await store.loadDuels()
            case .harvest: await store.loadHarvest()
            }
        }
    }

    private func leaveOrDelete() async {
        isLeaving = true
        mutationError = nil
        defer { isLeaving = false; exitAction = nil }
        do {
            _ = try await APIClient.shared.leaveGcMajlis(majlis.id)
            dismiss()
        } catch {
            mutationError = LError(error)
        }
    }
}

// MARK: - الترتيب

private struct GcMajlisRankingView: View {
    let store: GcMajlisDetailStore

    var body: some View {
        if let board = store.board, !board.rows.isEmpty {
            VStack(spacing: 10) {
                if let leader = board.rows.first {
                    HStack(spacing: 11) {
                        ZStack {
                            Circle().fill(GcTheme.sky.opacity(0.14)).frame(width: 48, height: 48)
                            GcPlayerPhoto(url: leader.avatar, size: 40)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L("majlis.ranking.leader"))
                                .font(GulfCupFonts.app(size: 10.5))
                                .foregroundStyle(GcTheme.inkDim)
                            Text(leader.name)
                                .font(GulfCupFonts.headline(size: 17))
                                .foregroundStyle(GcTheme.ink)
                        }
                        Spacer()
                        Text("\(leader.totalPoints)")
                            .font(GulfCupFonts.headline(size: 22))
                            .foregroundStyle(GcTheme.skyDeep)
                            .monospacedDigit()
                    }
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: GcTheme.cardRadius).fill(GcTheme.sky.opacity(0.08)))
                    .overlay(RoundedRectangle(cornerRadius: GcTheme.cardRadius).stroke(GcTheme.sky.opacity(0.20)))
                }

                VStack(spacing: 0) {
                    ForEach(Array(board.rows.enumerated()), id: \.element.id) { index, row in
                        if index > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 54) }
                        HStack(spacing: 10) {
                            Text(row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : "\(row.rank)")
                                .font(row.rank <= 3 ? .system(size: 17) : GulfCupFonts.app(size: 12, weight: .bold))
                                .foregroundStyle(GcTheme.inkDim)
                                .frame(width: 28)
                            GcPlayerPhoto(url: row.avatar, size: 30)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.name + (row.isOwner ? " 👑" : "") + ((row.isDayChampion ?? false) ? " 🏆" : ""))
                                    .font(GulfCupFonts.app(size: 12.5, weight: .semibold))
                                    .foregroundStyle(GcTheme.ink)
                                    .lineLimit(1)
                                Text(
                                    (row.isDayChampion ?? false)
                                        ? L("majlis.champion.today") + " · " + L("majlis.ranking.stats", [
                                            "correct": "\(row.correctCount)",
                                            "exact": "\(row.exactCount)",
                                        ])
                                        : L("majlis.ranking.stats", [
                                            "correct": "\(row.correctCount)",
                                            "exact": "\(row.exactCount)",
                                        ])
                                )
                                    .font(GulfCupFonts.app(size: 9.5))
                                    .foregroundStyle(GcTheme.inkDim)
                            }
                            Spacer()
                            Text("\(row.totalPoints)")
                                .font(GulfCupFonts.app(size: 15, weight: .bold))
                                .foregroundStyle(GcTheme.emeraldDeep)
                                .monospacedDigit()
                        }
                        .padding(.horizontal, 13)
                        .padding(.vertical, 9)
                        .frame(minHeight: 52)
                        .accessibilityElement(children: .combine)
                    }
                }
                .gcCard()
            }
        } else {
            GcMajlisFeatureState(
                state: store.boardState,
                loadingTitle: L("majlis.ranking.loading"),
                emptyTitle: L("majlis.ranking.empty.title"),
                emptyBody: L("majlis.ranking.empty.body")
            ) { await store.loadBoard(force: true) }
        }
    }
}

// MARK: - فانتازي المجلس

private struct GcMajlisFantasyView: View {
    let store: GcMajlisDetailStore

    var body: some View {
        if let data = store.fantasy, !data.rows.isEmpty {
            VStack(spacing: 10) {
                GcSectionHeader(
                    icon: "person.3.sequence.fill",
                    title: L("majlis.fantasy.title"),
                    subtitle: L("majlis.fantasy.body"),
                    tint: GcTheme.sky
                )
                VStack(spacing: 0) {
                    ForEach(Array(data.rows.enumerated()), id: \.element.id) { index, row in
                        if index > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 54) }
                        HStack(spacing: 10) {
                            Text("\(row.rank)")
                                .font(GulfCupFonts.app(size: 12, weight: .bold))
                                .foregroundStyle(row.rank <= 3 ? GcTheme.skyDeep : GcTheme.inkDim)
                                .frame(width: 28, height: 28)
                                .background(Circle().fill(row.rank <= 3 ? GcTheme.sky.opacity(0.12) : GcTheme.chipFill))
                            GcPlayerPhoto(url: row.avatar, size: 30)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.name + (row.isOwner ? " 👑" : ""))
                                    .font(GulfCupFonts.app(size: 12.5, weight: row.isViewer ? .bold : .semibold))
                                    .foregroundStyle(GcTheme.ink)
                                if !row.hasSquad {
                                    Text(L("majlis.fantasy.noSquad"))
                                        .font(GulfCupFonts.app(size: 9.5))
                                        .foregroundStyle(GcTheme.inkFaint)
                                }
                            }
                            Spacer()
                            Text("\(row.totalPoints)")
                                .font(GulfCupFonts.app(size: 15, weight: .bold))
                                .foregroundStyle(GcTheme.emeraldDeep)
                                .monospacedDigit()
                        }
                        .padding(.horizontal, 13).padding(.vertical, 9)
                        .frame(minHeight: 52)
                        .background(row.isViewer ? GcTheme.sky.opacity(0.06) : Color.clear)
                        .accessibilityElement(children: .combine)
                    }
                }
                .gcCard()
            }
        } else {
            GcMajlisFeatureState(
                state: store.fantasyState,
                loadingTitle: L("majlis.fantasy.loading"),
                emptyTitle: L("majlis.fantasy.empty.title"),
                emptyBody: L("majlis.fantasy.empty.body")
            ) { await store.loadFantasy(force: true) }
        }
    }
}

// MARK: - اختيارات البطل

private struct GcMajlisChampionPicksView: View {
    let store: GcMajlisDetailStore

    var body: some View {
        if let data = store.championPicks, !data.members.isEmpty {
            VStack(spacing: 10) {
                HStack(spacing: 9) {
                    Image(systemName: data.visibility == "sealed" ? "lock.fill" : "crown.fill")
                        .foregroundStyle(GcTheme.sky)
                    Text(data.visibility == "sealed"
                         ? L("majlis.championPicks.sealed")
                         : L("majlis.championPicks.revealed"))
                        .font(GulfCupFonts.app(size: 12.5, weight: .semibold))
                        .foregroundStyle(GcTheme.ink)
                    Spacer()
                }
                .padding(13)
                .gcCard()

                VStack(spacing: 0) {
                    ForEach(Array(data.members.enumerated()), id: \.element.id) { index, member in
                        if index > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 54) }
                        HStack(spacing: 10) {
                            GcPlayerPhoto(url: member.avatar, size: 30)
                            Text(member.name + (member.isOwner ? " 👑" : ""))
                                .font(GulfCupFonts.app(size: 12.5, weight: member.isViewer ? .bold : .semibold))
                                .foregroundStyle(GcTheme.ink)
                                .lineLimit(1)
                            Spacer()
                            if data.visibility == "sealed" {
                                Label(
                                    member.hasPicked ? L("majlis.championPicks.picked") : L("majlis.championPicks.notPicked"),
                                    systemImage: member.hasPicked ? "checkmark.circle.fill" : "circle.dashed"
                                )
                                .font(GulfCupFonts.app(size: 10.5, weight: .bold))
                                .foregroundStyle(member.hasPicked ? GcTheme.emerald : GcTheme.inkFaint)
                            } else if let pick = member.pick {
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text(pick.teamName)
                                        .font(GulfCupFonts.app(size: 12, weight: .bold))
                                        .foregroundStyle(GcTheme.skyDeep)
                                    if pick.points > 0 {
                                        Text("+\(pick.points)")
                                            .font(GulfCupFonts.app(size: 9.5, weight: .bold))
                                            .foregroundStyle(GcTheme.emerald)
                                    }
                                }
                            } else {
                                Text(L("majlis.championPicks.noPick"))
                                    .font(GulfCupFonts.app(size: 10.5))
                                    .foregroundStyle(GcTheme.inkFaint)
                            }
                        }
                        .padding(.horizontal, 13).padding(.vertical, 9)
                        .frame(minHeight: 52)
                        .background(member.isViewer ? GcTheme.sky.opacity(0.06) : Color.clear)
                        .accessibilityElement(children: .combine)
                    }
                }
                .gcCard()
            }
        } else {
            GcMajlisFeatureState(
                state: store.championState,
                loadingTitle: L("majlis.championPicks.loading"),
                emptyTitle: L("majlis.championPicks.empty.title"),
                emptyBody: L("majlis.championPicks.empty.body")
            ) { await store.loadChampionPicks(force: true) }
        }
    }
}

// MARK: - التحديات

private struct GcMajlisDuelsView: View {
    let store: GcMajlisDetailStore
    let viewerId: String?
    @State private var showCreate = false
    @State private var actionError: String?

    var body: some View {
        VStack(spacing: 11) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(L("majlis.duels.title"))
                        .font(GulfCupFonts.headline(size: 17))
                        .foregroundStyle(GcTheme.ink)
                    Text(L("majlis.duels.body"))
                        .font(GulfCupFonts.app(size: 10.5))
                        .foregroundStyle(GcTheme.inkDim)
                }
                Spacer()
                Button { showCreate = true } label: {
                    Label(L("majlis.duels.create"), systemImage: "plus")
                        .font(GulfCupFonts.app(size: 11.5, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .background(Capsule().fill(GcTheme.emerald))
                }
                .buttonStyle(GcPressStyle())
                .disabled(store.duels?.eligibleMembers.isEmpty != false || eligibleMatches.isEmpty)
            }
            .padding(13)
            .gcCard()

            if let actionError {
                Text(actionError)
                    .font(GulfCupFonts.app(size: 11.5, weight: .semibold))
                    .foregroundStyle(GcTheme.crimson)
            }

            if let data = store.duels, !data.duels.isEmpty {
                ForEach(data.duels) { duel in duelCard(duel) }
            } else {
                GcMajlisFeatureState(
                    state: store.duelsState,
                    loadingTitle: L("majlis.duels.loading"),
                    emptyTitle: L("majlis.duels.empty.title"),
                    emptyBody: L("majlis.duels.empty.body")
                ) { await store.loadDuels(force: true) }
            }
        }
        .sheet(isPresented: $showCreate) {
            if let data = store.duels {
                GcMajlisCreateDuelSheet(
                    store: store,
                    members: data.eligibleMembers,
                    matches: eligibleMatches
                ) { showCreate = false }
            }
        }
    }

    private var eligibleMatches: [GcMajlisMatchdayMatch] {
        let now = Date().timeIntervalSince1970
        return (store.matchday?.matches ?? []).filter {
            !$0.fixture.status.live
                && !$0.fixture.status.finished
                && Double($0.fixture.timestamp) > now
        }
    }

    private func duelCard(_ duel: GcMajlisDuel) -> some View {
        VStack(spacing: 11) {
            HStack {
                GcChip(text: duelStatus(duel.status), tint: duelTint(duel.status))
                Spacer()
                Label("\(duel.stake)", systemImage: "diamond.fill")
                    .font(GulfCupFonts.app(size: 11.5, weight: .bold))
                    .foregroundStyle(GcTheme.skyDeep)
            }
            HStack(spacing: 10) {
                participant(duel.challenger)
                VStack(spacing: 3) {
                    Image(systemName: "bolt.fill").foregroundStyle(GcTheme.sky)
                    Text(L("majlis.duels.vs"))
                        .font(GulfCupFonts.app(size: 9, weight: .bold))
                        .foregroundStyle(GcTheme.inkFaint)
                }
                participant(duel.challenged)
            }

            if let fixture = store.matchday?.matches.first(where: { $0.fixture.id == duel.fixtureId })?.fixture {
                Text("\(fixture.home.name) × \(fixture.away.name)")
                    .font(GulfCupFonts.app(size: 11.5, weight: .semibold))
                    .foregroundStyle(GcTheme.inkDim)
            }

            duelActions(duel)
        }
        .padding(13)
        .gcCard()
        .accessibilityElement(children: .contain)
    }

    private func participant(_ participant: GcMajlisDuelParticipant) -> some View {
        VStack(spacing: 5) {
            GcPlayerPhoto(url: participant.avatar, size: 38)
            Text(participant.name)
                .font(GulfCupFonts.app(size: 11.5, weight: .bold))
                .foregroundStyle(GcTheme.ink)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private func duelActions(_ duel: GcMajlisDuel) -> some View {
        if duel.status == "pending", viewerId == duel.challenged.userId {
            HStack(spacing: 8) {
                duelButton(L("majlis.duels.accept"), tint: GcTheme.emerald) { await mutate(duel, .accept) }
                duelButton(L("majlis.duels.decline"), tint: GcTheme.crimson) { await mutate(duel, .decline) }
            }
        } else if duel.status == "pending", viewerId == duel.challenger.userId {
            duelButton(L("majlis.duels.cancel"), tint: GcTheme.crimson) { await mutate(duel, .cancel) }
        }
    }

    private func duelButton(_ title: String, tint: Color, action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            Text(title)
                .font(GulfCupFonts.app(size: 11.5, weight: .bold))
                .foregroundStyle(tint)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(RoundedRectangle(cornerRadius: 12).fill(tint.opacity(0.10)))
        }
        .buttonStyle(GcPressStyle())
        .disabled(store.duelMutationInFlight)
    }

    private func mutate(_ duel: GcMajlisDuel, _ action: GcMajlisDuelAction) async {
        actionError = nil
        do { try await store.mutate(duel, action: action) }
        catch { actionError = LError(error) }
    }

    private func duelStatus(_ value: String) -> String {
        L("majlis.duels.status.\(value)")
    }

    private func duelTint(_ value: String) -> Color {
        switch value {
        case "accepted", "settled": return GcTheme.emerald
        case "declined", "cancelled", "expired": return GcTheme.inkFaint
        default: return GcTheme.skyDeep
        }
    }
}

private struct GcMajlisCreateDuelSheet: View {
    let store: GcMajlisDetailStore
    let members: [GcMajlisDuelParticipant]
    let matches: [GcMajlisMatchdayMatch]
    let onDone: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var memberId = ""
    @State private var fixtureId = 0
    @State private var stake = 50
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section(L("majlis.duels.opponent")) {
                    Picker(L("majlis.duels.opponent"), selection: $memberId) {
                        Text(L("majlis.duels.chooseOpponent")).tag("")
                        ForEach(members) { Text($0.name).tag($0.userId) }
                    }
                }
                Section(L("majlis.duels.match")) {
                    Picker(L("majlis.duels.match"), selection: $fixtureId) {
                        Text(L("majlis.duels.chooseMatch")).tag(0)
                        ForEach(matches) { match in
                            Text("\(match.fixture.home.name) × \(match.fixture.away.name)").tag(match.fixture.id)
                        }
                    }
                }
                Section(L("majlis.duels.stake")) {
                    Picker(L("majlis.duels.stake"), selection: $stake) {
                        ForEach([10, 50, 100], id: \.self) { Text("\($0) \(L("account.pts"))").tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(GcTheme.crimson) }
                }
                Section {
                    Button { Task { await create() } } label: {
                        Text(L("majlis.duels.send"))
                            .font(GulfCupFonts.app(size: 14, weight: .bold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .disabled(memberId.isEmpty || fixtureId == 0 || store.duelMutationInFlight)
                }
            }
            .navigationTitle(L("majlis.duels.create"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("auth.close")) { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .environment(\.layoutDirection, .rightToLeft)
    }

    private func create() async {
        errorMessage = nil
        do {
            try await store.createDuel(opponentUserId: memberId, fixtureId: fixtureId, stake: stake)
            dismiss()
            onDone()
        } catch { errorMessage = LError(error) }
    }
}

// MARK: - حصاد المجلس

private struct GcMajlisHarvestView: View {
    let store: GcMajlisDetailStore
    @State private var shareItem: GcShareablePng?
    @State private var renderedImage: UIImage?

    var body: some View {
        if let data = store.harvest, data.status == "ready" {
            VStack(spacing: 12) {
                harvestHero(data)
                harvestShareButton(data)
                awardSection(
                    icon: "scope",
                    title: L("majlis.harvest.accurate"),
                    rows: data.awards.mostAccurate.map {
                        ($0.name, L("majlis.harvest.accurate.detail", ["accuracy": accuracy($0.accuracy)]), $0.avatar)
                    }
                )
                awardSection(
                    icon: "flame.fill",
                    title: L("majlis.harvest.bold"),
                    rows: data.awards.boldest.map {
                        ($0.name, L("majlis.harvest.bold.detail", ["prob": probability($0.pickProb)]), $0.avatar)
                    }
                )
                awardSection(
                    icon: "repeat",
                    title: L("majlis.harvest.stubborn"),
                    rows: data.awards.stubborn.map {
                        ($0.name, L("majlis.harvest.stubborn.detail", ["team": $0.teamName, "n": "\($0.picksCount)"]), $0.avatar)
                    }
                )
            }
            .task(id: data.generatedAt) { renderShareCard(data) }
        } else {
            GcMajlisFeatureState(
                state: store.harvestState,
                loadingTitle: L("majlis.harvest.loading"),
                emptyTitle: L("majlis.harvest.pending.title"),
                emptyBody: L("majlis.harvest.pending.body")
            ) { await store.loadHarvest(force: true) }
        }
    }

    @ViewBuilder private func harvestShareButton(_ data: GcMajlisHarvestResponse) -> some View {
        if let shareItem, let renderedImage {
            ShareLink(
                item: shareItem,
                subject: Text("\(L("majlis.harvest.title")) — \(data.majlis.name)"),
                message: Text(
                    L("majlis.harvest.shareMessage", ["name": data.majlis.name])
                        + "\n\(URLConstants.webOrigin)/gulf-cup/majlis?id=\(data.majlis.id)"
                ),
                preview: SharePreview(
                    "\(L("majlis.harvest.title")) — \(data.majlis.name)",
                    image: Image(uiImage: renderedImage)
                )
            ) {
                Label(L("majlis.harvest.share"), systemImage: "square.and.arrow.up")
                    .font(GulfCupFonts.app(size: 13.5, weight: .bold))
                    .foregroundStyle(GcTheme.skyDeep)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(
                        RoundedRectangle(cornerRadius: GcTheme.buttonRadius)
                            .fill(GcTheme.sky.opacity(0.12))
                    )
            }
            .buttonStyle(GcPressStyle())
        } else {
            HStack(spacing: 8) {
                ProgressView().tint(GcTheme.sky)
                Text(L("majlis.invite.preparing"))
                    .font(GulfCupFonts.app(size: 12.5, weight: .semibold))
                    .foregroundStyle(GcTheme.inkDim)
            }
            .frame(maxWidth: .infinity, minHeight: 48)
        }
    }

    private func harvestHero(_ data: GcMajlisHarvestResponse) -> some View {
        VStack(spacing: 13) {
            Image(systemName: "trophy.fill")
                .font(.system(size: 26))
                .foregroundStyle(GcTheme.skyDeep)
                .frame(width: 52, height: 52)
                .background(Circle().fill(GcTheme.sky.opacity(0.14)))
            Text(L("majlis.harvest.title"))
                .font(GulfCupFonts.headline(size: 19))
                .foregroundStyle(GcTheme.ink)
            ForEach(data.awards.champions) { champion in
                HStack(spacing: 10) {
                    GcPlayerPhoto(url: champion.avatar, size: 38)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(champion.name)
                            .font(GulfCupFonts.app(size: 14, weight: .bold))
                            .foregroundStyle(GcTheme.ink)
                        Text(L("majlis.harvest.champion"))
                            .font(GulfCupFonts.app(size: 10.5))
                            .foregroundStyle(GcTheme.inkDim)
                    }
                    Spacer()
                    Text("\(champion.totalPoints)")
                        .font(GulfCupFonts.headline(size: 21))
                        .foregroundStyle(GcTheme.skyDeep)
                        .monospacedDigit()
                }
                .padding(11)
                .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(GcTheme.sky.opacity(0.08)))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .gcCard()
    }

    @ViewBuilder private func awardSection(icon: String, title: String, rows: [(String, String, String?)]) -> some View {
        if !rows.isEmpty {
            VStack(spacing: 10) {
                GcSectionHeader(icon: icon, title: title, tint: GcTheme.sky)
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                        if index > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 54) }
                        HStack(spacing: 10) {
                            GcPlayerPhoto(url: row.2, size: 32)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.0).font(GulfCupFonts.app(size: 12.5, weight: .bold)).foregroundStyle(GcTheme.ink)
                                Text(row.1).font(GulfCupFonts.app(size: 10.5)).foregroundStyle(GcTheme.inkDim)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 13).padding(.vertical, 10)
                    }
                }
                .gcCard()
            }
        }
    }

    private func accuracy(_ value: Double) -> String {
        value <= 1 ? "\(Int((value * 100).rounded()))%" : "\(Int(value.rounded()))%"
    }

    private func probability(_ value: Double) -> String {
        value <= 1 ? "\(Int((value * 100).rounded()))%" : "\(Int(value.rounded()))%"
    }

    @MainActor
    private func renderShareCard(_ data: GcMajlisHarvestResponse) {
        let renderer = ImageRenderer(content: GcMajlisHarvestShareCard(data: data))
        renderer.scale = 3
        renderer.isOpaque = true
        guard let image = renderer.uiImage, let png = image.pngData() else { return }
        renderedImage = image
        shareItem = GcShareablePng(data: png)
    }
}

// MARK: - حالة ميزة موحّدة

private struct GcMajlisFeatureState: View {
    let state: GcLoadState
    let loadingTitle: String
    let emptyTitle: String
    let emptyBody: String
    let retry: () async -> Void

    var body: some View {
        switch state {
        case .idle, .loading:
            GcLoadingPanel(title: loadingTitle, rows: 2)
        case .failed(let message):
            GcErrorCard(message: message, retry: retry)
        case .empty, .loaded:
            GcEmptyState(icon: "sparkles", title: emptyTitle, subtitle: emptyBody)
                .gcCard()
        }
    }
}
