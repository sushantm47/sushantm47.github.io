import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIndex, chunkMarkdown, search, tokenize } from "../assets/js/retrieval.js";

const chunks = [
  { id: "1", title: "Project: OpsPilot", text: "Agentic RAG copilot for incident response with citations." },
  { id: "2", title: "Project: Ticket booking", text: "Go service using Redis holds and Postgres unique constraints." },
  { id: "3", title: "Skills", text: "Python, Go, TypeScript, Kafka, Docker." },
];

test("tokenize keeps tech names and stems plurals", () => {
  assert.deepEqual(tokenize("Projects using Node.js and C++"), ["project", "using", "node.js", "c++"]);
});

test("search ranks the most relevant chunk first", () => {
  const index = buildIndex(chunks);
  assert.equal(search(index, "how does the booking service avoid double selling with redis")[0].chunk.id, "2");
  assert.equal(search(index, "tell me about opspilot")[0].chunk.id, "1");
});

test("search returns nothing for stopword-only or unknown queries", () => {
  const index = buildIndex(chunks);
  assert.deepEqual(search(index, "what is the"), []);
  assert.deepEqual(search(index, "quantum knitting"), []);
});

test("chunkMarkdown scopes chunks by heading and skips code fences", () => {
  const md = "# Title\nIntro\n## Run\n```bash\n# not a heading\n```\nSteps here";
  const out = chunkMarkdown(md, { title: "Repo", source: "r/README.md", url: "u" });
  assert.deepEqual(out.map((c) => c.title), ["Repo: Title", "Repo: Run"]);
  assert.ok(out[1].text.includes("# not a heading"));
});
