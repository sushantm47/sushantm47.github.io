#!/usr/bin/env node
// Asks the live assistant a fixed set of recruiter questions and checks each answer for
// facts it must contain, mistakes it must avoid, and citations. Prints a report and fails
// if the pass rate drops below the threshold, the same idea as an eval gate.
//
// Usage: node scripts/eval-assistant.mjs            (endpoint from data/profile.json)
//        ASSISTANT_URL=https://... node scripts/eval-assistant.mjs

import { appendFile, readFile } from "node:fs/promises";

export function checkAnswer(testCase, response) {
  const answer = String(response?.answer || "");
  const lower = answer.toLowerCase();
  const failures = [];
  for (const text of testCase.must_include || []) {
    if (!lower.includes(text.toLowerCase())) failures.push(`missing "${text}"`);
  }
  const any = testCase.must_include_any || [];
  if (any.length && !any.some((t) => lower.includes(t.toLowerCase()))) {
    failures.push(`needs one of: ${any.join(", ")}`);
  }
  for (const pattern of testCase.must_not_match || []) {
    if (new RegExp(pattern, "i").test(answer)) failures.push(`should not match /${pattern}/`);
  }
  if (testCase.must_cite && !/\[\d+\]/.test(answer)) failures.push("no citation");
  return { pass: failures.length === 0, failures };
}

async function ask(endpoint, origin, question) {
  const res = await fetch(`${endpoint.replace(/\/$/, "")}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ message: question }),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  return res.json();
}

async function main() {
  const root = new URL("../", import.meta.url);
  const profile = JSON.parse(await readFile(new URL("data/profile.json", root), "utf8"));
  const evals = JSON.parse(await readFile(new URL("data/assistant-evals.json", root), "utf8"));
  const endpoint = process.env.ASSISTANT_URL || profile.chat?.endpoint;
  if (!endpoint) throw new Error("No endpoint: set chat.endpoint in data/profile.json or ASSISTANT_URL");
  const origin = (profile.site_url || "").replace(/\/$/, "");

  const rows = [];
  for (const testCase of evals.cases) {
    const response = await ask(endpoint, origin, testCase.question);
    const result = response.error ? { pass: false, failures: [response.error] } : checkAnswer(testCase, response);
    rows.push({ testCase, response, result });
    await new Promise((r) => setTimeout(r, 1500)); // stay well inside free-tier rate limits
  }

  const passed = rows.filter((r) => r.result.pass).length;
  const rate = passed / rows.length;
  const lines = [
    `## Assistant eval: ${passed}/${rows.length} passed (${Math.round(rate * 100)}%)`,
    "",
    "| Question | Result | Model | Notes |",
    "|---|---|---|---|",
    ...rows.map(({ testCase, response, result }) =>
      `| ${testCase.question} | ${result.pass ? "pass" : "FAIL"} | ${response.provider || "-"} | ${result.failures.join("; ") || ""} |`),
    "",
    "### Answers",
    ...rows.flatMap(({ testCase, response }) => ["", `**${testCase.question}**`, "", response.answer || response.error || "(empty)"]),
  ];
  const report = lines.join("\n");
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  if (rate < (evals.pass_threshold ?? 0.8)) process.exit(1);
}

if (process.argv[1]?.endsWith("eval-assistant.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
