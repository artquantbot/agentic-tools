import filmStudio from "../data/ai-film-studio.json" with { type: "json" };
import raw from "../data/catalog.json" with { type: "json" };
import categories from "../data/categories.json" with { type: "json" };
import { snapshot, searchInput, type Filters, type Tool } from "./schema.ts";
import { freshness, makeRanker } from "./ranking.ts";

export const catalog = snapshot.parse(raw);
export const byId = new Map(catalog.tools.map(tool => [tool.id, tool]));
export const categoryList = Object.entries(categories).map(([id, name]) => ({
  id, name, count: catalog.tools.filter(tool => tool.categories.includes(id)).length
}));
export function detail(tool: Tool) {
  return { ...tool, freshness: freshness(tool.verifiedAt) };
}
const rank = makeRanker(catalog.tools);
export function search(input: ReturnType<typeof searchInput.parse>) {
  const result = rank(input);
  const summarize = (item: typeof result.results[number]) => {
    const { tool, rank: _rank, ...explanation } = item;
    const { id, name, description, categories, github, hosting, openSource, license, verifiedAt, stars, setup, tradeoff, confidence, lastActivity, kinds, reviewedAt, mcp } = tool;
    return { ...explanation, tool: { id, name, description, categories, github, hosting, openSource, license, verifiedAt, stars, setup, tradeoff, confidence, lastActivity, freshness: freshness(verifiedAt), ...(kinds ? { kinds, mcp, reviewedAt } : {}) },
      evidence: tool.sources,
      alternatives: result.results.filter(candidate => candidate.tool.id !== id && candidate.tool.categories.some(category => categories.includes(category)))
        .slice(0, 2).map(candidate => ({ id: candidate.tool.id, name: candidate.tool.name }))
    };
  };
  return { ...result, results: result.results.map(summarize), unverified: result.unverified.map(summarize) };
}
export function compareTools(ids: string[]) {
  return { tools: ids.flatMap(id => { const tool = byId.get(id); return tool ? [detail(tool)] : []; }), missing: ids.filter(id => !byId.has(id)) };
}
function stackTool(id: string) {
  const tool = byId.get(id);
  return { id, name: tool?.name ?? "Unavailable catalog entry", setup: tool?.setup ?? null, license: tool?.license ?? null };
}
export function recommendStack(query: string, filters: Filters) {
  const namedGuide = query.trim().toLowerCase() === filmStudio.name.toLowerCase() && Object.keys(filters).length === 0;
  const result = search(searchInput.parse({ query: namedGuide ? "AI video production pipeline" : query, filters, limit: 15 }));
  const curatedStack = namedGuide ? {
    ...filmStudio,
    steps: filmStudio.steps.map(({ toolId, alternativeIds, ...step }) => ({
      ...step,
      tool: stackTool(toolId),
      alternatives: alternativeIds.map(stackTool)
    }))
  } : undefined;
  const groups = new Map<string, typeof result.results>();
  for (const item of result.results) {
    const group = item.tool.categories[0];
    const entries = groups.get(group) ?? [];
    if (entries.length < 3) groups.set(group, [...entries, item]);
  }
  return {
    constraints: result.constraints, groups: [...groups].map(([category, candidates]) => ({ category, candidates })),
    ...(curatedStack ? { curatedStack } : {}),
    unverified: result.unverified.slice(0, 5), compatibility: "Review interfaces, versions and deployment requirements before combining candidates."
  };
}
export type SearchResult = ReturnType<typeof search>;
export type StackResult = ReturnType<typeof recommendStack>;
