import { artSvg } from "./art.js";
import { initChat } from "./chat.js";
import {
  anchorFor,
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
  const profile = await (await fetch("data/profile.json", { cache: "no-cache" })).json();
  renderProfile(profile);

  const chat = await initChat(profile, document.getElementById("ask"));
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
  whenNear(document.getElementById("tiles"), () => loadRepoStats(profile));
  whenNear(document.getElementById("github"), () => loadRecentRepos(profile));
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
  document.title = `${p.name}, ${p.role}`;
  for (const node of document.querySelectorAll("[data-name]")) node.textContent = p.name;
  setText("role", p.role);
  setText("greeting", f(p.greeting || p.name));
  setText("intro", f(p.intro));
  setText("status", f(p.status));
  setText("availability", p.availability);
  setText("location", p.location);
  setText("graduating", p.education?.[0]?.end || "");
  setText("email-text", links.email);
  renderHeadline(p);
  renderPreviously(p);
  renderStats(p);

  setHref("github", githubUrl(p));
  setHref("linkedin", links.linkedin);
  setHref("resume", links.resume);
  setHref("email", `mailto:${links.email}`);
  for (const b of document.querySelectorAll("[data-copy-email]")) b.dataset.copy = links.email;

  const tags = document.getElementById("card-tags");
  for (const t of p.card_tags || []) tags.append(el("li", { text: t }));

  const tiles = document.getElementById("tiles");
  const projects = p.projects || [];
  let caseNumber = 0;
  projects.forEach((project, i) => {
    const featured = project.featured !== false;
    tiles.append(tile(project, featured ? ++caseNumber : 0, i, f));
  });
  initCaseDialog(p, f);

  const timeline = document.getElementById("experience-list");
  const rows = [
    ...(p.experience || []).map((e) => ({
      id: experienceAnchor(e.org), title: e.role, org: e.org, when: `${e.start} to ${e.end}`,
      where: e.location, points: e.points || [],
    })),
    ...(p.education || []).map((ed) => ({
      title: ed.degree, org: ed.school, when: `${ed.start} to ${ed.end}`, points: ed.notes ? [ed.notes] : [],
    })),
  ];
  rows.forEach((r, i) => {
    const item = el("li", { id: r.id, "data-reveal": "" },
      el("div", { class: "tl-head" },
        el("h3", {}, r.title, el("span", { class: "tl-org", text: ` at ${r.org}` })),
        el("p", { class: "tl-when", text: r.when })),
      r.where && el("p", { class: "tl-where", text: r.where }),
      r.points.length > 1
        ? el("ul", {}, ...r.points.map((pt) => withNumbers(el("li"), f(pt))))
        : r.points.length && withNumbers(el("p", { class: "tl-note" }), f(r.points[0])));
    stagger(item, i);
    timeline.append(item);
  });

  const skills = document.getElementById("skills-list");
  skillGroups(p).forEach((g, i) => {
    const used = (g.used_in || []).map((name) => {
      const href = anchorFor(name, p);
      return href ? el("a", { href, text: name }) : document.createTextNode(name);
    });
    const card = el("div", { class: "skill-group", "data-reveal": "" },
      el("h3", { text: g.group }),
      el("ul", { class: "tags" }, ...g.items.map((item) => el("li", { text: item }))),
      used.length && el("p", { class: "skill-used" }, "Used at and in ", ...interleave(used)));
    stagger(card, i);
    skills.append(card);
  });
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

function tile(project, caseNumber, index, f) {
  const hasCase = Boolean(project.case_study);
  const art = el("div", { class: "tile-art" });
  art.innerHTML = artSvg(project.art); // static, trusted markup from art.js

  const open = hasCase
    ? el("button", { type: "button", class: "tile-hit", "data-case": project.name, "aria-label": `Read the ${project.name} case study` }, art)
    : el("a", { class: "tile-hit", href: repoUrl(project), target: "_blank", rel: "noopener", "aria-label": `${project.name} on GitHub` }, art);

  const ask = el("button", { type: "button", class: "text-link", text: "Ask about this" });
  ask.addEventListener("click", () =>
    document.dispatchEvent(new CustomEvent("portfolio:ask", { detail: `Tell me about ${project.name}: the problem, the approach, and the result.` })));

  const node = el("article", {
    class: hasCase ? "tile tile-lg" : "tile",
    id: projectAnchor(project.name),
    "data-repo": project.repo,
    "data-reveal": "",
  },
    open,
    el("div", { class: "tile-body" },
      el("p", { class: "tile-kicker", text: caseNumber ? `Case study ${String(caseNumber).padStart(2, "0")}` : "Project" }),
      el("h3", { text: project.name }),
      el("p", { class: "tile-summary", text: f(project.summary) }),
      el("ul", { class: "tags tags-sm" }, ...(project.stack || []).map((s) => el("li", { text: s }))),
      el("p", { class: "tile-links" },
        hasCase && el("button", { type: "button", class: "text-link strong", "data-case": project.name, text: "Read case study" }),
        el("a", { class: "text-link", href: repoUrl(project), target: "_blank", rel: "noopener", text: "Code" }),
        ask),
      el("p", { class: "project-stats", "data-stats": "" })));
  node.style.setProperty("--tile", project.color || "#F4C95D");
  stagger(node, index);
  return node;
}

function initCaseDialog(profile, f) {
  const dialog = document.getElementById("case-dialog");
  const body = dialog.querySelector("[data-case-body]");
  let opener = null;

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-case]");
    if (!trigger) return;
    const project = (profile.projects || []).find((p) => p.name === trigger.dataset.case);
    if (!project?.case_study) return;
    opener = trigger;
    body.replaceChildren(caseStudy(project, f));
    dialog.style.setProperty("--tile", project.color || "#F4C95D");
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

function caseStudy(project, f) {
  const cs = project.case_study;
  const art = el("div", { class: "case-art" });
  art.innerHTML = artSvg(project.art);
  const ask = el("button", { type: "button", class: "text-link", text: "Ask about this" });
  ask.addEventListener("click", () => {
    document.getElementById("case-dialog").close();
    document.dispatchEvent(new CustomEvent("portfolio:ask", { detail: `Tell me about ${project.name}: the problem, the approach, and the result.` }));
  });
  return el("article", { class: "case" },
    art,
    el("p", { class: "tile-kicker", text: "Case study" }),
    el("h2", { id: "case-title", text: project.name }),
    el("p", { class: "case-summary", text: f(project.summary) }),
    el("ul", { class: "tags tags-sm" }, ...(project.stack || []).map((s) => el("li", { text: s }))),
    el("p", { class: "tile-links" },
      el("a", { class: "text-link strong", href: repoUrl(project), target: "_blank", rel: "noopener", text: "View the code" }),
      ask),
    el("div", { class: "case-result" }, el("h3", { text: "Result" }), withNumbers(el("p"), f(cs.result))),
    el("div", { class: "case-grid" },
      el("div", {}, el("h3", { text: "Problem" }), el("p", { text: f(cs.problem) })),
      el("div", {}, el("h3", { text: "Approach" }), el("p", { text: f(cs.approach) }))),
    cs.diagram?.length && el("ol", { class: "flow", "aria-label": `How ${project.name} works` },
      ...cs.diagram.map((d) => el("li", {}, el("span", { class: "flow-step", text: d.step }), el("span", { class: "flow-detail", text: d.detail })))),
    cs.decisions?.length && el("div", { class: "decisions" },
      el("h3", { text: "Key decisions" }),
      ...cs.decisions.map((d) => el("div", { class: "decision" }, el("h4", { text: d.title }), el("p", { text: f(d.detail) })))));
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
    else node.hidden = true;
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

async function loadRepoStats(profile) {
  if (!githubUser(profile)) return;
  const repos = [...new Set((profile.projects || []).map((p) => p.repo))];
  await Promise.all(repos.map(async (repo) => {
    try {
      const r = await gh(`/repos/${repo}`);
      // Language and stars only: "updated 5 years ago" would make older projects look abandoned.
      const text = [r.language, r.stargazers_count > 0 && `${r.stargazers_count} ${r.stargazers_count === 1 ? "star" : "stars"}`]
        .filter(Boolean).join(", ");
      for (const node of document.querySelectorAll(`[data-repo="${repo}"] [data-stats]`)) node.textContent = text;
    } catch { /* stats are optional */ }
  }));
}

async function loadRecentRepos(profile) {
  const user = githubUser(profile);
  const section = document.getElementById("github");
  if (!user) {
    section.hidden = true;
    return;
  }
  try {
    const shown = new Set((profile.projects || []).map((p) => p.repo.toLowerCase()));
    const list = await gh(`/users/${user}/repos?sort=pushed&per_page=12`);
    const target = document.getElementById("github-list");
    const fresh = list.filter((x) => !x.fork && !x.archived && !shown.has(x.full_name.toLowerCase())
      && x.name.toLowerCase() !== `${user}.github.io`.toLowerCase());
    fresh.slice(0, 6).forEach((r, i) => {
      const card = el("li", { "data-reveal": "" },
        el("a", { href: r.html_url, target: "_blank", rel: "noopener", text: r.name }),
        el("p", { text: r.description || "No description yet." }),
        r.language && el("p", { class: "meta", text: r.language }));
      stagger(card, i);
      target.append(card);
    });
    if (!target.children.length) section.hidden = true;
    reveal(target);
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
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0B1120" : "#F3F5F9");
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
