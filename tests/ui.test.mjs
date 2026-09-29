import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ART_KINDS, artSvg } from "../assets/js/art.js";
import { employerNames, employers, headlineParts } from "../assets/js/knowledge.js";
import { countFrame, easeOut } from "../assets/js/ui.js";

const profile = JSON.parse(await readFile(new URL("../data/profile.json", import.meta.url), "utf8"));

test("count-up frames keep the text's format and end on the exact value", () => {
  assert.equal(countFrame("200–300 GB", 0), "0–0 GB");
  assert.equal(countFrame("200–300 GB", 0.5), "100–150 GB");
  assert.equal(countFrame("5,000+", 0.5), "2,500+");
  assert.equal(countFrame("0.909", 0.5), "0.455");
  for (const st of profile.stats) assert.equal(countFrame(st.value, 1), st.value);
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
});

test("every project has a tile color and a drawing", () => {
  for (const p of profile.projects) {
    assert.match(p.color, /^#[0-9a-f]{6}$/i, p.name);
    assert.ok(ART_KINDS.includes(p.art), `${p.name} art "${p.art}"`);
  }
});

test("tile drawings are plain SVG with no inline styles or scripts (CSP-safe)", () => {
  for (const kind of ART_KINDS) {
    const svg = artSvg(kind);
    assert.match(svg, /^<svg viewBox=/);
    assert.ok(!/style=|<script|on\w+=/.test(svg), kind);
  }
});

test("headline accent and employer helpers", () => {
  assert.deepEqual(headlineParts("I build dependable software.", "dependable"), [
    { text: "I build ", accent: false },
    { text: "dependable", accent: true },
    { text: " software.", accent: false },
  ]);
  assert.deepEqual(headlineParts("No accent here.", "missing"), [{ text: "No accent here.", accent: false }]);
  assert.deepEqual(employerNames(profile), ["Takeda", "EY", "Deloitte"]);
  assert.deepEqual(employers({ previously: ["Acme"] }), [{ name: "Acme", url: "" }]);
});

test("index.html has no inline styles or scripts, so the CSP holds", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(!/\sstyle=/.test(html));
  assert.ok(!/<script(?![^>]*\ssrc=)(?![^>]*application\/ld\+json)/.test(html));
});
