import Foundation
import Testing
@testable import sabq

// نقل تعديلات الويب — الدفعة الثالثة: سطر الكاتب في الخبر (#1598):
// الصورة والصفة والتوثيق و«آخر تحديث» والتاريخ/الوقت بتوقيت الرياض.
struct WebParityBatch3Tests {

    private func article(_ json: String) throws -> Article {
        Article.from(try JSONDecoder().decode(APIArticle.self, from: json.data(using: .utf8)!))
    }

    // MARK: - فكّ الحمولة

    @Test func decodesAuthorPhotoStaffAndReporter() throws {
        let a = try article("""
        {"id":"b1","title":"خبر","body":"نص","publishedAt":"2026-09-12T04:23:25.698Z",
         "reporterId":"u-1","authorId":"admin",
         "author":{"id":"u-1","firstName":"أحمد","lastName":"العلي","profileImageUrl":"https://media.sabq.org/a.jpg"},
         "staff":{"slug":"ahmad-ali","nameAr":"أحمد العلي","isVerified":true,"title":null},
         "seoMetadata":{"editorialModifiedAt":"2026-09-12T06:00:00.000Z"}}
        """)
        #expect(a.author == "أحمد العلي")
        #expect(a.authorImageURL == "https://media.sabq.org/a.jpg")
        #expect(a.authorSlug == "ahmad-ali")
        #expect(a.isAuthorVerified)
        #expect(a.authorRole == "مراسل صحفي")
        #expect(a.editorialModifiedAt != nil)
        #expect(a.lastUpdatedLabel != nil)
    }

    @Test func missingEditorialModifiedAtHidesLastUpdated() throws {
        let a = try article("""
        {"id":"b2","title":"خبر","body":"نص","publishedAt":"2026-09-12T04:23:25.698Z",
         "author":{"id":"x","firstName":"صحيفة","lastName":"سبق"},"reporterId":"x","updatedAt":"2026-09-12T05:00:00.000Z"}
        """)
        // `updatedAt` وحده لا يكفي — الويب يعرض «آخر تحديث» فقط عند تعديل تحريري مسجّل.
        #expect(a.editorialModifiedAt == nil)
        #expect(a.lastUpdatedLabel == nil)
    }

    @Test func staffNameFallsBackWhenAuthorMissing() throws {
        let a = try article("""
        {"id":"b3","title":"خبر","body":"نص","staff":{"slug":"s","nameAr":"مراسل سبق"}}
        """)
        #expect(a.author == "مراسل سبق")
        #expect(a.authorSlug == "s")
    }

    // MARK: - قواعد الصفة (كما في الويب)

    @Test func staffTitleWinsOverEverything() {
        #expect(Article.resolveAuthorRole(name: "صحيفة سبق", authorId: "a", reporterId: "a", staffTitle: " رئيس القسم الاقتصادي ") == "رئيس القسم الاقتصادي")
    }

    @Test func newspaperAccountGetsPublisherRole() {
        #expect(Article.resolveAuthorRole(name: "صحيفة سبق", authorId: "a", reporterId: "a", staffTitle: nil) == "صحيفة إلكترونية سعودية")
    }

    @Test func reporterMatchGetsReporterRole() {
        #expect(Article.resolveAuthorRole(name: "أحمد", authorId: "u-1", reporterId: "u-1", staffTitle: "") == "مراسل صحفي")
    }

    @Test func otherwiseArticleWriter() {
        #expect(Article.resolveAuthorRole(name: "أحمد", authorId: "u-1", reporterId: "u-9", staffTitle: nil) == "كاتب الخبر")
        #expect(Article.resolveAuthorRole(name: "أحمد", authorId: nil, reporterId: nil, staffTitle: nil) == "كاتب الخبر")
    }

    // MARK: - التاريخ والوقت بتوقيت الرياض بأرقام لاتينية

    @Test func publicationDateAndClockUseRiyadhAndLatinDigits() throws {
        let a = try article("""
        {"id":"b4","title":"خبر","body":"نص","publishedAt":"2026-09-12T04:23:25.698Z"}
        """)
        // 04:23 UTC = 07:23 بتوقيت الرياض
        #expect(a.publicationDate == "12 سبتمبر 2026")
        #expect(a.publicationClock.hasPrefix("07:23"))
        #expect(a.publicationClock.contains("ص"))
        // لا أرقام عربية-هندية (U+0660…U+0669) في أي موضع — مقارنة بالرموز لا بالنص.
        #expect(a.publicationClock.unicodeScalars.allSatisfy { !(0x660...0x669).contains($0.value) })
        #expect(a.publicationDate.unicodeScalars.allSatisfy { !(0x660...0x669).contains($0.value) })
        #expect(a.readingLabel.hasPrefix("قراءة "))
        #expect(a.readingLabel.hasSuffix(" دقيقة"))
    }

    @Test func reporterProfileDecodesTitle() throws {
        let json = """
        {"id":"r1","slug":"shyfh-sbq","fullName":"صحيفة سبق","title":"محرر أول","avatarUrl":null}
        """.data(using: .utf8)!
        let p = try JSONDecoder().decode(APIReporterProfile.self, from: json)
        #expect(p.title == "محرر أول")
        #expect(p.avatarUrl == nil)
    }
}
