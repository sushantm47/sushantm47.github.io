#!/usr/bin/env node
// Builds data/site.json from data/resume.json (parsed from the resume PDF), the GitHub
// repositories tagged with the portfolio topic, and the settings in data/profile.json.
// Usage: node scripts/build-site.mjs [--offline]

import { readFile, writeFile } from "node:fs/promises";
import { buildSite } from "../assets/js/site-model.js";

const README_LIMIT = 40_000;

async function gh(path, accept = "application/vnd.github+json") {
  const headers = { accept, "user-agent": "portfolio-site-builder" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${path} returned ${res.status}`);
  return accept.includes("raw") ? res.text() : res.json();
}

export async function fetchGitHub(user, topic) {
  const all = (await gh(`/users/${user}/repos?per_page=100&type=owner&sort=pushed`)) || [];
  const tagged = all.filter((r) => !r.fork && !r.archived && (r.topics || []).includes(topic));
  const repos = await Promise.all(tagged.map(async (r) => {
    const [readme, releases] = await Promise.all([
      gh(`/repos/${r.full_name}/readme`, "application/vnd.github.raw+json").catch(() => null),
      gh(`/repos/${r.full_name}/releases?per_page=1`).catch(() => null),
    ]);
    const release = (releases || []).find((x) => !x.draft);
    return {
      name: r.name, full_name: r.full_name, description: r.description || "",
      topics: r.topics || [], homepage: r.homepage || "", language: r.language || "",
      stargazers_count: r.stargazers_count, pushed_at: r.pushed_at,
      readme: (readme || "").slice(0, README_LIMIT),
      release: release ? { tag: release.tag_name, url: release.html_url } : null,
    };
  }));
  return { repos, fetched_at: new Date().toISOString() };
}

async function main() {
  const offline = process.argv.includes("--offline");
  const root = new URL("../", import.meta.url);
  const settings = JSON.parse(await readFile(new URL("data/profile.json", root), "utf8"));
  const resume = JSON.parse(await readFile(new URL("data/resume.json", root), "utf8"));
  const topic = settings.github?.topic || "portfolio";

  let github = { repos: [] };
  if (!offline) {
    try {
      github = await fetchGitHub(settings.github.user, topic);
      if (!github.repos.length) {
        console.warn(`::warning::No public repositories have the topic "${topic}". Add it to the repositories you want on the site.`);
      }
    } catch (err) {
      console.warn(`::warning::GitHub unavailable (${err.message}); projects come from the resume only.`);
    }
  }
  const site = buildSite(settings, resume, github);
  await writeFile(new URL("data/site.json", root), JSON.stringify(site, null, 2) + "\n");
  console.log(`Wrote data/site.json: ${site.experience.length} roles, ${site.projects.length} projects ` +
    `(${github.repos.length} from GitHub), ${site.skills.length} skill groups.`);
}

if (process.argv[1]?.endsWith("build-site.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
