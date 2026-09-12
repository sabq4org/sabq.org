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

    /// جدول المحرر (sabq-table): الرؤوس <th> صفٌّ مستقل، والخلايا لا تتناثر كفقرات.
    @Test func parsesSabqTableIntoHeaderAndRows() {
        let blocks = ArticleHtmlParser.parse(
            "<p>قبل</p><table class=\"sabq-table\" style=\"min-width: 100px\"><colgroup><col style=\"min-width: 25px\"><col></colgroup><tbody>"
            + "<tr><th colspan=\"1\" rowspan=\"1\"><p style=\"text-align: center\">القطاع</p></th><th><p><span style=\"color: rgb(20, 20, 20)\"><strong>القيمة</strong></span></p></th></tr>"
            + "<tr><td><p>المطاعم</p></td><td><p>1,667.8</p></td></tr>"
            + "<tr><td><p>الوقود</p></td><td><p>960.4</p></td></tr>"
            + "</tbody></table><p>بعد</p>"
        )

        #expect(blocks.count == 3)
        guard case .table(let header, let rows, let cardStyle) = blocks[1] else {
            Issue.record("البلوك الأوسط ليس جدولًا: \(blocks)")
            return
        }
        #expect(cardStyle == false)
        #expect(header?.map { $0.map(\.text).joined() } == ["القطاع", "القيمة"])
        #expect(rows.count == 2)
        #expect(rows[0].map { $0.map(\.text).joined() } == ["المطاعم", "1,667.8"])
        #expect(rows[1].map { $0.map(\.text).joined() } == ["الوقود", "960.4"])
        guard case .paragraph(let after) = blocks[2] else {
            Issue.record("الفقرة بعد الجدول ضاعت: \(blocks)")
            return
        }
        #expect(after.map(\.text).joined() == "بعد")
    }

    /// جدول بلا <th>: كل الصفوف بيانات ولا رأس، ومظهر البطاقة يُلتقط من الـclass.
    @Test func parsesHeaderlessCardTable() {
        let blocks = ArticleHtmlParser.parse(
            "<table class=\"sabq-table sabq-table--card\"><tbody><tr><td>المسار</td><td>الوصف</td></tr></tbody></table>"
        )
        guard case .table(let header, let rows, let cardStyle) = blocks.first else {
            Issue.record("لم يُنتج جدولًا: \(blocks)")
            return
        }
        #expect(header == nil)
        #expect(rows.count == 1)
        #expect(cardStyle == true)
    }

    @Test func parsesBlockquote() {
        let blocks = ArticleHtmlParser.parse("<blockquote>اقتباس مهم</blockquote>")
        guard case .blockquote(let runs, let attribution) = blocks.first else {
            Issue.record("لم يُنتج blockquote: \(blocks)")
            return
        }
        #expect(runs.map(\.text).joined() == "اقتباس مهم")
        #expect(attribution == nil)
    }

    /// «المقولة» — القائل في فقرة واحدة: يُفصل القائل عن النص.
    @Test func splitsQuoteAttribution() {
        let blocks = ArticleHtmlParser.parse(
            "<blockquote><p>«الاتفاق يسهم في إنعاش الصناعة النووية» — روبرت أينهورن، المسؤول السابق في الخارجية الأمريكية</p></blockquote>"
        )
        guard case .blockquote(let runs, let attribution) = blocks.first else {
            Issue.record("لم يُنتج blockquote: \(blocks)")
            return
        }
        #expect(runs.map(\.text).joined() == "«الاتفاق يسهم في إنعاش الصناعة النووية»")
        #expect(attribution?.map(\.text).joined() == "روبرت أينهورن، المسؤول السابق في الخارجية الأمريكية")
    }

    /// شرطة داخل المقولة نفسها (قبل قفل «») لا تُفصل كقائل.
    @Test func doesNotSplitDashInsideQuote() {
        let blocks = ArticleHtmlParser.parse(
            "<blockquote><p>«العلاقات الأمريكية - السعودية تتعزز»</p></blockquote>"
        )
        guard case .blockquote(_, let attribution) = blocks.first else {
            Issue.record("لم يُنتج blockquote: \(blocks)")
            return
        }
        #expect(attribution == nil)
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
        guard case .image(let url, let alt, _, _) = blocks.first else {
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
        guard case .image(let url, _, _, _) = blocks.first else {
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

    // MARK: - الاسترداد من HTML مشوّه

    /// انحدار: وسم حاوية لم يُغلق أبدًا كان يبتلع كل ما بعده (صور/عناوين/فقرات)
    /// داخل بلوك واحد فتختفي بقية المقال. بعد الاسترداد تُحلَّل البلوكات التالية
    /// كبلوكات عليا وتظهر كلها.
    @Test func unclosedContainerDoesNotSwallowRestOfDocument() {
        let blocks = ArticleHtmlParser.parse(
            #"<div class="broken"><p>فقرة أولى</p><h2>عنوان تالٍ</h2><img src="https://cdn.sabq.org/c.jpg">"#
        )
        let joinedText = blocks.compactMap { block -> String? in
            if case .paragraph(let runs) = block { return runs.map(\.text).joined() }
            return nil
        }.joined()
        #expect(joinedText.contains("فقرة أولى"), "الفقرة داخل الحاوية المكسورة اختفت: \(blocks)")
        #expect(
            blocks.contains { if case .heading = $0 { return true } else { return false } },
            "العنوان بعد الحاوية المكسورة ابتُلع: \(blocks)"
        )
        #expect(
            blocks.contains { if case .image = $0 { return true } else { return false } },
            "الصورة بعد الحاوية المكسورة ابتُلعت: \(blocks)"
        )
    }

    /// الحاويات السليمة المتداخلة يجب ألا يتغيّر سلوكها مع منطق الاسترداد.
    @Test func wellFormedNestedContainersUnaffectedByRecovery() {
        let blocks = ArticleHtmlParser.parse(
            "<div><div><p>متداخل</p></div></div><p>بعد الحاوية</p>"
        )
        let texts = blocks.compactMap { block -> String? in
            if case .paragraph(let runs) = block { return runs.map(\.text).joined() }
            return nil
        }
        #expect(texts.contains { $0.contains("متداخل") })
        #expect(texts.contains { $0.contains("بعد الحاوية") })
    }
}
