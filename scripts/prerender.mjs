#!/usr/bin/env node
// Writes profile.json content straight into index.html, plus robots.txt and sitemap.xml,
// so search engines and link previews see real text without running JavaScript.
// Usage: node scripts/prerender.mjs

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { artSvg } from "../assets/js/art.js";
import {
  employerNames,
  employers,
  experienceAnchor,
  fill,
  githubUrl,
  headlineParts,
  projectAnchor,
  repoUrl,
  skillGroups,
} from "../assets/js/knowledge.js";
import { splitNumbers } from "../assets/js/render.js";

export function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Search results show roughly the first 155 characters, so lead with who, where, and what.
export function description(p) {
  const text = p.seo_description || `${p.name}, ${p.role.toLowerCase()} in ${p.location}. ${fill(p.headline, p)}`;
  return text.length > 160 ? `${text.slice(0, text.lastIndexOf(" ", 157))}…` : text;
}

// The title is what people click in search results: name first, then role and place.
export function pageTitle(p) {
  return p.seo_title || `${p.name}, ${p.role}`;
}

function absolute(p, path) {
  return new URL(path, p.site_url || "https://example.com/").href;
}

// Structured data for Google: a profile page about a person, plus their projects as code.
export function structuredData(p) {
  const url = p.site_url;
  const personId = `${url}#person`;
  const person = {
    "@type": "Person",
    "@id": personId,
    name: p.name,
    jobTitle: p.role,
    description: description(p),
    url,
    image: absolute(p, "assets/img/og.png"),
    email: `mailto:${p.links?.email}`,
    address: { "@type": "PostalAddress", addressLocality: p.location },
    alumniOf: [
      ...(p.education || []).map((e) => ({ "@type": "CollegeOrUniversity", name: e.school.split(",")[0] })),
      ...employerNames(p).map((name) => ({ "@type": "Organization", name })),
    ],
    knowsAbout: skillGroups(p).flatMap((g) => g.items).slice(0, 25),
    sameAs: [githubUrl(p), p.links?.linkedin].filter(Boolean),
  };
  const projects = (p.projects || []).map((pr) => ({
    "@type": "SoftwareSourceCode",
    name: pr.name,
    description: fill(pr.tagline || pr.summary, p),
    codeRepository: repoUrl(pr),
    programmingLanguage: (pr.stack || [])[0],
    author: { "@id": personId },
  }));
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "ProfilePage", "@id": `${url}#page`, url, name: pageTitle(p), mainEntity: { "@id": personId } },
      person,
      ...projects,
    ],
  };
}

// Cloudflare Web Analytics: cookie-free visitor counts. Added only when a token is set in
// profile.json. Tokens are 32 hex characters; anything else is ignored so it can't inject markup.
export function analyticsTag(p) {
  const token = String(p.analytics?.cloudflare_token || "").trim();
  if (!token) return "";
  if (!/^[a-f0-9]{32}$/i.test(token)) {
    console.warn("Warning: analytics.cloudflare_token in data/profile.json doesn't look like a token; skipping.");
    return "";
  }
  return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token}"}'></script>`;
}

export function headTags(p) {
  const url = p.site_url;
  const title = pageTitle(p);
  const desc = description(p);
  const image = absolute(p, "assets/img/og.png");
  const imageAlt = `${p.name}: ${fill(p.headline, p)}`;
  // "<" is escaped inside JSON-LD so no value can close the script element.
  const jsonLd = JSON.stringify(structuredData(p)).replaceAll("<", "\\u003c");
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(desc)}">`,
    `<meta name="author" content="${escapeHtml(p.name)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large">`,
    url && `<link rel="canonical" href="${escapeHtml(url)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="${escapeHtml(p.name)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(desc)}">`,
    url && `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${escapeHtml(imageAlt)}">`,
    `<meta property="profile:first_name" content="${escapeHtml(p.name.split(" ")[0])}">`,
    `<meta property="profile:last_name" content="${escapeHtml(p.name.split(" ").slice(1).join(" "))}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(desc)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    `<script type="application/ld+json">${jsonLd}</script>`,
    analyticsTag(p),
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
    `        <p class="hero-name"><span data-name>${escapeHtml(p.name)}</span></p>`,
    `        <h1 id="headline">${headlineHtml(p)}</h1>`,
    `        <p class="hero-intro" data-text="tagline">${escapeHtml(fill(p.tagline || p.intro, p))}</p>`,
    `        <p class="hero-previously" id="previously"${previously ? "" : " hidden"}>${previously}</p>`,
  ].join("\n");
}

// ----- the rest of the page, so search engines can read it without running JavaScript -----

function numbersHtml(text) {
  return splitNumbers(text)
    .map((part) => (part.number ? `<strong class="num">${escapeHtml(part.text)}</strong>` : escapeHtml(part.text)))
    .join("");
}

const tagsHtml = (items, cls = "tags tags-sm") =>
  items?.length ? `<ul class="${cls}">${items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : "";

export function tilesHtml(p) {
  return (p.projects || [])
    .filter((x) => x.featured !== false)
    .map((pr, i) => {
      const kicker = `Case study ${String(i + 1).padStart(2, "0")}`;
      const opener = pr.case_study
        ? `<button class="tile" id="${projectAnchor(pr.name)}" type="button" data-case="${escapeHtml(pr.name)}" data-repo="${escapeHtml(pr.repo)}" aria-label="${escapeHtml(pr.name)}: read the case study">`
        : `<a class="tile" id="${projectAnchor(pr.name)}" href="${escapeHtml(repoUrl(pr))}" data-repo="${escapeHtml(pr.repo)}" target="_blank" rel="noopener">`;
      const closer = pr.case_study ? "</button>" : "</a>";
      return `${opener}<div class="tile-art">${artSvg(pr.art)}</div><span class="tile-body">` +
        `<span class="tile-kicker">${kicker}</span><span class="tile-title">${escapeHtml(pr.name)}</span>` +
        `<span class="tile-summary">${escapeHtml(fill(pr.tagline || pr.summary, p))}</span>` +
        `<span class="tile-foot"><span class="tile-tags">${escapeHtml((pr.stack || []).slice(0, 3).join(", "))}</span>` +
        `<span class="tile-cta">${pr.case_study ? "Read case study" : "View code"}</span></span></span>${closer}`;
    })
    .join("\n");
}

export function moreHtml(p) {
  return (p.projects || [])
    .filter((x) => x.featured === false)
    .map((pr) =>
      `<li data-repo="${escapeHtml(pr.repo)}"><a class="more-name" href="${escapeHtml(repoUrl(pr))}" target="_blank" rel="noopener">${escapeHtml(pr.name)}</a>` +
      `<p>${escapeHtml(fill(pr.tagline || pr.summary, p))}</p>${tagsHtml((pr.stack || []).slice(0, 3))}</li>`)
    .join("\n");
}

export function statsHtml(p) {
  return (p.stats || []).map((st) => `<div><dt>${escapeHtml(st.value)}</dt><dd>${escapeHtml(st.label)}</dd></div>`).join("");
}

export function rolesHtml(p) {
  return (p.experience || [])
    .map((e) =>
      `<li id="${experienceAnchor(e.org)}" class="role"><div class="role-head"><h3>${escapeHtml(e.role)}<span class="role-org"> at ${escapeHtml(e.org)}</span></h3>` +
      `<p class="role-when">${escapeHtml(`${e.start} to ${e.end}`)}</p></div>` +
      `<p class="role-summary">${numbersHtml(fill(e.summary || e.points?.[0] || "", p))}</p>${tagsHtml(e.tags)}` +
      (e.points?.length ? `<details class="role-more"><summary>More</summary><ul>${e.points.map((pt) => `<li>${numbersHtml(fill(pt, p))}</li>`).join("")}</ul></details>` : "") +
      "</li>")
    .join("\n");
}

export function eduHtml(p) {
  return (p.education || [])
    .map((ed) => {
      const gpa = /GPA [\d.]+ \/ [\d.]+/.exec(ed.notes || "")?.[0];
      const meta = [`${ed.start} to ${ed.end}`, gpa].filter(Boolean).join(", ");
      return `<li><strong>${escapeHtml(ed.degree)}</strong>, ${escapeHtml(ed.school)}<span class="edu-meta">${escapeHtml(meta)}</span></li>`;
    })
    .join("\n");
}

// Fills real links and contact text into the static HTML (they used to be filled in only by
// JavaScript), so crawlers see the GitHub, LinkedIn, resume, and email links.
export function fillStatic(html, p) {
  const links = p.links || {};
  const hrefs = {
    github: githubUrl(p),
    linkedin: links.linkedin,
    resume: links.resume,
    email: links.email ? `mailto:${links.email}` : "",
  };
  let out = html.replace(/data-href="(\w+)" href="[^"]*"/g, (m, key) =>
    hrefs[key] ? `data-href="${key}" href="${escapeHtml(hrefs[key])}"` : m);
  const texts = { "email-text": links.email, status: fill(p.status, p), location: p.location };
  out = out.replace(/(<(\w+)[^>]*data-text="([\w-]+)"[^>]*>)[^<]*(<\/\2>)/g, (m, open, tag, key, close) =>
    key in texts && texts[key] ? `${open}${escapeHtml(texts[key])}${close}` : m);
  return out;
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
  html = replaceBlock(html, "tiles", tilesHtml(profile));
  html = replaceBlock(html, "more", moreHtml(profile));
  html = replaceBlock(html, "stats", statsHtml(profile));
  html = replaceBlock(html, "roles", rolesHtml(profile));
  html = replaceBlock(html, "edu", eduHtml(profile));
  html = fillStatic(html, profile);

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
