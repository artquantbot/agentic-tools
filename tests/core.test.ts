import test from "node:test";
import assert from "node:assert/strict";
import { catalog, search } from "../src/catalog.ts";
import { makeRanker, parseConstraints } from "../src/ranking.ts";
import { searchInput, snapshot, tool } from "../src/schema.ts";
import { awesomeProjects, parseRegistryPage, repoKey, requestText, safeUrl } from "../scripts/sources.ts";

test("catalog is normalized and each record has source evidence", () => {
  assert.equal(snapshot.parse(catalog).tools.length, new Set(catalog.tools.map(item => item.id)).size);
  assert.ok(catalog.tools.length >= 40);
  for (const source of ["awesome", "github", "documentation"]) {
    assert.ok(catalog.tools.some(item => item.sources.some(evidence => evidence.kind === source)));
  }
  assert.ok(catalog.tools.every(item => item.id.startsWith("gh-") && !item.sources.some(source => source.kind === "registry")));
  assert.ok(catalog.tools.every(item => item.publisherIds.length === 0 && item.integrations.length === 0));
  const invalid = { ...catalog.tools[0], canonicalUrl: "javascript:alert(1)" };
  assert.equal(tool.safeParse(invalid).success, false);
});

test("Awesome extractor excludes maintainer links and accepts actual project evidence", async () => {
  const markdown = '### Project\n<div><a href="https://github.com/Owner/Repo"><img src="https://img.shields.io/badge/Repository-Public-green" alt="Repository verification"></a></div>\n<a href="https://github.com/Owner">Owner</a>';
  assert.deepEqual([...awesomeProjects(markdown)], [["owner/repo", "Project"]]);
  assert.equal(repoKey("https://github.com/Owner/Repo.git"), "owner/repo");
  assert.equal(repoKey("../evil"), null);
  assert.equal(safeUrl("https://127.0.0.1/example"), null);
  assert.equal(safeUrl("https://user:pass@good.example.org"), null);
  assert.equal(safeUrl("https://[::1]/"), null);
  await assert.rejects(requestText("https://169.254.169.254/"), /allowlist/);
});

test("registry parser whitelists facts and excludes deleted and invalid versions", () => {
  const value = {
    server: { name: "io.github.owner/demo", version: "1.0", description: "<script>invalid</script>" },
    _meta: { "io.modelcontextprotocol.registry/official": { status: "active", updatedAt: "2026-11-21T00:00:00Z", isLatest: true } }
  };
  const deleted = structuredClone(value);
  deleted._meta["io.modelcontextprotocol.registry/official"].status = "deleted";
  const invalidPackage = structuredClone(value);
  const invalid = { ...invalidPackage, server: { ...invalidPackage.server, packages: [{ registryType: "npm", identifier: "put words here" }] } };
  const parsed = parseRegistryPage({ servers: [value, deleted, invalid, { server: { name: "invalid" } }], metadata: { nextCursor: "next" } });
  assert.equal(parsed.next, "next");
  assert.equal(parsed.entries.length, 1);
  assert.equal("description" in parsed.entries[0], false);
});

test("preference parsing and explicit hard filter precedence", () => {
  const parsed = parseConstraints("Run offline and prefer Python", { language: "Python" });
  assert.equal(parsed.find(item => item.field === "language")?.required, true);
  assert.ok(parsed.some(item => item.field === "noPaidApi" && item.required));
  assert.equal(parseConstraints("Prefer Python")[0].required, false);
});

test("popular tools with conflicts, missing data or deprecation cannot outrank an eligible result", () => {
  const basis = catalog.tools.find(item => item.name === "Playwright")!;
  const variants = [
    { ...basis, id: "very-popular", stars: 1_000_000, os: ["Windows"], noPaidApi: false },
    { ...basis, id: "unverified", stars: 2_000_000, os: null },
    { ...basis, id: "deprecated", stars: 3_000_000, maintenance: "publisher-deprecated" as const }
  ];
  const result = makeRanker([basis, ...variants])(searchInput.parse({ query: "Browser automation on macOS with no paid API", sort: "popular" }));
  assert.deepEqual(result.results.map(item => item.tool.id), [basis.id]);
  assert.deepEqual(result.unverified.map(item => item.tool.id), ["deprecated", "unverified"]);
});

test("unsupported platform has no eligible results", () => {
  const result = search(searchInput.parse({ query: "Run an LLM locally on FreeBSD" }));
  assert.equal(result.results.length, 0);
});

test("repository metadata alone does not qualify a project for task recommendations", () => {
  const basis = catalog.tools.find(item => item.name === "Playwright")!;
  const metadata = { ...basis, confidence: "metadata" as const };
  const rank = makeRanker([metadata]);
  const task = rank(searchInput.parse({ query: "Playwright" }));
  assert.equal(task.total, 0);
  assert.deepEqual(task.unverified.map(item => item.tool.id), [basis.id]);
  assert.equal(rank(searchInput.parse({})).total, 1);
});
