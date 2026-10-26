// A small Markdown parser for README case studies. It returns plain data (blocks and inline
// parts); the page builds DOM nodes from that with textContent, so README content can never
// inject HTML or scripts. Raw HTML and images are dropped; links must be http(s) or are
// resolved against the repository on GitHub.

const FENCE = /^(```|~~~)\s*([\w-]*)\s*$/;

export function parseMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  const isBreak = (line) =>
    !line.trim() || /^(#{1,6})\s/.test(line) || FENCE.test(line) || /^\s*([-*+]|\d+[.)])\s+/.test(line) ||
    /^\s*>/.test(line) || /^\s*\|.*\|\s*$/.test(line) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = FENCE.exec(line);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence[1])) body.push(lines[i++]);
      i++;
      blocks.push({ type: "code", lang: fence[2], text: body.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, inlines: parseInline(heading[2]) });
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push({ type: "rule" }); i++; continue; }
    if (/^\s*</.test(line)) { i++; continue; } // raw HTML (badges, <details>) is skipped

    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || "")) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => parseInline(c.trim()));
      const head = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push({ type: "table", head, rows });
      continue;
    }
    const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      const ordered = /\d/.test(item[1]);
      const items = [];
      while (i < lines.length) {
        const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m) { items.push(m[2]); i++; continue; }
        if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1] += ` ${lines[i].trim()}`; i++; continue; }
        break;
      }
      blocks.push({ type: "list", ordered, items: items.map(parseInline) });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push({ type: "quote", inlines: parseInline(quote.join(" ")) });
      continue;
    }
    const para = [];
    while (i < lines.length && !(para.length && isBreak(lines[i]))) para.push(lines[i++].trim());
    const inlines = parseInline(para.join(" "));
    // A line of only badges leaves nothing visible; drop it, but keep spacing everywhere else.
    if (inlines.some((p) => p.type !== "text" || p.value.trim())) blocks.push({ type: "paragraph", inlines });
  }
  return blocks;
}

const LINKED_IMAGE = /\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g; // badges: [![CI](svg)](link)

export function parseInline(text) {
  text = String(text).replace(LINKED_IMAGE, "");
  const out = [];
  const pattern = /!\[[^\]]*\]\([^)]*\)|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|<[^>]+>/g;
  let last = 0;
  for (const m of String(text).matchAll(pattern)) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: "link", value: m[1], href: m[2] });
    else if (m[3] !== undefined) out.push({ type: "code", value: m[3] });
    else if (m[4] !== undefined || m[5] !== undefined) out.push({ type: "strong", value: m[4] ?? m[5] });
    else if (m[6] !== undefined) out.push({ type: "em", value: m[6] });
    // images and inline HTML are dropped
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

// Links in a README are relative to the repository; anything that isn't http(s) is resolved
// to the file on GitHub, and other schemes (javascript:, data:) are refused.
export function safeHref(href, repo) {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("#") || /^[a-z]+:/i.test(href)) return null;
  return `https://github.com/${repo}/blob/HEAD/${href.replace(/^\.?\//, "")}`;
}

// The first block is usually the README's own H1 and badges; the case study already shows them.
export function withoutTitle(blocks) {
  return blocks[0]?.type === "heading" && blocks[0].level === 1 ? blocks.slice(1) : blocks;
}
