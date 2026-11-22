import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const base = "http://127.0.0.1:4184";
const key = randomBytes(32).toString("base64url");
const runner = spawn(process.execPath, ["--experimental-strip-types", "runner/server.ts"], {
  stdio: "inherit", env: { ...process.env, STACK_STUDIO_PORT: "4184", STACK_RUNNER_KEYS: key }
});
const exited = once(runner, "exit");
async function api(path: string, expected: number, payload?: unknown, secret = key) {
  const response = await fetch(base + "/api/v1/executions/" + path, {
    method: payload === undefined ? "GET" : "POST",
    headers: { Authorization: "Bearer " + secret, ...(payload === undefined ? {} : { "Content-Type": "application/json" }) },
    body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(10_000)
  });
  assert.equal(response.status, expected, path + " returned " + response.status);
  return response;
}
let id: string | undefined;
try {
  for (let attempt = 0; ; attempt++) {
    try { await api("capability", 200); break; }
    catch (error) { if (attempt >= 40 || runner.exitCode !== null) throw error; await setTimeout(100); }
  }
  const preview = await (await api("dry-run", 200, { query: "AI video production" })).json();
  assert.equal(preview.ready, true, "Pinned image and daemon must be available.");
  await api("execute", 400, { approvalId: preview.approvalId, approved: false });
  id = (await (await api("execute", 202, { approvalId: preview.approvalId, approved: true })).json()).id;
  assert.ok(id);
  await api(id, 401, undefined, randomBytes(32).toString("base64url"));
  let status;
  for (let attempt = 0; attempt < 80; attempt++) {
    status = await (await api(id, 200)).json();
    if (status.completed) break;
    await setTimeout(500);
  }
  const { logs } = await (await api(id + "/logs", 200)).json();
  console.log(logs.trim());
  assert.equal(status?.state, "succeeded");
  assert.equal(status.cleanupPending, false);
  const video = Buffer.from(await (await api(id + "/artifact", 200)).arrayBuffer());
  assert.ok(video.length > 1_000);
  assert.equal(video.subarray(4, 8).toString(), "ftyp");
  assert.equal(createHash("sha256").update(video).digest("hex"), status.artifact.sha256);
  console.log("Verified MP4 bytes:", video.length, "SHA-256:", status.artifact.sha256);
  await api("destroy", 200, { id });
  await api(id, 404);
  id = undefined;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(base + "/studio");
    await page.getByRole("button", { name: "Build stack" }).click();
    await page.getByLabel("Local runner key").fill(key);
    await page.getByRole("button", { name: "Preview dry run" }).click();
    const approve = page.getByRole("button", { name: "Start approved run" });
    await expect(approve).toBeDisabled();
    await page.getByLabel("Approve this local Docker run").check();
    await approve.click();
    await expect(page.getByText("Execution succeeded")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByLabel("Execution logs")).toContainText("Verified fragmented MP4");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download MP4" }).click();
    const file = await download;
    assert.equal(file.suggestedFilename(), "video-smoke.mp4");
    const downloaded = await readFile(await file.path());
    await expect(page.getByText(createHash("sha256").update(downloaded).digest("hex"))).toBeVisible();
    await page.getByRole("button", { name: "Destroy execution" }).click();
    await expect(page.getByText("Execution succeeded")).toHaveCount(0);
    console.log("Browser verified approval, logs, MP4 download and destruction.");
  } finally { await browser.close(); }
} finally {
  if (id) await api("destroy", 200, { id }).catch(() => {});
  runner.kill("SIGTERM");
  await exited;
}
