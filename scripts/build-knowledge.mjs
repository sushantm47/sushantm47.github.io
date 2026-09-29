#!/usr/bin/env node
// Builds data/knowledge.json from data/profile.json plus the READMEs and docs of your repos.
// This is retrieval-augmented generation (RAG): the chatbot looks things up here at question
// time instead of being fine-tuned, so it updates on every deploy and costs nothing to "train".
//
// Usage: node scripts/build-knowledge.mjs [--offline]

import { readFile, writeFile } from "node:fs/promises";
import { chunkMarkdown } from "../assets/js/retrieval.js";
import { findPlaceholders, firstName, profileToChunks, repoUrl } from "../assets/js/knowledge.js";

const MAX_CHUNKS_PER_DOC = 12;
const MAX_CHUNKS_PER_AUTO_REPO = 6;
const MAX_AUTO_REPOS = 20;

const README_NAMES = ["README.md", "readme.md", "Readme.md"]; // GitHub paths are case-sensitive

export function docTargets(project) {
  const prefix = project.path ? `${project.path}/` : "";
  const target = (file) => ({
    file,
    raw: `https://raw.githubusercontent.com/${project.repo}/HEAD/${file}`,
    url: `https://github.com/${project.repo}/blob/HEAD/${file}`,
  });
  return [
    { candidates: README_NAMES.map((n) => target(`${prefix}${n}`)) },
    ...(project.docs || []).map((d) => ({ candidates: [target(`${prefix}${d}`)] })),
  ];
}

async function firstAvailable(candidates, fetchImpl) {
  let lastError;
  for (const target of candidates) {
    try {
      return { target, markdown: await fetchText(target.raw, fetchImpl) };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function fetchJson(url, fetchImpl) {
  const headers = { "user-agent": "portfolio-knowledge-builder", accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetchImpl(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// Public, non-fork, non-archived repos, skipping the portfolio site itself.
export function selectRepos(repos, user) {
  return repos.filter(
    (r) => !r.fork && !r.archived && !r.private && r.name.toLowerCase() !== `${user}.github.io`.toLowerCase()
  );
}

// Closest real repo for a mistyped featured name: exact (case-insensitive), then substring.
export function suggestRepo(wanted, repos) {
  const name = wanted.split("/").pop().toLowerCase();
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    repos.find((r) => r.name.toLowerCase() === name) ||
    repos.find((r) => norm(r.name).includes(norm(name)) || norm(name).includes(norm(r.name)))
  )?.full_name;
}

function repoSummaryChunk(r) {
  const topics = (r.topics || []).join(", ");
  return {
    id: `repo#${r.full_name}`,
    title: `Repository: ${r.name}`,
    source: r.full_name,
    url: r.html_url,
    text: [
      r.description || "No description.",
      r.language && `Main language: ${r.language}.`,
      topics && `Topics: ${topics}.`,
      `Code: ${r.html_url}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function fetchText(url, fetchImpl) {
  const headers = { "user-agent": "portfolio-knowledge-builder" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetchImpl(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

async function addAllRepos(profile, chunks, { fetchImpl, log }) {
  const user = profile.links?.github;
  if (!user) return;
  let repos;
  try {
    repos = await fetchJson(
      `https://api.github.com/users/${user}/repos?per_page=100&type=owner&sort=pushed`,
      fetchImpl
    );
  } catch (err) {
    log.warn(`  ! could not list repos for ${user}: ${err.message}`);
    return;
  }

  const byName = new Map(repos.map((r) => [r.full_name.toLowerCase(), r]));
  const featured = new Set();
  for (const project of profile.projects || []) {
    const key = project.repo.toLowerCase();
    if (byName.has(key)) {
      featured.add(key);
    } else if (project.repo.startsWith(`${user}/`)) {
      const hint = suggestRepo(project.repo, repos);
      log.warn(
        `  ! featured repo "${project.repo}" was not found among public repos` +
          (hint ? `. Did you mean "${hint}"? Fix it in data/profile.json.` : ". Is it public?")
      );
    }
  }

  // Every other public repo: its description plus the start of its README.
  const extra = selectRepos(repos, user).filter((r) => !featured.has(r.full_name.toLowerCase()));
  for (const r of extra.slice(0, MAX_AUTO_REPOS)) {
    chunks.push(repoSummaryChunk(r));
    try {
      const { target, markdown } = await firstAvailable(docTargets({ repo: r.full_name })[0].candidates, fetchImpl);
      const readme = chunkMarkdown(markdown, { title: r.name, source: `${r.full_name}/${target.file}`, url: target.url });
      chunks.push(...readme.slice(0, MAX_CHUNKS_PER_AUTO_REPO));
    } catch {
      /* repos without a README still get their summary chunk */
    }
  }
  log.info(`  + ${extra.length} more public repos added automatically`);
}

export async function buildKnowledge(profile, { offline = false, fetchImpl = fetch, log = console } = {}) {
  const chunks = profileToChunks(profile);
  if (!offline) {
    await addAllRepos(profile, chunks, { fetchImpl, log });
    const seen = new Set();
    for (const project of profile.projects || []) {
      for (const { candidates } of docTargets(project)) {
        if (seen.has(candidates[0].raw)) continue;
        seen.add(candidates[0].raw);
        try {
          const { target, markdown } = await firstAvailable(candidates, fetchImpl);
          const docChunks = chunkMarkdown(markdown, {
            title: project.name,
            source: `${project.repo}/${target.file}`,
            url: target.url,
          }).slice(0, MAX_CHUNKS_PER_DOC);
          chunks.push(...docChunks);
          log.info(`  + ${target.file} from ${project.repo} (${docChunks.length} chunks)`);
        } catch (err) {
          log.warn(`  ! skipped ${project.repo}/${candidates[0].file}: ${err.message}`);
        }
      }
    }
  }
  return {
    generated_at: new Date().toISOString(),
    owner: { name: profile.name, first: firstName(profile), github: repoUrl({ repo: profile.links?.github || "" }) },
    chunks,
  };
}

async function main() {
  const offline = process.argv.includes("--offline");
  const profile = JSON.parse(await readFile(new URL("../data/profile.json", import.meta.url), "utf8"));

  const placeholders = findPlaceholders(profile);
  if (placeholders.length) {
    console.warn(`Warning: ${placeholders.length} fields in data/profile.json still hold template text:`);
    for (const p of placeholders) console.warn(`  - ${p}`);
  }

  // In GitHub Actions, "::warning::" lines show up as yellow notes on the run's summary page.
  const inActions = process.env.GITHUB_ACTIONS === "true";
  const log = {
    info: (m) => console.log(m),
    warn: (m) => console.warn(inActions ? `::warning::${m.trim()}` : m),
  };
  const knowledge = await buildKnowledge(profile, { offline, log });
  await writeFile(
    new URL("../data/knowledge.json", import.meta.url),
    JSON.stringify(knowledge, null, 1) + "\n"
  );
  console.log(`Wrote data/knowledge.json with ${knowledge.chunks.length} chunks${offline ? " (offline)" : ""}.`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("build-knowledge.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
