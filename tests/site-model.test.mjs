import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseInline, parseMarkdown, safeHref, withoutTitle } from "../assets/js/markdown.js";
import { buildSite, skillTerms, statValue, tagsFor } from "../assets/js/site-model.js";

const read = async (p) => JSON.parse(await readFile(new URL(`../${p}`, import.meta.url), "utf8"));
const settings = await read("data/profile.json");
const resume = await read("data/resume.json");

const repo = (name, extra = {}) => ({
  name, full_name: `sushantm47/${name}`, description: `${name} from GitHub`, topics: ["portfolio", "python"],
  homepage: "", language: "Python", stargazers_count: 1, readme: `# ${name}\n\nFrom the README.`, release: null, ...extra,
});

test("the resume drives experience, education, skills, and the summary", () => {
  const site = buildSite(settings, resume);
  assert.equal(site.name, resume.name);
  assert.equal(site.intro, resume.summary);
  assert.deepEqual(site.experience.slice(0, 3).map((e) => e.org), resume.experience.map((j) => j.company));
  assert.equal(site.experience.at(-1).org, settings.additional_experience.at(-1).company,
    "additional experience is appended");
  assert.match(site.education[1].notes, /GPA 3\.91 \/ 4\.00/);
  assert.ok(site.status.includes(resume.education[0].end), "graduation date comes from the resume");
  assert.deepEqual(site.previously.map((p) => p.name), ["Takeda", "EY", "Deloitte"]);
});

test("GitHub supplies descriptions, demos, releases, and READMEs, in resume order", () => {
  const github = { repos: [
    repo("DealRadar"),
    repo("rootcite", { homepage: "https://example.com/demo", release: { tag: "v0.5.0", url: "https://x/r" } }),
    repo("new-tool", { description: "Something new" }),
  ] };
  const site = buildSite(settings, resume, github);
  assert.deepEqual(site.projects.map((p) => p.name), ["RootCite", "DealRadar", "new-tool"]);
  const [root, deal, extra] = site.projects;
  assert.equal(root.tagline, "rootcite from GitHub");
  assert.equal(root.release.tag, "v0.5.0");
  assert.equal(root.demo.page, "rootcite/", "the configured demo page wins over the repo website");
  assert.ok(root.highlights.length && root.readme.includes("From the README"));
  assert.equal(deal.demo, undefined);
  assert.deepEqual(extra.stack, ["python"], "a repo missing from the resume uses its topics");
  assert.equal(buildSite({ ...settings, projects: {} }, resume, { repos: [repo("x", { homepage: "https://x.dev" })] })
    .projects.at(-1).demo.page, "https://x.dev", "a repo's website becomes its demo link");
});

test("role tags are skills the bullets mention, main skills first", () => {
  assert.deepEqual(skillTerms("AWS (S3, Lambda)"), ["AWS", "S3", "Lambda"]);
  const skills = [{ group: "x", items: ["Python", "Go", "AWS (S3, Lambda)", "C++"] }];
  assert.deepEqual(tagsFor("Built Go services on AWS Lambda and S3 with Python and C++", skills),
    ["Go", "AWS", "Python", "C++", "Lambda", "S3"]);
  assert.deepEqual(tagsFor("Google and goals", skills), [], "matches whole words only");
});

test("the production answer keeps the personal-project caveat", () => {
  const site = buildSite(settings, resume);
  const answer = site.faq.find((f) => f.q.includes("built in production")).a;
  for (const job of resume.experience) assert.ok(answer.includes(job.bullets[0]), job.company);
  assert.match(answer, /RootCite and DealRadar are personal projects, not production systems\./);
});

test("Markdown parses the common README elements", () => {
  const blocks = parseMarkdown([
    "# Title", "", "Intro with **bold**, `code`, and [a link](docs/DESIGN.md).", "",
    "## Features", "- one", "- two", "", "| A | B |", "|---|---|", "| 1 | 2 |", "",
    "```python", "print('hi')", "```", "", "> a quote",
  ].join("\n"));
  assert.deepEqual(blocks.map((b) => b.type), ["heading", "paragraph", "heading", "list", "table", "code", "quote"]);
  assert.equal(withoutTitle(blocks)[0].type, "paragraph", "the README's own title is dropped");
  assert.deepEqual(blocks[1].inlines.map((i) => i.type), ["text", "strong", "text", "code", "text", "link", "text"]);
  assert.deepEqual(blocks[4].rows[0].map((c) => c[0].value), ["1", "2"]);
});

test("Markdown never passes through HTML, images, or unsafe links", () => {
  const blocks = parseMarkdown('<img src=x onerror=alert(1)>\n\nHi <script>alert(1)</script> ![badge](https://x/b.svg) [x](javascript:alert(1))');
  assert.equal(blocks.length, 1);
  const parts = blocks[0].inlines;
  assert.ok(!parts.some((p) => /script|img|badge/.test(p.value)), "HTML and images are dropped");
  assert.equal(safeHref("javascript:alert(1)", "o/r"), null);
  assert.equal(safeHref("data:text/html,x", "o/r"), null);
  assert.equal(safeHref("docs/DESIGN.md", "o/r"), "https://github.com/o/r/blob/HEAD/docs/DESIGN.md");
  assert.equal(safeHref("https://example.com", "o/r"), "https://example.com");
  assert.deepEqual(parseInline("plain").map((p) => p.type), ["text"]);
});

test("README badge rows are dropped instead of shown as raw text", () => {
  const blocks = parseMarkdown("# RootCite\n\n[![CI](https://x/badge.svg)](https://x/ci) [![MIT](https://x/m.svg)](LICENSE)\n\nIntro text.");
  assert.deepEqual(withoutTitle(blocks).map((b) => b.type), ["paragraph"]);
  assert.equal(withoutTitle(blocks)[0].inlines.map((p) => p.value).join("").trim(), "Intro text.");
  const spaced = parseMarkdown("**Live demo:** [site](https://x.dev) now")[0].inlines;
  assert.equal(spaced.map((p) => p.value).join(""), "Live demo: site now", "spaces between parts survive");
});

test("stat cards take their numbers from the resume", () => {
  const site = buildSite(settings, resume);
  const takeda = resume.experience.find((j) => j.company === "Takeda").bullets.join(" ");
  assert.ok(takeda.includes(`${site.stats[1].value} production`), "the pipeline count matches the resume");
  const updated = structuredClone(resume);
  updated.experience[0].bullets[0] = updated.experience[0].bullets[0].replace(/\d+\+? production/, "20+ production");
  assert.equal(buildSite(settings, updated).stats[1].value, "20+");
  assert.equal(statValue({ value: "7", from: { pattern: "no such text" } }, resume), "7", "falls back to the set value");
  assert.equal(statValue({ value: "x", from: { company: "EY GDS", pattern: "(\\d+) to \\d+ GB", format: "{1}+ GB" } }, resume), "200+ GB");
});
