import { artSvg } from "./art.js";
import { initChat } from "./chat.js";
import {
  employers,
  experienceAnchor,
  fill,
  githubUrl,
  headlineParts,
  projectAnchor,
  repoUrl,
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
  // Lazy loading: other public repos are fetched only when "More projects" is about to be seen.
  whenNear(document.querySelector(".more"), () => loadMoreRepos(profile));
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
  projects.filter((x) => x.featured !== false).forEach((project, i) => tiles.append(tile(project, i + 1, f)));
  const more = document.getElementById("more-list");
  for (const project of projects.filter((x) => x.featured === false)) {
    more.append(moreRow({ name: project.name, text: f(project.tagline || project.summary), tags: project.stack, url: repoUrl(project), repo: project.repo }));
  }
  initCaseDialog(p, f);

  const roles = document.getElementById("roles");
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

  const edu = document.getElementById("edu-list");
  for (const ed of p.education || []) {
    const gpa = /GPA [\d.]+ \/ [\d.]+/.exec(ed.notes || "")?.[0];
    edu.append(el("li", {},
      el("strong", { text: ed.degree }), `, ${ed.school}`,
      el("span", { class: "edu-meta", text: [`${ed.start} to ${ed.end}`, gpa].filter(Boolean).join(", ") })));
  }
}

function moreRow({ name, text, tags, url, repo }) {
  return el("li", { "data-repo": repo || "", "data-reveal": "" },
    el("a", { class: "more-name", href: url, target: "_blank", rel: "noopener", text: name }),
    el("p", { text }),
    tags?.length && el("ul", { class: "tags tags-sm" }, ...tags.slice(0, 3).map((t) => el("li", { text: t }))));
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
  const node = el(project.case_study ? "button" : "a", {
    class: "tile",
    id: projectAnchor(project.name),
    "data-repo": project.repo,
    "data-reveal": "",
    ...(project.case_study
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
        el("span", { class: "tile-cta", text: project.case_study ? "Read case study" : "View code" }))));
  node.style.setProperty("--tile", project.color || "#F4C95D");
  stagger(node, caseNumber - 1);
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

// Adds your other public repos (newest first) to "More projects".
async function loadMoreRepos(profile) {
  const user = githubUser(profile);
  if (!user) return;
  try {
    const shown = new Set((profile.projects || []).map((p) => p.repo.toLowerCase()));
    const list = await gh(`/users/${user}/repos?sort=pushed&per_page=12`);
    const target = document.getElementById("more-list");
    const extra = list.filter((x) => !x.fork && !x.archived && !shown.has(x.full_name.toLowerCase())
      && x.name.toLowerCase() !== `${user}.github.io`.toLowerCase() && x.description);
    for (const r of extra.slice(0, 4)) {
      target.append(moreRow({ name: r.name, text: r.description, tags: r.language ? [r.language] : [], url: r.html_url, repo: r.full_name }));
    }
    reveal(target);
  } catch { /* the curated projects are enough */ }
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
