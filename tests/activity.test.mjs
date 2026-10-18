import assert from "node:assert/strict";
import { test } from "node:test";
import { activityItems, firstLine } from "../assets/js/main.js";
import { artSvg, ART_KINDS } from "../assets/js/art.js";

const repo = (name, extra = {}) => ({ name, full_name: `u/${name}`, html_url: `https://github.com/u/${name}`, ...extra });

test("recent activity lists the newest commits, skipping forks, archives, and the site repo", () => {
  const repos = [repo("rootcite"), repo("old"), repo("forked", { fork: true }), repo("gone", { archived: true }), repo("u.github.io")];
  const commits = {
    "u/rootcite": { message: "Release 0.4.0", date: "2026-10-18T03:00:00Z" },
    "u/old": { message: "Initial commit", date: "2021-01-01T00:00:00Z" },
    "u/forked": { message: "x", date: "2026-10-19T00:00:00Z" },
    "u/u.github.io": { message: "site", date: "2026-10-19T00:00:00Z" },
  };
  assert.deepEqual(activityItems(repos, commits, "u").map((x) => x.repo.name), ["rootcite", "old"]);
  assert.equal(activityItems(repos, commits, "u", 1).length, 1);
});

test("commit messages show their first line, cut on a word boundary", () => {
  assert.equal(firstLine("Fix bug\n\nLong body"), "Fix bug");
  const long = "word ".repeat(40);
  assert.ok(firstLine(long, 30).length <= 31 && firstLine(long, 30).endsWith("…"));
});

test("project artwork takes its color from the stylesheet", () => {
  for (const kind of ART_KINDS) {
    assert.match(artSvg(kind), /stroke="currentColor"/);
    assert.ok(!/#[0-9A-Fa-f]{6}/.test(artSvg(kind)), `${kind} has no hard-coded colors`);
  }
});
