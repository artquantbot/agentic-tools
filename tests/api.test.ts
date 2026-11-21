import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/index.ts";
import { catalog } from "../src/catalog.ts";

const origin = "https://agentic-tools.example.org";
const allow = { LIMIT: { limit: async () => ({ success: true }) } };
const request = (path: string, init?: RequestInit) => handle(new Request(origin + path, init), allow);
const post = (path: string, value: unknown) => request(path, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value)
});

test("list pagination, detail, comparison, health, category and spec contracts", async () => {
  const first = await request("/api/v1/tools?limit=2");
  const next = await request("/api/v1/tools?limit=2&page=2");
  assert.match(first.headers.get("cache-control") ?? "", /max-age/);
  const data = await first.json();
  assert.equal(data.results.length, 2);
  assert.notEqual(data.results[0].tool.id, (await next.json()).results[0].tool.id);
  const ids = data.results.map((item: { tool: { id: string } }) => item.tool.id);
  const detail = await request("/api/v1/tools/" + ids[0]);
  assert.ok((await detail.json()).sources.length > 0);
  assert.equal((await (await post("/api/v1/compare", { ids })).json()).tools.length, 2);
  assert.equal((await (await request("/api/v1/health")).json()).count, catalog.tools.length);
  assert.ok((await (await request("/api/v1/categories")).json()).categories.length >= 25);
  const spec = await (await request("/api/v1/openapi.json")).json();
  assert.equal(spec.openapi, "3.1.0");
  for (const path of ["/health", "/tools", "/tools/{id}", "/categories", "/search", "/compare", "/recommend-stack"]) assert.ok(spec.paths[path]);
});

test("search and stack share eligibility requirements", async () => {
  const criteria = { query: "Run an LLM locally on a Mac" };
  const results = await (await post("/api/v1/search", criteria)).json();
  const stack = await (await post("/api/v1/recommend-stack", criteria)).json();
  assert.ok(results.total > 0);
  assert.ok(stack.groups.length > 0);
  assert.deepEqual(results.constraints, stack.constraints);
});

test("REST rejects malformed inputs, oversized bodies and cross-origin requests", async () => {
  for (const [path, status] of [["/api/v1/tools?limit=99", 400], ["/api/v1/tools?page=1&page=2", 400], ["/api/v2/search", 404], ["/api/v1/search", 405], ["/api/v1/tools/missing-id", 404]] as const) {
    const response = await request(path);
    assert.equal(response.status, status);
    assert.equal(typeof (await response.json()).error.code, "string");
  }
  assert.equal((await request("/api/v1/search", { method: "POST", body: "{}" })).status, 415);
  assert.equal((await request("/api/v1/search", { method: "POST", headers: { "content-type": "application/json" }, body: "bad" })).status, 400);
  assert.equal((await post("/api/v1/search", "x".repeat(20_000))).status, 413);
  assert.equal((await request("/mcp", { headers: { Origin: "https://unrelated.example.org" } })).status, 403);
  const limited = await handle(new Request(origin + "/api/v1/categories"), { LIMIT: { limit: async () => ({ success: false }) } });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "60");
});
