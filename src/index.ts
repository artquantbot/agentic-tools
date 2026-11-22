import { byId, catalog, categoryList, compareTools, detail, recommendStack, search } from "./catalog.ts";
import { comparison, id, searchInput, stackInput, type Filters } from "./schema.ts";
import { mcp } from "./mcp.ts";
import { openapi } from "./openapi.ts";
import * as z from "zod";

export interface Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  LIMIT?: { limit(input: { key: string }): Promise<{ success: boolean }> };
}
const api = "/api/v1";
const productionHost = "agentic-tools.ususuni.com";
const transportSecurity = "max-age=86400";
const maxBody = 16_384;
const cacheControl = "public, max-age=60, s-maxage=300";
const securityHeaders = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY", "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers?: HeadersInit;

  constructor(status: number, code: string, message: string, headers?: HeadersInit) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}
function error(status: number, code: string, message: string, headers?: HeadersInit): never {
  throw new HttpError(status, code, message, headers);
}
async function readBody(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    error(415, "content_type", "Send application/json.");
  }
  if (Number(request.headers.get("content-length")) > maxBody) error(413, "too_large", "JSON body exceeds 16 KiB.");
  const reader = request.body?.getReader();
  if (!reader) return error(400, "invalid_json", "Send a JSON body.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBody) {
        void reader.cancel().catch(() => {});
        error(413, "too_large", "JSON body exceeds 16 KiB.");
      }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode()) as unknown;
  } catch (cause) {
    if (cause instanceof HttpError) throw cause;
    return error(400, "invalid_json", "Send valid UTF-8 JSON.");
  } finally {
    reader.releaseLock();
  }
}
const localLimits = new Map<string, { start: number; count: number }>();
async function allowed(request: Request, env: Env) {
  const key = request.headers.get("cf-connecting-ip") ?? "local";
  if (env.LIMIT) return (await env.LIMIT.limit({ key })).success;
  const now = Date.now();
  for (const [address, window] of localLimits) if (now - window.start >= 60_000) localLimits.delete(address);
  const window = localLimits.get(key) ?? { start: now, count: 0 };
  if (localLimits.has(key) || localLimits.size < 2048) localLimits.set(key, window);
  else return false;
  return ++window.count <= 120;
}

function getSearch(params: URLSearchParams) {
  const filters: Record<string, unknown> = {};
  const input: Record<string, unknown> = { filters };
  for (const [key, val] of params) {
    if (params.getAll(key).length > 1) error(400, "invalid_input", "Duplicate query parameter.");
    if (key === "page" || key === "limit") input[key] = /^\d+$/.test(val) ? Number(val) : val;
    else if (key === "sort" || key === "query") input[key] = val;
    else if (key === "openSource" || key === "noPaidApi") filters[key] = val === "true" ? true : val === "false" ? false : val;
    else if (["category", "kind", "hosting", "os", "language", "license"].includes(key)) filters[key] = val;
    else error(400, "invalid_input", "Unknown query parameter.");
  }
  return searchInput.parse(input);
}

export async function handle(request: Request, env: Env = {}): Promise<Response> {
  const url = new URL(request.url);
  const onProduction = url.hostname === productionHost;
  if (onProduction && url.protocol === "http:") {
    return Response.redirect(`https://${productionHost}${url.pathname}${url.search}`, 308);
  }
  const path = url.pathname;
  const isApi = path === "/api" || path.startsWith("/api/");
  const isMcp = path === "/mcp";
  if (!isApi && !isMcp) return env.ASSETS?.fetch(request) ?? new Response("Not found", { status: 404 });

  const json = (value: unknown, status = 200, headers?: HeadersInit) => {
    const responseHeaders = new Headers({ ...securityHeaders, "Cache-Control": "no-store" });
    if (onProduction) responseHeaders.set("Strict-Transport-Security", transportSecurity);
    new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
    return Response.json(value, { status, headers: responseHeaders });
  };
  try {
    if (url.search.length > 2048) error(400, "invalid_input", "Query string exceeds length limit.");
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) error(403, "origin", "Origin must match this service.");
    if (request.headers.get("sec-fetch-site") === "cross-site" && request.method === "POST") error(403, "origin", "Cross-site request denied.");
    if (path === api + "/health" && request.method === "GET") return json({ status: "ok", version: "1.0.0", generatedAt: catalog.generatedAt, count: catalog.tools.length }, 200, { "Cache-Control": "public, max-age=30" });
    if (!(await allowed(request, env))) error(429, "rate_limited", "Request limit exceeded.", { "Retry-After": "60" });
    if (isMcp) {
      const parsedBody = request.method === "POST" ? await readBody(request) : undefined;
      if (Array.isArray(parsedBody)) error(400, "mcp_batch_not_supported", "Send one JSON-RPC message per request.");
      const response = await mcp.fetch(request, { parsedBody });
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
      headers.set("Cache-Control", "no-store");
      if (onProduction) headers.set("Strict-Transport-Security", transportSecurity);
      return new Response(response.body, { status: response.status, headers });
    }
    const get = request.method === "GET";
    const post = request.method === "POST";
    const cache = { "Cache-Control": cacheControl };
    if (get && path === api + "/openapi.json") return json(openapi, 200, cache);
    if (get && path === api + "/categories") {
      const distinct = <T extends string>(items: T[]) => [...new Set(items)].sort();
      return json({
        categories: categoryList, generatedAt: catalog.generatedAt, count: catalog.tools.length,
        facets: {
          os: distinct(catalog.tools.flatMap(tool => tool.os ?? [])),
          language: distinct(catalog.tools.flatMap(tool => tool.languages ?? [])),
          license: distinct(catalog.tools.flatMap(tool => tool.license ?? []))
        }
      }, 200, cache);
    }
    if (get && path === api + "/tools") return json(search(getSearch(url.searchParams)), 200, cache);
    if (get && path.startsWith(api + "/tools/")) {
      const identifier = id.safeParse(path.slice((api + "/tools/").length));
      const tool = identifier.success ? byId.get(identifier.data) : undefined;
      return tool ? json(detail(tool), 200, cache) : error(404, "not_found", "Unknown catalog ID.");
    }
    if (post && path === api + "/search") return json(search(searchInput.parse(await readBody(request))));
    if (post && path === api + "/compare") return json(compareTools(comparison.parse(await readBody(request)).ids));
    if (post && path === api + "/recommend-stack") {
      const { query, filters } = stackInput.parse(await readBody(request));
      return json(recommendStack(query, filters as Filters));
    }
    const postPaths = ["/search", "/compare", "/recommend-stack"].map(name => api + name);
    const getPaths = ["/health", "/tools", "/categories", "/openapi.json"].map(name => api + name);
    if (postPaths.includes(path)) error(405, "method", "Use POST.", { Allow: "POST" });
    if (getPaths.includes(path) || path.startsWith(api + "/tools/")) error(405, "method", "Use GET.", { Allow: "GET" });
    return error(404, "not_found", "Unknown API route.");
  } catch (cause) {
    if (cause instanceof HttpError) return json({ error: { code: cause.code, message: cause.message } }, cause.status, cause.headers);
    if (cause instanceof z.ZodError) return json({ error: { code: "invalid_input", message: "Input does not match the endpoint schema.", fields: cause.issues.map(issue => issue.path.join(".")) } }, 400);
    console.error(JSON.stringify({ event: "request_failure", surface: isMcp ? "mcp" : "api", error: cause instanceof Error ? cause.name : "unknown" }));
    return json({ error: { code: "internal", message: "The request failed." } }, 500);
  }
}
export default { fetch: handle };
