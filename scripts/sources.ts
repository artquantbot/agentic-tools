import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as z from "zod";

export const awesomeUrl = "https://github.com/slavakurilyak/awesome-ai-agents";
export const awesomeRaw = "https://raw.githubusercontent.com/slavakurilyak/awesome-ai-agents/main/README.md";
export const registryUrl = "https://registry.modelcontextprotocol.io/v0.1/servers";
const repoPattern = /^[\w.-]{1,100}\/[\w.-]{1,100}$/;
export function repoKey(value: string | undefined) {
  const candidate = value?.replace(/^https:\/\/github\.com\//i, "").replace(/\/$/, "").replace(/\.git$/, "");
  return candidate && repoPattern.test(candidate) && candidate.split("/").every(part => part !== "." && part !== "..")
    ? candidate.toLowerCase() : null;
}

export function safeUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return null;
    if (/\.(local|internal|localhost|test|invalid|example)$/i.test(url.hostname) || /^\d/.test(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function awesomeProjects(markdown: string) {
  const projects = new Map<string, string>();
  for (const section of markdown.split(/^### /m).slice(1)) {
    const [name] = section.split("\n", 1);
    const match = section.match(/<a href="(https:\/\/github\.com\/[^"<>]+)"><img src="https:\/\/img\.shields\.io\/badge\/Repository-Public-green"/);
    const key = repoKey(match?.[1]);
    if (key && name.length <= 160) projects.set(key, name.trim());
  }
  return projects;
}

const registryEntry = z.object({
  server: z.object({
    name: z.string().regex(/^[\w.-]+\/[\w.-]+$/).max(80),
    version: z.string().min(1).max(80),
    repository: z.object({ url: z.string().optional() }).optional(),
    packages: z.array(z.object({ registryType: z.string().max(20), identifier: z.string().max(100) })).default([]),
    remotes: z.array(z.object({ type: z.enum(["streamable-http", "sse"]) })).default([])
  }),
  _meta: z.object({
    "io.modelcontextprotocol.registry/official": z.object({
      status: z.enum(["active", "deprecated", "deleted"]), updatedAt: z.iso.datetime(), isLatest: z.boolean().optional()
    })
  })
});

export function parseRegistryPage(input: unknown) {
  const page = z.object({
    servers: z.array(z.unknown()), metadata: z.object({ nextCursor: z.string().max(300).optional() })
  }).parse(input);
  return {
    entries: page.servers.flatMap(value => {
      const entry = registryEntry.safeParse(value);
      if (!entry.success) return [];
      const meta = entry.data._meta["io.modelcontextprotocol.registry/official"];
      return meta.status === "deleted" || meta.isLatest === false ? [] : [{ ...entry.data.server, ...meta }];
    }),
    next: page.metadata.nextCursor
  };
}

type Cached = { checkedAt: string; etag?: string; body: string };
const hosts = new Set(["api.github.com", "raw.githubusercontent.com", "registry.modelcontextprotocol.io", "hacker-news.firebaseio.com"]);
const cacheDir = new URL("../.cache/import/", import.meta.url);

export async function requestText(url: string, token?: string): Promise<Cached> {
  const parsed = new URL(url);
  if (!safeUrl(url) || !hosts.has(parsed.hostname)) throw new Error("Upstream host is outside the importer allowlist");
  await mkdir(cacheDir, { recursive: true });
  const cache = new URL(createHash("sha256").update(url).digest("hex") + ".json", cacheDir);
  const previous: Cached | null = await readFile(cache, "utf8").then(JSON.parse).catch(() => null);
  const now = new Date().toISOString();
  if (previous && Date.now() - Date.parse(previous.checkedAt) < 3600000) return previous;
  const headers = new Headers({ "user-agent": "agentic-tools-catalog/0.1" });
  if (previous?.etag) headers.set("if-none-match", previous.etag);
  if (parsed.hostname === "api.github.com" && token) headers.set("authorization", `Bearer ${token}`);
  try {
    const response = await fetch(parsed, { headers, redirect: "error", signal: AbortSignal.timeout(18000) });
    if (response.status !== 304 && !response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = response.status === 304 ? null : await response.arrayBuffer();
    if (bytes && bytes.byteLength > 4_000_000) throw new Error("Source response exceeds import limit");
    const item = {
      checkedAt: now, etag: response.headers.get("etag") ?? previous?.etag,
      body: bytes ? new TextDecoder().decode(bytes) : previous?.body ?? ""
    };
    await writeFile(cache, JSON.stringify(item));
    return item;
  } catch (error) {
    if (previous) {
      console.warn(`Using cached data for ${parsed.hostname}`);
      return previous;
    }
    throw error;
  }
}
