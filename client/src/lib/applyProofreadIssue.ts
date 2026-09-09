/** Replace visible text only; never replace a matching URL/attribute or inject HTML. */
export function applyProofreadIssue(html: string, original: string, suggestion: string): string | null {
  if (!original.trim() || original === suggestion) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const chars: Array<{ node: Text | null; offset: number }> = [];
  let text = "";
  const append = (value: string, node: Text | null) => {
    for (let offset = 0; offset < value.length; offset++) {
      const char = /\s/.test(value[offset]) ? " " : value[offset];
      if (char === " " && text.endsWith(" ")) continue;
      text += char;
      chars.push({ node, offset });
    }
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { append(node.textContent || "", node as Text); return; }
    if (!(node instanceof Element)) return;
    if (["SCRIPT", "STYLE"].includes(node.tagName)) return;
    const block = /^(P|DIV|H[1-6]|LI|UL|OL|BLOCKQUOTE|BR|HR|TR|TD|TH)$/.test(node.tagName);
    if (block) append(" ", null);
    node.childNodes.forEach(walk);
    if (block) append(" ", null);
  };
  walk(doc.body);
  const source = original.replace(/\s+/g, " ").trim();
  const isWord = (value: string) => /[\p{L}\p{M}\p{N}_]/u.test(value);
  let start = text.indexOf(source);
  while (start >= 0) {
    const end = start + source.length;
    if ((!isWord(source[0]) || !isWord(text[start - 1] || "")) &&
        (!isWord(source.at(-1)!) || !isWord(text[end] || "")) &&
        chars.slice(start, end).every(c => c.node)) break;
    start = text.indexOf(source, start + 1);
  }
  if (start < 0) return null;
  // Keep unchanged prefix/suffix in their existing formatting nodes. A missing
  // space changes only one insertion point; a hamza changes only that letter.
  let prefix = 0;
  while (prefix < source.length && prefix < suggestion.length && source[prefix] === suggestion[prefix]) prefix++;
  let suffix = 0;
  while (suffix < source.length - prefix && suffix < suggestion.length - prefix && source[source.length - suffix - 1] === suggestion[suggestion.length - suffix - 1]) suffix++;
  const from = start + prefix;
  const to = start + source.length - suffix;
  const insertion = suggestion.slice(prefix, suggestion.length - suffix);
  const anchor = chars[from] ?? chars[from - 1];
  if (from === to) {
    // At the word's end insert after its final character, not into the next block.
    const point = prefix === source.length ? chars[from - 1] : anchor;
    if (!point?.node) return null;
    point.node.insertData(point.offset + (prefix === source.length ? 1 : 0), insertion);
  } else {
    if (!anchor?.node) return null;
    const last = chars[to - 1];
    if (!last?.node) return null;
    const affected = [...new Set(chars.slice(from, to).map(c => c.node!))];
    for (const node of affected) {
      const left = node === anchor.node ? anchor.offset : 0;
      const right = node === last.node ? last.offset + 1 : node.length;
      node.replaceData(left, right - left, node === anchor.node ? insertion : "");
    }
  }
  return doc.body.innerHTML;
}
