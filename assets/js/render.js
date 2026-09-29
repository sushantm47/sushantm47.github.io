// Parses a model answer into plain data blocks. The DOM is built from these with
// textContent only, so nothing the model writes can inject HTML or scripts.

export function parseAnswer(text) {
  const blocks = [];
  let list = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      if (!list) {
        list = { type: "list", items: [] };
        blocks.push(list);
      }
      list.items.push(parseInline(bullet[1]));
      continue;
    }
    list = null;
    if (line) blocks.push({ type: "paragraph", inlines: parseInline(line.replace(/^#+\s*/, "")) });
  }
  return blocks;
}

export function parseInline(text) {
  const out = [];
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`|\[(\d{1,2})\]/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: "strong", value: m[1] });
    else if (m[2] !== undefined) out.push({ type: "code", value: m[2] });
    else out.push({ type: "cite", n: Number(m[3]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

// Which sources the answer actually cited, in citation order.
export function citedSources(blocks, sources) {
  const cited = new Set();
  const visit = (inlines) => inlines.forEach((i) => i.type === "cite" && cited.add(i.n));
  for (const b of blocks) b.type === "list" ? b.items.forEach(visit) : visit(b.inlines);
  const used = sources.filter((s) => cited.has(s.n));
  return used.length ? used : sources.slice(0, 3);
}

// Splits text so impact numbers ("15+", "25%", "200 to 300 GB", "5,000+") can be highlighted.
const NUMBER = /(?<![A-Za-z@.\d])\d(?:[\d,.]*\d)?(?:\+|%)?(?:\s?(?:to|–|-)\s?\d(?:[\d,.]*\d)?(?:\+|%)?)?(?:\s?(?:GB|TB|MB|ms|x)\b)?/g;

export function splitNumbers(text) {
  const parts = [];
  let last = 0;
  for (const m of String(text).matchAll(NUMBER)) {
    if (m.index > last) parts.push({ number: false, text: text.slice(last, m.index) });
    parts.push({ number: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ number: false, text: text.slice(last) });
  return parts;
}
