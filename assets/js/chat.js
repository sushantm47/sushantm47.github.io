// Chat console. Uses the Cloudflare Worker when configured; otherwise answers from
// knowledge.json in the browser (offline mode) so the site always works for free.

import { buildIndex, search } from "./retrieval.js";
import { fill, profileToChunks } from "./knowledge.js";
import { citedSources, parseAnswer } from "./render.js";

const TIMEOUT_MS = 20000;

export async function initChat(profile, root) {
  const form = root.querySelector("form");
  const input = root.querySelector("input");
  const log = root.querySelector("[data-log]");
  const note = root.querySelector("[data-mode]");
  const chips = root.querySelector("[data-suggestions]");
  const endpoint = (profile.chat?.endpoint || "").trim();
  const history = [];
  const index = buildIndex(await loadChunks(profile));

  note.textContent = endpoint
    ? "Answers are written from my repos and resume, and list their sources."
    : "Offline mode: answers show the most relevant excerpts from my repos and resume.";

  for (const q of profile.chat?.suggestions || []) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = fill(q, profile);
    b.addEventListener("click", () => ask(b.textContent));
    chips.append(b);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) ask(q);
  });
  document.addEventListener("portfolio:ask", (e) => {
    root.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    ask(e.detail);
  });

  let busy = false;
  async function ask(question) {
    if (busy) return;
    busy = true;
    input.value = "";
    form.querySelector("button").disabled = true;
    const turn = document.createElement("article");
    turn.className = "turn";
    const q = document.createElement("p");
    q.className = "turn-q";
    q.textContent = question;
    const a = document.createElement("div");
    a.className = "turn-a is-pending";
    a.textContent = "Looking through the repos…";
    turn.append(q, a);
    log.prepend(turn);

    let result;
    if (endpoint) {
      try {
        result = await askWorker(endpoint, question, history);
      } catch (err) {
        result = offlineAnswer(index, question);
        result.notice = err.status === 429
          ? "The assistant hit its free daily limit, so here are matching excerpts instead."
          : "The assistant is unreachable, so here are matching excerpts instead.";
      }
    } else {
      result = offlineAnswer(index, question);
    }

    history.push({ role: "user", content: question }, { role: "assistant", content: result.answer });
    history.splice(0, Math.max(0, history.length - 6));
    renderAnswer(a, result);
    busy = false;
    form.querySelector("button").disabled = false;
    input.focus();
  }
}

async function loadChunks(profile) {
  try {
    const res = await fetch("data/knowledge.json", { cache: "no-cache" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.chunks) && data.chunks.length) return data.chunks;
    }
  } catch {
    /* fall back to the profile alone */
  }
  return profileToChunks(profile);
}

async function askWorker(endpoint, message, history) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint.replace(/\/$/, "") + "/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, history }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = new Error(`chat returned ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function offlineAnswer(index, question) {
  // Keep only strong matches: weaker ones make excerpt answers noisy.
  const ranked = search(index, question, 3);
  const hits = ranked.filter((h) => h.score >= ranked[0].score * 0.5);
  if (!hits.length) {
    return {
      answer: "I couldn't find that in my portfolio. Try asking about a project, a skill, or my availability, or email me directly.",
      sources: [],
      mode: "offline",
    };
  }
  const sources = hits.map((h, i) => ({ n: i + 1, title: h.chunk.title, url: h.chunk.url || "" }));
  const lines = hits.map((h, i) => `- **${h.chunk.title}**: ${excerpt(h.chunk.text)} [${i + 1}]`);
  return { answer: ["Here's what my portfolio says:", ...lines].join("\n"), sources, mode: "offline" };
}

export function excerpt(text, max = 240) {
  const clean = String(text).replace(/[#*`>|]/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

function renderAnswer(container, result) {
  container.classList.remove("is-pending");
  container.replaceChildren();
  if (result.notice) {
    const n = document.createElement("p");
    n.className = "turn-notice";
    n.textContent = result.notice;
    container.append(n);
  }
  const blocks = parseAnswer(result.answer);
  const sources = result.sources || [];
  for (const block of blocks) {
    if (block.type === "list") {
      const ul = document.createElement("ul");
      for (const item of block.items) {
        const li = document.createElement("li");
        appendInlines(li, item, sources);
        ul.append(li);
      }
      container.append(ul);
    } else {
      const p = document.createElement("p");
      appendInlines(p, block.inlines, sources);
      container.append(p);
    }
  }
  const used = citedSources(blocks, sources).filter((s) => s.url);
  if (used.length) {
    const list = document.createElement("ol");
    list.className = "turn-sources";
    list.setAttribute("aria-label", "Sources");
    for (const s of used) {
      const li = document.createElement("li");
      li.value = s.n;
      const link = document.createElement("a");
      link.href = s.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = s.title;
      li.append(link);
      list.append(li);
    }
    container.append(list);
  }
}

function appendInlines(parent, inlines, sources) {
  for (const part of inlines) {
    if (part.type === "text") parent.append(part.value);
    else if (part.type === "strong" || part.type === "code") {
      const el = document.createElement(part.type === "strong" ? "strong" : "code");
      el.textContent = part.value;
      parent.append(el);
    } else if (part.type === "cite") {
      const source = sources.find((s) => s.n === part.n);
      const mark = document.createElement(source?.url ? "a" : "span");
      mark.className = "cite";
      mark.textContent = String(part.n);
      if (source?.url) {
        mark.href = source.url;
        mark.target = "_blank";
        mark.rel = "noopener";
        mark.title = source.title;
      }
      parent.append(mark);
    }
  }
}
