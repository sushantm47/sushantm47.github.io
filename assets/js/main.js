import { initChat } from "./chat.js";
import { fill, githubUrl, repoUrl } from "./knowledge.js";

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
    if (k === "text") node.textContent = v;
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter(Boolean));
  return node;
}

function renderProfile(p) {
  const f = (t) => fill(t, p);
  const links = p.links || {};
  document.title = `${p.name}, ${p.role}`;
  for (const node of document.querySelectorAll("[data-name]")) node.textContent = p.name;
  setText("role", p.role);
  setText("headline", f(p.headline));
  setText("intro", f(p.intro));
  setText("status", f(p.status));

  setHref("github", githubUrl(p));
  setHref("linkedin", links.linkedin);
  setHref("resume", links.resume);
  setHref("email", `mailto:${links.email}`);
  setText("email-text", links.email);

  const [lead, ...rest] = p.projects || [];
  const work = document.getElementById("work-list");
  if (lead) work.append(projectEntry(lead, f, true));
  for (const project of rest) work.append(projectEntry(project, f, false));

  const timeline = document.getElementById("experience-list");
  for (const e of p.experience || []) {
    timeline.append(
      el("li", {},
        el("p", { class: "when", text: `${e.start} to ${e.end}` }),
        el("div", {},
          el("h3", { text: `${e.role}, ${e.org}` }),
          el("ul", {}, ...(e.points || []).map((pt) => el("li", { text: f(pt) }))))));
  }
  for (const ed of p.education || []) {
    timeline.append(
      el("li", {},
        el("p", { class: "when", text: `${ed.start} to ${ed.end}` }),
        el("div", {},
          el("h3", { text: `${ed.degree}, ${ed.school}` }),
          ed.notes && el("p", { text: f(ed.notes) }))));
  }

  const skills = document.getElementById("skills-list");
  for (const [group, items] of Object.entries(p.skills || {})) {
    skills.append(el("div", {}, el("h3", { text: group }), el("p", { text: items.join(", ") })));
  }
}

function projectEntry(project, f, lead) {
  const ask = el("button", { type: "button", class: "link-button", text: "Ask about this" });
  ask.addEventListener("click", () =>
    document.dispatchEvent(
      new CustomEvent("portfolio:ask", { detail: `Tell me about ${project.name}: what problem it solves and how it works.` })));
  return el("article", { class: lead ? "project project-lead" : "project", "data-repo": project.repo },
    el("div", { class: "project-main" },
      el("h3", { text: project.name }),
      el("p", { class: "project-summary", text: f(project.summary) }),
      project.outcome && el("p", { class: "project-outcome", text: f(project.outcome) })),
    el("div", { class: "project-side" },
      el("p", { class: "project-stack", text: (project.stack || []).join(", ") }),
      el("p", { class: "project-stats", "data-stats": "" }),
      el("p", { class: "project-actions" },
        el("a", { href: repoUrl(project), target: "_blank", rel: "noopener", text: "Code" }),
        ask)));
}

function setText(key, value) {
  for (const node of document.querySelectorAll(`[data-text="${key}"]`)) node.textContent = value || "";
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
        node.textContent = [
          r.language,
          `${r.stargazers_count} ${r.stargazers_count === 1 ? "star" : "stars"}`,
          `updated ${relativeTime(r.pushed_at)}`,
        ].filter(Boolean).join(", ");
      }
    } catch { /* stats are optional */ }
  }));

  try {
    const list = await gh(`/users/${user}/repos?sort=pushed&per_page=8`);
    const target = document.getElementById("github-list");
    for (const r of list.filter((x) => !x.fork).slice(0, 6)) {
      target.append(
        el("li", {},
          el("a", { href: r.html_url, target: "_blank", rel: "noopener", text: r.name }),
          el("p", { text: r.description || "No description yet." }),
          el("p", { class: "meta", text: [r.language, `updated ${relativeTime(r.pushed_at)}`].filter(Boolean).join(", ") })));
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
