import type { Filters, SearchInput, Tool } from "./schema.ts";
import categoryLabels from "../data/categories.json" with { type: "json" };

type Constraint = { field: keyof Filters | "architecture" | "mcp" | "cloudOnly" | "browser" | "codex" | "videoRendering"; value: string | boolean; required: boolean };
export type Assessment = Constraint & { status: "satisfied" | "unverified" | "conflict" };
const vocab = {
  os: { macOS: /\b(mac|macos|osx|apple silicon)\b/i, Linux: /\blinux\b/i, Windows: /\bwindows\b/i, Android: /\bandroid\b/i, iOS: /\bios\b/i, FreeBSD: /\bfreebsd\b/i },
  language: { Python: /\bpython\b/i, TypeScript: /\btypescript\b/i, JavaScript: /\bjavascript\b/i, Rust: /\brust\b/i, Go: /\b(?:golang|in go|go support)\b/i, Swift: /\bswift\b/i, "C++": /(?:^|\s)c\+\+(?=\s|$|[,.])/i, Ruby: /\bruby\b/i, Java: /\bjava\b/i, Kotlin: /\bkotlin\b/i },
  hosting: { local: /\b(local(?:ly)?|offline|self[- ]hosted|on[- ]prem(?:ises)?)\b/i, cloud: /\b(cloud[- ]only|cloud[- ]hosted|hosted browser|managed sandbox)\b/i }
};

export function parseConstraints(query: string, filters: Filters = {}): Constraint[] {
  const parsed: Constraint[] = [];
  const add = (field: Constraint["field"], value: Constraint["value"], match: RegExpMatchArray) => {
    const start = match.index ?? 0;
    const prefix = query.slice(0, start).split(/[.,;]|\band\b/i).at(-1) ?? "";
    if (/\b(?:avoid|exclude|without|no)\s+(?:using\s+)?$/i.test(prefix)) return;
    parsed.push({ field, value, required: !/\b(?:prefer|ideally|nice to have|optional)\b/i.test(prefix) });
  };

  for (const [field, values] of Object.entries(vocab)) {
    for (const [value, rule] of Object.entries(values)) {
      const match = query.match(rule);
      if (match) add(field as "os" | "language" | "hosting", value, match);
    }
  }
  const open = query.match(/\bopen[- ]source\b/i);
  const free = query.match(/\b(?:no paid API|without (?:a )?paid API|offline)\b/i)
    ?? query.match(/\bfree\b(?=.{0,28}\blocal\b.{0,25}\b(?:video|rendering)\b)/i);
  const silicon = query.match(/\bapple silicon\b/i);
  const license = query.match(/\b(MIT|Apache[- ]2\.0|BSD-3-Clause|AGPL-3\.0|GPL-3\.0)\b/i);
  if (open) add("openSource", true, open);
  if (free) add("noPaidApi", true, free);
  const mcp = query.match(/\b(?:mcp server|through mcp|via mcp)\b/i);
  const cloudOnly = query.match(/\bcloud[- ]only\b/i);
  const browser = query.match(/\b(?:hosted browser|browser automation|browser agents?)\b/i);
  if (mcp) add("mcp", true, mcp);
  if (browser) add("browser", true, browser);
  const codex = query.match(/\bcodex\b/i);
  const rendering = query.match(/\blocal video rendering\b/i);
  if (codex && /\b(?:video|animation|film)\b/i.test(query)) add("codex", true, codex);
  if (rendering) add("videoRendering", true, rendering);
  if (cloudOnly) add("cloudOnly", true, cloudOnly);
  if (silicon) add("architecture", "Apple Silicon", silicon);
  if (license) add("license", license[0].replace(/^apache /i, "Apache-"), license);
  for (const [field, value] of Object.entries(filters)) {
    if (value !== undefined) parsed.push({ field: field as keyof Filters, value, required: true });
  }
  return [...new Map(parsed.sort((a, b) => Number(a.required) - Number(b.required))
    .map(requirement => [`${requirement.field}=${String(requirement.value).toLowerCase()}`, requirement])).values()];
}

function evaluate(tool: Tool, constraint: Constraint): Assessment {
  const { field, value } = constraint;
  const observation = {
    category: tool.categories, kind: tool.kinds, os: tool.os, language: tool.languages,
    codex: tool.capabilities.includes("Codex workflow") || tool.integrations.includes("MCP stdio") ? true : null,
    videoRendering: tool.capabilities.some(capability => ["local video rendering", "programmatic video rendering"].includes(capability)) ? true : null,
    hosting: tool.hosting === "hybrid" ? ["local", "cloud", "hybrid"] : tool.hosting,
    mcp: tool.mcp,
    browser: tool.categories.includes("browser") ? true : tool.confidence === "curated" ? false : null,
    cloudOnly: tool.hosting == null ? null : tool.hosting === "cloud",
    license: tool.license, openSource: tool.openSource, noPaidApi: tool.noPaidApi,
    architecture: tool.capabilities.includes("apple silicon") ? "Apple Silicon" : null
  }[field];
  const match = (observed: unknown) => typeof observed === "string" && typeof value === "string"
    ? observed.toLowerCase() === value.toLowerCase() : observed === value;
  const status = observation == null ? "unverified" : (Array.isArray(observation) ? observation.some(match) : match(observation)) ? "satisfied" : "conflict";
  return { ...constraint, status };
}

const stopWords = new Set("a an the for to on in of and or using use with find build run compare that need needs i we agent agents tool tools can which supports support requires required must no paid api only prefer ideally local locally cloud source open macos mac apple silicon linux windows python typescript javascript rust ruby swift java kotlin freebsd android ios golang free".split(" "));
const concepts: Array<[RegExp, string]> = [
  [/\b(?:browser (?:automation|agent)|automate (?:the )?browser|web testing)\b/i, "browser automation"],
  [/\b(?:llms?|language models?)\b/i, "llm inference"],
  [/\b(?:postgres|postgresql)\b/i, "postgresql"],
  [/\b(?:speech to text|transcribe|transcription)\b/i, "transcription speech"],
  [/\b(?:recall|memory|remember)\b/i, "memory"],
  [/\b(?:observe|traces?|tracing|telemetry)\b/i, "observability tracing"],
  [/\b(?:coordinate|multi.agent|handoffs)\b/i, "orchestration"],
  [/\b(?:isolat\w+|sandbox\w*)\b/i, "sandbox isolated execution"],
  [/\b(?:embedding\w*|similarity search)\b/i, "vector search"],
  [/\b(?:ai video production|video production pipeline|ai film studio)\b/i, "video production pipeline render video generation"],
  [/\b(?:automated video editing|edit(?:ing)? videos?)\b/i, "automated video editing compositing video rendering"],
  [/\b(?:cinematic animation|motion graphics)\b/i, "cinematic animation motion graphics"],
  [/\b(?:video tools|video rendering)\b/i, "video rendering"]
];
function tokens(value: string) {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(word => !stopWords.has(word)) ?? [];
}
export const weights = { relevance: 1, preference: 0.1, maintenance: 0.04, evidence: 0.08 };
export const categoryTitle = (value: string) => categoryLabels[value as keyof typeof categoryLabels] ?? value;
export const freshness = (value: string, now = Date.now()) => now - Date.parse(value) <= 30 * 86400000 ? "current" : "stale";

export function makeRanker(tools: Tool[]) {
  const frequency = new Map<string, number>();
  const index = tools.map(tool => {
    const primary = [...tokens(tool.name), ...tokens(tool.capabilities.join(" ")), ...tokens(tool.categories.map(categoryTitle).join(" "))];
    const secondary = tokens(tool.description ?? "");
    const words = new Map<string, number>();
    for (const word of primary) words.set(word, (words.get(word) ?? 0) + 2);
    for (const word of secondary) words.set(word, (words.get(word) ?? 0) + 1);
    for (const word of words.keys()) frequency.set(word, (frequency.get(word) ?? 0) + 1);
    return { tool, words, length: primary.length * 2 + secondary.length };
  });
  const average = index.reduce((total, item) => total + item.length, 0) / Math.max(index.length, 1);
  return (input: SearchInput) => {
    const constraints = parseConstraints(input.query, input.filters);
    const stop = input.query.replace(/\b(?:MIT|Apache[- ]2\.0|BSD-3-Clause|AGPL-3\.0|GPL-3\.0)\b/gi, "");
    const queryTokens = [...new Set([...tokens(stop), ...concepts.flatMap(([rule, terms]) => rule.test(input.query) ? tokens(terms) : [])])];
    const filterConstraints = parseConstraints("", input.filters);
    const candidates = index.flatMap(({ tool, words, length }) => {
      const requirements = constraints.map(constraint => evaluate(tool, constraint));
      const explicit = filterConstraints.map(constraint => evaluate(tool, constraint));
      if (requirements.some(r => r.required && r.status === "conflict") || explicit.some(r => r.status !== "satisfied")) return [];
      const terms = queryTokens.filter(word => words.has(word));
      if (queryTokens.length && !terms.length) return [];
      const score = terms.reduce((total, word) => {
        const tf = words.get(word) ?? 0;
        const df = frequency.get(word) ?? 0;
        const idf = Math.log(1 + (index.length - df + 0.5) / (df + 0.5));
        return total + idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * length / (average || 1)));
      }, 0);
      const fit = queryTokens.length ? (1 - Math.exp(-score / 5)) : 0;
      const upkeep = tool.maintenance === "repository-active" ? "repository-active" : tool.maintenance ?? "unknown";
      const catalogStatus = upkeep === "archived" || upkeep === "publisher-deprecated" ? "retired" : "listed";
      const hasTaskEvidence = !input.query || tool.confidence === "curated";
      const eligible = catalogStatus === "listed" && hasTaskEvidence && requirements.every(r => !r.required || r.status === "satisfied");
      const preference = requirements.filter(r => !r.required && r.status === "satisfied").length / Math.max(constraints.filter(r => !r.required).length, 1);
      return [{
        tool, requirements, eligible, why: terms.length ? `Matches catalog terms: ${terms.join(", ")}.` : "Matches the selected catalog scope.",
        scores: {
          taskFit: Math.round(fit * 100), maintenance: upkeep,
          trust: { advisoryStatus: tool.securityAdvisories === null ? "unknown" : tool.securityAdvisories.length ? "advisory-listed" : "none-in-reviewed-sources", evidence: tool.confidence },
          integration: tool.installation?.length ? "documented" : "unknown",
          cost: tool.noPaidApi === true ? "no-paid-api-path-documented" : tool.noPaidApi === false ? "paid-api-required" : "unknown"
        },
        rank: fit * weights.relevance + preference * weights.preference
          + Number(upkeep === "repository-active") * weights.maintenance + Number(tool.confidence === "curated") * weights.evidence
      }];
    });
    const compare = (a: typeof candidates[number], b: typeof candidates[number]) => {
      if (input.sort === "recent") return (b.tool.lastActivity ?? "").localeCompare(a.tool.lastActivity ?? "") || a.tool.id.localeCompare(b.tool.id);
      if (input.sort === "popular") return (b.tool.stars ?? -1) - (a.tool.stars ?? -1) || a.tool.id.localeCompare(b.tool.id);
      return b.rank - a.rank || a.tool.id.localeCompare(b.tool.id);
    };
    const confirmed = candidates.filter(row => row.eligible).sort(compare);
    const uncertain = candidates.filter(row => !row.eligible).sort(compare);
    const start = (input.page - 1) * input.limit;
    return {
      constraints, total: confirmed.length, unverifiedTotal: uncertain.length, page: input.page, limit: input.limit,
      results: confirmed.slice(start, start + input.limit), unverified: uncertain.slice(start, start + input.limit)
    };
  };
}
