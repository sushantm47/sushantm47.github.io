# Sushant Mudalgi · Portfolio

**Live site: https://sushantm47.github.io**

My personal portfolio, with an assistant you can question about my work. Ask it about
my projects, experience, skills, or availability, and it answers from my resume and the
READMEs of my GitHub repositories, citing the source of each fact.

## Where the content comes from

The site has no hand-maintained content. Everything comes from two sources:

```
assets/resume.pdf ──> parse_resume.py ──> resume.json ──┐
GitHub repos tagged "portfolio" ────────────────────────┼─> build-site.mjs ─> site.json
data/profile.json (headline, stats, chat settings) ─────┘          │
                                                                   ├─> the page
                                                                   ├─> the assistant's knowledge
                                                                   └─> HTML for search engines
```

- **Resume:** summary, experience, education, skills, and project highlights are parsed
  from the PDF on every build. Updating the site means replacing `assets/resume.pdf`.
- **GitHub:** every public repository with the topic `portfolio` becomes a project, with
  its description, topics, website (shown as a live demo link), latest release, and
  README (shown as the case study). Case studies fetch the README live, so edits on
  GitHub appear immediately.
- **Rebuilds:** on every push and every hour, so new releases, descriptions, and README
  changes reach the assistant and search engines without a commit here.

Stat cards read their numbers from the resume, and the tests compare the site with the
resume rather than with fixed wording, so a new resume never needs a code change. If the
resume can't be parsed, the build stops with an error and the last good version of the
site stays live.

## How the assistant works

The assistant uses retrieval-augmented generation (RAG): it looks up relevant facts at
question time instead of relying on a model's memory.

```
site.json ────┐
repo READMEs ─┴─> build step ─> knowledge.json      (rebuilt on every push and hourly)

question ─> BM25 search over knowledge.json ─> top matching excerpts
                                                  │
                                                  └─> LLM writes a short answer
                                                      that cites the excerpts [1] [2]
```

1. **Indexing:** a build step collects my resume content and the README of every public repo I
   own, splits them into heading-sized chunks, and publishes them as `knowledge.json`.
   New repos are picked up automatically.
2. **Retrieval:** each question is matched against the chunks with BM25 keyword search.
3. **Generation:** a serverless function sends the best matches to an LLM with strict
   instructions to answer only from them and cite each one. The API key stays on the
   server, never in the browser.
4. **Fallback:** if the LLM is unavailable, the site shows the matching excerpts
   directly, so the assistant always answers.

## Tech

| Area | Choice |
|---|---|
| Site | HTML, CSS, and JavaScript modules, with no framework or build step |
| Interaction | Scroll reveal, count-up stats, scroll-spy nav, an ask box that docks into the nav, lazy-loaded data |
| Retrieval | BM25 search and markdown chunking, shared by the browser and the server |
| LLM service | Cloudflare Worker calling an OpenAI-compatible API |
| Live data | GitHub REST API for project stats and the Recent activity feed |
| Hosting | GitHub Pages, deployed by GitHub Actions |
| Analytics | Cloudflare Web Analytics (cookie-free) |
| Search engines | Page text, meta tags, and JSON-LD rendered into the HTML at build time |

## Structure

```
index.html                   page shell
assets/css/style.css         styles, light and dark themes
assets/js/main.js            renders the profile, project tiles, case studies, theme
assets/js/ui.js              scroll reveal, count-up, scroll-spy, docking ask box, lazy loading
assets/js/art.js             project tile artwork drawn as SVG in code
assets/img/                  logo and favicon
assets/js/chat.js            assistant UI and fallback answers
assets/js/retrieval.js       BM25 search and markdown chunking
assets/js/knowledge.js       turns the site model into searchable chunks
assets/js/site-model.js      merges the resume, GitHub, and settings into the site model
assets/js/markdown.js        safe Markdown rendering of README case studies
assets/js/render.js          safe rendering of answers
assets/resume.pdf            the resume: source of the site's content
data/profile.json            settings: headline, stats, chat endpoint, demo pages
data/resume.json             generated from the resume PDF
data/site.json               generated: the merged site model
scripts/parse_resume.py      reads the resume PDF
scripts/build-site.mjs       merges the resume with GitHub repositories
scripts/build-knowledge.mjs  builds knowledge.json from the site model and repos
scripts/prerender.mjs        writes page text and metadata into the HTML
worker/                      serverless LLM proxy
tests/                       unit tests (node --test)
```

## More detail

[How this portfolio works](docs/HOW_IT_WORKS.md): the RAG pipeline, safety, performance, and deployment.

## Contact

mudalgi.s@northeastern.edu · [LinkedIn](https://www.linkedin.com/in/sushant-mudalgi) · [GitHub](https://github.com/sushantm47)
