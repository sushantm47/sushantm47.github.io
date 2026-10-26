import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { anchorFor, joinList, profileToChunks, skillGroups } from "../assets/js/knowledge.js";
import { splitNumbers } from "../assets/js/render.js";
import { escapeHtml, heroHtml } from "../scripts/prerender.mjs";

const profile = JSON.parse(await readFile(new URL("../data/site.json", import.meta.url), "utf8"));

test("impact numbers are split out for highlighting", () => {
  const nums = (t) => splitNumbers(t).filter((p) => p.number).map((p) => p.text);
  assert.deepEqual(nums("cutting workflow costs by 25% across 10+ workflows"), ["25%", "10+"]);
  assert.deepEqual(nums("processing 200 to 300 GB for 5,000+ users"), ["200 to 300 GB", "5,000+"]);
  assert.deepEqual(nums("MRR 1.000 versus 0.909"), ["1.000", "0.909"]);
  assert.equal(splitNumbers("no numbers here").length, 1);
  assert.deepEqual(nums("AWS (S3, DMS) on EC2, hit@5, Data Engineer L4"), [], "digits inside names stay plain");
  assert.deepEqual(nums("started in 2021."), ["2021"], "trailing punctuation is not part of the number");
  assert.equal(splitNumbers("a 25% b").map((p) => p.text).join(""), "a 25% b");
});

test("lists read naturally", () => {
  assert.equal(joinList(["Takeda"]), "Takeda");
  assert.equal(joinList(["Takeda", "EY"]), "Takeda and EY");
  assert.equal(joinList(["Takeda", "EY", "Deloitte"]), "Takeda, EY, and Deloitte");
});

test("every skill 'used in' name links to a project or a job on the page", () => {
  for (const g of skillGroups(profile)) {
    for (const name of g.used_in || []) assert.ok(anchorFor(name, profile), `${g.group}: ${name}`);
  }
  assert.equal(anchorFor("RootCite", profile), "#project-rootcite");
  assert.equal(anchorFor("EY GDS", profile), "#exp-ey-gds");
  assert.equal(anchorFor("Nowhere", profile), null);
  assert.deepEqual(skillGroups({ skills: { A: ["x"] } }), [{ group: "A", items: ["x"], used_in: [] }]);
});

test("case studies come from the resume and are searchable by the assistant", () => {
  const featured = profile.projects.filter((p) => p.featured !== false);
  assert.ok(featured.length >= 1);
  for (const p of featured) assert.ok(p.highlights.length >= 1, `${p.name} has resume highlights`);
  const chunk = profileToChunks(profile).find((c) => c.title === "Highlights: RootCite");
  assert.match(chunk.text, /reciprocal rank fusion/);
  assert.match(chunk.text, /previously named OpsPilot/);
});

test("the prerendered hero has availability, the highlighted word, and linked employers", () => {
  const html = heroHtml(profile);
  assert.ok(html.includes(`graduating ${profile.education[0].end}`), "availability names the graduation date");
  assert.match(html, /<p class="hero-name"><span data-name>Sushant Mudalgi<\/span><\/p>/, "name is visible above the headline");
  assert.match(html, /I build <span class="accent">dependable<\/span> software/);
  assert.match(html, /Previously at <a href="https:\/\/www.takeda.com"[^>]*>Takeda<\/a>, <a[^>]*>EY<\/a>, and <a[^>]*>Deloitte<\/a>/);
  assert.ok(!/<dl/.test(html), "stats live in Experience now, not the hero");
  assert.ok(!/style=/.test(html), "no inline styles: the CSP blocks them");
});

test("the RootCite tile carries a live demo badge, and only projects with a demo do", async () => {
  const { tilesHtml } = await import("../scripts/prerender.mjs");
  const html = tilesHtml(profile);
  assert.equal((html.match(/class="demo-badge"/g) || []).length, profile.projects.filter((p) => p.demo && p.featured !== false).length);
  assert.match(html, /<a class="demo-badge" href="rootcite\/">/);
  assert.ok(!/<button[^>]*>(?:(?!<\/button>)[\s\S])*demo-badge/.test(html), "the badge is not nested inside the tile button");
});

test("the toolbox lists every skill group and is readable without JavaScript", async () => {
  const { toolboxHtml } = await import("../scripts/prerender.mjs");
  const html = toolboxHtml(profile);
  for (const g of profile.skills) assert.ok(html.includes(`<dt>${g.group}</dt>`), g.group);
  const page = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const skill of profile.skills.flatMap((g) => g.items)) {
    assert.ok(page.includes(escapeHtml(skill)), `toolbox shows ${skill}`);
  }
  assert.match(page, /rel="apple-touch-icon" href="assets\/img\/apple-touch-icon.png"/);
});

test("the site's content matches the resume it was built from", async () => {
  const resume = JSON.parse(await readFile(new URL("../data/resume.json", import.meta.url), "utf8"));
  resume.experience.forEach((job, i) => {
    const role = profile.experience[i];
    assert.equal(role.org, job.company);
    assert.equal(role.role, job.title);
    assert.deepEqual(role.points, job.bullets, `${job.company} bullets are copied exactly`);
  });
  resume.education.forEach((school, i) => {
    for (const course of school.coursework) assert.ok(profile.education[i].notes.includes(course), course);
  });
  assert.equal(profile.intro, resume.summary);
});
