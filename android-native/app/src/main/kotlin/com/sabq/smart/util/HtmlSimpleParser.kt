package com.sabq.smart.util

// Parsed structural representation of a published article body.
// The API returns `body` / `content` as TipTap-generated HTML;
// HtmlSimpleParser converts that HTML into an ordered list of these blocks.
sealed interface BlockNode {
    data class Heading(val level: Int, val runs: List<InlineRun>) : BlockNode
    data class Paragraph(val runs: List<InlineRun>) : BlockNode
    data class ListBlock(val ordered: Boolean, val items: List<List<InlineRun>>) : BlockNode
    data class Blockquote(val runs: List<InlineRun>) : BlockNode
    data class Image(val url: String, val alt: String?, val caption: String?) : BlockNode
    data class ImageGallery(val images: List<GalleryImage>) : BlockNode
    data class TwitterEmbed(val tweetUrl: String) : BlockNode
    data class VideoEmbed(val provider: VideoProvider, val embedUrl: String, val sourceUrl: String?) : BlockNode
    data class WhatsAppCta(val phone: String, val phrase: String, val url: String) : BlockNode
    object Divider : BlockNode
}

data class InlineRun(
    val text: String,
    var bold: Boolean = false,
    var italic: Boolean = false,
    var underline: Boolean = false,
    var strikethrough: Boolean = false,
    var colorHex: String? = null,
    var link: String? = null,
)

data class GalleryImage(
    val url: String,
    val caption: String?,
)

enum class VideoProvider {
    YOUTUBE,
    DAILYMOTION,
    OTHER
}

class HTMLTag(
    val name: String,
    val isClosing: Boolean,
    val attributesRaw: String
) {
    val classes: List<String> by lazy {
        val cls = attr("class") ?: ""
        cls.split(" ").map { it.trim() }.filter { it.isNotEmpty() }
    }

    fun attr(name: String): String? {
        for (q in listOf("\"", "'")) {
            val pattern = "\\b$name\\s*=\\s*$q([^$q]*)$q"
            val regex = Regex(pattern, RegexOption.IGNORE_CASE)
            val match = regex.find(attributesRaw)
            if (match != null) {
                return match.groupValues[1]
            }
        }
        return null
    }
}

class HTMLScanner(val input: String) {
    var index = 0

    fun isAtEnd(): Boolean = index >= input.length

    fun peek(): Char? {
        if (isAtEnd()) return null
        return input[index]
    }

    fun advance(n: Int = 1) {
        index = (index + n).coerceAtMost(input.length)
    }

    fun skipWhitespace() {
        while (!isAtEnd() && input[index].isWhitespace()) {
            advance(1)
        }
    }

    fun peekTag(): HTMLTag? {
        if (isAtEnd() || input[index] != '<') return null
        val close = input.indexOf('>', index)
        if (close == -1) return null
        val raw = input.substring(index, close + 1)
        return parseTag(raw)
    }

    fun consumeTag(): HTMLTag? {
        if (isAtEnd() || input[index] != '<') return null
        val close = input.indexOf('>', index)
        if (close == -1) return null
        val raw = input.substring(index, close + 1)
        index = close + 1
        return parseTag(raw)
    }

    fun consumeUntil(stop: Char): String {
        val start = index
        while (!isAtEnd() && input[index] != stop) {
            advance(1)
        }
        return input.substring(start, index)
    }

    fun consumeContainer(): String {
        val openTag = consumeTag() ?: return ""
        if (openTag.isClosing) return ""
        val start = index
        var depth = 1
        while (!isAtEnd()) {
            if (input[index] == '<') {
                val close = input.indexOf('>', index)
                if (close != -1) {
                    val raw = input.substring(index, close + 1)
                    val parsed = parseTag(raw)
                    if (parsed != null && parsed.name == openTag.name) {
                        if (parsed.isClosing) {
                            depth--
                            if (depth == 0) {
                                val inner = input.substring(start, index)
                                index = close + 1
                                return inner
                            }
                        } else {
                            depth++
                        }
                    }
                    index = close + 1
                    continue
                }
            }
            advance(1)
        }
        return input.substring(start, index)
    }

    private fun parseTag(raw: String): HTMLTag? {
        var body = raw
        if (!body.startsWith("<") || !body.endsWith(">")) return null
        body = body.substring(1, body.length - 1)
        val isClosing = body.startsWith("/")
        if (isClosing) body = body.substring(1)
        if (body.endsWith("/")) body = body.substring(0, body.length - 1)
        body = body.trim()
        if (body.isEmpty()) return null

        val nameRun = body.takeWhile { it.isLetterOrDigit() || it == '-' }
        val name = nameRun.lowercase()
        val attrsRaw = body.substring(nameRun.length).trim()
        return HTMLTag(name, isClosing, attrsRaw)
    }
}

object HtmlSimpleParser {

    fun parse(html: String?): List<BlockNode> {
        if (html.isNullOrBlank()) return emptyList()
        val normalized = normaliseWhitespace(html)
        val blocks = mutableListOf<BlockNode>()
        val scanner = HTMLScanner(normalized)

        while (!scanner.isAtEnd()) {
            scanner.skipWhitespace()
            if (scanner.isAtEnd()) break

            val block = parseNextBlock(scanner)
            if (block != null) {
                if (block is BlockNode.Paragraph && runsAreEmpty(block.runs)) continue
                blocks.add(block)
            } else {
                scanner.advance(1)
            }
        }
        return blocks
    }

    private fun parseNextBlock(scanner: HTMLScanner): BlockNode? {
        val peek = scanner.peek() ?: return null
        if (peek != '<') {
            val chunk = scanner.consumeUntil('<')
            val runs = parseInlineRuns(chunk)
            return if (runsAreEmpty(runs)) null else BlockNode.Paragraph(runs)
        }

        val tag = scanner.peekTag()
        if (tag == null) {
            scanner.advance(1)
            return null
        }

        // Self-closing / void
        if (tag.name == "hr") { scanner.consumeTag(); return BlockNode.Divider }
        if (tag.name == "br") { scanner.consumeTag(); return null }
        if (tag.name == "img") {
            scanner.consumeTag()
            val src = tag.attr("src")
            if (src != null) {
                return BlockNode.Image(url = src, alt = tag.attr("alt"), caption = null)
            }
            return null
        }

        // Custom div blocks switch on data attributes BEFORE generic tags.
        if (tag.name == "div") {
            val isGallery = tag.attr("data-image-gallery") != null || tag.classes.contains("photo-album")
            val isVideo = tag.attr("data-video-embed") != null || tag.classes.contains("video-embed") || tag.classes.contains("youtube-embed")
            val isTweet = tag.attr("data-twitter-embed") != null || tag.classes.contains("tweet-embed") || (tag.classes.contains("social-embed") && tag.attr("data-embed-type") == "twitter")
            val isWhatsApp = tag.attr("data-whatsapp-cta") != null || tag.classes.contains("whatsapp-cta-card")

            if (isGallery) {
                return parseImageGallery(scanner, tag)
            }
            if (isVideo) {
                return parseVideoEmbed(scanner, tag)
            }
            if (isTweet) {
                return parseTwitterEmbed(scanner, tag)
            }
            if (isWhatsApp) {
                return parseWhatsAppCta(scanner, tag)
            }
            // Generic div: render children as paragraph.
            val inner = scanner.consumeContainer()
            val cleaned = stripTags(inner).trim()
            if (cleaned.isEmpty()) return null
            return BlockNode.Paragraph(parseInlineRuns(inner))
        }

        // <blockquote class="twitter-tweet"> is a tweet, not a quote.
        if (tag.name == "blockquote") {
            if (tag.classes.contains("twitter-tweet")) {
                return parseTwitterEmbedFromBlockquote(scanner)
            }
            val inner = scanner.consumeContainer()
            val runs = parseInlineRuns(inner)
            return if (runsAreEmpty(runs)) null else BlockNode.Blockquote(runs)
        }

        val level = headingLevel(tag.name)
        if (level != null) {
            val inner = scanner.consumeContainer()
            val runs = parseInlineRuns(inner)
            return if (runsAreEmpty(runs)) null else BlockNode.Heading(level = level, runs = runs)
        }

        if (tag.name == "ul" || tag.name == "ol") {
            return parseList(scanner, ordered = tag.name == "ol")
        }

        if (tag.name == "p") {
            val inner = scanner.consumeContainer()
            val img = tryExtractInlineImage(inner)
            if (img != null) return img
            val runs = parseInlineRuns(inner)
            return if (runsAreEmpty(runs)) null else BlockNode.Paragraph(runs)
        }

        scanner.consumeTag()
        return null
    }

    private fun parseList(scanner: HTMLScanner, ordered: Boolean): BlockNode {
        val inner = scanner.consumeContainer()
        val items = mutableListOf<List<InlineRun>>()
        val s = HTMLScanner(inner)
        while (!s.isAtEnd()) {
            s.skipWhitespace()
            val tag = s.peekTag()
            if (tag == null || tag.name != "li") {
                s.advance(1)
                continue
            }
            val itemHTML = s.consumeContainer()
            val runs = parseInlineRuns(itemHTML)
            if (!runsAreEmpty(runs)) {
                items.add(runs)
            }
        }
        return BlockNode.ListBlock(ordered, items)
    }

    private fun parseImageGallery(scanner: HTMLScanner, tag: HTMLTag): BlockNode {
        val inner = scanner.consumeContainer()
        val images = mutableListOf<GalleryImage>()

        // Preferred path: data-images='[{...}]'. Decoded before parsing.
        val rawAttr = tag.attr("data-images")
        if (rawAttr != null) {
            val decoded = decodeEntities(rawAttr)
            try {
                val objects = decoded.split("},{", "}, {", "[{", "}]")
                for (obj in objects) {
                    if (obj.isBlank()) continue
                    val srcMatch = Regex(""""src"\s*:\s*"([^"]+)"""").find(obj)
                    val capMatch = Regex(""""caption"\s*:\s*"([^"]*)"""").find(obj)
                    val src = srcMatch?.groupValues?.get(1)
                    if (src != null) {
                        val cap = capMatch?.groupValues?.get(1)?.takeIf { it.isNotEmpty() }
                        images.add(GalleryImage(src, cap))
                    }
                }
            } catch (e: Exception) {
                // ignore
            }
        }

        // Fallback: scrape img tags inside inner
        if (images.isEmpty()) {
            val imgRegex = Regex("""<img[^>]*src="([^"]+)"[^>]*>""", RegexOption.IGNORE_CASE)
            imgRegex.findAll(inner).forEach { match ->
                val src = match.groupValues[1]
                images.add(GalleryImage(src, null))
            }
        }

        return BlockNode.ImageGallery(images)
    }

    private fun parseVideoEmbed(scanner: HTMLScanner, tag: HTMLTag): BlockNode {
        val inner = scanner.consumeContainer()
        var embedUrl = tag.attr("data-embed-url") ?: tag.attr("src") ?: ""
        val sourceUrl = tag.attr("data-url")
        
        if (embedUrl.isEmpty()) {
            val iframeRegex = Regex("""<iframe[^>]*src="([^"]+)"[^>]*>""", RegexOption.IGNORE_CASE)
            val match = iframeRegex.find(inner)
            if (match != null) {
                embedUrl = match.groupValues[1]
            }
        }
        
        return BlockNode.VideoEmbed(
            provider = detectVideoProvider(embedUrl),
            embedUrl = embedUrl,
            sourceUrl = sourceUrl
        )
    }

    private fun detectVideoProvider(url: String): VideoProvider {
        val lower = url.lowercase()
        return when {
            lower.contains("youtube") || lower.contains("youtu.be") -> VideoProvider.YOUTUBE
            lower.contains("dailymotion") || lower.contains("dai.ly") -> VideoProvider.DAILYMOTION
            else -> VideoProvider.OTHER
        }
    }

    private fun parseTwitterEmbed(scanner: HTMLScanner, tag: HTMLTag): BlockNode {
        val inner = scanner.consumeContainer()
        val url = extractTweetURL(inner) ?: tag.attr("data-embed-url") ?: tag.attr("href") ?: ""
        return if (url.isNotEmpty()) BlockNode.TwitterEmbed(url) else BlockNode.Divider
    }

    private fun parseTwitterEmbedFromBlockquote(scanner: HTMLScanner): BlockNode {
        val inner = scanner.consumeContainer()
        val url = extractTweetURL(inner)
        return if (url != null) BlockNode.TwitterEmbed(url) else BlockNode.Blockquote(parseInlineRuns(inner))
    }

    private fun parseWhatsAppCta(scanner: HTMLScanner, tag: HTMLTag): BlockNode {
        val inner = scanner.consumeContainer()
        val phone = (tag.attr("data-phone") ?: "").filter { it.isDigit() }
        val phraseAttr = tag.attr("data-phrase")?.trim().orEmpty()
        val phraseFromText = stripTags(inner).trim()
        val phrase = when {
            phraseAttr.isNotEmpty() -> phraseAttr
            phraseFromText.isNotEmpty() -> phraseFromText
            else -> "تواصل عبر واتساب"
        }
        val href = Regex("""href="(https?://wa\.me/[^"]+)"""", RegexOption.IGNORE_CASE)
            .find(inner)?.groupValues?.get(1)
            ?: phone.takeIf { it.isNotEmpty() }?.let { "https://wa.me/$it" }
        return if (href != null) {
            BlockNode.WhatsAppCta(phone = phone, phrase = phrase, url = href)
        } else {
            BlockNode.Divider
        }
    }

    private fun extractTweetURL(html: String): String? {
        val pattern = """href="(https?://(?:twitter\.com|x\.com)/[^"]+/status/[0-9]+[^"]*)""""
        val regex = Regex(pattern, RegexOption.IGNORE_CASE)
        val match = regex.find(html)
        return match?.groupValues?.get(1)
    }

    private fun tryExtractInlineImage(inner: String): BlockNode? {
        val trimmed = inner.trim()
        if (!trimmed.lowercase().startsWith("<img")) return null
        val pattern = """<img[^>]*src="([^"]+)"[^>]*(?:alt="([^"]*)")?"""
        val regex = Regex(pattern, RegexOption.IGNORE_CASE)
        val match = regex.find(trimmed) ?: return null
        val src = match.groupValues[1]
        val alt = match.groupValues.getOrNull(2)?.takeIf { it.isNotEmpty() }
        return BlockNode.Image(url = src, alt = alt, caption = null)
    }

    data class MarkFrame(
        val bold: Boolean = false,
        val italic: Boolean = false,
        val underline: Boolean = false,
        val strikethrough: Boolean = false,
        val colorHex: String? = null,
        val link: String? = null,
        val pushedBy: String
    )

    fun parseInlineRuns(html: String): List<InlineRun> {
        val runs = mutableListOf<InlineRun>()
        val s = HTMLScanner(html)
        val stack = mutableListOf<MarkFrame>()

        fun currentRunTemplate(text: String): InlineRun {
            var bold = false
            var italic = false
            var underline = false
            var strikethrough = false
            var colorHex: String? = null
            var link: String? = null

            for (frame in stack) {
                if (frame.bold) bold = true
                if (frame.italic) italic = true
                if (frame.underline) underline = true
                if (frame.strikethrough) strikethrough = true
                if (frame.colorHex != null) colorHex = frame.colorHex
                if (frame.link != null) link = frame.link
            }
            return InlineRun(text, bold, italic, underline, strikethrough, colorHex, link)
        }

        while (!s.isAtEnd()) {
            if (s.peek() == '<') {
                val tag = s.peekTag()
                if (tag == null) {
                    s.advance(1)
                    continue
                }
                if (tag.isClosing) {
                    s.consumeTag()
                    val idx = stack.indexOfLast { it.pushedBy == tag.name }
                    if (idx != -1) {
                        stack.removeAt(idx)
                    }
                } else {
                    s.consumeTag()
                    var frame = MarkFrame(pushedBy = tag.name)
                    when (tag.name) {
                        "strong", "b" -> frame = frame.copy(bold = true)
                        "em", "i" -> frame = frame.copy(italic = true)
                        "u" -> frame = frame.copy(underline = true)
                        "s", "strike", "del" -> frame = frame.copy(strikethrough = true)
                        "a" -> {
                            val href = tag.attr("href")
                            if (href != null) {
                                frame = frame.copy(link = href)
                            }
                        }
                        "span" -> {
                            val style = tag.attr("style")
                            if (style != null) {
                                val hex = colorHexFromStyle(style)
                                if (hex != null) {
                                    frame = frame.copy(colorHex = hex)
                                }
                            }
                        }
                        "br" -> {
                            runs.add(currentRunTemplate("\n"))
                            continue
                        }
                    }
                    stack.add(frame)
                }
            } else {
                val chunk = s.consumeUntil('<')
                if (chunk.isEmpty()) continue
                val decoded = decodeEntities(chunk)
                runs.add(currentRunTemplate(decoded))
            }
        }

        return mergeAdjacentRuns(runs)
    }

    private fun mergeAdjacentRuns(runs: List<InlineRun>): List<InlineRun> {
        if (runs.isEmpty()) return emptyList()
        val out = mutableListOf<InlineRun>()
        for (run in runs) {
            val last = out.lastOrNull()
            if (last != null &&
                last.bold == run.bold &&
                last.italic == run.italic &&
                last.underline == run.underline &&
                last.strikethrough == run.strikethrough &&
                last.colorHex == run.colorHex &&
                last.link == run.link
            ) {
                out[out.size - 1] = last.copy(text = last.text + run.text)
            } else {
                out.add(run)
            }
        }
        return out
    }

    private fun runsAreEmpty(runs: List<InlineRun>): Boolean {
        val text = runs.joinToString("") { it.text }
        return text.trim().isEmpty()
    }

    private fun colorHexFromStyle(style: String): String? {
        val lower = style.lowercase()
        val regex = Regex("color\\s*:\\s*", RegexOption.IGNORE_CASE)
        val match = regex.find(lower) ?: return null
        val rest = lower.substring(match.range.last + 1).trim()
        if (rest.startsWith("#")) {
            val hex = rest.drop(1).takeWhile { "0123456789abcdef".contains(it) }
            return if (hex.length == 3) {
                hex.map { "$it$it" }.joinToString("")
            } else {
                hex
            }
        }
        if (rest.startsWith("rgb")) {
            val rgbPattern = Regex("rgba?\\((\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)")
            val m = rgbPattern.find(rest)
            if (m != null && m.groupValues.size >= 4) {
                val r = m.groupValues[1].toIntOrNull() ?: 0
                val g = m.groupValues[2].toIntOrNull() ?: 0
                val b = m.groupValues[3].toIntOrNull() ?: 0
                return String.format("%02x%02x%02x", r, g, b)
            }
        }
        return null
    }

    private fun headingLevel(tagName: String): Int? {
        if (tagName.length == 2 && tagName.startsWith("h")) {
            val digit = tagName.substring(1).toIntOrNull()
            if (digit in 1..6) return digit
        }
        return null
    }

    private fun stripTags(html: String): String {
        return html.replace(Regex("<[^>]+>"), "")
    }

    private fun decodeEntities(input: String): String {
        var out = input
        val entities = listOf(
            "&amp;" to "&",
            "&lt;" to "<",
            "&gt;" to ">",
            "&quot;" to "\"",
            "&apos;" to "'",
            "&#39;" to "'",
            "&nbsp;" to " ",
            "&hellip;" to "…",
            "&mdash;" to "—",
            "&ndash;" to "–",
            "&laquo;" to "«",
            "&raquo;" to "»"
        )
        for ((k, v) in entities) {
            out = out.replace(k, v)
        }
        // Decodes &#(dec); pattern
        val regex = Regex("&#([0-9]+);")
        out = regex.replace(out) { matchResult ->
            val scalar = matchResult.groupValues[1].toIntOrNull()
            if (scalar != null) {
                scalar.toChar().toString()
            } else {
                matchResult.value
            }
        }
        return out
    }

    private fun normaliseWhitespace(html: String): String {
        var result = html.replace("\r\n", "\n")
        result = result.replace(Regex(">\\s+<"), "><")
        return result
    }
}
