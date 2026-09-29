// Turns profile.json into retrievable knowledge chunks. Shared by the browser and the build script.

export function firstName(profile) {
  return String(profile.name || "").trim().split(/\s+/)[0] || "they";
}

export function fill(text, profile) {
  return String(text ?? "").replaceAll("{first}", firstName(profile));
}

export function repoUrl(project) {
  const base = `https://github.com/${project.repo}`;
  return project.path ? `${base}/tree/HEAD/${project.path}` : base;
}

export function githubUrl(profile) {
  return `https://github.com/${profile.links?.github || ""}`;
}

export function profileToChunks(profile) {
  const name = profile.name;
  const links = profile.links || {};
  const f = (t) => fill(t, profile);
  const chunks = [];
  const add = (id, title, text, url = "") =>
    chunks.push({ id: `profile#${id}`, title, source: "profile", url, text: f(text) });

  add(
    "about",
    `About ${name}`,
    [
      `${name}: ${profile.role}. ${profile.headline}`,
      profile.intro,
      `Location: ${profile.location}.`,
      `Currently: ${profile.status}`,
      `Contact: email ${links.email}; GitHub ${githubUrl(profile)}; LinkedIn ${links.linkedin}.`,
    ].join("\n")
  );

  for (const p of profile.projects || []) {
    add(
      `project-${slug(p.name)}`,
      `Project: ${p.name}`,
      [p.summary, p.outcome && `Results: ${p.outcome}`, `Tech stack: ${(p.stack || []).join(", ")}.`, `Code: ${repoUrl(p)}`]
        .filter(Boolean)
        .join("\n"),
      repoUrl(p)
    );
  }

  for (const e of profile.experience || []) {
    add(
      `experience-${slug(e.org)}-${e.start}`,
      `Experience: ${e.role} at ${e.org}`,
      `${e.role} at ${e.org}${e.location ? ` (${e.location})` : ""}, ${e.start} to ${e.end}.\n${(e.points || []).join("\n")}`
    );
  }

  for (const ed of profile.education || []) {
    add(
      `education-${slug(ed.school)}`,
      `Education: ${ed.degree}`,
      `${ed.degree}, ${ed.school}, ${ed.start} to ${ed.end}. ${ed.notes || ""}`
    );
  }

  const skills = Object.entries(profile.skills || {})
    .map(([group, items]) => `${group}: ${items.join(", ")}.`)
    .join("\n");
  if (skills) add("skills", `Skills of ${name}`, skills);

  for (const [i, item] of (profile.faq || []).entries()) {
    add(`faq-${i}`, f(item.q), f(item.a));
  }
  return chunks;
}

export function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Fields still holding template values, so the build can warn before publishing.
export function findPlaceholders(profile) {
  const markers = ["Your Name", "your-github-username", "you@example.com", "your-handle", "Replace"];
  const hits = [];
  const walk = (value, path) => {
    if (typeof value === "string") {
      if (markers.some((m) => value.includes(m))) hits.push(path);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(profile, "");
  return hits;
}
