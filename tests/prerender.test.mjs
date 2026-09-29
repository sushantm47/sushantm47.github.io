import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { description, escapeHtml, headTags, heroHtml, replaceBlock, sitemap } from "../scripts/prerender.mjs";

const profile = JSON.parse(await readFile(new URL("../data/profile.json", import.meta.url), "utf8"));

test("head tags carry the name, description, canonical URL, and valid JSON-LD", () => {
  const head = headTags(profile);
  assert.match(head, /<title>Sushant Mudalgi, Software engineer<\/title>/);
  assert.match(head, /<link rel="canonical" href="https:\/\/sushantm47.github.io\/">/);
  const ld = JSON.parse(head.match(/application\/ld\+json">(.*)<\/script>/)[1]);
  assert.equal(ld["@type"], "Person");
  assert.ok(ld.sameAs.includes("https://github.com/sushantm47"));
});

test("text is escaped so profile content can't break the page", () => {
  assert.equal(escapeHtml('<b>"x" & y</b>'), "&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;");
  const evil = { ...profile, name: "</script><script>alert(1)</script>" };
  assert.ok(!headTags(evil).includes("</script><script>"));
  assert.ok(heroHtml(evil).includes("&lt;/script&gt;"));
});

test("description fits a search snippet", () => {
  assert.equal(description(profile), "Sushant Mudalgi, software engineer in Boston, MA. I build dependable software, from data pipelines to APIs to AI agents.");
  assert.ok(description({ ...profile, headline: "word ".repeat(100) }).length <= 160);
});

test("index.html has both prerender blocks and they are replaceable", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const out = replaceBlock(replaceBlock(html, "head", "<title>T</title>"), "hero", "<h1>H</h1>");
  assert.match(out, /<title>T<\/title>/);
  assert.match(out, /<h1>H<\/h1>/);
  assert.throws(() => replaceBlock("<html></html>", "head", "x"), /missing/);
});

test("sitemap lists the site URL", () => {
  assert.match(sitemap("https://a.github.io/", new Date("2026-09-27")), /<loc>https:\/\/a.github.io\/<\/loc><lastmod>2026-09-27/);
});
