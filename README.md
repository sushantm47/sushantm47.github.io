# Sushant Mudalgi · Portfolio

**Live site: https://sushantm47.github.io**

My personal portfolio, with an assistant you can question about my work. Ask it about
my projects, experience, skills, or availability, and it answers from my resume and the
READMEs of my GitHub repositories, citing the source of each fact.

## How the assistant works

The assistant uses retrieval-augmented generation (RAG): it looks up relevant facts at
question time instead of relying on a model's memory.

```
profile.json ──┐
repo READMEs ──┴─> build step ─> knowledge.json      (rebuilt on every deploy and weekly)

question ─> BM25 search over knowledge.json ─> top matching excerpts
                                                  │
                                                  └─> LLM writes a short answer
                                                      that cites the excerpts [1] [2]
```

1. **Indexing:** a build step collects my profile and the README of every public repo I
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
| Retrieval | BM25 search and markdown chunking, shared by the browser and the server |
| LLM service | Cloudflare Worker calling an OpenAI-compatible API |
| Live data | GitHub REST API for repo stats and recent activity |
| Hosting | GitHub Pages, deployed by GitHub Actions |
| Search engines | Page text, meta tags, and JSON-LD rendered into the HTML at build time |

## Structure

```
index.html                   page shell
assets/css/style.css         styles, light and dark themes
assets/js/main.js            renders the profile, GitHub stats, theme
assets/js/chat.js            assistant UI and fallback answers
assets/js/retrieval.js       BM25 search and markdown chunking
assets/js/knowledge.js       turns the profile into searchable chunks
assets/js/render.js          safe rendering of answers
data/profile.json            resume content
scripts/build-knowledge.mjs  builds knowledge.json from the profile and repos
scripts/prerender.mjs        writes page text and metadata into the HTML
worker/                      serverless LLM proxy
tests/                       unit tests (node --test)
```

## Contact

mudalgi.s@northeastern.edu · [LinkedIn](https://www.linkedin.com/in/sushant-mudalgi) · [GitHub](https://github.com/sushantm47)
