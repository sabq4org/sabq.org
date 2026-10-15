package com.sabq.smart.util

import org.junit.Assert.*
import org.junit.Test

/** نقل الويب #1512 — عرض ومحاذاة صور المحرر؛ يطابق اختبارات iOS للدفعة 1. */
class ImageLayoutTest {
    @Test fun percentAndPixelWidths() {
        assertEquals(0.5f, ImageLayout.parse("50%", null).widthFraction!!, 0.001f)
        assertEquals(0.25f, ImageLayout.parse("25%", "right").widthFraction!!, 0.001f)
        assertEquals(380f / 760f, ImageLayout.parse("380px", null).widthFraction!!, 0.001f)
        assertEquals(0.33f, ImageLayout.parse("0.33", null).widthFraction!!, 0.001f)
    }

    @Test fun fullWidthAndClamps() {
        assertNull(ImageLayout.parse("100%", null).widthFraction)
        assertNull(ImageLayout.parse("98%", null).widthFraction)
        assertNull(ImageLayout.parse(null, null).widthFraction)
        assertNull(ImageLayout.parse("", "left").widthFraction)
        assertEquals(0.2f, ImageLayout.parse("5%", null).widthFraction!!, 0.001f)
        assertNull(ImageLayout.parse("abc", null).widthFraction)
    }

    @Test fun alignment() {
        assertEquals(ImageAlign.Right, ImageLayout.parse("50%", "RIGHT ").align)
        assertEquals(ImageAlign.Left, ImageLayout.parse(null, "left").align)
        assertEquals(ImageAlign.Center, ImageLayout.parse(null, "middle").align)
        assertEquals(ImageAlign.Center, ImageLayout.parse(null, null).align)
    }

    @Test fun parserReadsEditorAttributesOnVoidAndInlineImages() {
        val html = """<img src="/a.jpg" data-width="50%" data-align="left" data-caption="تعليق" alt="بديل">""" +
            """<p><img alt="ثانية" src="https://x/b.jpg" data-width="75%" data-align="right"></p>""" +
            """<p><img src="/c.jpg"></p>"""
        val blocks = HtmlSimpleParser.parse(html).filterIsInstance<BlockNode.Image>()
        assertEquals(3, blocks.size)
        assertEquals("تعليق", blocks[0].caption)
        assertEquals("بديل", blocks[0].alt)
        assertEquals(0.5f, blocks[0].layout.widthFraction!!, 0.001f)
        assertEquals(ImageAlign.Left, blocks[0].layout.align)
        assertEquals("ثانية", blocks[1].alt)
        assertEquals(0.75f, blocks[1].layout.widthFraction!!, 0.001f)
        assertEquals(ImageAlign.Right, blocks[1].layout.align)
        assertEquals(ImageLayout.Full, blocks[2].layout)
        assertNull(blocks[2].caption)
    }
}
