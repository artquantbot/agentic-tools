import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { Readable } from "node:stream";
import { handle } from "../src/index.ts";
import { createExecutor } from "./executions.ts";
import { runnerApi } from "./http.ts";

const port = Number(process.env.STACK_STUDIO_PORT ?? 4174);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid Stack Studio port.");
const address = "127.0.0.1";
const hostname = address + ":" + port;
const origin = "http://" + hostname;
const executor = createExecutor();
const execute = runnerApi((process.env.STACK_RUNNER_KEYS ?? "").split(",").filter(Boolean), origin, executor);

const client = new URL("../.cloudflare/output/v1/workers/default/assets/", import.meta.url);
const webEntry = await readFile(new URL("index.html", client));
const assets = new Set((await readdir(new URL("assets/", client), { withFileTypes: true }))
  .filter(entry => entry.isFile() && /^[\w.-]+\.(js|css)$/.test(entry.name)).map(entry => "/assets/" + entry.name));
const security = {
  "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; object-src 'none'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
const assetBinding = { async fetch(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: security });
  const path = new URL(request.url).pathname;
  if (path.startsWith("/assets/") && !assets.has(path)) return new Response(null, { status: 404, headers: security });
  const file = assets.has(path) ? await readFile(new URL(path.slice(1), client)) : webEntry;
  const contentType = path.endsWith(".js") && assets.has(path) ? "text/javascript" : assets.has(path) ? "text/css" : "text/html";
  return new Response(request.method === "HEAD" ? null : new Uint8Array(file), {
    headers: { ...security, "Content-Type": contentType + "; charset=utf-8", "Cache-Control": "no-store" }
  });
} };

const server = createServer({ requestTimeout: 15_000, headersTimeout: 5_000, maxHeaderSize: 8_192 }, async (incoming, outgoing) => {
  if (incoming.headers.host !== hostname || !incoming.url?.startsWith("/") || incoming.url.startsWith("//")) {
    outgoing.writeHead(400).end();
    return;
  }
  try {
    const url = new URL(origin + incoming.url);
    if (url.origin !== origin) { outgoing.writeHead(400).end(); return; }
    const method = incoming.method ?? "GET";
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) if (typeof value === "string") headers.set(name, value);
    // Cloudflare supplies this header on Workers. Local callers must not control the rate-limit key.
    headers.delete("cf-connecting-ip");
    const init: RequestInit & { duplex?: "half" } = { method, headers };
    if (method !== "GET" && method !== "HEAD") { init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>; init.duplex = "half"; }
    const request = new Request(url, init);
    const runner = url.pathname.startsWith("/api/v1/executions/");
    const response = runner ? await execute(request) : await handle(request, { ASSETS: assetBinding });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).on("error", () => outgoing.destroy()).pipe(outgoing);
    else outgoing.end();
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  }
});
server.maxConnections = 32;
server.setTimeout(15_000, socket => socket.destroy());
server.listen(port, address, () => console.log("Local Stack Studio at " + origin + "/studio"));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  server.close();
  void executor.shutdown().then(() => process.exit(0), () => process.exit(1));
});
