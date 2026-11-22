import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import * as z from "zod";
import { snapshot, tool, url, type Tool, type Source } from "../src/schema.ts";
import { awesomeProjects, awesomeRaw, awesomeUrl, parseRegistryPage, registryUrl, repoKey, requestText, safeUrl } from "./sources.ts";
import categories from "../data/categories.json" with { type: "json" };

const target = new URL("../data/catalog.json", import.meta.url);
const old = await readFile(target, "utf8").then(text => snapshot.parse(JSON.parse(text))).catch(() => null);
const options = { cacheOnly: process.argv.includes("--cached") };
const token = process.env.GITHUB_TOKEN;
const reviewedOnly = process.argv.includes("--reviewed-only");
if (reviewedOnly && !old) throw new Error("A valid existing snapshot is required for a reviewed-only import");
const generatedAt = options.cacheOnly ? old?.generatedAt ?? new Date().toISOString() : new Date().toISOString();
const openLicenses = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "GPL-2.0", "GPL-3.0", "AGPL-3.0", "MPL-2.0", "ISC", "Unlicense", "LGPL-3.0", "Artistic-2.0", "EPL-2.0"]);
const githubSchema = z.object({
  id: z.int(), name: z.string().max(160), html_url: z.string(), full_name: z.string(),
  language: z.string().nullable(), archived: z.boolean(), disabled: z.boolean(),
  license: z.object({ spdx_id: z.string().nullable() }).nullable(),
  pushed_at: z.iso.datetime().nullable(), stargazers_count: z.int().nonnegative()
});

class RepositoryIdentityError extends Error {}

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

const reviewedItem = tool.pick({
  name: true, description: true, categories: true, capabilities: true, os: true, languages: true,
  hosting: true, noPaidApi: true, dependencies: true, installation: true, permissions: true,
  integrations: true, mcp: true, setup: true, tradeoff: true
}).extend({
  repository: z.string(), githubId: z.int().positive(), reviewedAt: z.iso.datetime(),
  kinds: tool.shape.kinds.unwrap(), license: tool.shape.license, openSource: tool.shape.openSource,
  licenseTerms: tool.shape.licenseTerms.unwrap(), licenseSource: url, extraEvidence: z.array(url)
});
const reviewFile = new URL("../data/reviewed-tools.json", import.meta.url);
const reviews = z.array(reviewedItem).parse(JSON.parse(await readFile(reviewFile, "utf8")));
const reviewedEvidence = new Map<string, Source[]>();
const reviewedIds = new Set<number>();
for (const { repository, githubId, licenseSource, extraEvidence, ...fields } of reviews) {
  const key = repoKey(repository);
  if (!key || curated.has(key) || reviewedIds.has(githubId) || !fields.categories.every(category => Object.hasOwn(categories, category))) {
    throw new Error(`Invalid or duplicate reviewed repository: ${repository}`);
  }
  const links = [fields.setup, licenseSource, ...extraEvidence];
  if (links.some(link => !safeUrl(link)) || (fields.kinds.includes("mcp-server") && fields.mcp !== true)) {
    throw new Error(`Reviewed repository has invalid evidence: ${repository}`);
  }
  curated.set(key, { ...fields, confidence: "curated" });
  reviewedIds.add(githubId);
  reviewedEvidence.set(key, [
    observation("documentation", fields.setup!, fields.reviewedAt, ["installation", "dependencies", "capabilities", "os", "integrations", "mcp", "kinds"]),
    observation("documentation", licenseSource, fields.reviewedAt, ["license", "licenseTerms", "openSource"]),
    ...extraEvidence.map(link => observation("documentation", link, fields.reviewedAt, ["supplementary evidence"]))
  ]);
}
const expectedReviewedIds = new Map(reviews.map(review => [repoKey(review.repository), review.githubId]));

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
const tools = new Map<string, Tool>(reviewedOnly ? old?.tools.map(tool => [tool.id, tool]) : []);
const imported = reviewedOnly ? null : await requestText(awesomeRaw, undefined, options).catch(error => { console.warn("Awesome AI Agents unavailable", error.message); return null; });
const awesome = imported ? awesomeProjects(imported.body) : new Map<string, string>();
if (imported && !awesome.size) throw new Error("Awesome source format changed");
const keys = reviewedOnly ? [...reviewedEvidence.keys()] :
  [...new Set([...curated.keys(), ...[...awesome.keys()].filter(key => !curated.has(key)).slice(0, 12)])];
for (let offset = 0; offset < keys.length; offset += 4) {
  await Promise.all(keys.slice(offset, offset + 4).map(async key => {
    try {
      const response = await requestText(`https://api.github.com/repos/${key}`, token, options);
      const metadata = githubSchema.parse(JSON.parse(response.body));
      if (!safeUrl(metadata.html_url) || repoKey(metadata.html_url) !== key || repoKey(metadata.full_name) !== key
        || (expectedReviewedIds.has(key) && metadata.id !== expectedReviewedIds.get(key))) throw new RepositoryIdentityError(`Repository identity did not match ${key}`);
      if (metadata.disabled) {
        tools.delete(`gh-${metadata.id}`);
        return;
      }
      const doc = curated.get(key);
      const sources = [observation("github", metadata.html_url, response.checkedAt, ["identity", "license", "stars", "lastActivity", "maintenance", "primaryLanguage"])];
      if (imported && awesome.has(key)) sources.push(observation("awesome", awesomeUrl, imported.checkedAt, ["discovery"]));
      if (reviewedEvidence.has(key)) sources.push(...reviewedEvidence.get(key)!);
      else if (doc?.setup) sources.push(observation("documentation", doc.setup, "2026-11-21T00:00:00.000Z",
        ["description", "categories", "capabilities", "hosting", "setup", "tradeoff", ...Object.keys(doc).filter(field => ["languages", "os", "noPaidApi"].includes(field) && doc[field as keyof Tool] !== null)]));
      const record = empty({
        id: `gh-${metadata.id}`, name: metadata.name, canonicalUrl: metadata.html_url, categories: ["emerging"], sources
      });
      Object.assign(record, doc, {
        github: metadata.html_url, website: null, languages: doc?.languages ?? (metadata.language ? [metadata.language] : null),
        license: doc?.license !== undefined ? doc.license : metadata.license?.spdx_id && metadata.license.spdx_id !== "NOASSERTION" ? metadata.license.spdx_id : null,
        openSource: doc?.openSource !== undefined ? doc.openSource : metadata.license?.spdx_id && openLicenses.has(metadata.license.spdx_id.replace(/-(only|or-later)$/, "")) ? true : null,
        stars: metadata.stargazers_count, lastActivity: metadata.pushed_at,
        maintenance: metadata.archived ? "archived" : "repository-active"
      });
      tools.set(record.id, record);
    } catch (error) {
      if (error instanceof RepositoryIdentityError && expectedReviewedIds.has(key)) throw error;
      const previous = old?.tools.find(tool => tool.id.startsWith("gh-") && repoKey(tool.github ?? undefined) === key
        && tool.sources.some(source => source.kind === "github"));
      if (previous) {
        const doc = curated.get(key);
        const evidence = reviewedEvidence.get(key);
        const sources = previous.sources.filter(source => source.kind !== "registry" && (!evidence || source.kind !== "documentation"));
        if (evidence) sources.push(...evidence);
        tools.set(previous.id, {
          ...empty({ id: previous.id, name: previous.name, canonicalUrl: previous.canonicalUrl, categories: ["emerging"], sources }),
          ...doc, github: previous.github, license: doc?.license !== undefined ? doc.license : previous.license,
          openSource: doc?.openSource !== undefined ? doc.openSource : previous.openSource, stars: previous.stars,
          languages: doc?.languages ?? previous.languages, lastActivity: previous.lastActivity, maintenance: previous.maintenance
        });
      }
      console.warn(`GitHub metadata unavailable for ${key}: ${(error as Error).message}`);
    }
  }));
}

if (process.argv.includes("--registry-leads")) {
  const result = await requestText(`${registryUrl}?limit=40&version=latest`, undefined, options);
  const page = parseRegistryPage(JSON.parse(result.body));
  const leads = page.entries.filter(entry => entry.status === "active").map(entry => ({
    name: entry.name, version: entry.version, status: entry.status,
    registryEvidence: `${registryUrl}/${encodeURIComponent(entry.name)}/versions/${encodeURIComponent(entry.version)}`
  }));
  const output = new URL("../.cache/import/registry-leads.json", import.meta.url);
  await mkdir(new URL("./", output), { recursive: true });
  await writeFile(output, JSON.stringify({ observedAt: result.checkedAt, untrusted: true, leads }, null, 2) + "\n");
  console.log(`Saved ${leads.length} unreviewed Registry leads outside the catalog`);
}

const next = snapshot.parse({ generatedAt, tools: [...tools.values()].sort((a, b) => a.id.localeCompare(b.id)) });
if (reviewedOnly && reviews.some(review => !tools.get(`gh-${review.githubId}`)?.reviewedAt)) {
  throw new Error("Reviewed import incomplete; current snapshot preserved");
}
if (next.tools.filter(tool => tool.confidence === "curated").length < 25) throw new Error("Curated import coverage is too low; current snapshot preserved");
const temporary = new URL(`${target.href}.${process.pid}.tmp`);
await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
await rename(temporary, target);
console.log(`Imported ${next.tools.length} tools (${next.tools.filter(tool => tool.confidence === "curated").length} curated)`);
