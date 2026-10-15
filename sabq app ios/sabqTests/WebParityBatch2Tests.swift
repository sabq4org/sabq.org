import Foundation
import Testing
@testable import sabq

// نقل تعديلات الويب — الدفعة الثانية: معرّف التصنيف لبلوك «مقالات قد تهمك»،
// ورأس مزوّد الصوت لإسناد «الصوت عبر HUMAIN».
struct WebParityBatch2Tests {

    @Test func decodesNestedCategoryIdForRelatedOpinions() throws {
        let json = """
        {"id":"a1","title":"خبر","body":"نص","category":{"id":"cat-77","nameAr":"رياضة","slug":"sports"}}
        """.data(using: .utf8)!
        let api = try JSONDecoder().decode(APIArticle.self, from: json)
        #expect(api.categoryId == "cat-77")
        #expect(Article.from(api).categoryId == "cat-77")
    }

    @Test func decodesFlatCategoryIdVariants() throws {
        let camel = try JSONDecoder().decode(APIArticle.self, from: """
        {"id":"a2","title":"خبر","body":"نص","categoryId":"cat-1","section":"محليات"}
        """.data(using: .utf8)!)
        let snake = try JSONDecoder().decode(APIArticle.self, from: """
        {"id":"a3","title":"خبر","body":"نص","category_id":"cat-2"}
        """.data(using: .utf8)!)
        #expect(camel.categoryId == "cat-1")
        #expect(snake.categoryId == "cat-2")
    }

    @Test func missingCategoryIdStaysNil() throws {
        let api = try JSONDecoder().decode(APIArticle.self, from: """
        {"id":"a4","title":"خبر","body":"نص"}
        """.data(using: .utf8)!)
        #expect(api.categoryId == nil)
    }

    @Test func providerHeaderIsNormalised() throws {
        let url = try #require(URL(string: "https://api.sabq.org/api/articles/x/summary-audio"))
        let humain = try #require(HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil,
                                                  headerFields: ["X-TTS-Provider": " HUMAIN ", "Content-Type": "audio/wav"]))
        #expect(SabqAudioPlayer.providerName(from: humain) == "humain")
        #expect(SabqAudioPlayer.fileExtension(forContentType: humain.value(forHTTPHeaderField: "Content-Type")) == "wav")

        let none = try #require(HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil,
                                                headerFields: ["Content-Type": "audio/mpeg"]))
        #expect(SabqAudioPlayer.providerName(from: none) == nil)
        #expect(SabqAudioPlayer.fileExtension(forContentType: "audio/mpeg") == "mp3")
        #expect(SabqAudioPlayer.fileExtension(forContentType: nil) == "mp3")
    }

    @Test func itemDefaultsToStreamingDelivery() throws {
        let url = try #require(URL(string: "https://media.sabq.org/n.mp3"))
        let item = SabqAudioPlayer.Item(key: "k", url: url, title: "t", subtitle: nil, artworkURL: nil)
        #expect(item.delivery == .stream)
    }
}
