package com.sabq.smart.util

/**
 * Minimal HTML → structured-paragraph parser. The Sabq backend ships
 * article bodies as HTML in the `body` / `content` field. iOS has a
 * 600-line [ArticleHtmlParser] that handles inline images, embeds,
 * blockquotes, and Twitter cards. This is the v1 Android equivalent:
 * we extract just enough to render a readable article — paragraphs,
 * headings, and inline images. Twitter/YouTube embeds and rich
 * tables fall through as plain text for now.
 *
 * Output is a list of [BlockNode] that the screen renders with one
 * composable per node.
 */
sealed interface BlockNode {
    data class Paragraph(val text: String) : BlockNode
    data class Heading(val text: String, val level: Int) : BlockNode
    data class Image(val src: String, val caption: String?) : BlockNode
    data class Quote(val text: String) : BlockNode
}

object HtmlSimpleParser {
    private val blockSplit = Regex(
        "(?i)(<p[^>]*>|</p>|<br\\s*/?>)",
    )
    private val headingRegex = Regex("(?i)<(h[1-6])[^>]*>(.+?)</\\1>")
    private val imgRegex = Regex("(?i)<img[^>]*src=\"([^\"]+)\"[^>]*(?:alt=\"([^\"]*)\")?")
    private val quoteRegex = Regex("(?i)<blockquote[^>]*>(.+?)</blockquote>", RegexOption.DOT_MATCHES_ALL)
    private val anyTag = Regex("<[^>]+>")
    private val entityMap = mapOf(
        "&nbsp;" to " ",
        "&amp;" to "&",
        "&lt;" to "<",
        "&gt;" to ">",
        "&quot;" to "\"",
        "&#39;" to "'",
        "&laquo;" to "«",
        "&raquo;" to "»",
        "&hellip;" to "…",
    )

    fun parse(html: String?): List<BlockNode> {
        if (html.isNullOrBlank()) return emptyList()

        val blocks = mutableListOf<BlockNode>()

        // First pass: extract block-level structures (headings, images,
        // quotes) by replacing them with sentinels, then process the
        // remaining text as paragraphs.

        var working = html

        headingRegex.findAll(working).forEach { match ->
            blocks += BlockNode.Heading(
                text = decodeText(stripTags(match.groupValues[2])),
                level = match.groupValues[1].drop(1).toIntOrNull() ?: 2,
            )
        }
        working = headingRegex.replace(working, "")

        imgRegex.findAll(working).forEach { match ->
            val src = match.groupValues[1]
            val alt = match.groupValues.getOrNull(2)?.takeIf { it.isNotBlank() }
            blocks += BlockNode.Image(src = src, caption = alt)
        }
        working = imgRegex.replace(working, "")

        quoteRegex.findAll(working).forEach { match ->
            blocks += BlockNode.Quote(text = decodeText(stripTags(match.groupValues[1])))
        }
        working = quoteRegex.replace(working, "")

        // Now split the remainder on paragraph boundaries.
        val paragraphs = working
            .split(blockSplit)
            .map { stripTags(it).let(::decodeText).trim() }
            .filter { it.isNotEmpty() }

        paragraphs.forEach { blocks += BlockNode.Paragraph(it) }

        return blocks
    }

    private fun stripTags(input: String): String = anyTag.replace(input, "")

    private fun decodeText(input: String): String {
        var out = input
        entityMap.forEach { (e, c) -> out = out.replace(e, c) }
        // Numeric entities: &#1234; or &#x1A;
        out = Regex("&#(\\d+);").replace(out) { m ->
            m.groupValues[1].toIntOrNull()?.toChar()?.toString() ?: m.value
        }
        out = Regex("&#x([0-9a-fA-F]+);").replace(out) { m ->
            m.groupValues[1].toIntOrNull(16)?.toChar()?.toString() ?: m.value
        }
        return out
            .replace(Regex("\\s+"), " ")
            .trim()
    }
}
