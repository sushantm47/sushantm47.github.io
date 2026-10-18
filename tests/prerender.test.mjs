import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { analyticsTag, description, eduHtml, escapeHtml, fillStatic, headTags, rolesHtml, statsHtml, tilesHtml, heroHtml, replaceBlock, sitemap, stampHtml, stampImports } from "../scripts/prerender.mjs";

const profile = JSON.parse(await readFile(new URL("../data/profile.json", import.meta.url), "utf8"));

test("head tags carry a search-friendly title, description, canonical URL, and preview image", () => {
  const head = headTags(profile);
  assert.match(head, /<title>Sushant Mudalgi \| Software Engineer, Data and AI \| Boston<\/title>/);
  assert.match(head, /<link rel="canonical" href="https:\/\/sushantm47.github.io\/">/);
  assert.match(head, /<meta name="robots" content="index, follow, max-image-preview:large">/);
  assert.match(head, /<meta property="og:image" content="https:\/\/sushantm47.github.io\/assets\/img\/og.png">/);
  assert.match(head, /<meta name="twitter:card" content="summary_large_image">/);
});

test("structured data describes a profile page, the person, and each project", () => {
  const head = headTags(profile);
  const ld = JSON.parse(head.match(/application\/ld\+json">(.*?)<\/script>/)[1]);
  const types = ld["@graph"].map((n) => n["@type"]);
  assert.equal(types[0], "ProfilePage");
  const person = ld["@graph"].find((n) => n["@type"] === "Person");
  assert.equal(ld["@graph"][0].mainEntity["@id"], person["@id"]);
  assert.ok(person.sameAs.includes("https://github.com/sushantm47"));
  assert.ok(person.alumniOf.some((o) => o.name === "Takeda"));
  assert.ok(person.alumniOf.some((o) => o.name === "Northeastern University"));
  const code = ld["@graph"].filter((n) => n["@type"] === "SoftwareSourceCode");
  assert.equal(code.length, profile.projects.length);
  assert.ok(code.every((c) => c.codeRepository.startsWith("https://github.com/")));
});

test("text is escaped so profile content can't break the page", () => {
  assert.equal(escapeHtml('<b>"x" & y</b>'), "&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;");
  const evil = { ...profile, name: "</script><script>alert(1)</script>", headline: "<img src=x onerror=alert(1)>" };
  assert.ok(!headTags(evil).includes("</script><script>"));
  assert.ok(heroHtml(evil).includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("description fits a search snippet", () => {
  assert.equal(description(profile), profile.seo_description);
  assert.ok(description(profile).length <= 160);
  assert.match(description({ ...profile, seo_description: "" }), /^Sushant Mudalgi, software engineer in Boston, MA\./);
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

test("asset URLs and module imports get a version stamp, and restamping replaces it", () => {
  const html = '<link href="assets/css/style.css"><script type="module" src="assets/js/main.js"></script>';
  const once = stampHtml(html, "abc123");
  assert.match(once, /style\.css\?v=abc123/);
  assert.match(once, /main\.js\?v=abc123/);
  assert.equal(stampHtml(once, "def456").match(/\?v=/g).length, 2);
  assert.match(stampHtml(once, "def456"), /main\.js\?v=def456/);

  const js = 'import { a } from "./chat.js";\nimport { b } from "../x/y.js";\nimport c from "https://cdn/z.js";';
  const stamped = stampImports(js, "v1");
  assert.match(stamped, /"\.\/chat\.js\?v=v1"/);
  assert.match(stamped, /"\.\.\/x\/y\.js\?v=v1"/);
  assert.match(stamped, /"https:\/\/cdn\/z\.js"/, "absolute URLs are left alone");
});

test("the analytics script is added only for a valid token", () => {
  assert.equal(analyticsTag({}), "");
  assert.equal(analyticsTag({ analytics: { cloudflare_token: "" } }), "");
  const ok = analyticsTag({ analytics: { cloudflare_token: "0123456789abcdef0123456789abcdef" } });
  assert.match(ok, /static\.cloudflareinsights\.com\/beacon\.min\.js/);
  assert.match(ok, /"token": "0123456789abcdef0123456789abcdef"/);
  const realWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(analyticsTag({ analytics: { cloudflare_token: '"></script><script>alert(1)' } }), "");
  } finally {
    console.warn = realWarn;
  }
});

test("the page's Content Security Policy allows the analytics beacon and nothing extra", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src 'self' https:\/\/static\.cloudflareinsights\.com;/);
  assert.match(csp, /connect-src [^;]*https:\/\/cloudflareinsights\.com/);
  assert.ok(!/unsafe-inline/.test(csp));
});

test("the whole page is readable without JavaScript", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const text of ["RootCite", '"alternateName":"OpsPilot"', "DealRadar", "Recent activity", "Data Engineer L4", "at Takeda", "at EY GDS",
    "Northeastern University", "15+", "Let's build something dependable."]) {
    assert.ok(html.includes(text), `missing from static HTML: ${text}`);
  }
  assert.ok(!/data-href="(github|linkedin|resume|email)" href="#"/.test(html), "links still point to #");
  assert.match(html, /rel="me noopener"/);
});

test("prerendered sections match the profile and escape its text", () => {
  assert.equal((tilesHtml(profile).match(/class="tile"/g) || []).length, profile.projects.filter((p) => p.featured !== false).length);
  assert.equal((rolesHtml(profile).match(/class="role"/g) || []).length, profile.experience.length);
  assert.equal((statsHtml(profile).match(/<dt>/g) || []).length, profile.stats.length);
  assert.match(eduHtml(profile), /GPA 3\.91 \/ 4\.00/);
  const evil = { ...profile, experience: [{ ...profile.experience[0], role: "<script>alert(1)</script>" }] };
  assert.ok(!rolesHtml(evil).includes("<script>"));
});

test("resume buttons: one opens it, the download ones save it with a clear file name", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const resume = html.match(/<a [^>]*data-href="resume"[^>]*>/g);
  const downloads = resume.filter((a) => /download=/.test(a));
  assert.ok(downloads.length >= 2, "hero and contact both offer a download");
  assert.ok(downloads.every((a) => a.includes('download="Sushant-Mudalgi-Resume.pdf"')));
  assert.ok(resume.some((a) => !/download/.test(a) && /target="_blank"/.test(a)), "a view link opens in a new tab");
  assert.ok(resume.every((a) => a.includes('href="assets/resume.pdf"')));
});

test("static links are filled in and the step is repeatable", () => {
  const html = '<a data-href="github" href="#">GitHub</a><p data-text="location"></p>';
  const once = fillStatic(html, profile);
  assert.match(once, /href="https:\/\/github.com\/sushantm47"/);
  assert.match(once, /<p data-text="location">Boston, MA<\/p>/);
  assert.equal(fillStatic(once, profile), once);
});
