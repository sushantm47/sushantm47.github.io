// BM25 keyword retrieval over knowledge chunks.
// Shared by the browser (offline answers), the Cloudflare Worker (LLM context),
// and the build script. No dependencies, no DOM.

const STOPWORDS = new Set(
  ("a an and are as at be by can do does for from has have he her his how i in is it its " +
    "me my of on or she that the their them they this to was what when where which who " +
    "why will with you your about tell").split(" ")
);

export function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z0-9][a-z0-9+#.]*/g) || [])
    .map((t) => t.replace(/\.+$/, ""))
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);
}

// Tiny suffix stemmer: "projects" -> "project", "building" -> "build".
function stem(t) {
  if (/[.+#]/.test(t)) return t; // keep "node.js", "c++", "c#" intact
  if (t.length > 5 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 4 && t.endsWith("ed")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

export function buildIndex(chunks, { k1 = 1.4, b = 0.75 } = {}) {
  const docs = chunks.map((c) => {
    // Titles are short and precise, so they count twice.
    const tokens = [...tokenize(c.title), ...tokenize(c.title), ...tokenize(c.text)];
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return { chunk: c, tf, length: tokens.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const n = docs.length;
  const idf = new Map();
  for (const [t, f] of df) idf.set(t, Math.log(1 + (n - f + 0.5) / (f + 0.5)));
  const avgLength = docs.reduce((s, d) => s + d.length, 0) / Math.max(n, 1);
  return { docs, idf, avgLength, k1, b };
}

// `ignore`: terms that match everything (like the site owner's name) and only add noise.
export function search(index, query, k = 5, { ignore = [] } = {}) {
  const skip = new Set(ignore.flatMap((t) => tokenize(t)));
  const terms = [...new Set(tokenize(query))].filter((t) => !skip.has(t));
  if (!terms.length) return [];
  const { docs, idf, avgLength, k1, b } = index;
  const scored = [];
  for (const d of docs) {
    let score = 0;
    for (const t of terms) {
      const f = d.tf.get(t);
      if (!f) continue;
      const norm = k1 * (1 - b + (b * d.length) / Math.max(avgLength, 1));
      score += idf.get(t) * ((f * (k1 + 1)) / (f + norm));
    }
    if (score > 0) scored.push({ chunk: d.chunk, score });
  }
  return scored.sort((a, b2) => b2.score - a.score).slice(0, k);
}

// Split markdown into heading-scoped chunks of at most ~maxChars.
export function chunkMarkdown(markdown, { title, source, url, maxChars = 900 }) {
  const chunks = [];
  let heading = title;
  let buffer = [];
  let inCode = false;
  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (!text) return;
    for (let i = 0; i < text.length; i += maxChars) {
      chunks.push({
        id: `${source}#${chunks.length}`,
        title: heading === title ? title : `${title}: ${heading}`,
        source,
        url,
        text: text.slice(i, i + maxChars),
      });
    }
  };
  for (const line of String(markdown).split(/\r?\n/)) {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue; // code blocks rarely answer "about me" questions; keep their text only
    }
    const m = !inCode && line.match(/^#{1,4}\s+(.*\S)\s*$/);
    if (m) {
      flush();
      heading = m[1].replace(/[*_`]/g, "");
    } else {
      buffer.push(line);
    }
  }
  flush();
  return chunks;
}
