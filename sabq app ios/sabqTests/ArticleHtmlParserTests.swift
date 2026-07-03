import Foundation
import Testing
@testable import sabq

// اختبارات المحلّل الذي يحوّل HTML (TipTap) إلى بلوكات SwiftUI — أي انكسار
// هنا يشوّه عرض كل مقال في التطبيق بصمت، وهو دالة نقية بلا I/O فاختباره رخيص.
struct ArticleHtmlParserTests {

    // MARK: - البلوكات النصية الأساسية

    @Test func parsesHeadingAndParagraphWithBoldRun() {
        let blocks = ArticleHtmlParser.parse(
            "<h2>عنوان فرعي</h2><p>نص عادي <strong>غامق</strong> تكملة</p>"
        )

        #expect(blocks.count == 2)
        guard case .heading(let level, let headingRuns) = blocks[0] else {
            Issue.record("البلوك الأول ليس عنوانًا: \(blocks[0])")
            return
        }
        #expect(level == 2)
        #expect(headingRuns.map(\.text).joined() == "عنوان فرعي")

        guard case .paragraph(let runs) = blocks[1] else {
            Issue.record("البلوك الثاني ليس فقرة: \(blocks[1])")
            return
        }
        #expect(runs.map(\.text).joined() == "نص عادي غامق تكملة")
        #expect(runs.contains { $0.bold && $0.text == "غامق" })
    }

    @Test func parsesOrderedAndUnorderedLists() {
        let blocks = ArticleHtmlParser.parse(
            "<ul><li>أول</li><li>ثانٍ</li></ul><ol><li>1</li><li>2</li><li>3</li></ol>"
        )

        #expect(blocks.count == 2)
        guard case .list(let ordered1, let items1) = blocks[0],
              case .list(let ordered2, let items2) = blocks[1] else {
            Issue.record("لم يُنتج المحلّل قائمتين: \(blocks)")
            return
        }
        #expect(ordered1 == false)
        #expect(items1.count == 2)
        #expect(ordered2 == true)
        #expect(items2.count == 3)
    }

    @Test func parsesBlockquote() {
        let blocks = ArticleHtmlParser.parse("<blockquote>اقتباس مهم</blockquote>")
        guard case .blockquote(let runs) = blocks.first else {
            Issue.record("لم يُنتج blockquote: \(blocks)")
            return
        }
        #expect(runs.map(\.text).joined() == "اقتباس مهم")
    }

    @Test func skipsEmptyParagraphs() {
        let blocks = ArticleHtmlParser.parse("<p></p><p>  </p><p>نص</p>")
        #expect(blocks.count == 1)
    }

    /// انحدار: كان الماسح يتقدم محرفًا بعد كل بلوك nil (فقرة فارغة/<br>)
    /// حتى لو استُهلك الوسم كاملًا، فيأكل '<' الوسم التالي ويحوّل "p>نص"
    /// إلى فقرة نصية مشوّهة تظهر في المقال.
    @Test func nilBlocksDoNotCorruptFollowingTag() {
        let blocks = ArticleHtmlParser.parse("<p>أول</p><br><p>ثانٍ</p>")
        #expect(blocks.count == 2)
        for block in blocks {
            guard case .paragraph(let runs) = block else { continue }
            let text = runs.map(\.text).joined()
            #expect(!text.contains(">"), "نص مشوّه تسرّب من وسم مأكول: \(text)")
        }
    }

    // MARK: - الصور

    @Test func parsesStandaloneImage() {
        let blocks = ArticleHtmlParser.parse(
            #"<img src="https://cdn.sabq.org/a.jpg" alt="وصف الصورة">"#
        )
        guard case .image(let url, let alt, _) = blocks.first else {
            Issue.record("لم يُنتج بلوك صورة: \(blocks)")
            return
        }
        #expect(url.absoluteString == "https://cdn.sabq.org/a.jpg")
        #expect(alt == "وصف الصورة")
    }

    @Test func extractsImageWrappedInParagraph() {
        let blocks = ArticleHtmlParser.parse(
            #"<p><img src="https://cdn.sabq.org/b.jpg"></p>"#
        )
        guard case .image(let url, _, _) = blocks.first else {
            Issue.record("الصورة داخل <p> لم تُستخرج: \(blocks)")
            return
        }
        #expect(url.absoluteString == "https://cdn.sabq.org/b.jpg")
    }

    // MARK: - تضمين تويتر (يشمل حارس المضيف الأمني)

    @Test func parsesTweetFromBlockquoteAnchor() {
        let blocks = ArticleHtmlParser.parse(
            #"<blockquote class="twitter-tweet"><a href="https://twitter.com/sabqorg/status/123456789"></a></blockquote>"#
        )
        guard case .twitterEmbed(let url) = blocks.first else {
            Issue.record("لم يُنتج twitterEmbed: \(blocks)")
            return
        }
        #expect(url.host == "twitter.com")
    }

    @Test func tweetFallbackAcceptsTrustedHost() {
        let blocks = ArticleHtmlParser.parse(
            #"<div data-twitter-embed="true" data-embed-url="https://x.com/sabqorg/status/987"></div>"#
        )
        guard case .twitterEmbed(let url) = blocks.first else {
            Issue.record("data-embed-url موثوق لم يُقبل: \(blocks)")
            return
        }
        #expect(url.host == "x.com")
    }

    /// حارس أمني: data-embed-url لمضيف غير twitter/x يجب ألا يُصيَّر
    /// «كتغريدة» تفتح موقع تصيّد من داخل WKWebView.
    @Test func tweetFallbackRejectsUntrustedHost() {
        let blocks = ArticleHtmlParser.parse(
            #"<div data-twitter-embed="true" data-embed-url="https://evil.example.com/phish"></div>"#
        )
        if case .twitterEmbed = blocks.first {
            Issue.record("مضيف غير موثوق مرّ من حارس التضمين")
        }
    }

    // MARK: - الكيانات والفواصل

    @Test func decodesNamedEntities() {
        let blocks = ArticleHtmlParser.parse("<p>روّاد &amp; شركاء &quot;سبق&quot;</p>")
        guard case .paragraph(let runs) = blocks.first else {
            Issue.record("لم يُنتج فقرة: \(blocks)")
            return
        }
        let text = runs.map(\.text).joined()
        #expect(text.contains("&"))
        #expect(text.contains("\"سبق\""))
    }

    @Test func parsesHorizontalRuleAsDivider() {
        let blocks = ArticleHtmlParser.parse("<p>قبل</p><hr><p>بعد</p>")
        #expect(blocks.count == 3)
        guard case .divider = blocks[1] else {
            Issue.record("<hr> لم يتحول إلى divider: \(blocks)")
            return
        }
    }
}
