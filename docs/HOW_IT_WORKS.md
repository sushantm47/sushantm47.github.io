# How this portfolio works

This site is a static portfolio with one dynamic feature: an assistant that answers
questions about my work from my resume and my GitHub repositories, and cites where each
fact came from. This document explains how the pieces fit together and why they were
built this way.

## The big picture

```
                    build time (GitHub Actions)                      request time
              ┌─────────────────────────────────────────┐
profile.json ─┤                                         │
              ├─> build-knowledge ─> knowledge.json ────┼──> Cloudflare Worker ──> LLM
repo READMEs ─┤      (chunk + index)                    │      (search + prompt)
              │                                         │            │
index.html ───┴─> prerender ─> HTML with real text ─────┼──> browser <┘
                   + cache-busting version stamps        │   (renders answer + sources)
              └─────────────────────────────────────────┘
```

Everything runs on free tiers: GitHub Pages hosts the site, GitHub Actions builds it, a
Cloudflare Worker holds the LLM key, and an OpenAI-compatible LLM API writes the answers.

## The assistant: retrieval-augmented generation (RAG)

The assistant doesn't rely on a model's memory of me, which would be empty or wrong. It
looks things up at question time and is told to answer only from what it found.

### 1. Indexing (on every deploy, and every Monday)

`scripts/build-knowledge.mjs` builds `data/knowledge.json`:

- **From `profile.json`:** one chunk each for the summary, every project and case study,
  every job, education, skills, and every FAQ entry.
- **From GitHub:** it lists every public repo I own through the GitHub API (skipping
  forks and archived repos), downloads each README and any listed design docs, and splits
  them into chunks at headings, up to about 900 characters each. Repos I create later are
  picked up automatically.
- Each chunk keeps its **title, source, and URL**, which is what makes citations possible.

The build also checks that every featured repo name in `profile.json` exists, and
suggests the closest match if one is mistyped.

### 2. Retrieval

`assets/js/retrieval.js` implements **BM25**, the ranking function behind most search
engines, in about 100 lines with no dependencies:

- Text is lowercased and tokenized, keeping technical names intact (`node.js`, `c++`,
  `v2.14.0`), with common words removed and a light suffix stemmer (`projects` → `project`).
- Chunk titles count twice, because a title like "Experience: Data Engineer at EY" is a
  precise signal.
- The site owner's name is ignored in queries. It appears in nearly every chunk, so it
  only adds noise: without this, "What did Sushant do at EY?" ranked the generic "About"
  chunk above the EY role.

The same module runs in three places: the build script, the Worker, and the browser.

### 3. Generation

`worker/src/index.js` is a Cloudflare Worker. For each question it:

1. Loads `knowledge.json` from the site (cached for 10 minutes) and retrieves the top 8
   chunks.
2. Sends them to the LLM with rules written for the real audience, recruiters: open with a
   direct answer; give each work point with its employer, dates, and measurable result;
   copy numbers exactly; cite after every point; label personal projects as personal and
   never as production systems; no filler; answer only from the context, otherwise say so;
   decline unrelated requests.
3. Returns the answer plus a source list, which the page turns into highlighted citation
   marks linked to the repo or file.

Models are tried in order, and the first good answer wins:

1. **Groq** (any OpenAI-compatible API) as the primary model.
2. An optional **second API**, configured the same way.
3. **Cloudflare Workers AI**, a model built into the Cloudflare account through a binding,
   with no extra key.

A provider that's rate limited, out of its free quota, or rejects its key is skipped. The
response records which model answered, which helps when debugging.

### Curated answers

`profile.json` includes hand-written answers to the questions recruiters ask most ("What
has Sushant built in production?", "What's his strongest project?", "Which tools has he
used at work?"). They're indexed like everything else, so retrieval matches them directly
and the model starts from a complete, accurate answer instead of stitching fragments
together. Shortened display numbers (like the "200+ GB" stat card) are kept out of the
context, so answers use the exact figures from the job entries.

### Evaluation

`data/assistant-evals.json` holds recruiter questions with facts each answer must contain
(employer names, exact numbers), mistakes it must avoid (rounded numbers, calling a
personal project production), and whether it must cite. The **Evaluate assistant**
workflow runs them against the live assistant with one click and writes a pass/fail report,
with every answer, to the run's summary page. It fails below an 80% pass rate. Run it after
changing the prompt, the model, or the profile.

### 4. Fallback

If no model is configured, or every model is unavailable, the browser answers on its
own: it searches `knowledge.json` locally and shows the best-matching excerpts with their
sources. The assistant never shows an error page.

### Why RAG instead of fine-tuning

| | RAG (this site) | Fine-tuning a model |
|---|---|---|
| Updating | Automatic on every push | Retrain each time |
| Cost | $0 | GPU time |
| Can show sources | Yes, every fact links to a file | No |
| Risk of invented facts | Low: told to answer only from retrieved text | Higher |

## Safety

- **The API key** exists only as a Cloudflare secret. It's never in the browser or the repo.
- **Origin check:** the Worker only answers requests from this site's address.
- **Input limits:** questions are capped at 500 characters and history at 6 messages;
  anything else is rejected.
- **Prompt rules** tell the model to treat retrieved text as data, not instructions, and
  to refuse anything unrelated to the portfolio, so the Worker can't be used as a free
  general-purpose chatbot.
- **No HTML from the model:** answers are parsed into plain data (text, bold, code,
  citation numbers) and rendered with `textContent`. A model reply containing
  `<script>` shows up as harmless text.
- **Content Security Policy:** the page may only load its own files, Google Fonts, the
  GitHub API, the Worker, and Cloudflare's analytics beacon. No inline scripts or styles
  are allowed.
- **No surprise bills:** free tiers without a card can't charge anything; the worst case
  is hitting a daily limit, which triggers the fallback.

## Performance

- **No framework, no bundler:** plain HTML, CSS, and JavaScript modules.
- **Lazy loading:** the assistant's knowledge file downloads only when a visitor hovers,
  focuses, or taps the ask box. The Recent activity feed (the newest commit in each
  recently pushed repository) loads only when its section is about to scroll into view.
- **Drawn, not downloaded:** project artwork is SVG generated in code, so there are no
  image files to fetch.
- **Cache busting:** GitHub Pages lets browsers keep files for about 10 minutes. Without
  care, a returning visitor can get new HTML with old JavaScript, and the page breaks. The
  deploy step stamps every CSS and JS URL, and every module import, with a content hash
  (`main.js?v=76656110a2`), so matching files always load together.

## Search engines and link previews

The page is rendered by JavaScript, but `scripts/prerender.mjs` writes the complete page
into the HTML at build time, so crawlers and link previews never need to run any code:

- **All content:** hero, project tiles, more projects, stats, every role, education, and
  contact text, with the same markup the page script produces. When JavaScript runs, it
  replaces these with the interactive versions instead of adding a second copy.
- **Real links:** GitHub, LinkedIn, resume, and email links are written in, marked
  `rel="me"` so search engines can tie the profiles to the same person.
- **Title and description** tuned for what people search: name, role, city, school, and
  employers.
- **Structured data:** a JSON-LD graph with a `ProfilePage` whose main entity is a
  `Person` (role, schools and employers, skills, profile links), plus each project as
  `SoftwareSourceCode` with its repository.
- **Link previews:** Open Graph and Twitter tags with a 1200×630 preview image.
- `sitemap.xml`, `robots.txt`, a canonical URL, and `max-image-preview:large`.

## RootCite live demo

`rootcite/` is a static demo page for RootCite, served by GitHub Pages so it loads instantly.
RootCite's API runs on a free host that sleeps when idle, so the page:

- shows a recorded diagnosis (`data/rootcite-example.json`) immediately;
- wakes the API in the background with `GET /health`, which uses no model tokens, and shows
  progress until it answers;
- enables live runs once the API is ready, and falls back to the recorded example if the
  API is unreachable or its daily budget of live runs is spent.

The portfolio also sends that wake-up request when the work section scrolls into view and
when the RootCite case study opens, so the API is usually awake by the time a visitor
reaches the demo.

## Visitor analytics

Visits are counted with Cloudflare Web Analytics, which uses no cookies and stores no
personal data, so no consent banner is needed. The script is added at build time only
when a token is set in `profile.json`. Questions asked to the assistant show up as
request counts on the Worker's own dashboard.

## Interaction design

- One story from top to bottom: who I am, what I've built, ask about it, where I've
  worked, how to reach me.
- The ask box lives in its own section and docks into the nav whenever that section is
  off screen; `/` opens it from anywhere.
- Sections fade in as they scroll into view, stats count up, the nav highlights the
  current section, and a progress bar tracks scrolling. All motion is disabled for
  visitors who ask their device for reduced motion.

## Deployment

Two GitHub Actions workflows deploy everything; nothing is deployed from a laptop.

**Deploy worker** runs when the Worker's code changes: it runs the tests, then deploys to
Cloudflare with the official `wrangler` action. The Cloudflare API token and the LLM key
are GitHub encrypted secrets, uploaded to Cloudflare as Worker secrets.

**Deploy site** runs on every push to `main`, every Monday, and on demand:

1. Run the test suite.
2. Build `knowledge.json` from the profile and my repos.
3. Prerender the HTML and stamp asset versions.
4. Publish to GitHub Pages.

## Tests

`npm test` runs 67 tests with Node's built-in test runner, covering retrieval and
chunking, knowledge building and repo discovery, safe answer rendering, offline answers,
the Worker (origin checks, validation, the three-model fallback chain, rate-limit handling),
prerendering and escaping, cache busting, and layout helpers such as number highlighting
and count-up frames.
