import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fill, findPlaceholders, firstName, profileToChunks, repoUrl } from "../assets/js/knowledge.js";
import { buildKnowledge, docTargets, selectRepos, suggestRepo } from "../scripts/build-knowledge.mjs";

const profile = JSON.parse(await readFile(new URL("../data/profile.json", import.meta.url), "utf8"));

test("profile.json is complete enough to render", () => {
  for (const key of ["name", "role", "headline", "links", "projects", "skills"]) assert.ok(profile[key], key);
  for (const p of profile.projects) assert.match(p.repo, /^[\w.-]+\/[\w.-]+$/, p.name);
});

test("{first} placeholders use the first name", () => {
  const p = { name: "Ada Lovelace" };
  assert.equal(firstName(p), "Ada");
  assert.equal(fill("When can {first} start?", p), "When can Ada start?");
});

test("every project, job, and FAQ becomes a chunk", () => {
  const chunks = profileToChunks(profile);
  const titles = chunks.map((c) => c.title);
  for (const p of profile.projects) assert.ok(titles.includes(`Project: ${p.name}`));
  assert.equal(chunks.filter((c) => c.id.startsWith("profile#faq")).length, profile.faq.length);
  assert.ok(chunks.every((c) => !c.text.includes("{first}")));
});

test("repo links point at the subfolder when a path is set", () => {
  assert.equal(repoUrl({ repo: "u/r", path: "4_x" }), "https://github.com/u/r/tree/HEAD/4_x");
  assert.equal(docTargets({ repo: "u/r", path: "4_x" })[0].candidates[0].raw, "https://raw.githubusercontent.com/u/r/HEAD/4_x/README.md");
});

test("template placeholders are reported", () => {
  assert.deepEqual(findPlaceholders(profile), [], "profile.json still has template text");
  assert.deepEqual(findPlaceholders({ name: "Your Name", links: { email: "you@example.com" } }), ["name", "links.email"]);
  assert.deepEqual(findPlaceholders({ name: "Ada" }), []);
});

test("buildKnowledge adds README chunks and survives missing files", async () => {
  const fakeFetch = async (url) =>
    url.includes("api.github.com/users/")
      ? Response.json([])
      : url.endsWith("opspilot/HEAD/README.md")
      ? new Response("# OpsPilot\nHybrid search.\n## Guardrails\nPrompt injection defense.")
      : url.endsWith("DealRadar/HEAD/readme.md")
        ? new Response("# DealRadar\nFlask and MySQL price tracker.")
        : new Response("missing", { status: 404, statusText: "Not Found" });
  const quiet = { info() {}, warn() {} };
  const k = await buildKnowledge(profile, { fetchImpl: fakeFetch, log: quiet });
  const readme = k.chunks.filter((c) => c.source.endsWith("opspilot/README.md"));
  assert.equal(readme.length, 2);
  assert.ok(readme[1].url.includes("/blob/HEAD/README.md"));
  const lower = k.chunks.filter((c) => c.source === "sushantm47/DealRadar/readme.md");
  assert.equal(lower.length, 1, "falls back to a lowercase readme.md");
  assert.equal(k.owner.name, profile.name);
});

const apiRepos = [
  { name: "OpsPilot-agent", full_name: "sushantm47/OpsPilot-agent", fork: false, archived: false, private: false, html_url: "https://github.com/sushantm47/OpsPilot-agent", description: "Agentic RAG", language: "Python", topics: ["rag"] },
  { name: "DealRadar", full_name: "sushantm47/DealRadar", fork: false, archived: false, private: false, html_url: "https://github.com/sushantm47/DealRadar" },
  { name: "new-idea", full_name: "sushantm47/new-idea", fork: false, archived: false, private: false, html_url: "https://github.com/sushantm47/new-idea", description: "A brand new project", language: "Go" },
  { name: "someone-elses", full_name: "sushantm47/someone-elses", fork: true, archived: false, private: false, html_url: "x" },
  { name: "old-portfolio", full_name: "sushantm47/old-portfolio", fork: false, archived: true, private: false, html_url: "x" },
  { name: "sushantm47.github.io", full_name: "sushantm47/sushantm47.github.io", fork: false, archived: false, private: false, html_url: "x" },
];

test("auto-discovery skips forks, archived repos, and the site itself", () => {
  assert.deepEqual(selectRepos(apiRepos, "sushantm47").map((r) => r.name), ["OpsPilot-agent", "DealRadar", "new-idea"]);
});

test("a mistyped featured repo gets a suggestion", () => {
  assert.equal(suggestRepo("sushantm47/opspilot", apiRepos), "sushantm47/OpsPilot-agent");
  assert.equal(suggestRepo("sushantm47/dealradar", apiRepos), "sushantm47/DealRadar");
  assert.equal(suggestRepo("sushantm47/nothing-like-it", apiRepos), undefined);
});

test("every public repo is added to the knowledge, and wrong names are reported", async () => {
  const warnings = [];
  const log = { info() {}, warn: (m) => warnings.push(m) };
  const fakeFetch = async (url) => {
    if (url.includes("api.github.com/users/sushantm47/repos")) return Response.json(apiRepos);
    if (url.endsWith("new-idea/HEAD/README.md")) return new Response("# new-idea\nA Go service.");
    return new Response("missing", { status: 404, statusText: "Not Found" });
  };
  const k = await buildKnowledge(profile, { fetchImpl: fakeFetch, log });
  const titles = k.chunks.map((c) => c.title);
  assert.ok(titles.includes("Repository: new-idea"));
  assert.ok(titles.includes("Repository: OpsPilot-agent"), "unmatched real repos still get indexed");
  assert.ok(!titles.includes("Repository: DealRadar"), "featured repos aren't duplicated");
  assert.ok(!titles.some((t) => t.includes("someone-elses") || t.includes("old-portfolio")));
  assert.ok(warnings.some((w) => w.includes('Did you mean "sushantm47/OpsPilot-agent"')));
});
