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

1. Loads `knowledge.json` from the site (cached for 10 minutes) and retrieves the top 6
   chunks.
2. Sends them to the LLM with strict rules: answer only from the numbered context, cite
   with `[1]`, `[2]`, say "I don't know" otherwise, stay under about 120 words, refer to
   me in the third person, and decline unrelated requests.
3. Returns the answer plus a source list, which the page turns into highlighted citation
   marks linked to the repo or file.

It uses any **OpenAI-compatible API** (Groq by default), with an optional second
provider that's tried automatically when the first hits its free daily limit.

### 4. Fallback

If no LLM is configured, or both providers are unavailable, the browser answers on its
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
  focuses, or taps the ask box. Extra GitHub repos load only when "More projects" is
  about to scroll into view.
- **Drawn, not downloaded:** project artwork is SVG generated in code, so there are no
  image files to fetch.
- **Cache busting:** GitHub Pages lets browsers keep files for about 10 minutes. Without
  care, a returning visitor can get new HTML with old JavaScript, and the page breaks. The
  deploy step stamps every CSS and JS URL, and every module import, with a content hash
  (`main.js?v=76656110a2`), so matching files always load together.

## Search engines and link previews

The page content is rendered by JavaScript, but `scripts/prerender.mjs` writes the real
title, description, headline, and introduction into the HTML at build time, along with
JSON-LD `Person` data (name, role, schools, skills, GitHub and LinkedIn), Open Graph tags
for link previews, `sitemap.xml`, and `robots.txt`.

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

The **Deploy site** GitHub Actions workflow runs on every push to `main`, every Monday,
and on demand:

1. Run the test suite.
2. Build `knowledge.json` from the profile and my repos.
3. Prerender the HTML and stamp asset versions.
4. Publish to GitHub Pages.

## Tests

`npm test` runs 44 tests with Node's built-in test runner, covering retrieval and
chunking, knowledge building and repo discovery, safe answer rendering, offline answers,
the Worker (origin checks, validation, provider fallback, rate-limit handling),
prerendering and escaping, cache busting, and layout helpers such as number highlighting
and count-up frames.
