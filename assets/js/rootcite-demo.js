// RootCite live demo, served from the portfolio so it loads instantly.
// The API runs on a free host that sleeps when idle: this page shows a recorded example at
// once, wakes the API in the background (GET /health uses no model tokens), and enables
// live runs when it answers. All API output is rendered as text, never as HTML.

export const EXPECTED_WAKE_SECONDS = 60;
export const GIVE_UP_SECONDS = 150;
const POLL_MS = 3000;

// Progress shown while waking: approaches but never reaches 100% until the API answers.
export function wakeProgress(elapsedSeconds) {
  const fraction = elapsedSeconds / EXPECTED_WAKE_SECONDS;
  return Math.min(0.95, fraction < 1 ? fraction * 0.85 : 0.85 + (1 - 1 / fraction) * 0.1);
}

export function readyText(health) {
  const model = health.llm_provider === "offline" ? "offline planner" : health.model;
  const left = Number.isInteger(health.live_runs_remaining)
    ? `, ${health.live_runs_remaining} live runs left today`
    : "";
  return `Demo server ready (${model}${left}).`;
}

export function errorMessage(status, body, retryAfter) {
  if (status === 429 && body?.reason === "daily_budget") {
    return "Today's live runs are used up. The recorded example is shown; live runs reset at midnight UTC.";
  }
  if (status === 429) return `Too many runs in a short time. Try again in ${retryAfter || 60} seconds.`;
  if (status === 503) return "The model is busy right now. Try again in a minute.";
  return `The run failed (HTTP ${status}). The recorded example is shown instead.`;
}

// ----- page -----

const $ = (id) => document.getElementById(id);

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (cls) node.className = cls;
  return node;
}

async function getJson(url, { timeoutMs = 10_000, ...init } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body, retryAfter: res.headers.get("retry-after") };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setStatus(state, text, progress) {
  $("status").dataset.state = state;
  $("status-text").textContent = text;
  if (progress !== undefined) $("status-bar").style.width = `${Math.round(progress * 100)}%`;
}

function setBanner(text, kind = "") {
  const banner = $("banner");
  banner.textContent = text;
  banner.className = `banner ${kind}`.trim();
}

function block(title, child) {
  const section = el("div", null, "block");
  section.append(el("h2", title), child);
  return section;
}

function renderResult(d) {
  const out = $("result");
  out.replaceChildren();
  const meta = el("p", null, "meta");
  meta.append(
    el("span", `${(d.latency_ms / 1000).toFixed(1)} s`),
    el("span", `${d.usage.input_tokens + d.usage.output_tokens} tokens`),
    el("span", `${d.tools_called.length} tool calls`),
  );
  if (d.cached) meta.append(el("span", "served from cache"));

  const badges = el("p", null, "badges");
  badges.append(
    el("span", d.grounded ? "Grounded in evidence" : "Not grounded", `badge ${d.grounded ? "good" : "attn"}`),
    el("span", d.needs_human ? "Needs human review" : "Safe to act on", `badge ${d.needs_human ? "attn" : "good"}`),
  );
  const meter = el("div", null, "meter");
  const fill = el("span");
  meter.append(fill);
  requestAnimationFrame(() => { fill.style.width = `${Math.round(d.confidence * 100)}%`; });

  out.append(meta, block("Root cause", el("p", d.root_cause, "root")), badges,
    el("p", `Confidence ${Math.round(d.confidence * 100)}%`, "note"), meter);

  const list = (items, tag, cls) => {
    const node = el(tag, null, cls);
    items.forEach((item) => node.append(el("li", item)));
    return node;
  };
  if (d.recommended_actions.length) out.append(block("Recommended actions", list(d.recommended_actions, "ol")));
  if (d.warnings.length) out.append(block("Guardrail warnings", list(d.warnings, "ul", "warn")));
  if (d.blocked_actions.length) out.append(block("Held for human approval", list(d.blocked_actions, "ul", "blocked")));
  if (d.tools_called.length) out.append(block("Tools the agent called", list(d.tools_called, "ul", "chips")));

  const table = el("table");
  const head = el("tr");
  ["ID", "Kind", "Source", "Section", ""].forEach((h) => head.append(el("th", h)));
  table.append(head);
  const cited = new Set(d.citations);
  for (const e of d.evidence) {
    const row = el("tr", null, cited.has(e.evidence_id) ? "cited" : "");
    row.append(el("td", e.evidence_id, "id"), el("td", e.kind), el("td", e.source), el("td", e.section),
      el("td", e.flagged ? "injection suspected" : "", "flag"));
    table.append(row);
  }
  const wrap = el("div", null, "table-wrap");
  wrap.append(table);
  const evidence = el("div");
  evidence.append(el("p", "Highlighted rows are the evidence the diagnosis cites.", "note"), wrap);
  out.append(block("Evidence", evidence));
}

async function main() {
  const [profile, example] = await Promise.all([
    getJson("../data/profile.json").then((r) => r.body),
    getJson("../data/rootcite-example.json").then((r) => r.body),
  ]);
  const project = (profile?.projects || []).find((p) => p.demo);
  const api = project.demo.api.replace(/\/$/, "");
  $("repo").href = `https://github.com/${project.repo}`;

  const scenarios = example.scenarios;
  const list = $("scenarios");
  const select = $("service");
  const choose = (index) => {
    const s = scenarios[index];
    select.value = s.service;
    $("title").value = s.title;
    $("description").value = s.description;
    list.querySelectorAll(".scenario").forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
  };
  scenarios.forEach((s, i) => {
    const button = el("button", null, "scenario");
    button.type = "button";
    button.append(el("b", s.service), el("span", s.title));
    button.addEventListener("click", () => choose(i));
    list.append(button);
    select.append(new Option(s.service, s.service));
  });
  choose(example.scenario);

  const showExample = (note) => {
    renderResult(example.result);
    setBanner(note || `Recorded example (${example.recorded_with}). Run it live once the server is ready.`);
  };
  showExample();

  const run = $("run");
  const enable = () => { run.disabled = false; run.textContent = "Run diagnosis"; };

  (async function wake() {
    const started = performance.now();
    const tick = setInterval(() => {
      const seconds = (performance.now() - started) / 1000;
      setStatus("waking", `Starting the demo server… ${Math.round(seconds)} s (usually under a minute)`,
        wakeProgress(seconds));
    }, 1000);
    while ((performance.now() - started) / 1000 < GIVE_UP_SECONDS) {
      try {
        const health = await getJson(`${api}/health`, { cache: "no-store" });
        if (health.ok) {
          clearInterval(tick);
          setStatus("ready", readyText(health.body), 1);
          enable();
          return;
        }
      } catch { /* still waking */ }
      await sleep(POLL_MS);
    }
    clearInterval(tick);
    setStatus("down", "The demo server didn't respond. The recorded example is shown; you can still try a live run.");
    enable();
  })();

  $("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    run.disabled = true;
    run.textContent = "Investigating…";
    setBanner("Retrieving runbooks, checking deploys, metrics, and logs…");
    try {
      const res = await getJson(`${api}/v1/diagnoses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          alert_id: `demo-${Date.now()}`,
          service: select.value,
          title: $("title").value,
          description: $("description").value,
        }),
        timeoutMs: 90_000,
      });
      if (!res.ok) {
        showExample(errorMessage(res.status, res.body, res.retryAfter));
        $("banner").classList.add("alert");
        return;
      }
      renderResult(res.body);
      setBanner(res.body.cached ? "Live result, served from cache." : "Live run.", "live");
    } catch {
      showExample("The demo server couldn't be reached. The recorded example is shown instead.");
      $("banner").classList.add("alert");
    } finally {
      enable();
    }
  });
}

if (typeof document !== "undefined") {
  main().catch((err) => {
    console.error(err);
    setBanner("Part of this page didn't load. Refresh to try again.", "alert");
  });
}
