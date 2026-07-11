import Foundation
import Observation

enum GcLoadState: Equatable {
    case idle
    case loading
    case loaded
    case empty
    case failed(String)

    var isLoading: Bool { self == .loading }
}

@MainActor
@Observable
final class GcMajlisNotificationPreferenceStore {
    static let shared = GcMajlisNotificationPreferenceStore()

    private(set) var enabled = false
    private(set) var state: GcLoadState = .idle
    var message: String?

    private init() {}

    func load(force: Bool = false) async {
        if state == .loading || (!force && state == .loaded) { return }
        state = .loading
        do {
            enabled = try await APIClient.shared.fetchGcMajlisNotificationPreference().enabled
            state = .loaded
        } catch {
            state = .failed(LError(error))
        }
    }

    @discardableResult
    func setEnabled(_ newValue: Bool, requestSystemPermission: Bool = true) async -> Bool {
        if newValue && requestSystemPermission {
            let granted = await GcPushManager.shared.requestAuthorization()
            guard granted else {
                enabled = false
                message = L("majlis.notifications.denied")
                // لا نترك backend على default=true بعد رفض إذن النظام؛ وإلا
                // سيعود المفتاح مفعّلًا في الفتح التالي وتُنشأ رسائل لا يمكن عرضها.
                state = .loading
                do {
                    _ = try await APIClient.shared.updateGcMajlisNotificationPreference(enabled: false)
                    state = .loaded
                } catch {
                    state = .failed(LError(error))
                }
                return false
            }
        }

        let oldValue = enabled
        enabled = newValue
        state = .loading
        do {
            enabled = try await APIClient.shared.updateGcMajlisNotificationPreference(enabled: newValue).enabled
            state = .loaded
            message = enabled ? L("majlis.notifications.enabled") : L("majlis.notifications.disabled")
            return true
        } catch {
            enabled = oldValue
            state = .failed(LError(error))
            message = LError(error)
            return false
        }
    }
}

@MainActor
@Observable
final class GcMajlisStore {
    private(set) var majalis: [GcMajlisSummary] = []
    private(set) var state: GcLoadState = .idle
    private(set) var isMutating = false
    var notice: String?

    func load(force: Bool = false) async {
        if state == .loading || (!force && (state == .loaded || state == .empty)) { return }
        state = .loading
        do {
            majalis = try await APIClient.shared.fetchGcMyMajalis()
            state = majalis.isEmpty ? .empty : .loaded
        } catch {
            state = .failed(LError(error))
        }
    }

    func create(name: String) async throws -> GcMajlisSummary {
        isMutating = true
        defer { isMutating = false }
        let created = try await APIClient.shared.createGcMajlis(name: name)
        await reloadAfterMutation()
        notice = L("majlis.notice.created", ["name": created.name])
        return created
    }

    func join(code: String) async throws -> GcMajlisSummary {
        isMutating = true
        defer { isMutating = false }
        let joined = try await APIClient.shared.joinGcMajlis(code: code)
        await reloadAfterMutation()
        notice = L("majlis.notice.joined", ["name": joined.name])
        return joined
    }

    func leave(_ majlis: GcMajlisSummary) async throws {
        isMutating = true
        defer { isMutating = false }
        _ = try await APIClient.shared.leaveGcMajlis(majlis.id)
        majalis.removeAll { $0.id == majlis.id }
        state = majalis.isEmpty ? .empty : .loaded
        notice = majlis.isOwner ? L("majlis.notice.deleted") : L("majlis.notice.left")
    }

    private func reloadAfterMutation() async {
        do {
            majalis = try await APIClient.shared.fetchGcMyMajalis()
            state = majalis.isEmpty ? .empty : .loaded
        } catch {
            // العملية الأساسية نجحت؛ نبقي العنصر المرجع ونتيح Pull to Refresh.
            state = .failed(LError(error))
        }
    }
}

@MainActor
@Observable
final class GcMajlisDetailStore {
    let majlis: GcMajlisSummary

    private(set) var board: GcMajlisBoard?
    private(set) var matchday: GcMajlisMatchdayResponse?
    private(set) var fantasy: GcMajlisFantasyResponse?
    private(set) var championPicks: GcMajlisChampionPicksResponse?
    private(set) var harvest: GcMajlisHarvestResponse?
    private(set) var duels: GcMajlisDuelsResponse?

    private(set) var boardState: GcLoadState = .idle
    private(set) var matchdayState: GcLoadState = .idle
    private(set) var fantasyState: GcLoadState = .idle
    private(set) var championState: GcLoadState = .idle
    private(set) var harvestState: GcLoadState = .idle
    private(set) var duelsState: GcLoadState = .idle
    private(set) var duelMutationInFlight = false

    init(majlis: GcMajlisSummary) {
        self.majlis = majlis
    }

    func loadInitial(focusFixtureId: Int? = nil) async {
        let focusDate = await matchdayDate(for: focusFixtureId)
        async let boardLoad: Void = loadBoard()
        async let matchdayLoad: Void = loadMatchday(date: focusDate)
        _ = await (boardLoad, matchdayLoad)
    }

    private func matchdayDate(for fixtureId: Int?) async -> String? {
        guard let fixtureId,
              let fixtures = try? await APIClient.shared.fetchGcFixtures(),
              let fixture = fixtures.first(where: { $0.id == fixtureId }),
              let date = GcDateMath.date(from: fixture.date) else { return nil }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Riyadh")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    func refreshAll() async {
        async let boardLoad: Void = loadBoard(force: true)
        async let matchdayLoad: Void = loadMatchday(date: matchday?.date, force: true)
        async let fantasyLoad: Void = loadFantasy(force: true)
        async let championLoad: Void = loadChampionPicks(force: true)
        async let harvestLoad: Void = loadHarvest(force: true)
        async let duelsLoad: Void = loadDuels(force: true)
        _ = await (boardLoad, matchdayLoad, fantasyLoad, championLoad, harvestLoad, duelsLoad)
    }

    func loadBoard(force: Bool = false) async {
        if boardState == .loading || (!force && board != nil) { return }
        boardState = .loading
        do {
            board = try await APIClient.shared.fetchGcMajlisBoard(majlis.id)
            boardState = board?.rows.isEmpty == true ? .empty : .loaded
        } catch {
            boardState = .failed(LError(error))
        }
    }

    func loadMatchday(date: String? = nil, force: Bool = false) async {
        if matchdayState == .loading || (!force && date == nil && matchday != nil) { return }
        matchdayState = .loading
        do {
            matchday = try await APIClient.shared.fetchGcMajlisMatchday(majlis.id, date: date)
            matchdayState = matchday?.matches.isEmpty == true ? .empty : .loaded
        } catch {
            matchdayState = .failed(LError(error))
        }
    }

    func loadFantasy(force: Bool = false) async {
        if fantasyState == .loading || (!force && fantasy != nil) { return }
        fantasyState = .loading
        do {
            fantasy = try await APIClient.shared.fetchGcMajlisFantasy(majlis.id)
            fantasyState = fantasy?.rows.isEmpty == true ? .empty : .loaded
        } catch {
            fantasyState = .failed(LError(error))
        }
    }

    func loadChampionPicks(force: Bool = false) async {
        if championState == .loading || (!force && championPicks != nil) { return }
        championState = .loading
        do {
            championPicks = try await APIClient.shared.fetchGcMajlisChampionPicks(majlis.id)
            championState = championPicks?.members.isEmpty == true ? .empty : .loaded
        } catch {
            championState = .failed(LError(error))
        }
    }

    func loadHarvest(force: Bool = false) async {
        if harvestState == .loading || (!force && harvest != nil) { return }
        harvestState = .loading
        do {
            harvest = try await APIClient.shared.fetchGcMajlisHarvest(majlis.id)
            harvestState = harvest?.status == "ready" ? .loaded : .empty
        } catch {
            harvestState = .failed(LError(error))
        }
    }

    func loadDuels(force: Bool = false) async {
        if duelsState == .loading || (!force && duels != nil) { return }
        duelsState = .loading
        do {
            duels = try await APIClient.shared.fetchGcMajlisDuels(majlis.id)
            duelsState = duels?.duels.isEmpty == true ? .empty : .loaded
        } catch {
            duelsState = .failed(LError(error))
        }
    }

    func createDuel(opponentUserId: String, fixtureId: Int, stake: Int) async throws {
        duelMutationInFlight = true
        defer { duelMutationInFlight = false }
        _ = try await APIClient.shared.createGcMajlisDuel(
            majlisId: majlis.id,
            challengedUserId: opponentUserId,
            fixtureId: fixtureId,
            stake: stake
        )
        await loadDuels(force: true)
    }

    func mutate(_ duel: GcMajlisDuel, action: GcMajlisDuelAction) async throws {
        duelMutationInFlight = true
        defer { duelMutationInFlight = false }
        _ = try await APIClient.shared.mutateGcMajlisDuel(duel.id, action: action)
        await loadDuels(force: true)
    }
}
