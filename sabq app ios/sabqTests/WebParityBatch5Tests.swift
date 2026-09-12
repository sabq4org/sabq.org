import Foundation
import Testing
@testable import sabq

// نقل تعديلات الويب — الدفعة الخامسة: البنود 13–18.
struct WebParityBatch5Tests {

    // MARK: - 13. فريق سبق الذكي

    @Test func aiTeamDecodesAndCompletesRelativeAvatars() throws {
        let json = """
        {"generatedAt":"2026-09-12T00:00:00.000Z",
         "team":[{"slug":"rased","nameAr":"راصد","titleAr":"محرر الرصد","departmentAr":"الرصد والعاجل","avatarUrl":"/ai-team/rased.jpg"},
                 {"slug":"x","nameAr":"س","titleAr":"t","departmentAr":"d","avatarUrl":""}],
         "counters":{"monthOps":0,"teamCount":16}}
        """.data(using: .utf8)!
        let team = try JSONDecoder().decode(APIAITeam.self, from: json)
        #expect(team.isRenderable)
        #expect(team.team[0].absoluteAvatarURL?.absoluteString == "https://sabq.org/ai-team/rased.jpg")
        #expect(team.team[1].absoluteAvatarURL == nil)
        #expect(team.counters?.monthOps == 0)
    }

    @Test func aiTeamWithoutMembersIsNotRenderable() throws {
        let team = try JSONDecoder().decode(APIAITeam.self, from: #"{"team":[]}"#.data(using: .utf8)!)
        #expect(!team.isRenderable)
        let missing = try JSONDecoder().decode(APIAITeam.self, from: #"{"generatedAt":"x"}"#.data(using: .utf8)!)
        #expect(!missing.isRenderable)
    }

    // MARK: - 14. المشاهدات على بطاقة الرأي

    @Test func opinionViewsDecodeAndFormatWithLatinGrouping() throws {
        let json = #"{"id":"o1","title":"رأي","content":"نص","views":1240}"#.data(using: .utf8)!
        let api = try JSONDecoder().decode(APIOpinion.self, from: json)
        let opinion = OpinionArticle.from(api)
        #expect(opinion.viewsCount == 1240)
        #expect(opinion.viewsLabel == "1,240 مشاهدة")
        #expect(SabqFormatters.groupedLatin(0) == "0")
        #expect(SabqFormatters.groupedLatin(1_250_000) == "1,250,000")
    }

    @Test func opinionViewsFallBackToZero() throws {
        let api = try JSONDecoder().decode(APIOpinion.self, from: #"{"id":"o2","title":"رأي","content":"نص"}"#.data(using: .utf8)!)
        #expect(OpinionArticle.from(api).viewsLabel == "0 مشاهدة")
    }

    // MARK: - 16. تصغير الشعار بعتبتين

    @Test func headerCompactUsesHysteresis() {
        #expect(HomeHeaderCompact.next(current: false, y: 73) == true)
        #expect(HomeHeaderCompact.next(current: false, y: 72) == false)
        #expect(HomeHeaderCompact.next(current: true, y: 40) == true)   // بين العتبتين يبقى كما هو
        #expect(HomeHeaderCompact.next(current: false, y: 40) == false)
        #expect(HomeHeaderCompact.next(current: true, y: 16) == false)
        #expect(HomeHeaderCompact.next(current: true, y: 0) == false)
    }

    // MARK: - 18. نصوص فشل التسجيل

    @Test func registrationCopyByStatus() {
        #expect(RegistrationErrorMessage.message(for: APIError.serverError(413)) == RegistrationErrorMessage.tooLarge)
        #expect(RegistrationErrorMessage.message(for: APIError.rateLimited) == RegistrationErrorMessage.tooMany)
        #expect(RegistrationErrorMessage.message(for: APIError.serverError(429)) == RegistrationErrorMessage.tooMany)
        #expect(RegistrationErrorMessage.message(for: APIError.forbidden) == RegistrationErrorMessage.forbidden)
        #expect(RegistrationErrorMessage.message(for: APIError.serverError(502)) == RegistrationErrorMessage.connection)
        #expect(RegistrationErrorMessage.message(for: APIError.serverError(408)) == RegistrationErrorMessage.connection)
        #expect(RegistrationErrorMessage.message(for: URLError(.notConnectedToInternet)) == RegistrationErrorMessage.connection)
        #expect(RegistrationErrorMessage.message(for: APIError.decodingError) == RegistrationErrorMessage.connection)
        #expect(RegistrationErrorMessage.message(for: APIError.serverError(400)) == RegistrationErrorMessage.unconfirmed)
    }

    @Test func registrationKeepsServerMessagesAndPromisesDataIsKept() {
        #expect(RegistrationErrorMessage.message(for: APIError.apiMessage("البريد مستخدم من قبل")) == "البريد مستخدم من قبل")
        #expect(RegistrationErrorMessage.connection.contains("بياناتك ما زالت في النموذج"))
        #expect(RegistrationErrorMessage.unconfirmed.contains("بياناتك ما زالت في النموذج"))
        let raw = RegistrationErrorMessage.message(for: APIError.serverError(500))
        #expect(!raw.contains("500"))
    }

    // MARK: - 10. ركلات الترجيح في توقعات سبق

    @Test func penaltiesDecodeAndFormatAwayFirst() throws {
        let r = try JSONDecoder().decode(PredScoreResult.self, from: #"{"finalHome":1,"finalAway":1,"penalties":{"home":4,"away":3}}"#.data(using: .utf8)!)
        #expect(PredScoreResult.penaltiesLabel(r.penalties) == "(3–4 ر.ت)")
        let none = try JSONDecoder().decode(PredScoreResult.self, from: #"{"finalHome":2,"finalAway":0}"#.data(using: .utf8)!)
        #expect(PredScoreResult.penaltiesLabel(none.penalties) == nil)
        #expect(PredScoreResult.penaltiesLabel(PredPenaltiesMeta(home: nil, away: 3)) == nil)
    }
}
