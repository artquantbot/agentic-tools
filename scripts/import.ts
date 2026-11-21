import { createHash } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import * as z from "zod";
import { snapshot, type Tool, type Source } from "../src/schema.ts";
import { awesomeProjects, awesomeRaw, awesomeUrl, parseRegistryPage, registryUrl, repoKey, requestText, safeUrl } from "./sources.ts";
import categories from "../data/categories.json" with { type: "json" };

const generatedAt = new Date().toISOString();
const target = new URL("../data/catalog.json", import.meta.url);
const old = await readFile(target, "utf8").then(text => snapshot.parse(JSON.parse(text))).catch(() => null);
const token = process.env.GITHUB_TOKEN;
const openLicenses = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "GPL-2.0", "GPL-3.0", "AGPL-3.0", "MPL-2.0", "ISC", "Unlicense", "LGPL-3.0", "Artistic-2.0", "EPL-2.0"]);
const githubSchema = z.object({
  id: z.int(), name: z.string().max(160), html_url: z.string(), homepage: z.string().nullable(),
  full_name: z.string(), language: z.string().nullable(), archived: z.boolean(), disabled: z.boolean(),
  license: z.object({ spdx_id: z.string().nullable() }).nullable(),
  pushed_at: z.iso.datetime().nullable(), stargazers_count: z.int().nonnegative()
});

type Curated = Partial<Tool>;
const curated = new Map<string, Curated>();
const tsv = await readFile(new URL("../data/curated.tsv", import.meta.url), "utf8");
function list(value: string) { return value ? value.split(",") : []; }
for (const row of tsv.trim().split("\n").slice(1)) {
  const [repository, name, groups, caps, description, docs, langs, os, hosting, noPaidApi, tradeoff] = row.split("\t");
  const key = repoKey(repository);
  const setup = safeUrl(docs);
  if (!key || !setup || !list(groups).every(group => group in categories)) throw new Error(`Invalid curated row for ${repository}`);
  curated.set(key, {
    name, description, categories: list(groups), capabilities: list(caps), setup,
    languages: list(langs).length ? list(langs) : null, os: list(os).length ? list(os) : null,
    hosting: hosting as Tool["hosting"], noPaidApi: noPaidApi === "" ? null : noPaidApi === "true", tradeoff,
    confidence: "curated", mcp: list(groups).includes("mcp") ? true : null
  });
}

function empty(fields: Pick<Tool, "id" | "name" | "canonicalUrl" | "categories" | "sources">): Tool {
  return {
    github: null, website: null, description: null, capabilities: [], os: null, languages: null,
    license: null, openSource: null, hosting: null, noPaidApi: null, pricing: null, dependencies: null,
    permissions: null, installation: null, integrations: [], mcp: null, maintenance: null, latestRelease: null,
    lastActivity: null, stars: null, securityAdvisories: null, setup: null, tradeoff: null,
    publisherIds: [], verifiedAt: fields.sources.map(s => s.verifiedAt).sort().at(-1) ?? generatedAt, confidence: "metadata", ...fields
  };
}
function observation(kind: Source["kind"], url: string, verifiedAt: string, fields: string[]): Source {
  return { kind, url, verifiedAt, fields };
}
const tools = new Map<string, Tool>();
const repositories = new Map<string, Tool>();
const imported = await requestText(awesomeRaw).catch(error => { console.warn("Awesome AI Agents unavailable", error.message); return null; });
const awesome = imported ? awesomeProjects(imported.body) : new Map<string, string>();
if (imported && !awesome.size) throw new Error("Awesome source format changed");
const keys = [...new Set([...curated.keys(), ...[...awesome.keys()].filter(key => !curated.has(key)).slice(0, 12)])];
for (let offset = 0; offset < keys.length; offset += 4) {
  await Promise.all(keys.slice(offset, offset + 4).map(async key => {
    try {
      const response = await requestText(`https://api.github.com/repos/${key}`, token);
      const metadata = githubSchema.parse(JSON.parse(response.body));
      if (metadata.disabled || !safeUrl(metadata.html_url)) return;
      const doc = curated.get(key);
      const sources = [observation("github", metadata.html_url, response.checkedAt, ["identity", "license", "stars", "lastActivity", "maintenance", "primaryLanguage"])];
      if (imported && awesome.has(key)) sources.push(observation("awesome", awesomeUrl, imported.checkedAt, ["discovery"]));
      if (doc?.setup) sources.push(observation("documentation", doc.setup, "2026-11-21T00:00:00.000Z",
        ["description", "categories", "capabilities", "hosting", "setup", "tradeoff", ...Object.keys(doc).filter(field => ["languages", "os", "noPaidApi"].includes(field) && doc[field as keyof Tool] !== null)]));
      const record = empty({
        id: `gh-${metadata.id}`, name: metadata.name, canonicalUrl: metadata.html_url, categories: ["emerging"], sources
      });
      Object.assign(record, doc, {
        github: metadata.html_url, website: safeUrl(metadata.homepage), languages: doc?.languages ?? (metadata.language ? [metadata.language] : null),
        license: metadata.license?.spdx_id && metadata.license.spdx_id !== "NOASSERTION" ? metadata.license.spdx_id : null,
        openSource: metadata.license?.spdx_id && openLicenses.has(metadata.license.spdx_id.replace(/-(only|or-later)$/, "")) ? true : null,
        stars: metadata.stargazers_count, lastActivity: metadata.pushed_at,
        maintenance: metadata.archived ? "archived" : "repository-active"
      });
      tools.set(record.id, record);
      repositories.set(key, record);
      const actual = repoKey(metadata.full_name);
      if (actual) repositories.set(actual, record);
    } catch (error) {
      const previous = old?.tools.find(tool => repoKey(tool.github ?? undefined) === key);
      if (previous) { tools.set(previous.id, previous); repositories.set(key, previous); }
      console.warn(`GitHub metadata unavailable for ${key}: ${(error as Error).message}`);
    }
  }));
}

try {
  const result = await requestText(`${registryUrl}?limit=40&version=latest`);
  const page = parseRegistryPage(JSON.parse(result.body));
  if (!page.entries.length) throw new Error("No valid latest entries in source response");
  for (const entry of page.entries) {
    const github = entry.repository?.url && /^https:\/\/github\.com\//i.test(entry.repository.url)
      ? repoKey(entry.repository.url) : null;
    const api = `${registryUrl}/${encodeURIComponent(entry.name)}/versions/${encodeURIComponent(entry.version)}`;
    const evidence = observation("registry", api, result.checkedAt, ["publisherIds", "publisherVersion", "mcp", "integrations"]);
    const packageIds = entry.packages.map(pkg => `${pkg.registryType}:${pkg.identifier}`).filter(value => value.length <= 80);
    const publisherIds = [...new Set([entry.name, ...packageIds])];
    const linked = github ? repositories.get(github) : undefined;
    const byPackage = [...tools.values()].find(tool => packageIds.some(pkg => tool.publisherIds.includes(pkg)));
    const record = linked ?? byPackage ?? empty({
      id: `mcp-${createHash("sha256").update(entry.name).digest("hex").slice(0, 32)}`, name: entry.name,
      canonicalUrl: api, categories: ["mcp"], sources: []
    });
    if (record.publisherIds.includes(entry.name)) continue;
    record.publisherIds = [...new Set([...record.publisherIds, ...publisherIds])];
    record.integrations = [...new Set([...record.integrations, ...entry.remotes.map(remote => remote.type), ...entry.packages.map(pkg => pkg.registryType)])];
    record.sources = [...record.sources, evidence];
    record.categories = [...new Set([...record.categories, "mcp"])];
    record.mcp = true;
    record.verifiedAt = record.sources.map(source => source.verifiedAt).sort().at(-1) ?? record.verifiedAt;
    if (!linked && !byPackage) {
      record.description = "MCP server listed in the Official MCP Registry.";
      record.latestRelease = entry.version;
      record.lastActivity = entry.updatedAt;
      record.verifiedAt = result.checkedAt;
      record.maintenance = entry.status === "deprecated" ? "publisher-deprecated" : null;
      record.github = github ? `https://github.com/${github}` : null;
      record.setup = record.github;
    }
    tools.set(record.id, record);
    if (github) repositories.set(github, record);
  }
} catch (error) {
  console.warn("Official MCP Registry unavailable:", (error as Error).message);
  for (const record of old?.tools ?? []) {
    if (record.id.startsWith("mcp-") && !tools.has(record.id)) tools.set(record.id, record);
  }
}

const next = snapshot.parse({ generatedAt, tools: [...tools.values()].sort((a, b) => a.id.localeCompare(b.id)) });
if (next.tools.filter(tool => tool.confidence === "curated").length < 25) throw new Error("Curated import coverage is too low; current snapshot preserved");
const temporary = new URL(`${target.href}.${process.pid}.tmp`);
await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
await rename(temporary, target);
console.log(`Imported ${next.tools.length} tools (${next.tools.filter(tool => tool.confidence === "curated").length} curated)`);
