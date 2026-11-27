import Foundation

// MARK: - إضافات مقال الرأي (/api/v1/opinion-extras)
//
// نظير OpinionExtrasView في server/services/opinionReaderExtrasService.ts.

nonisolated struct APIOpinionAgreeState: Decodable, Equatable {
    let pollId: String
    let agree: Int
    let disagree: Int
    let agreePct: Int
    let disagreePct: Int
    let total: Int
    /// "agree" | "disagree" | nil
    let userChoice: String?

    var hasVoted: Bool { userChoice != nil }
}

nonisolated struct APIOpinionExtras: Decodable, Equatable {
    let articleId: String
    let canEdit: Bool
    let pullQuote: String?
    let agreeVoteEnabled: Bool
    let agree: APIOpinionAgreeState?
    let quoteCardUrl: String?
}

/// معرّف ثابت للجهاز يرسل في X-Session-Id لتصويت القارئ غير المسجّل.
/// لا يحمل أي بيانات شخصية؛ يُنشأ مرة ويبقى في UserDefaults.
nonisolated enum OpinionVoterIdentity {
    private static let defaultsName = "sabq.opinionVoterIdentity"

    static var current: String {
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: defaultsName), !existing.isEmpty {
            return existing
        }
        let fresh = "ios-\(UUID().uuidString.lowercased())"
        defaults.set(fresh, forKey: defaultsName)
        return fresh
    }
}
