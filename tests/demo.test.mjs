import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { errorMessage, GIVE_UP_SECONDS, readyText, wakeProgress } from "../assets/js/rootcite-demo.js";
import { profileToChunks } from "../assets/js/knowledge.js";
import { demoPages, sitemap } from "../scripts/prerender.mjs";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const profile = JSON.parse(await read("data/site.json"));
const example = JSON.parse(await read("data/rootcite-example.json"));

test("wake-up progress rises steadily but never claims to be done", () => {
  const points = [0, 10, 30, 60, 90, 150].map(wakeProgress);
  points.slice(1).forEach((p, i) => assert.ok(p > points[i], `progress rises at step ${i}`));
  assert.ok(points.every((p) => p >= 0 && p <= 0.95));
  assert.ok(GIVE_UP_SECONDS > 60);
});

test("status and error messages explain what happened", () => {
  assert.equal(readyText({ llm_provider: "openai", model: "openai/gpt-oss-20b", live_runs_remaining: 42 }),
    "Demo server ready (openai/gpt-oss-20b, 42 live runs left today).");
  assert.equal(readyText({ llm_provider: "offline", model: "x", live_runs_remaining: null }),
    "Demo server ready (offline planner).");
  assert.match(errorMessage(429, { reason: "daily_budget" }), /used up.*midnight UTC/);
  assert.match(errorMessage(429, {}, "12"), /12 seconds/);
  assert.match(errorMessage(503), /busy/);
});

test("the recorded example is a complete diagnosis for a listed scenario", () => {
  assert.equal(example.scenarios.length, 5);
  assert.ok(example.scenarios[example.scenario]);
  for (const key of ["root_cause", "confidence", "citations", "evidence", "tools_called", "usage", "warnings"]) {
    assert.ok(key in example.result, key);
  }
  assert.ok(example.result.warnings.some((w) => w.includes("prompt injection")));
  assert.ok(example.recorded_with);
});

test("the demo page is self-contained, CSP-safe, and allowed to reach the demo host", async () => {
  const html = await read("rootcite/index.html");
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /connect-src 'self' https:\/\/\*\.onrender\.com/);
  assert.ok(!/unsafe-inline/.test(csp) && !/\sstyle=/.test(html));
  assert.ok(!/<script(?![^>]*\ssrc=)/.test(html), "no inline scripts");
  const index = await read("index.html");
  assert.match(index, /connect-src [^;"]*https:\/\/\*\.onrender\.com/);
});

test("the demo is listed in the sitemap and known to the assistant", () => {
  assert.deepEqual(demoPages(profile), ["rootcite/"]);
  assert.match(sitemap("https://a.github.io/", new Date("2026-10-18"), ["rootcite/"]), /<loc>https:\/\/a\.github\.io\/rootcite\/<\/loc>/);
  const chunk = profileToChunks(profile).find((c) => c.title === "Project: RootCite");
  assert.match(chunk.text, /Live demo: https:\/\/sushantm47\.github\.io\/rootcite\//);
});
