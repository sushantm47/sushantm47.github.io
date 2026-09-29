// Page interactions. Everything here is progressive: without JavaScript the content is still
// there, and people who ask their device for reduced motion get no animation.

export const reducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ----- pure helpers (unit tested) -----

// One frame of a count-up: every number in the text scaled by t (0..1), same formatting.
export function countFrame(text, t) {
  if (t >= 1) return text;
  return String(text).replace(/\d[\d,]*(?:\.\d+)?/g, (raw) => {
    const n = Number(raw.replaceAll(",", ""));
    const decimals = (raw.split(".")[1] || "").length;
    const v = n * Math.max(0, t);
    const fixed = v.toFixed(decimals);
    return raw.includes(",") ? Number(fixed).toLocaleString("en-US", { minimumFractionDigits: decimals }) : fixed;
  });
}

export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ----- count-up stats -----

export function countUp(nodes, duration = 1200) {
  if (reducedMotion()) return;
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      const node = entry.target;
      const final = node.dataset.final || node.textContent;
      node.dataset.final = final;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        node.textContent = countFrame(final, easeOut(t));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }, { threshold: 0.6 });
  nodes.forEach((n) => io.observe(n));
}

// ----- reveal on scroll -----

export function reveal(root = document) {
  const nodes = [...root.querySelectorAll("[data-reveal]:not(.is-in)")];
  if (reducedMotion() || !("IntersectionObserver" in window)) {
    nodes.forEach((n) => n.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  nodes.forEach((n) => io.observe(n));
}

// ----- run a callback once, when an element gets near the viewport (lazy loading) -----

export function whenNear(node, callback, margin = "600px") {
  if (!node) return;
  if (!("IntersectionObserver" in window)) return void callback();
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      callback();
    }
  }, { rootMargin: `${margin} 0px` });
  io.observe(node);
}

// ----- nav: highlight the section being read, and a reading-progress bar -----

export function scrollSpy(links) {
  const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const link = byId.get(entry.target.id);
      if (entry.isIntersecting) {
        links.forEach((a) => a.removeAttribute("aria-current"));
        link?.setAttribute("aria-current", "true");
      }
    }
  }, { rootMargin: "-45% 0px -50% 0px" });
  for (const id of byId.keys()) {
    const section = document.getElementById(id);
    if (section) io.observe(section);
  }
}

export function progressBar(bar) {
  let queued = false;
  const update = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  addEventListener("scroll", () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}

// ----- copy email with a small confirmation -----

export function copyButtons(toast) {
  let timer;
  document.addEventListener("click", async (e) => {
    const button = e.target.closest("[data-copy]");
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      toast.textContent = "Email copied";
    } catch {
      toast.textContent = button.dataset.copy;
    }
    toast.classList.add("is-on");
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove("is-on"), 1800);
  });
}

// ----- the ask box docks into the nav whenever its section is off screen -----

export function dockAsk({ slot, ask, dock, panel }) {
  const input = ask.querySelector("input");
  let open = false;

  const openPanel = () => {
    if (open) return;
    open = true;
    slot.style.minHeight = `${slot.offsetHeight}px`; // keep the hero from jumping
    panel.querySelector("[data-panel-body]").append(ask);
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add("is-open"));
    dock.setAttribute("aria-expanded", "true");
    input.focus({ preventScroll: true }); // the panel is fixed; don't let focus scroll the page
  };
  const closePanel = ({ restoreFocus = true } = {}) => {
    if (!open) return;
    open = false;
    panel.classList.remove("is-open");
    panel.hidden = true;
    slot.append(ask);
    slot.style.minHeight = "";
    dock.setAttribute("aria-expanded", "false");
    if (restoreFocus && document.body.classList.contains("is-docked")) dock.focus({ preventScroll: true });
  };

  // While the panel is open the ask box lives in the panel, so we watch the slot it came from.
  const io = new IntersectionObserver(([entry]) => {
    const docked = !entry.isIntersecting;
    document.body.classList.toggle("is-docked", docked);
    if (!docked) closePanel({ restoreFocus: false });
  }, { rootMargin: "-72px 0px -15% 0px" });
  io.observe(slot);

  dock.addEventListener("click", () => (open ? closePanel() : openPanel()));
  panel.querySelector("[data-panel-close]").addEventListener("click", () => closePanel());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) closePanel();
  });
  document.addEventListener("pointerdown", (e) => {
    if (open && !panel.contains(e.target) && !dock.contains(e.target)) closePanel({ restoreFocus: false });
  });

  // Use the section when it's on screen, otherwise the docked panel. Never scroll the page.
  const focus = () => {
    if (document.body.classList.contains("is-docked")) openPanel();
    else input.focus({ preventScroll: true });
  };
  return { focus, reveal: focus };
}
