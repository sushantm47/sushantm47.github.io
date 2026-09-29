#!/usr/bin/env node
// Writes profile.json content straight into index.html, plus robots.txt and sitemap.xml,
// so search engines and link previews see real text without running JavaScript.
// Usage: node scripts/prerender.mjs

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { employers, fill, githubUrl, headlineParts, skillGroups } from "../assets/js/knowledge.js";

export function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Search results show roughly the first 155 characters, so lead with who, where, and what.
export function description(p) {
  const text = `${p.name}, ${p.role.toLowerCase()} in ${p.location}. ${fill(p.headline, p)}`;
  return text.length > 160 ? `${text.slice(0, text.lastIndexOf(" ", 157))}…` : text;
}

export function headTags(p) {
  const url = p.site_url;
  const title = `${p.name}, ${p.role}`;
  const desc = description(p);
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: p.name,
    jobTitle: p.role,
    url,
    email: `mailto:${p.links?.email}`,
    address: { "@type": "PostalAddress", addressLocality: p.location },
    alumniOf: (p.education || []).map((e) => ({ "@type": "CollegeOrUniversity", name: e.school })),
    knowsAbout: skillGroups(p).flatMap((g) => g.items).slice(0, 25),
    sameAs: [githubUrl(p), p.links?.linkedin].filter(Boolean),
  };
  // "<" is escaped inside JSON-LD so no value can close the script element.
  const jsonLd = JSON.stringify(person).replaceAll("<", "\\u003c");
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(desc)}">`,
    `<meta name="author" content="${escapeHtml(p.name)}">`,
    url && `<link rel="canonical" href="${escapeHtml(url)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(desc)}">`,
    url && `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta name="twitter:card" content="summary">`,
    `<script type="application/ld+json">${jsonLd}</script>`,
  ]
    .filter(Boolean)
    .join("\n  ");
}

export function previouslyHtml(p) {
  const list = employers(p).map((e) =>
    e.url
      ? `<a href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${escapeHtml(e.name)}</a>`
      : escapeHtml(e.name)
  );
  if (!list.length) return "";
  const joined =
    list.length === 1 ? list[0]
      : list.length === 2 ? `${list[0]} and ${list[1]}`
        : `${list.slice(0, -1).join(", ")}, and ${list.at(-1)}`;
  return `Previously at ${joined}`;
}

export function headlineHtml(p) {
  return headlineParts(fill(p.headline, p), p.headline_accent)
    .map((part) => (part.accent ? `<span class="accent">${escapeHtml(part.text)}</span>` : escapeHtml(part.text)))
    .join("");
}

export function heroHtml(p) {
  const previously = previouslyHtml(p);
  const grad = p.education?.[0]?.end;
  const availability = [p.availability, grad && `graduating ${grad}`].filter(Boolean).join(", ");
  return [
    `<p class="avail"${availability ? "" : " hidden"}><span class="pulse" aria-hidden="true"></span><span id="availability">${escapeHtml(availability)}</span></p>`,
    `        <h1 id="headline">${headlineHtml(p)}</h1>`,
    `        <p class="hero-intro" data-text="tagline">${escapeHtml(fill(p.tagline || p.intro, p))}</p>`,
    `        <p class="hero-previously" id="previously"${previously ? "" : " hidden"}>${previously}</p>`,
  ].join("\n");
}

export function replaceBlock(html, name, content) {
  const pattern = new RegExp(`(<!-- prerender:${name} -->)[\\s\\S]*?(<!-- /prerender:${name} -->)`);
  if (!pattern.test(html)) throw new Error(`index.html is missing the prerender:${name} markers`);
  return html.replace(pattern, (_, open, close) => `${open}\n  ${content}\n  ${close}`);
}

export function sitemap(url, date = new Date()) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${escapeHtml(url)}</loc><lastmod>${date.toISOString().slice(0, 10)}</lastmod></url>
</urlset>
`;
}

// Cache busting: GitHub Pages lets browsers keep files for ~10 minutes. Without a version
// stamp, a returning visitor can get new HTML/data with old JS and CSS, and the page breaks.
// Every asset URL and every relative module import gets "?v=<content hash>".
export function stampHtml(html, version) {
  return html.replace(/(assets\/(?:css|js)\/[\w.-]+\.(?:css|js))(?:\?v=[\w]+)?/g, `$1?v=${version}`);
}

export function stampImports(js, version) {
  return js.replace(/(from\s+["'])(\.{1,2}\/[\w./-]+\.js)(?:\?v=[\w]+)?(["'])/g, `$1$2?v=${version}$3`);
}

export async function assetVersion(root, files) {
  const hash = createHash("sha256");
  for (const file of files.sort()) hash.update(await readFile(new URL(file, root)));
  return hash.digest("hex").slice(0, 10);
}

async function main() {
  const root = new URL("../", import.meta.url);
  const profile = JSON.parse(await readFile(new URL("data/profile.json", root), "utf8"));
  let html = await readFile(new URL("index.html", root), "utf8");
  html = replaceBlock(html, "head", headTags(profile));
  html = replaceBlock(html, "hero", heroHtml(profile));

  if (process.argv.includes("--bust")) {
    const jsFiles = (await readdir(new URL("assets/js/", root))).filter((f) => f.endsWith(".js"));
    const files = ["assets/css/style.css", ...jsFiles.map((f) => `assets/js/${f}`)];
    const version = await assetVersion(root, files);
    html = stampHtml(html, version);
    for (const f of jsFiles) {
      const url = new URL(`assets/js/${f}`, root);
      await writeFile(url, stampImports(await readFile(url, "utf8"), version));
    }
    console.log(`Stamped assets with version ${version}.`);
  }
  await writeFile(new URL("index.html", root), html);

  if (profile.site_url) {
    const base = profile.site_url.replace(/\/?$/, "/");
    await writeFile(new URL("sitemap.xml", root), sitemap(base));
    await writeFile(new URL("robots.txt", root), `User-agent: *\nAllow: /\n\nSitemap: ${base}sitemap.xml\n`);
  }
  console.log("Prerendered index.html, sitemap.xml, and robots.txt.");
}

if (process.argv[1]?.endsWith("prerender.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
