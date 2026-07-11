import Foundation
import Observation

enum GcTab: Hashable {
    case home, matches, predictions, tournament, more
}

enum GcPredSegment: String, CaseIterable, Identifiable {
    case matches, leaderboard, majlis, fantasy, long, mine

    var id: String { rawValue }

    var title: String {
        switch self {
        case .matches: return L("predictions.seg.matches")
        case .leaderboard: return L("predictions.seg.leaders")
        case .majlis: return L("majlis.title")
        case .fantasy: return L("predictions.seg.fantasy")
        case .long: return L("predictions.seg.long")
        case .mine: return L("predictions.seg.mine")
        }
    }
}

struct GcMajlisInviteRoute: Identifiable, Hashable, Codable {
    let code: String
    var id: String { code }
}

/// موجّه واحد للتبويبات والروابط العميقة. يحتفظ برمز الدعوة حتى يكتمل الدخول
/// ولا ينفّذ الانضمام تلقائيًا؛ تبقى للمستخدم موافقة صريحة واحدة داخل ورقة الدعوة.
@MainActor
@Observable
final class GcAppRouter {
    static let shared = GcAppRouter()

    var selectedTab: GcTab = .home
    var predictionSegment: GcPredSegment = .matches
    var pendingMajlisInvite: GcMajlisInviteRoute?
    var pendingMajlisId: String?
    var pendingMajlisFixtureId: Int?

    private let pendingInviteKey = "gc.router.pendingMajlisInvite.v1"
    private let pendingMajlisIdKey = "gc.router.pendingMajlisId.v1"
    private let pendingMajlisFixtureIdKey = "gc.router.pendingMajlisFixtureId.v1"

    private init() {
        if let code = UserDefaults.standard.string(forKey: pendingInviteKey) {
            pendingMajlisInvite = Self.validInvite(code).map { GcMajlisInviteRoute(code: $0) }
        }
        if let id = UserDefaults.standard.string(forKey: pendingMajlisIdKey) {
            pendingMajlisId = Self.validMajlisId(id)
            if pendingMajlisId == nil { UserDefaults.standard.removeObject(forKey: pendingMajlisIdKey) }
        }
        let fixtureId = UserDefaults.standard.integer(forKey: pendingMajlisFixtureIdKey)
        pendingMajlisFixtureId = pendingMajlisId != nil && fixtureId > 0 ? fixtureId : nil
        if pendingMajlisFixtureId == nil {
            UserDefaults.standard.removeObject(forKey: pendingMajlisFixtureIdKey)
        }
    }

    func openPredictions(_ segment: GcPredSegment) {
        predictionSegment = segment
        selectedTab = .predictions
    }

    func openMajlisInvite(code rawCode: String) {
        guard let code = Self.validInvite(rawCode) else { return }
        pendingMajlisInvite = GcMajlisInviteRoute(code: code)
        UserDefaults.standard.set(code, forKey: pendingInviteKey)
        openPredictions(.majlis)
    }

    func completeMajlisInvite() {
        pendingMajlisInvite = nil
        UserDefaults.standard.removeObject(forKey: pendingInviteKey)
    }

    func openMajlis(id rawId: String, fixtureId: Int? = nil) {
        guard let id = Self.validMajlisId(rawId) else { return }
        pendingMajlisId = id
        pendingMajlisFixtureId = fixtureId.flatMap { $0 > 0 ? $0 : nil }
        UserDefaults.standard.set(id, forKey: pendingMajlisIdKey)
        if let pendingMajlisFixtureId {
            UserDefaults.standard.set(pendingMajlisFixtureId, forKey: pendingMajlisFixtureIdKey)
        } else {
            UserDefaults.standard.removeObject(forKey: pendingMajlisFixtureIdKey)
        }
        openPredictions(.majlis)
    }

    func completeMajlisNavigation() {
        pendingMajlisId = nil
        pendingMajlisFixtureId = nil
        UserDefaults.standard.removeObject(forKey: pendingMajlisIdKey)
        UserDefaults.standard.removeObject(forKey: pendingMajlisFixtureIdKey)
    }

    func handle(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        let scheme = (components.scheme ?? "").lowercased()
        let host = (components.host ?? "").lowercased()
        let pathParts = components.path.split(separator: "/").map(String.init)

        let isUniversal = (scheme == "https" || scheme == "http")
            && (host == "sabq.org" || host == "www.sabq.org")
            && pathParts.count >= 2
            && pathParts[0].lowercased() == "gulf-cup"
            && pathParts[1].lowercased() == "majlis"
        let isCustom = (scheme == "sabqgulfcup" || scheme == "gulfcup")
            && (host == "majlis" || pathParts.first?.lowercased() == "majlis")

        guard isUniversal || isCustom else { return }
        let fixtureId = components.queryItems?
            .first(where: { $0.name.lowercased() == "fixture" })?
            .value
            .flatMap(Int.init)
            .flatMap { $0 > 0 ? $0 : nil }
        if let code = components.queryItems?.first(where: { $0.name.lowercased() == "code" })?.value {
            openMajlisInvite(code: code)
        } else if let id = components.queryItems?.first(where: { $0.name.lowercased() == "id" })?.value {
            openMajlis(id: id, fixtureId: fixtureId)
        } else if isUniversal, pathParts.count == 3 {
            openMajlis(id: pathParts[2], fixtureId: fixtureId)
        } else if isCustom, host == "majlis", pathParts.count == 1 {
            openMajlis(id: pathParts[0], fixtureId: fixtureId)
        } else if isCustom, host.isEmpty, pathParts.count == 2,
                  pathParts[0].lowercased() == "majlis" {
            openMajlis(id: pathParts[1], fixtureId: fixtureId)
        }
    }

    private static func validInvite(_ rawCode: String) -> String? {
        let code = rawCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard (4...8).contains(code.count),
              code.unicodeScalars.allSatisfy({ scalar in
                  (48...57).contains(scalar.value) || (65...90).contains(scalar.value)
              }) else {
            return nil
        }
        return code
    }

    private static func validMajlisId(_ rawId: String) -> String? {
        let id = rawId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (8...80).contains(id.count),
              id.unicodeScalars.allSatisfy({ scalar in
                  (48...57).contains(scalar.value) ||
                  (65...90).contains(scalar.value) ||
                  (97...122).contains(scalar.value) ||
                  scalar.value == 45
              }) else {
            return nil
        }
        return id
    }
}
