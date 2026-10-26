// Builds the site model from three sources:
//   resume.json  parsed from the resume PDF: summary, experience, education, skills, projects
//   GitHub       repositories tagged with the portfolio topic: description, topics, website,
//                latest release, README
//   profile.json a few settings that rarely change: headline, stats, chat endpoint, styling
// Pure and dependency-free; the build runs it in Node.

const DEFAULT_ART = ["flow", "chart", "network", "globe"];
const CITY_FALLBACK = "";

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// "Databricks (Delta Lake, Unity Catalog)" -> ["Databricks", "Delta Lake", "Unity Catalog"]
export function skillTerms(item) {
  const match = /^(.*?)\s*\((.*)\)\s*$/.exec(item);
  if (!match) return [item.trim()];
  return [match[1].trim(), ...match[2].split(",").map((s) => s.trim())].filter(Boolean);
}

function mentions(text, term) {
  return new RegExp(`(^|[^A-Za-z0-9+#])${escapeRegExp(term)}(?![A-Za-z0-9+#])`, "i").test(text);
}

// Skills from the resume that a piece of text mentions. Main skills come first in order of
// mention; sub-items in parentheses ("Unity Catalog") only fill any remaining room.
export function tagsFor(text, skills, max = 6) {
  const main = [];
  const sub = [];
  for (const group of skills) {
    for (const item of group.items) {
      const [head, ...children] = skillTerms(item);
      for (const [term, bucket] of [[head, main], ...children.map((c) => [c, sub])]) {
        if (term.length < 2 || main.concat(sub).some((f) => f.term === term)) continue;
        const pattern = `(^|[^A-Za-z0-9+#])${escapeRegExp(term)}(?![A-Za-z0-9+#])`;
        const at = text.search(new RegExp(pattern, "i"));
        if (at >= 0) bucket.push({ term, at });
      }
    }
  }
  const byPosition = (a, b) => a.at - b.at;
  return [...main.sort(byPosition), ...sub.sort(byPosition)].slice(0, max).map((f) => f.term);
}

// A stat can take its number from the resume: "from" names a pattern to find in a company's
// bullets (or anywhere in the resume) and a format for the captured number. If the resume no
// longer matches, the stat's own value is kept.
export function statValue(stat, resume) {
  if (!stat.from?.pattern) return stat.value;
  const jobs = (resume.experience || []).filter((j) => !stat.from.company || j.company === stat.from.company);
  const text = [resume.summary || "", ...jobs.flatMap((j) => j.bullets || [])].join("\n");
  const match = new RegExp(stat.from.pattern, "i").exec(text);
  return match ? (stat.from.format || "{1}").replace(/\{(\d)\}/g, (_, n) => match[Number(n)] ?? "") : stat.value;
}

function gpaNote(gpa) {
  return gpa ? `GPA ${gpa.replace("/", " / ")}.` : "";
}

function githubUser(resume, settings) {
  const fromResume = /github\.com\/([^/\s]+)/.exec(resume.contact?.github || "")?.[1];
  return settings.github?.user || fromResume || "";
}

function project(resumeProject, repo, settings, user, index) {
  const name = resumeProject?.name || repo?.name || "";
  const configured = Object.keys(settings.projects || {});
  const key = configured.find((k) => norm(k) === norm(repo?.name || name)) || repo?.name || name;
  const extra = settings.projects?.[key] || {};
  const topics = (repo?.topics || []).filter((t) => t !== (settings.github?.topic || "portfolio"));
  const description = repo?.description || "";
  const demo = extra.demo || (repo?.homepage ? { page: repo.homepage } : undefined);
  return {
    name,
    repo: repo?.full_name || `${user}/${extra.repo || key}`,
    tagline: description || resumeProject?.subtitle || "",
    summary: [resumeProject?.subtitle, description].filter(Boolean).join(". ") || name,
    stack: resumeProject?.stack?.length ? resumeProject.stack : topics,
    highlights: resumeProject?.bullets || [],
    readme: repo?.readme || "",
    release: repo?.release || null,
    language: repo?.language || "",
    stars: repo?.stargazers_count ?? 0,
    homepage: repo?.homepage || "",
    demo,
    previous_name: extra.previous_name,
    kind: extra.kind || "Solo project",
    color: extra.color,
    art: extra.art || DEFAULT_ART[index % DEFAULT_ART.length],
    featured: true,
  };
}

export function buildSite(settings, resume, github = { repos: [] }) {
  const user = githubUser(resume, settings);
  const skills = resume.skills || [];
  const graduation = resume.education?.[0]?.end || "";
  const fill = (s) => String(s || "").replaceAll("{graduation}", graduation);

  const jobs = [...(resume.experience || []), ...(settings.additional_experience || [])];
  const experience = jobs.map((j) => {
    const text = (j.bullets || []).join(" ");
    return {
      role: j.title,
      org: j.company,
      location: j.location || CITY_FALLBACK,
      start: j.start,
      end: j.end,
      summary: j.bullets?.[0] || "",
      points: j.bullets || [],
      tags: tagsFor(text, skills),
    };
  });

  // Projects: resume order first (the order you chose), then any other tagged repositories.
  const repos = github.repos || [];
  const used = new Set();
  const projects = (resume.projects || []).map((rp, i) => {
    const repo = repos.find((r) => norm(r.name) === norm(rp.name));
    if (repo) used.add(repo.full_name);
    return project(rp, repo, settings, user, i);
  });
  repos
    .filter((r) => !used.has(r.full_name))
    .forEach((r) => projects.push(project(null, r, settings, user, projects.length)));

  const owners = [...experience.map((e) => ({ name: e.org, text: e.points.join(" ") })),
    ...projects.map((p) => ({ name: p.name, text: p.highlights.join(" ") }))];
  const skillGroups = skills.map((g) => {
    const terms = g.items.flatMap(skillTerms);
    const used_in = owners
      .map((o) => ({ name: o.name, hits: terms.filter((t) => mentions(o.text, t)).length }))
      .filter((o) => o.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 3)
      .map((o) => o.name);
    return { group: g.group, items: g.items, used_in };
  });

  const employerMap = settings.employers || {};
  const previously = (resume.experience || []).map((j) => ({
    name: employerMap[j.company]?.name || j.company,
    url: employerMap[j.company]?.url || "",
  }));

  const personal = projects.map((p) => p.name);
  const production = [
    ...experience
      .filter((e) => e.points.length)
      .map((e) => `At ${e.org} (${e.start} to ${e.end}), as ${e.role}: ${e.points.join(" ")}`),
    personal.length &&
      `${personal.join(" and ")} ${personal.length > 1 ? "are personal projects" : "is a personal project"}, not production systems.`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    name: resume.name,
    site_url: settings.site_url,
    role: settings.role,
    headline: settings.headline,
    headline_accent: settings.headline_accent,
    tagline: settings.tagline || resume.summary,
    intro: resume.summary,
    location: settings.location,
    availability: settings.availability,
    status: fill(settings.status),
    seo_title: settings.seo_title,
    seo_description: settings.seo_description,
    previously,
    stats: (settings.stats || []).map((s) => ({ value: statValue(s, resume), label: s.label })),
    links: {
      github: user,
      linkedin: resume.contact?.linkedin || settings.links?.linkedin || "",
      email: resume.contact?.email || settings.links?.email || "",
      resume: settings.links?.resume || "assets/resume.pdf",
    },
    chat: settings.chat,
    analytics: settings.analytics,
    projects,
    experience,
    education: (resume.education || []).map((e) => ({
      degree: e.degree,
      school: e.school,
      start: e.start,
      end: e.end,
      notes: [gpaNote(e.gpa), e.coursework?.length ? `Coursework: ${e.coursework.join(", ")}.` : ""]
        .filter(Boolean)
        .join(" "),
    })),
    skills: skillGroups,
    faq: [
      ...(production ? [{ q: "What has {first} built in production?", a: production }] : []),
      ...(settings.faq || []).map((f) => ({ q: f.q, a: fill(f.a) })),
    ],
    sources: {
      resume: resume.source || null,
      github_topic: settings.github?.topic || "portfolio",
      built_at: github.fetched_at || null,
    },
  };
}
