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
      profile.previously?.length && `Previously at ${joinList(employerNames(profile))}.`,
      profile.availability && `Availability: ${profile.availability}.`,
      ...(profile.stats || []).map((st) => `${st.value} ${st.label}.`),
      `Location: ${profile.location}.`,
      `Currently: ${profile.status}`,
      `Contact: email ${links.email}; GitHub ${githubUrl(profile)}; LinkedIn ${links.linkedin}.`,
    ]
      .filter(Boolean)
      .join("\n")
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
    const cs = p.case_study;
    if (cs) {
      add(
        `case-study-${slug(p.name)}`,
        `Case study: ${p.name}`,
        [
          `Problem: ${cs.problem}`,
          `Approach: ${cs.approach}`,
          cs.diagram?.length && `How it works: ${cs.diagram.map((d) => `${d.step} (${d.detail})`).join(", then ")}.`,
          ...(cs.decisions || []).map((d) => `Decision: ${d.title}. ${d.detail}`),
          `Result: ${cs.result}`,
        ]
          .filter(Boolean)
          .join("\n"),
        repoUrl(p)
      );
    }
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

  const skills = skillGroups(profile)
    .map((g) => `${g.group}: ${g.items.join(", ")}.${g.used_in?.length ? ` Used at or in: ${joinList(g.used_in)}.` : ""}`)
    .join("\n");
  if (skills) add("skills", "Skills", skills);

  for (const [i, item] of (profile.faq || []).entries()) {
    add(`faq-${i}`, f(item.q), f(item.a));
  }
  return chunks;
}

// "previously" may hold plain names or {name, url} objects.
export function employers(profile) {
  return (profile.previously || []).map((e) => (typeof e === "string" ? { name: e, url: "" } : e));
}

export function employerNames(profile) {
  return employers(profile).map((e) => e.name);
}

// Splits the headline so one word or phrase can be highlighted.
export function headlineParts(headline, accent) {
  if (!accent || !headline.includes(accent)) return [{ text: headline, accent: false }];
  const i = headline.indexOf(accent);
  return [
    { text: headline.slice(0, i), accent: false },
    { text: accent, accent: true },
    { text: headline.slice(i + accent.length), accent: false },
  ].filter((p) => p.text);
}

// Skills may be a list of {group, items, used_in} or a plain {group: items} object.
export function skillGroups(profile) {
  const skills = profile.skills || [];
  if (Array.isArray(skills)) return skills;
  return Object.entries(skills).map(([group, items]) => ({ group, items, used_in: [] }));
}

export function joinList(items) {
  const list = (items || []).filter(Boolean);
  if (list.length <= 1) return list.join("");
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list.at(-1)}`;
}

export function projectAnchor(name) {
  return `project-${slug(name)}`;
}

export function experienceAnchor(org) {
  return `exp-${slug(org)}`;
}

// Resolves a "used_in" name to an on-page anchor: a project or an employer.
export function anchorFor(name, profile) {
  const key = String(name).toLowerCase();
  if ((profile.projects || []).some((p) => p.name.toLowerCase() === key)) return `#${projectAnchor(name)}`;
  if ((profile.experience || []).some((e) => e.org.toLowerCase() === key)) return `#${experienceAnchor(name)}`;
  return null;
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
