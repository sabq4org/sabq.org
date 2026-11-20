package com.sabq.smart.util

import org.junit.Assert.*
import org.junit.Test

/**
 * انحدار: `parse` كانت تتقدّم حرفًا بعد كل كتلة null حتى لو استُهلك الوسم كاملًا
 * (فقرة فارغة `<p>&nbsp;</p>` أو `<br>`)، فتأكل '<' الوسم التالي وتظهر
 * `p style="text-align: right">` نصًّا داخل المقال. يطابق اختبار iOS
 * `nilBlocksDoNotCorruptFollowingTag`.
 */
class HtmlSimpleParserTest {
    private fun text(block: BlockNode): String = when (block) {
        is BlockNode.Paragraph -> block.runs.joinToString("") { it.text }
        is BlockNode.Heading -> block.runs.joinToString("") { it.text }
        else -> block.toString()
    }

    @Test fun emptyNbspParagraphDoesNotEatNextTag() {
        val blocks = HtmlSimpleParser.parse(
            """<p style="text-align: right">أول</p><p style="text-align: right">&nbsp;</p><p style="text-align: right">ثانٍ</p>""",
        )
        assertEquals(listOf("أول", "ثانٍ"), blocks.map(::text))
    }

    @Test fun emptyParagraphAndBrDoNotCorruptFollowingTags() {
        val blocks = HtmlSimpleParser.parse("<p>أول</p><p></p><br><p>ثانٍ</p><h2></h2><p>ثالث</p>")
        assertEquals(listOf("أول", "ثانٍ", "ثالث"), blocks.map(::text))
        blocks.forEach { assertFalse("نص مشوّه تسرّب من وسم مأكول: ${text(it)}", text(it).contains(">") || text(it).contains("<")) }
    }

    @Test fun unknownTopLevelTagDoesNotEatNextTag() {
        val blocks = HtmlSimpleParser.parse("<section><p>داخل</p></section>")
        assertEquals(listOf("داخل"), blocks.map(::text))
    }

    @Test fun realOpinionArticleWithEmptyParagraphParsesCleanly() {
        val html = javaClass.classLoader!!.getResourceAsStream("html/opinion_empty_nbsp_paragraph.html")!!
            .readBytes().toString(Charsets.UTF_8)
        val blocks = HtmlSimpleParser.parse(html)
        // 12 فقرة في المصدر، واحدة منها فارغة (&nbsp; فقط) فتبقى 11.
        assertEquals(11, blocks.size)
        blocks.forEach {
            val t = text(it)
            assertFalse("بقايا وسم في النص: $t", t.contains("style=") || t.contains("text-align") || t.contains(">"))
        }
        assertTrue(text(blocks[8]).startsWith("خامساً"))
        assertTrue(text(blocks[9]).startsWith("إن الاحتفاظ بالمواهب"))
        assertTrue(text(blocks[10]).startsWith("المنظمات التي تهدف"))
    }
}
