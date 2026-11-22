import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { buildPlan, planInput, planOutput } from "../src/studio.ts";
import { handle } from "../src/index.ts";
import { createExecutor } from "../runner/executions.ts";
import { runnerApi } from "../runner/http.ts";

const video = { query: "Build me a complete AI video production stack using open-source tools." };
const cases = [
  [video.query, "ai-film-studio"],
  ["Design a 3D browser game development stack.", "browser-game"],
  ["Build a local AI agent with memory.", "local-memory"],
  ["Build a multi-agent research system.", "research"],
  ["Plan an AI-powered SaaS application.", "saas"]
];
const delay = () => new Promise(resolve => setTimeout(resolve, 10));

test("five stack workflows build valid manifests with prerequisite order", async () => {
  for (const [query, expected] of cases) {
    const response = await handle(new Request("https://catalog.test/api/v1/stacks/build", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query })
    }));
    assert.equal(response.status, 200);
    const plan = planOutput.parse(await response.json());
    assert.equal(plan.recipe?.id, expected);
    assert.ok(plan.components.length >= 2);
    assert.equal(plan.cost.totalUsd, null);
    assert.equal(Boolean(plan.execution), expected === "ai-film-studio");
    for (const item of plan.components) for (const dep of item.dependsOn) {
      assert.ok(plan.installationOrder.indexOf(dep) < plan.installationOrder.indexOf(item.role));
    }
  }
});

test("validate conflicting license and incompatible role selection, compare valid alternatives", async () => {
  const edited = { ...video, selections: [{ role: "render", toolId: "gh-274495425" }] };
  for (const input of [edited, { ...video, environment: { license: "MIT" } },
    { ...video, selections: [{ role: "render", toolId: "gh-221981891" }] }]) {
    const plan = buildPlan(planInput.parse(input));
    assert.equal(plan.compatibility, "conflict");
    assert.equal(plan.execution, null);
  }
  const response = await handle(new Request("https://catalog.test/api/v1/stacks/compare", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plans: [video, edited] })
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).plans[1].components.find((item: { role: string }) => item.role === "render").tool.name, "Remotion");
  assert.equal((await handle(new Request("https://catalog.test/api/v1/executions/execute", { method: "POST" }))).status, 501);
});

test("runner validates ownership, origin, approval, limits and stop/destroy lifecycle", async () => {
  const container = "a".repeat(64);
  const ownerKey = randomBytes(32).toString("base64url");
  const otherKey = randomBytes(32).toString("base64url");
  let created = 0;
  let stopped = 0;
  let cleaned = 0;
  let finish: (output: Buffer) => void = () => {};
  const executor = createExecutor({
    imageReady: async () => true,
    createContainer: async () => { created++; return container; },
    startContainer: async (_, log) => { log("render started\n"); return new Promise(resolve => { finish = resolve; }); },
    stopContainer: async () => { stopped++; finish(Buffer.alloc(0)); return Buffer.alloc(0); },
    removeContainer: async () => { cleaned++; return Buffer.alloc(0); }
  }, () => {});
  const origin = "http://127.0.0.1:4174";
  const api = runnerApi([ownerKey, otherKey], origin, executor);
  const call = (path: string, body?: unknown, key = ownerKey, from = origin) => api(new Request(origin + "/api/v1/executions/" + path, {
    method: body === undefined ? "GET" : "POST", headers: { Origin: from, ...(key ? { Authorization: "Bearer " + key } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }));
  assert.equal((await call("dry-run", video, "")).status, 401);
  assert.equal((await call("dry-run", video, ownerKey, "https://elsewhere.test")).status, 403);
  assert.equal((await call("dry-run", { ...video, query: cases[1][0] })).status, 422);
  assert.equal((await call("dry-run", { ...video, image: "external-image" })).status, 400);
  assert.equal((await call("dry-run", { query: "x".repeat(9_000) })).status, 413);
  const { approvalId } = await (await call("dry-run", video)).json();
  assert.equal(created, 0);
  assert.equal((await call("execute", { approvalId, approved: false })).status, 400);
  assert.equal((await call("execute", { approvalId, approved: true }, otherKey)).status, 403);
  const accepted = await call("execute", { approvalId, approved: true });
  assert.equal(accepted.status, 202);
  const { id } = await accepted.json();
  assert.equal((await call("execute", { approvalId, approved: true })).status, 403);
  assert.equal((await call(id, undefined, otherKey)).status, 404);
  assert.equal((await call(id + "/logs", undefined, otherKey)).status, 404);
  assert.equal((await call("stop", { id }, otherKey)).status, 404);
  assert.equal((await call("destroy", { id }, otherKey)).status, 404);
  for (let i = 0; i < 30 && (await (await call(id)).json()).state !== "running"; i++) await delay();
  assert.match((await (await call(id + "/logs")).json()).logs, /render started/);
  assert.equal((await call("stop", { id })).status, 200);
  assert.equal((await call("destroy", { id })).status, 200);
  assert.equal((await call(id)).status, 404);
  assert.equal(created, 1);
  assert.equal(stopped, 1);
  assert.equal(cleaned, 1);
});
