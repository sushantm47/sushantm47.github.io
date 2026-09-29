#!/usr/bin/env node
// Writes profile.json content straight into index.html, plus robots.txt and sitemap.xml,
// so search engines and link previews see real text without running JavaScript.
// Usage: node scripts/prerender.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fill, githubUrl } from "../assets/js/knowledge.js";

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
    knowsAbout: Object.values(p.skills || {}).flat().slice(0, 25),
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

export function heroHtml(p) {
  return [
    `<p class="hero-who"><span data-name>${escapeHtml(p.name)}</span>, <span data-text="role">${escapeHtml(p.role)}</span></p>`,
    `      <h1 id="headline" data-text="headline">${escapeHtml(fill(p.headline, p))}</h1>`,
    `      <p class="hero-intro" data-text="intro">${escapeHtml(fill(p.intro, p))}</p>`,
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

async function main() {
  const root = new URL("../", import.meta.url);
  const profile = JSON.parse(await readFile(new URL("data/profile.json", root), "utf8"));
  let html = await readFile(new URL("index.html", root), "utf8");
  html = replaceBlock(html, "head", headTags(profile));
  html = replaceBlock(html, "hero", heroHtml(profile));
  html = html.replace(/(<a class="bar-name"[^>]*>)[^<]*(<\/a>)/, `$1${escapeHtml(profile.name)}$2`);
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
