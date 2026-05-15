import Foundation
import Testing
@testable import sabq

struct APIArticleDecodingTests {

    @Test func decodesStringTagsFromArticleDetailPayload() throws {
        let json = """
        {
          "id": "article-1",
          "title": "خبر تجريبي",
          "body": "نص الخبر",
          "section": "محليات",
          "author": "سبق",
          "published_at": "2026-03-29T05:12:58.951Z",
          "tags": ["الرياض", "طقس", "أمطار"]
        }
        """.data(using: .utf8)!

        let article = try JSONDecoder().decode(APIArticle.self, from: json)

        #expect(article.keywords == ["الرياض", "طقس", "أمطار"])
        #expect(Article.from(article).tags == ["الرياض", "طقس", "أمطار"])
    }

    @Test func decodesSEOKeywordsWhenTopLevelTagsEmpty() throws {
        let json = """
        {
          "id": "article-2",
          "title": "الإمارات: سقوط شظايا",
          "content": "نص الخبر",
          "slug": "test-slug",
          "publishedAt": "2026-04-04T07:04:38.077Z",
          "seo": {
            "keywords": ["الإمارات", "دبي", "سقوط شظايا", "اعتراض جوي"],
            "metaTitle": "عنوان",
            "metaDescription": "وصف"
          }
        }
        """.data(using: .utf8)!

        let article = try JSONDecoder().decode(APIArticle.self, from: json)
        #expect(article.keywords == ["الإمارات", "دبي", "سقوط شظايا", "اعتراض جوي"])
    }

    @Test func decodesFallsToTopLevelTagsWhenSEOKeywordsEmpty() throws {
        let json = """
        {
          "id": "article-3",
          "title": "خبر مع seo فارغ",
          "content": "نص",
          "publishedAt": "2026-04-04T07:00:00.000Z",
          "seo": {
            "keywords": [],
            "metaTitle": "عنوان"
          },
          "tags": ["وزارة الداخلية", "الرياض"]
        }
        """.data(using: .utf8)!

        let article = try JSONDecoder().decode(APIArticle.self, from: json)
        #expect(article.keywords == ["وزارة الداخلية", "الرياض"])
    }

    @Test func decodesV1EmptyTagsThenEnrichment() throws {
        let v1Json = """
        {
          "id": "CM4pE68IXuOHeMmcJ-zRT",
          "title": "الإمارات: سقوط شظايا",
          "body": "نص الخبر",
          "section": "العالم",
          "author": "صحيفة سبق",
          "published_at": "2026-04-04T07:04:38.077Z",
          "tags": []
        }
        """.data(using: .utf8)!

        let v1Article = try JSONDecoder().decode(APIArticle.self, from: v1Json)
        #expect(v1Article.keywords?.isEmpty == true)

        let enriched = v1Article.withKeywords(["الإمارات", "دبي", "سقوط شظايا"])
        #expect(enriched.keywords == ["الإمارات", "دبي", "سقوط شظايا"])
        #expect(Article.from(enriched).tags == ["الإمارات", "دبي", "سقوط شظايا"])
    }
}
