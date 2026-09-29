import assert from "node:assert/strict";
import { test } from "node:test";
import { citedSources, parseAnswer, parseInline } from "../assets/js/render.js";
import { excerpt, offlineAnswer } from "../assets/js/chat.js";
import { buildIndex } from "../assets/js/retrieval.js";
import { relativeTime } from "../assets/js/main.js";

test("inline markup becomes data, never HTML", () => {
  assert.deepEqual(parseInline("Uses **Redis** and `SET NX` [2]"), [
    { type: "text", value: "Uses " },
    { type: "strong", value: "Redis" },
    { type: "text", value: " and " },
    { type: "code", value: "SET NX" },
    { type: "text", value: " " },
    { type: "cite", n: 2 },
  ]);
  const evil = parseInline('<img src=x onerror="alert(1)">');
  assert.deepEqual(evil, [{ type: "text", value: '<img src=x onerror="alert(1)">' }]);
});

test("bullets are grouped into one list", () => {
  const blocks = parseAnswer("Two projects:\n- OpsPilot [1]\n- Booking [2]\nDone.");
  assert.deepEqual(blocks.map((b) => b.type), ["paragraph", "list", "paragraph"]);
  assert.equal(blocks[1].items.length, 2);
});

test("only cited sources are listed", () => {
  const sources = [1, 2, 3].map((n) => ({ n, title: `S${n}`, url: `u${n}` }));
  assert.deepEqual(citedSources(parseAnswer("A [3] B [1]"), sources).map((s) => s.n), [1, 3]);
  assert.equal(citedSources(parseAnswer("No citations."), sources).length, 3);
});

test("offline answers quote the best-matching chunks with sources", () => {
  const index = buildIndex([
    { id: "a", title: "Project: OpsPilot", url: "https://x/opspilot", text: "Incident copilot with citations." },
    { id: "b", title: "Skills", url: "", text: "Python and Go." },
  ]);
  const result = offlineAnswer(index, "What is OpsPilot?");
  assert.equal(result.mode, "offline");
  assert.equal(result.sources[0].url, "https://x/opspilot");
  assert.match(result.answer, /\*\*Project: OpsPilot\*\*/);
  assert.match(offlineAnswer(index, "zzz").answer, /couldn't find/);
});

test("excerpts cut on a word boundary", () => {
  const text = "word ".repeat(100);
  const out = excerpt(text, 50);
  assert.ok(out.length <= 51 && out.endsWith("…"));
});

test("relative time reads naturally", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  assert.equal(relativeTime("2026-09-27T01:00:00Z", now), "today");
  assert.equal(relativeTime("2026-09-20T12:00:00Z", now), "7 days ago");
  assert.equal(relativeTime("2026-06-01T12:00:00Z", now), "3 months ago");
  assert.equal(relativeTime("2024-06-01T12:00:00Z", now), "2 years ago");
});
