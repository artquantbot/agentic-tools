import * as z from "zod";
import { toolKinds } from "./tool-kinds.ts";

export const toolKind = z.enum(Object.keys(toolKinds) as (keyof typeof toolKinds)[]);

export const id = z.string().regex(/^[a-z0-9][a-z0-9-]{1,119}$/);
export const label = z.string().trim().min(1).max(80);
export const url = z.url({ protocol: /^https$/ });
export const source = z.object({
  kind: z.enum(["github", "awesome", "registry", "documentation"]),
  url, verifiedAt: z.iso.datetime(), fields: z.array(label)
});
export const tool = z.object({
  id, name: z.string().min(1).max(160), canonicalUrl: url, github: url.nullable(),
  website: url.nullable(), description: z.string().max(240).nullable(),
  categories: z.array(id).min(1), capabilities: z.array(label), os: z.array(label).nullable(),
  languages: z.array(label).nullable(), license: label.nullable(), openSource: z.boolean().nullable(),
  hosting: z.enum(["local", "cloud", "hybrid"]).nullable(), noPaidApi: z.boolean().nullable(),
  pricing: z.string().nullable(), dependencies: z.array(label).nullable(), permissions: z.array(label).nullable(),
  installation: z.array(label).nullable(), integrations: z.array(label),
  mcp: z.boolean().nullable(), maintenance: z.enum(["archived", "repository-active", "publisher-deprecated"]).nullable(),
  latestRelease: label.nullable(), lastActivity: z.iso.datetime().nullable(), stars: z.int().nonnegative().nullable(),
  securityAdvisories: z.array(url).nullable(), setup: url.nullable(), tradeoff: z.string().nullable(),
  publisherIds: z.array(label), sources: z.array(source).min(1), verifiedAt: z.iso.datetime(),
  confidence: z.enum(["curated", "metadata"]),
  kinds: z.array(toolKind).min(1).optional(),
  licenseTerms: z.string().max(500).optional(),
  reviewedAt: z.iso.datetime().optional()
});
export type Tool = z.infer<typeof tool>;
export type Source = z.infer<typeof source>;
export const snapshot = z.object({ generatedAt: z.iso.datetime(), tools: z.array(tool).min(1) });
export const filters = z.strictObject({
  category: id.optional(), kind: toolKind.optional(), openSource: z.boolean().optional(),
  hosting: z.enum(["local", "cloud", "hybrid"]).optional(), os: label.optional(),
  language: label.optional(), license: label.optional(), noPaidApi: z.boolean().optional()
});
export const paging = {
  page: z.int().min(1).max(10000).default(1), limit: z.int().min(1).max(50).default(12)
};
export const searchInput = z.strictObject({
  query: z.string().trim().max(500).default(""), filters: filters.default({}),
  sort: z.enum(["relevance", "recent", "popular"]).default("relevance"), ...paging
});
export const comparison = z.strictObject({ ids: z.array(id).min(2).max(5).refine(ids => new Set(ids).size === ids.length) });
export const stackInput = z.strictObject({
  query: z.string().trim().min(1).max(500), filters: filters.default({})
});
export type SearchInput = z.infer<typeof searchInput>;
export type Filters = z.infer<typeof filters>;
