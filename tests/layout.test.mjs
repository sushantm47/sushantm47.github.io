import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { anchorFor, joinList, profileToChunks, skillGroups } from "../assets/js/knowledge.js";
import { splitNumbers } from "../assets/js/render.js";
import { heroHtml } from "../scripts/prerender.mjs";

const profile = JSON.parse(await readFile(new URL("../data/profile.json", import.meta.url), "utf8"));

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
  assert.equal(anchorFor("OpsPilot", profile), "#project-opspilot");
  assert.equal(anchorFor("EY GDS", profile), "#exp-ey-gds");
  assert.equal(anchorFor("Nowhere", profile), null);
  assert.deepEqual(skillGroups({ skills: { A: ["x"] } }), [{ group: "A", items: ["x"], used_in: [] }]);
});

test("case studies are complete and searchable by the assistant", () => {
  const featured = profile.projects.filter((p) => p.featured !== false);
  assert.ok(featured.length >= 1);
  for (const p of featured) {
    for (const key of ["problem", "approach", "result"]) assert.ok(p.case_study?.[key], `${p.name}.${key}`);
  }
  const chunk = profileToChunks(profile).find((c) => c.title === "Case study: OpsPilot");
  assert.match(chunk.text, /Decision: Hybrid search/);
  assert.match(chunk.text, /Retrieve \(/);
});

test("the prerendered hero has availability, the highlighted word, and linked employers", () => {
  const html = heroHtml(profile);
  assert.match(html, /Open to co-op and full-time roles, graduating May 2027/);
  assert.match(html, /I build <span class="accent">dependable<\/span> software/);
  assert.match(html, /Previously at <a href="https:\/\/www.takeda.com"[^>]*>Takeda<\/a>, <a[^>]*>EY<\/a>, and <a[^>]*>Deloitte<\/a>/);
  assert.ok(!/<dl/.test(html), "stats live in Experience now, not the hero");
  assert.ok(!/style=/.test(html), "no inline styles: the CSP blocks them");
});
