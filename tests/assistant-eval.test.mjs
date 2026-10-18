import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { checkAnswer } from "../scripts/eval-assistant.mjs";
import { buildMessages } from "../worker/src/index.js";
import { profileToChunks } from "../assets/js/knowledge.js";

const evals = JSON.parse(await readFile(new URL("../data/assistant-evals.json", import.meta.url), "utf8"));
const profile = JSON.parse(await readFile(new URL("../data/profile.json", import.meta.url), "utf8"));
const byQ = (q) => evals.cases.find((c) => c.question.startsWith(q));

test("a strong recruiter answer passes the production-work check", () => {
  const good = "Sushant built production pipelines at Takeda and EY. At Takeda he maintained 15+ PySpark pipelines [1]. At EY he processed 200 to 300 GB [2].";
  assert.deepEqual(checkAnswer(byQ("What has"), { answer: good }), { pass: true, failures: [] });
});

test("the weak answer from the screenshot fails, for the right reasons", () => {
  const weak = "Sushant has shipped several production-grade systems: 15+ PySpark pipelines, plus 200GB of data processed. These projects demonstrate his experience. [1][2][3]";
  const { pass, failures } = checkAnswer(byQ("What has"), { answer: weak });
  assert.equal(pass, false);
  assert.ok(failures.some((f) => f.includes('missing "Takeda"')));
  assert.ok(failures.some((f) => f.includes("200")), "flags the rounded number");
});

test("citations are required where the case says so", () => {
  assert.ok(checkAnswer(byQ("When can"), { answer: "Sushant graduates in May 2027." }).failures.includes("no citation"));
  assert.equal(checkAnswer(byQ("When can"), { answer: "Sushant graduates in May 2027 [1]." }).pass, true);
});

test("every eval case is well formed", () => {
  for (const c of evals.cases) {
    assert.ok(c.question && typeof c.must_cite === "boolean", c.question);
    for (const pattern of c.must_not_match || []) assert.doesNotThrow(() => new RegExp(pattern));
  }
});

test("the prompt asks for recruiter-quality answers", () => {
  const [system] = buildMessages({ name: "Sushant Mudalgi", first: "Sushant" }, [], [], "q");
  for (const rule of ["names the employer and dates", "exactly", "right after each point", "personal project", "No filler"]) {
    assert.ok(system.content.includes(rule), rule);
  }
});

test("curated answers keep exact numbers, and the summary no longer carries shortened stats", () => {
  const chunks = profileToChunks(profile);
  const production = chunks.find((c) => c.title === "What has Sushant built in production?");
  assert.match(production.text, /200 to 300 GB/);
  assert.match(production.text, /personal projects, not production systems/);
  assert.ok(!chunks.find((c) => c.id === "profile#about").text.includes("200+ GB"));
});
