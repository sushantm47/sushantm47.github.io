import { artSvg } from "./art.js";
import { parseMarkdown, safeHref, withoutTitle } from "./markdown.js";
import { initChat } from "./chat.js";
import {
  employers,
  experienceAnchor,
  fill,
  githubUrl,
  headlineParts,
  projectAnchor,
  repoUrl,
  skillGroups,
} from "./knowledge.js";
import { splitNumbers } from "./render.js";
import { copyButtons, countUp, dockAsk, progressBar, reveal, scrollSpy, whenNear } from "./ui.js";

const PLACEHOLDER_USER = "your-github-username";

async function main() {
  document.documentElement.classList.add("js");
  initTheme();
  const profile = await (await fetch("data/site.json", { cache: "no-cache" })).json();
  renderProfile(profile);

  const chat = await initChat(profile, document.getElementById("ask"));
  // (the ask box lives in its own section; it docks into the nav when that section is off screen)
  const dock = dockAsk({
    slot: document.getElementById("ask-slot"),
    ask: document.getElementById("ask"),
    dock: document.getElementById("dock"),
    panel: document.getElementById("ask-panel"),
  });
  document.addEventListener("portfolio:ask", (e) => {
    dock.reveal();
    chat.ask(e.detail);
  });
  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName || "");
    if (e.key === "/" && !typing && !document.getElementById("case-dialog").open) {
      e.preventDefault();
      dock.focus();
    }
  });

  reveal();
  countUp([...document.querySelectorAll("#stats dt")]);
  scrollSpy([...document.querySelectorAll(".bar-nav a")]);
  progressBar(document.getElementById("progress"));
  copyButtons(document.getElementById("toast"));

  // Lazy loading: GitHub data is fetched only when its section is about to be seen.
  // Wake the sleeping demo server while visitors read the work section (no model tokens used).
  whenNear(document.getElementById("tiles"), () => wakeDemos(profile), "200px");

  // Lazy loading: GitHub activity is fetched only when its section is about to be seen.
  whenNear(document.getElementById("activity"), () => loadActivity(profile));
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "text") node.textContent = v;
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== undefined && c !== null && c !== false && c !== 0 && c !== ""));
  return node;
}

// ----- page content -----

function renderProfile(p) {
  const f = (t) => fill(t, p);
  const links = p.links || {};
  for (const node of document.querySelectorAll("[data-name]")) node.textContent = p.name;
  setText("tagline", f(p.tagline || p.intro));
  setText("status", f(p.status));
  setText("location", p.location);
  setText("email-text", links.email);
  const grad = p.education?.[0]?.end;
  const availability = document.getElementById("availability");
  if (availability) availability.textContent = [p.availability, grad && `graduating ${grad}`].filter(Boolean).join(", ");
  renderHeadline(p);
  renderPreviously(p);
  renderStats(p);

  setHref("github", githubUrl(p));
  setHref("linkedin", links.linkedin);
  setHref("resume", links.resume);
  setHref("email", `mailto:${links.email}`);
  for (const b of document.querySelectorAll("[data-copy-email]")) b.dataset.copy = links.email;

  const projects = p.projects || [];
  const tiles = document.getElementById("tiles");
  tiles.replaceChildren(); // replaces the prerendered copy with interactive tiles
  projects.filter((x) => x.featured !== false).forEach((project, i) => tiles.append(tile(project, i + 1, f)));
  initCaseDialog(p, f);

  const roles = document.getElementById("roles");
  roles.replaceChildren();
  (p.experience || []).forEach((e, i) => {
    const item = el("li", { id: experienceAnchor(e.org), class: "role", "data-reveal": "" },
      el("div", { class: "role-head" },
        el("h3", {}, e.role, el("span", { class: "role-org", text: ` at ${e.org}` })),
        el("p", { class: "role-when", text: `${e.start} to ${e.end}` })),
      withNumbers(el("p", { class: "role-summary" }), f(e.summary || e.points?.[0] || "")),
      e.tags?.length && el("ul", { class: "tags tags-sm" }, ...e.tags.map((t) => el("li", { text: t }))),
      e.points?.length > 0 && el("details", { class: "role-more" },
        el("summary", { text: "More" }),
        el("ul", {}, ...e.points.map((pt) => withNumbers(el("li"), f(pt))))));
    stagger(item, i);
    roles.append(item);
  });

  const toolbox = document.getElementById("toolbox");
  toolbox.replaceChildren(...skillGroups(p).map((g) => el("div", {},
    el("dt", { text: g.group }),
    el("dd", {}, el("ul", { class: "tags tags-sm" }, ...g.items.map((t) => el("li", { text: t })))))));

  const edu = document.getElementById("edu-list");
  edu.replaceChildren();
  for (const ed of p.education || []) {
    const gpa = /GPA [\d.]+ \/ [\d.]+/.exec(ed.notes || "")?.[0];
    edu.append(el("li", {},
      el("strong", { text: ed.degree }), `, ${ed.school}`,
      el("span", { class: "edu-meta", text: [`${ed.start} to ${ed.end}`, gpa].filter(Boolean).join(", ") })));
  }
}

function renderHeadline(p) {
  const h1 = document.getElementById("headline");
  h1.replaceChildren(...headlineParts(fill(p.headline, p), p.headline_accent).map((part) =>
    part.accent ? el("span", { class: "accent", text: part.text }) : part.text));
}

function renderPreviously(p) {
  const node = document.getElementById("previously");
  const list = employers(p).map((e) =>
    e.url ? el("a", { href: e.url, target: "_blank", rel: "noopener", text: e.name }) : document.createTextNode(e.name));
  node.replaceChildren(...(list.length ? ["Previously at ", ...interleave(list)] : []));
  node.hidden = !list.length;
}

function renderStats(p) {
  const list = document.getElementById("stats");
  list.replaceChildren(...(p.stats || []).map((st) =>
    el("div", {}, el("dt", { text: st.value }), el("dd", { text: st.label }))));
  list.hidden = !(p.stats || []).length;
}

// ----- project tiles and case studies -----

function tile(project, caseNumber, f) {
  const art = el("div", { class: "tile-art" });
  art.innerHTML = artSvg(project.art); // static, trusted markup from art.js
  const hasCase = hasCaseStudy(project);
  const node = el(hasCase ? "button" : "a", {
    class: "tile",
    id: projectAnchor(project.name),
    "data-repo": project.repo,
    ...(hasCase
      ? { type: "button", "data-case": project.name, "aria-label": `${project.name}: read the case study` }
      : { href: repoUrl(project), target: "_blank", rel: "noopener" }),
  },
    art,
    el("span", { class: "tile-body" },
      el("span", { class: "tile-kicker", text: `Case study ${String(caseNumber).padStart(2, "0")}` }),
      el("span", { class: "tile-title", text: project.name }),
      el("span", { class: "tile-summary", text: f(project.tagline || project.summary) }),
      el("span", { class: "tile-foot" },
        el("span", { class: "tile-tags", text: (project.stack || []).slice(0, 3).join(", ") }),
        el("span", { class: "tile-cta", text: hasCase ? "Read case study" : "View code" }))));
  const badge = project.demo && el("a", { class: "demo-badge", href: project.demo.page },
    el("span", { class: "pulse", "aria-hidden": "true" }), "Live demo");
  const wrap = el("div", { class: "tile-wrap", "data-reveal": "" }, node, badge);
  stagger(wrap, caseNumber - 1);
  return wrap;
}

// A demo hosted on a free plan sleeps when idle. A GET /health wakes it without using any
// model tokens, so by the time a visitor opens the demo it is usually ready.
export function wakeDemos(profile) {
  for (const project of profile.projects || []) {
    if (!project.demo?.api) continue;
    const key = `woken:${project.demo.api}`;
    try {
      if (sessionStorage.getItem(key)) continue;
      sessionStorage.setItem(key, "1");
    } catch { /* storage unavailable: wake anyway */ }
    fetch(`${project.demo.api.replace(/\/$/, "")}/health`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
  }
}

function initCaseDialog(profile, f) {
  const dialog = document.getElementById("case-dialog");
  const body = dialog.querySelector("[data-case-body]");
  let opener = null;

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-case]");
    if (!trigger) return;
    const project = (profile.projects || []).find((p) => p.name === trigger.dataset.case);
    if (!hasCaseStudy(project)) return;
    wakeDemos({ projects: [project] });
    opener = trigger;
    body.replaceChildren(caseStudy(project, f));
    dialog.showModal();
    document.documentElement.classList.add("is-locked");
    dialog.querySelector(".case-close").focus();
  });
  dialog.querySelector("[data-case-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close(); // click on the backdrop
  });
  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("is-locked");
    opener?.focus();
  });
}

export function hasCaseStudy(project) {
  return Boolean(project?.highlights?.length || project?.readme);
}

// The README is fetched live, so edits on GitHub show up immediately; the copy from the last
// build is the fallback (for example when GitHub's rate limit is reached).
async function liveReadme(project) {
  const key = `readme:${project.repo}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return cached;
  } catch { /* storage unavailable */ }
  try {
    const res = await fetch(`https://api.github.com/repos/${project.repo}/readme`, {
      headers: { accept: "application/vnd.github.raw+json" },
    });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    try { sessionStorage.setItem(key, text); } catch { /* storage full */ }
    return text;
  } catch {
    return project.readme || "";
  }
}

function inlineNodes(parts, repo) {
  return parts.map((p) => {
    if (p.type === "link") {
      const href = safeHref(p.href, repo);
      return href ? el("a", { href, target: "_blank", rel: "noopener", text: p.value }) : p.value;
    }
    if (p.type === "code") return el("code", { text: p.value });
    if (p.type === "strong") return el("strong", { text: p.value });
    if (p.type === "em") return el("em", { text: p.value });
    return p.value;
  });
}

function markdownNodes(markdown, repo) {
  return withoutTitle(parseMarkdown(markdown)).map((b) => {
    if (b.type === "heading") return el(`h${Math.min(6, b.level + 2)}`, {}, ...inlineNodes(b.inlines, repo));
    if (b.type === "paragraph") return el("p", {}, ...inlineNodes(b.inlines, repo));
    if (b.type === "quote") return el("blockquote", {}, ...inlineNodes(b.inlines, repo));
    if (b.type === "list") return el(b.ordered ? "ol" : "ul", {}, ...b.items.map((i) => el("li", {}, ...inlineNodes(i, repo))));
    if (b.type === "rule") return el("hr");
    if (b.type === "code") {
      return b.lang === "mermaid"
        ? el("p", { class: "case-note", text: "A diagram is included in the README on GitHub." })
        : el("pre", {}, el("code", { text: b.text }));
    }
    if (b.type === "table") {
      return el("div", { class: "table-wrap" }, el("table", {},
        el("thead", {}, el("tr", {}, ...b.head.map((c) => el("th", {}, ...inlineNodes(c, repo))))),
        el("tbody", {}, ...b.rows.map((r) => el("tr", {}, ...r.map((c) => el("td", {}, ...inlineNodes(c, repo))))))));
    }
    return null;
  }).filter(Boolean);
}

function caseStudy(project, f) {
  const art = el("div", { class: "case-art" });
  art.innerHTML = artSvg(project.art);
  const ask = el("button", { type: "button", class: "text-link", text: "Ask about this" });
  ask.addEventListener("click", () => {
    document.getElementById("case-dialog").close();
    document.dispatchEvent(new CustomEvent("portfolio:ask", { detail: `Tell me about ${project.name}: the problem, the approach, and the result.` }));
  });
  const readme = el("div", { class: "readme", "aria-busy": "true" }, el("p", { class: "case-note", text: "Loading the README from GitHub…" }));
  liveReadme(project).then((text) => {
    readme.replaceChildren(...(text ? markdownNodes(text, project.repo) : [el("p", { class: "case-note", text: "This repository has no README yet." })]));
    readme.removeAttribute("aria-busy");
  });
  return el("article", { class: "case" },
    art,
    el("p", { class: "tile-kicker", text: project.previous_name ? `Case study, previously named ${project.previous_name}` : "Case study" }),
    el("h2", { id: "case-title", text: project.name }),
    el("p", { class: "case-summary", text: f(project.tagline || project.summary) }),
    el("ul", { class: "tags tags-sm" }, ...(project.stack || []).map((s) => el("li", { text: s }))),
    el("p", { class: "tile-links" },
      project.demo && el("a", { class: "button button-sm", href: project.demo.page, text: "Try the live demo" }),
      el("a", { class: "text-link strong", href: repoUrl(project), target: "_blank", rel: "noopener", text: "View the code" }),
      project.release && el("a", { class: "activity-release", href: project.release.url, target: "_blank", rel: "noopener", text: project.release.tag }),
      ask),
    project.demo && el("p", { class: "case-note", text: "The demo server sleeps when idle. If it's asleep, the demo page wakes it, usually in under a minute, and shows a recorded example meanwhile." }),
    project.highlights?.length && el("div", { class: "case-result" },
      el("h3", { text: "Highlights" }),
      el("ul", {}, ...project.highlights.map((h) => withNumbers(el("li"), f(h))))),
    el("div", { class: "case-readme" },
      el("h3", {}, "From the README ", el("span", { class: "case-note", text: "(live from GitHub)" })),
      readme));
}

// ----- small helpers -----

// Appends text to a node, wrapping impact numbers in <strong class="num">.
function withNumbers(node, text) {
  for (const part of splitNumbers(text)) {
    node.append(part.number ? el("strong", { class: "num", text: part.text }) : part.text);
  }
  return node;
}

function interleave(nodes) {
  const out = [];
  nodes.forEach((n, i) => {
    if (i > 0) out.push(i === nodes.length - 1 ? (nodes.length > 2 ? ", and " : " and ") : ", ");
    out.push(n);
  });
  return out;
}

function stagger(node, i) {
  node.style.setProperty("--i", String(i % 6));
}

function setText(key, value) {
  for (const node of document.querySelectorAll(`[data-text="${key}"]`)) {
    node.textContent = value || "";
    node.hidden = !value;
  }
}

function setHref(key, value) {
  for (const node of document.querySelectorAll(`[data-href="${key}"]`)) {
    if (value) node.setAttribute("href", value);
    else node.hidden = true; // e.g. no resume file configured: hide its buttons
  }
}

// ----- live GitHub data (public API, no key; cached per session) -----

async function gh(path) {
  const key = `gh:${path}`;
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) || "null");
    if (hit && Date.now() - hit.at < 3600_000) return hit.data;
  } catch { /* storage unavailable */ }
  const res = await fetch(`https://api.github.com${path}`, { headers: { accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const data = await res.json();
  try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* ignore */ }
  return data;
}

function githubUser(profile) {
  const user = profile.links?.github;
  return user && user !== PLACEHOLDER_USER ? user : null;
}

// Recent activity: the newest commit in each recently pushed public repository. Read live
// from GitHub's public API (no token), cached for the session, so the section stays current
// without rebuilding the site.
export function activityItems(repos, commitsByRepo, user, limit = 5) {
  return repos
    .filter((r) => !r.fork && !r.archived && r.name.toLowerCase() !== `${user}.github.io`.toLowerCase())
    .map((r) => ({ repo: r, commit: commitsByRepo[r.full_name] }))
    .filter((x) => x.commit)
    .sort((a, b) => Date.parse(b.commit.date) - Date.parse(a.commit.date))
    .slice(0, limit);
}

export function firstLine(message, max = 90) {
  const line = String(message || "").split("\n")[0].trim();
  return line.length > max ? `${line.slice(0, line.lastIndexOf(" ", max - 1))}…` : line;
}

async function loadActivity(profile) {
  const user = githubUser(profile);
  const list = document.getElementById("activity-list");
  const section = document.getElementById("activity");
  if (!user) {
    section.hidden = true;
    return;
  }
  try {
    const repos = (await gh(`/users/${user}/repos?sort=pushed&per_page=8`)).slice(0, 6);
    const commitsByRepo = {};
    const releaseByRepo = {};
    await Promise.all(repos.map(async (r) => {
      try {
        const [release] = await gh(`/repos/${r.full_name}/releases?per_page=1`);
        if (release && !release.draft) releaseByRepo[r.full_name] = release;
      } catch { /* releases are optional */ }
    }));
    await Promise.all(repos.map(async (r) => {
      try {
        const [latest] = await gh(`/repos/${r.full_name}/commits?per_page=1`);
        if (latest) {
          commitsByRepo[r.full_name] = {
            message: latest.commit.message,
            date: latest.commit.author?.date || latest.commit.committer?.date,
            url: latest.html_url,
          };
        }
      } catch { /* an empty or private repo is skipped */ }
    }));
    const items = activityItems(repos, commitsByRepo, user);
    list.replaceChildren(...items.map(({ repo, commit }, i) => {
      const item = el("li", { "data-reveal": "" },
        el("div", { class: "activity-head" },
          el("a", { class: "activity-repo", href: repo.html_url, target: "_blank", rel: "noopener", text: repo.name }),
          releaseByRepo[repo.full_name] && el("a", {
            class: "activity-release", href: releaseByRepo[repo.full_name].html_url,
            target: "_blank", rel: "noopener", text: releaseByRepo[repo.full_name].tag_name,
          }),
          el("time", { datetime: commit.date, text: relativeTime(commit.date) })),
        el("a", { class: "activity-commit", href: commit.url, target: "_blank", rel: "noopener", text: firstLine(commit.message) }),
        repo.description && el("p", { class: "activity-desc", text: repo.description }),
        repo.language && el("p", { class: "meta", text: repo.language }));
      stagger(item, i);
      return item;
    }));
    list.removeAttribute("aria-busy");
    if (!items.length) section.hidden = true;
    reveal(list);
  } catch {
    section.hidden = true;
  }
}

export function relativeTime(iso, now = Date.now()) {
  const days = Math.floor((now - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

// ----- theme: dark by default, remembered once the visitor picks -----

function initTheme() {
  const button = document.getElementById("theme");
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch { /* ignore */ }
  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    button.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0C0C0E" : "#F7F7F8");
  };
  apply(saved === "light" ? "light" : "dark");
  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    apply(next);
    try { localStorage.setItem("theme", next); } catch { /* ignore */ }
  });
}

if (typeof document !== "undefined") {
  main().catch((err) => {
    console.error(err);
    document.getElementById("load-error").hidden = false;
  });
}
