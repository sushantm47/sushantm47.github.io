# Portfolio with a repo-grounded AI assistant

A fast, static portfolio site with an "Ask about my work" assistant. Visitors ask a
question; the assistant answers from your profile and your repos' READMEs and design
docs, and cites which repo each fact came from.

Everything runs on free tiers: GitHub Pages hosts the site, a Cloudflare Worker keeps
the LLM key secret, and a free LLM API (Groq by default) writes the answers. With no
LLM configured at all, the assistant still works in offline mode by showing the most
relevant excerpts.

## How it works

```
data/profile.json ─┐
your repo READMEs ─┴─> scripts/build-knowledge.mjs ─> data/knowledge.json   (on every deploy + weekly)

Browser ── question ──> Cloudflare Worker ── BM25 search over knowledge.json
                              │
                              └── top chunks + rules ──> free LLM ──> cited answer
```

This is retrieval-augmented generation (RAG), not fine-tuning. The assistant looks things
up at question time, so it updates whenever you push, needs no GPU, and is told to answer
only from what it retrieved and to cite it.

## 1. Make it yours (10 minutes)

1. Edit `data/profile.json`: name, links, projects (`owner/repo`, plus `path` for a
   subfolder), experience, education, skills, FAQ. `{first}` is replaced with your
   first name.
2. Add your resume as `assets/resume.pdf`.
3. Preview locally:
   ```bash
   node scripts/build-knowledge.mjs      # warns about any template text you missed
   python -m http.server 8000            # open http://localhost:8000
   ```
   Press `/` to jump to the question box.

## 2. Publish on GitHub Pages (free)

1. Create a public repo named `<your-username>.github.io`.
2. Push this folder to it.
3. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**.
4. The **Deploy site** workflow runs tests, rebuilds the knowledge file, and publishes to
   `https://<your-username>.github.io`.

At this point the assistant works in offline mode.

## 3. Turn on the LLM (free)

1. Get a free API key at https://console.groq.com (no card needed). Check the model list
   there and keep `LLM_MODEL` in `worker/wrangler.toml` set to a model your key can use.
2. Create a free Cloudflare account, then:
   ```bash
   cd worker
   npx wrangler login
   # edit wrangler.toml: ALLOWED_ORIGINS and KNOWLEDGE_URL use your github.io address
   npx wrangler secret put LLM_API_KEY     # paste the Groq key
   npx wrangler deploy                     # prints https://portfolio-chat.<you>.workers.dev
   ```
3. Put that URL in `data/profile.json` under `chat.endpoint`, then commit and push.

Any OpenAI-compatible API works by changing `LLM_BASE_URL` and `LLM_MODEL`: Groq, Google
Gemini, OpenRouter, or paid options like Claude later. You can set a second free provider
as `FALLBACK_*`; it's used automatically when the first hits its daily limit. If both are
out, visitors get offline-mode answers instead of an error.

## Safety

- The API key exists only as a Cloudflare secret, never in the browser or the repo.
- The Worker only accepts requests from your site's origin, limits question length and
  history, and the model is told to refuse anything unrelated to your portfolio.
- Model output is rendered as text, never as HTML, so it can't inject scripts.
- A Content Security Policy limits the page to your own files, GitHub's API, and
  `*.workers.dev`. If you move the Worker to a custom domain, add it to `connect-src` in
  `index.html`.
- Free tiers without a card can't bill you; the worst case is hitting the daily limit.

## Tests

```bash
npm test
```

Covers retrieval, knowledge building, safe rendering, offline answers, and the Worker
(origin checks, validation, provider fallback, rate-limit handling).

## Structure

```
index.html                 page shell
assets/css/style.css       styles, light and dark
assets/js/main.js          renders profile.json, live GitHub stats, theme
assets/js/chat.js          the assistant UI, Worker calls, offline answers
assets/js/retrieval.js     BM25 search + markdown chunking (shared with the Worker)
assets/js/knowledge.js     profile.json -> knowledge chunks
assets/js/render.js        safe answer parsing
data/profile.json          your content (the only file you must edit)
data/knowledge.json        generated
scripts/build-knowledge.mjs
worker/                    Cloudflare Worker (LLM proxy)
tests/                     node --test
```
