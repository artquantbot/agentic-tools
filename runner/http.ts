import { createHash, timingSafeEqual } from "node:crypto";
import * as z from "zod";
import { runnerOpenApi } from "./openapi.ts";
import { createExecutor, jobInput, RunnerError } from "./executions.ts";

const prefix = "/api/v1/executions";
export const keyPattern = /^[A-Za-z0-9_-]{43,128}$/;
const asDigest = (key: string) => createHash("sha256").update(key).digest();

async function body(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new RunnerError(415, "content_type", "Send application/json.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RunnerError(400, "invalid_input", "Send a JSON body.");
  const buffer = new Uint8Array(8_192);
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.length > buffer.length) throw new RunnerError(413, "too_large", "Body exceeds 8 KiB.");
      buffer.set(value, size);
      size += value.length;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size))) as unknown;
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof RunnerError) throw error;
    throw new RunnerError(400, "invalid_input", "Send valid UTF-8 JSON.");
  } finally { reader.releaseLock(); }
}

export function runnerApi(keys: string[], origin: string, executor = createExecutor()) {
  if (!keys.length || keys.length > 8 || keys.some(key => !keyPattern.test(key))) throw new Error("Configure 1–8 random runner keys, 43–128 base64url characters each.");
  const digests = keys.map(asDigest);
  const limits = new Map<string, { start: number; count: number }>();
  const json = (value: unknown, status = 200) => Response.json(value, {
    status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" }
  });
  return async (request: Request) => {
    const path = new URL(request.url).pathname;
    const suffix = path.slice(prefix.length);
    try {
      const requester = request.headers.get("origin");
      if ((requester && requester !== origin) || request.headers.get("sec-fetch-site") === "cross-site") {
        throw new RunnerError(403, "origin", "Only the local Stack Studio origin may access the runner.");
      }
      if (suffix === "/openapi.json" && request.method === "GET") return json(runnerOpenApi);
      if (suffix === "/capability" && request.method === "GET") return json({ local: true });
      const key = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
      if (!key) throw new RunnerError(401, "unauthorized", "Provide a local runner key.");
      const digest = asDigest(key);
      if (!digests.some(candidate => timingSafeEqual(candidate, digest))) throw new RunnerError(401, "unauthorized", "Provide a local runner key.");
      const owner = digest.toString("hex");
      const now = Date.now();
      const current = limits.get(owner);
      const window = current && now - current.start < 60_000 ? current : { start: now, count: 0 };
      limits.set(owner, window);
      if (++window.count > 90) throw new RunnerError(429, "rate_limited", "Wait before retrying.");
      if (request.method === "POST") {
        if (suffix === "/dry-run") return json(await executor.dryRun(owner, await body(request)));
        if (suffix === "/execute") return json(executor.execute(owner, await body(request)), 202);
        const action = suffix === "/stop" ? executor.stop : suffix === "/destroy" ? executor.destroy : null;
        if (action) return json(await action(owner, jobInput.parse(await body(request)).id));
      }
      if (request.method === "GET") {
        const match = suffix.match(/^\/([\da-f-]{36})(?:\/(logs|artifact))?$/i);
        if (match) {
          const { id } = jobInput.parse({ id: match[1] });
          if (match[2] === "logs") return json(executor.logs(owner, id));
          if (match[2] === "artifact") return new Response(new Uint8Array(executor.artifact(owner, id)), {
            headers: { "Content-Type": "video/mp4", "Content-Disposition": 'attachment; filename="video-smoke.mp4"',
              "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" }
          });
          return json(executor.status(owner, id));
        }
      }
      throw new RunnerError(404, "not_found", "Unknown local runner route.");
    } catch (error) {
      if (error instanceof RunnerError) return json({ error: { code: error.code, message: error.message } }, error.status);
      if (error instanceof z.ZodError) return json({ error: { code: "invalid_input", message: "Request does not match the runner schema." } }, 400);
      return json({ error: { code: "internal", message: "The local runner request failed." } }, 500);
    }
  };
}
