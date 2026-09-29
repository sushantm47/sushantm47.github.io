import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker, { buildMessages, cleanAnswer, corsHeaders, validate } from "../worker/src/index.js";

const ORIGIN = "https://ada.github.io";
const env = {
  ALLOWED_ORIGINS: ORIGIN,
  KNOWLEDGE_URL: "https://ada.github.io/data/knowledge.json",
  LLM_MODEL: "test-model",
  LLM_API_KEY: "secret",
};
const knowledge = {
  owner: { name: "Ada Lovelace", first: "Ada" },
  chunks: [
    { id: "1", title: "Project: OpsPilot", url: "https://github.com/ada/opspilot", text: "Incident copilot with citations." },
    { id: "2", title: "Skills", url: "", text: "Python and Go." },
  ],
};

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockFetch(llm) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url) === env.KNOWLEDGE_URL) return Response.json(knowledge);
    return llm(String(url), init);
  };
  return calls;
}

const chat = (body, origin = ORIGIN) =>
  worker.fetch(
    new Request("https://w.dev/chat", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env
  );

test("answers from retrieved context and returns sources", async () => {
  const calls = mockFetch(async () =>
    Response.json({ choices: [{ message: { content: "<think>hmm</think>OpsPilot diagnoses alerts [1]." } }] }));
  const res = await chat({ message: "What is OpsPilot?" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  const body = await res.json();
  assert.equal(body.answer, "OpsPilot diagnoses alerts [1].");
  assert.equal(body.sources[0].url, "https://github.com/ada/opspilot");

  const sent = JSON.parse(calls.at(-1).init.body);
  assert.equal(calls.at(-1).url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(calls.at(-1).init.headers.authorization, "Bearer secret");
  assert.match(sent.messages[0].content, /Answer ONLY from the numbered context/);
  assert.match(sent.messages[0].content, /\[1\] Project: OpsPilot/);
});

test("rejects other origins and bad input", async () => {
  mockFetch(async () => { throw new Error("should not be called"); });
  assert.equal((await chat({ message: "hi" }, "https://evil.example")).status, 403);
  assert.equal((await chat({ message: "" })).status, 400);
  assert.equal((await chat({ message: "x".repeat(501) })).status, 400);
  assert.equal((await chat({ message: "hi", history: [{ role: "system", content: "x" }] })).status, 400);
});

test("falls back to the second provider when the first is rate limited", async () => {
  const fallbackEnv = { ...env, FALLBACK_BASE_URL: "https://backup.dev/v1", FALLBACK_MODEL: "m2", FALLBACK_API_KEY: "k2" };
  mockFetch(async (url) =>
    url.startsWith("https://api.groq.com")
      ? new Response("limit", { status: 429 })
      : Response.json({ choices: [{ message: { content: "From backup [1]." } }] }));
  const res = await worker.fetch(
    new Request("https://w.dev/chat", { method: "POST", headers: { origin: ORIGIN }, body: JSON.stringify({ message: "OpsPilot?" }) }),
    fallbackEnv
  );
  assert.equal((await res.json()).answer, "From backup [1].");
});

test("reports 429 when every provider is out of quota", async () => {
  mockFetch(async () => new Response("limit", { status: 429 }));
  assert.equal((await chat({ message: "OpsPilot?" })).status, 429);
});

test("preflight and health checks", async () => {
  const pre = await worker.fetch(new Request("https://w.dev/chat", { method: "OPTIONS", headers: { origin: ORIGIN } }), env);
  assert.equal(pre.status, 204);
  assert.equal((await worker.fetch(new Request("https://w.dev/health"), env)).status, 200);
});

test("helpers", () => {
  assert.equal(validate({ message: "ok" }), null);
  assert.equal(corsHeaders("https://x.dev", { ALLOWED_ORIGINS: "https://x.dev/" })["access-control-allow-origin"], "https://x.dev");
  assert.equal(cleanAnswer("<think>a\nb</think>\n Hi "), "Hi");
  const msgs = buildMessages({ name: "Ada", first: "Ada" }, [], [{ role: "user", content: "q0" }], "q1");
  assert.deepEqual(msgs.map((m) => m.role), ["system", "user", "user"]);
  assert.match(msgs[0].content, /no matching information/);
});
