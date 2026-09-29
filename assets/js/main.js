import { initChat } from "./chat.js";
import {
  anchorFor,
  experienceAnchor,
  fill,
  githubUrl,
  joinList,
  projectAnchor,
  repoUrl,
  skillGroups,
} from "./knowledge.js";
import { splitNumbers } from "./render.js";

const PLACEHOLDER_USER = "your-github-username";

async function main() {
  initTheme();
  const profile = await (await fetch("data/profile.json", { cache: "no-cache" })).json();
  renderProfile(profile);
  await initChat(profile, document.getElementById("ask"));
  loadGithub(profile);
  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName || "");
    if (e.key === "/" && !typing) {
      e.preventDefault();
      document.querySelector("#ask input").focus();
    }
  });
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
  setText("headline", f(p.headline));
  setText("intro", f(p.intro));
  setText("previously", p.previously?.length ? `Previously at ${joinList(p.previously)}` : "");
  setText("status", f(p.status));
  renderStats(p);

  setHref("github", githubUrl(p));
  setHref("linkedin", links.linkedin);
  setHref("resume", links.resume);
  setHref("email", `mailto:${links.email}`);
  setText("email-text", links.email);

  const projects = p.projects || [];
  const featured = projects.filter((x) => x.featured !== false);
  const others = projects.filter((x) => x.featured === false);
  const work = document.getElementById("work-list");
  featured.forEach((project, i) => work.append(caseStudy(project, i, f)));
  const otherList = document.getElementById("other-list");
  for (const project of others) otherList.append(smallProject(project, f));
  document.getElementById("other").hidden = !others.length;

  const timeline = document.getElementById("experience-list");
  for (const e of p.experience || []) {
    timeline.append(
      el("li", { id: experienceAnchor(e.org) },
        el("div", { class: "when" }, el("p", { text: `${e.start} to ${e.end}` }), e.location && el("p", { text: e.location })),
        el("div", {},
          el("h3", { text: `${e.role}, ${e.org}` }),
          el("ul", {}, ...(e.points || []).map((pt) => withNumbers(el("li"), f(pt)))))));
  }
  for (const ed of p.education || []) {
    timeline.append(
      el("li", {},
        el("div", { class: "when" }, el("p", { text: `${ed.start} to ${ed.end}` })),
        el("div", {},
          el("h3", { text: `${ed.degree}, ${ed.school}` }),
          ed.notes && withNumbers(el("p"), f(ed.notes)))));
  }

  const skills = document.getElementById("skills-list");
  for (const g of skillGroups(p)) {
    const used = (g.used_in || []).map((name) => {
      const href = anchorFor(name, p);
      return href ? el("a", { href, text: name }) : document.createTextNode(name);
    });
    skills.append(
      el("div", { class: "skill-group" },
        el("h3", { text: g.group }),
        el("p", { text: g.items.join(", ") }),
        used.length && el("p", { class: "skill-used" }, "Used at and in ", ...interleave(used))));
  }
}

function renderStats(p) {
  const list = document.getElementById("stats");
  list.replaceChildren();
  for (const st of p.stats || []) {
    list.append(el("div", {}, el("dt", { text: st.value }), el("dd", { text: st.label })));
  }
  list.hidden = !(p.stats || []).length;
}

function actions(project, question) {
  const ask = el("button", { type: "button", class: "link-button", text: "Ask about this" });
  ask.addEventListener("click", () =>
    document.dispatchEvent(new CustomEvent("portfolio:ask", { detail: question })));
  return el("p", { class: "project-actions" },
    el("a", { href: repoUrl(project), target: "_blank", rel: "noopener", text: "Code" }),
    ask);
}

function caseStudy(project, index, f) {
  const cs = project.case_study;
  const question = `Tell me about ${project.name}: the problem, the approach, and the result.`;
  const head = el("header", { class: "case-head" },
    el("p", { class: "eyebrow", text: `Case study ${String(index + 1).padStart(2, "0")}` }),
    el("h3", { text: project.name }),
    el("p", { class: "case-summary", text: f(project.summary) }),
    el("p", { class: "case-meta" },
      project.kind && el("span", { text: project.kind }),
      el("span", { text: (project.stack || []).join(", ") }),
      el("span", { class: "project-stats", "data-stats": "" })),
    actions(project, question));

  if (!cs) {
    return el("article", { class: "case", id: projectAnchor(project.name), "data-repo": project.repo },
      head,
      project.outcome && el("div", { class: "case-result" }, el("h4", { text: "Result" }), withNumbers(el("p"), f(project.outcome))));
  }

  const flow = cs.diagram?.length && el("ol", { class: "flow", "aria-label": `How ${project.name} works` },
    ...cs.diagram.map((d) =>
      el("li", {}, el("span", { class: "flow-step", text: d.step }), el("span", { class: "flow-detail", text: d.detail }))));

  const decisions = cs.decisions?.length && el("details", { class: "case-more" },
    el("summary", { text: `Key decisions (${cs.decisions.length})` }),
    el("div", { class: "decisions" },
      ...cs.decisions.map((d) => el("div", {}, el("h5", { text: d.title }), el("p", { text: f(d.detail) })))));

  return el("article", { class: "case", id: projectAnchor(project.name), "data-repo": project.repo },
    head,
    el("div", { class: "case-result" }, el("h4", { text: "Result" }), withNumbers(el("p"), f(cs.result))),
    el("div", { class: "case-grid" },
      el("div", {}, el("h4", { text: "Problem" }), el("p", { text: f(cs.problem) })),
      el("div", {}, el("h4", { text: "Approach" }), el("p", { text: f(cs.approach) }))),
    flow,
    decisions);
}

function smallProject(project, f) {
  return el("article", { class: "mini", id: projectAnchor(project.name), "data-repo": project.repo },
    el("h3", { text: project.name }),
    el("p", { text: f(project.summary) }),
    el("p", { class: "mini-stack", text: (project.stack || []).join(", ") }),
    el("p", { class: "project-stats", "data-stats": "" }),
    actions(project, `Tell me about ${project.name}.`));
}

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

async function loadGithub(profile) {
  const user = profile.links?.github;
  const section = document.getElementById("github");
  if (!user || user === PLACEHOLDER_USER) {
    section.hidden = true;
    return;
  }
  const repos = [...new Set((profile.projects || []).map((p) => p.repo))];
  await Promise.all(repos.map(async (repo) => {
    try {
      const r = await gh(`/repos/${repo}`);
      for (const node of document.querySelectorAll(`[data-repo="${repo}"] [data-stats]`)) {
        // Language and stars only: "updated 5 years ago" would make older projects look abandoned.
        node.textContent = [
          r.language,
          r.stargazers_count > 0 && `${r.stargazers_count} ${r.stargazers_count === 1 ? "star" : "stars"}`,
        ].filter(Boolean).join(", ");
      }
    } catch { /* stats are optional */ }
  }));

  try {
    const shown = new Set(repos.map((r) => r.toLowerCase()));
    const list = await gh(`/users/${user}/repos?sort=pushed&per_page=12`);
    const target = document.getElementById("github-list");
    const fresh = list.filter((x) => !x.fork && !x.archived && !shown.has(x.full_name.toLowerCase())
      && x.name.toLowerCase() !== `${user}.github.io`.toLowerCase());
    for (const r of fresh.slice(0, 6)) {
      target.append(
        el("li", {},
          el("a", { href: r.html_url, target: "_blank", rel: "noopener", text: r.name }),
          el("p", { text: r.description || "No description yet." }),
          r.language && el("p", { class: "meta", text: r.language })));
    }
    if (!target.children.length) section.hidden = true;
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

// ----- theme -----

function initTheme() {
  const button = document.getElementById("theme");
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch { /* ignore */ }
  if (saved) document.documentElement.dataset.theme = saved;
  const sync = () => {
    const dark = (document.documentElement.dataset.theme ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
    button.setAttribute("aria-pressed", String(dark));
    button.textContent = dark ? "Light mode" : "Dark mode";
  };
  button.addEventListener("click", () => {
    const next = button.getAttribute("aria-pressed") === "true" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* ignore */ }
    sync();
  });
  sync();
}

if (typeof document !== "undefined") {
  main().catch((err) => {
    console.error(err);
    document.getElementById("load-error").hidden = false;
  });
}
