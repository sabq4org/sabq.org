import Foundation
import Testing
@testable import sabq

// نقل تعديلات الويب إلى iOS — الدفعة الأولى (docs/web-to-apps-parity-log.md):
// عرض/محاذاة صور المحرر (#1512)، اسم القسم المجهول (#1573)، رسائل الخطأ (#1573).
struct WebParityBatch1Tests {

    // MARK: - تخطيط صور المحرر

    @Test func parsesPercentWidthAndAlignment() {
        let layout = ImageLayout.parse(width: "50%", align: "right")
        #expect(layout.widthFraction == 0.5)
        #expect(layout.align == .right)
    }

    @Test func fullWidthCollapsesToNil() {
        #expect(ImageLayout.parse(width: "100%", align: nil).widthFraction == nil)
        #expect(ImageLayout.parse(width: nil, align: nil) == .full)
    }

    @Test func pixelWidthIsRelativeToNominalColumn() {
        let layout = ImageLayout.parse(width: "380px", align: "left")
        #expect(layout.widthFraction == 380 / ImageLayout.nominalColumnWidth)
        #expect(layout.align == .left)
    }

    @Test func tinyWidthIsClampedAndUnknownAlignIsCenter() {
        let layout = ImageLayout.parse(width: "5%", align: "weird")
        #expect(layout.widthFraction == 0.2)
        #expect(layout.align == .center)
    }

    @Test func parserReadsEditorImageAttributes() {
        let html = #"<img src="https://media.sabq.org/a.webp" alt="وصف" data-width="33%" data-align="left" data-caption="تعليق الصورة">"#
        let blocks = ArticleHtmlParser.parse(html)
        guard case .image(let url, let alt, let caption, let layout) = blocks.first else {
            Issue.record("expected image block, got \(String(describing: blocks.first))")
            return
        }
        #expect(url.absoluteString == "https://media.sabq.org/a.webp")
        #expect(alt == "وصف")
        #expect(caption == "تعليق الصورة")
        #expect(layout.widthFraction == 0.33)
        #expect(layout.align == .left)
    }

    @Test func parserReadsAttributesOnParagraphWrappedImage() {
        let html = #"<p><img src="https://media.sabq.org/b.webp" data-align="right" data-width="50%"></p>"#
        let blocks = ArticleHtmlParser.parse(html)
        guard case .image(_, _, _, let layout) = blocks.first else {
            Issue.record("expected image block, got \(String(describing: blocks.first))")
            return
        }
        #expect(layout.widthFraction == 0.5)
        #expect(layout.align == .right)
    }

    @Test func plainImageKeepsFullLayout() {
        let blocks = ArticleHtmlParser.parse(#"<img src="https://media.sabq.org/c.webp">"#)
        guard case .image(_, _, let caption, let layout) = blocks.first else {
            Issue.record("expected image block")
            return
        }
        #expect(caption == nil)
        #expect(layout == .full)
    }

    // MARK: - اسم القسم المجهول

    @Test func knownSectionUsesFixedTitle() {
        #expect(Article.resolveCategoryLabel(name: "رياضة", slug: nil) == nil)
        #expect(Article.resolveCategoryLabel(name: nil, slug: "sports") == nil || Article.resolveCategoryLabel(name: nil, slug: "sports") == "رياضة")
    }

    @Test func unknownSectionKeepsServerNameInsteadOfSaudi() throws {
        let json = """
        {"id":"x1","title":"خبر","body":"نص","category":{"name":"غرائب","slug":"weird"}}
        """.data(using: .utf8)!
        let article = Article.from(try JSONDecoder().decode(APIArticle.self, from: json))
        #expect(article.categoryTitle == "غرائب")
        #expect(article.category == .saudi) // اللون فقط
    }

    @Test func missingSectionFallsBackToGenericNews() throws {
        let json = """
        {"id":"x2","title":"خبر بلا قسم","body":"نص"}
        """.data(using: .utf8)!
        let article = Article.from(try JSONDecoder().decode(APIArticle.self, from: json))
        #expect(article.categoryTitle == "أخبار")
    }

    @Test func slugOnlyUnknownSectionDerivesLabelFromSlug() {
        #expect(Article.resolveCategoryLabel(name: nil, slug: "royal-court") == "royal court")
    }

    // MARK: - رسائل الخطأ للقارئ

    @Test func mapsTransportFailuresToReaderCopy() {
        #expect(ReaderErrorMessage.classify(URLError(.timedOut), fallback: "f") == ReaderErrorMessage.timeout)
        #expect(ReaderErrorMessage.classify(URLError(.notConnectedToInternet), fallback: "f") == ReaderErrorMessage.offline)
        #expect(ReaderErrorMessage.classify(URLError(.badServerResponse), fallback: "f") == ReaderErrorMessage.connection)
    }

    @Test func mapsAPIStatusesWithoutLeakingCodes() {
        let text = ReaderErrorMessage.classify(APIError.serverError(502), fallback: "f")
        #expect(text == ReaderErrorMessage.serverError)
        #expect(!text.contains("502"))
        #expect(ReaderErrorMessage.classify(APIError.rateLimited, fallback: "f") == ReaderErrorMessage.rateLimited)
        #expect(ReaderErrorMessage.classify(APIError.notFound, fallback: "f") == ReaderErrorMessage.notFound)
        #expect(ReaderErrorMessage.classify(APIError.decodingError, fallback: "f") == ReaderErrorMessage.parse)
    }

    @Test func serverMessagesAndCancellationPassThrough() {
        #expect(ReaderErrorMessage.classify(APIError.apiMessage("تجاوزت حد الإرسال"), fallback: "f") == "تجاوزت حد الإرسال")
        #expect(ReaderErrorMessage.classify(CancellationError(), fallback: "f") == "f")
    }
}
