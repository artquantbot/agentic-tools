import * as z from "zod";
import { comparison, filters, searchInput, stackInput, tool } from "./schema.ts";

const json = (schema: unknown) => ({ "application/json": { schema } });
const routeError = { type: "object", required: ["error"], properties: { error: {
  type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } }
} } };
const response = (description: string, schema: unknown) => ({ description, content: json(schema) });
const identifier = z.string();
const assessment = z.object({
  field: z.string(), value: z.union([z.string(), z.boolean()]), required: z.boolean(),
  status: z.enum(["satisfied", "unverified", "conflict"])
});
const constraint = assessment.omit({ status: true });
const freshness = z.enum(["current", "stale"]);
const item = z.object({
  tool: tool.pick({
    id: true, name: true, description: true, categories: true, github: true, hosting: true,
    openSource: true, license: true, verifiedAt: true, stars: true, setup: true, tradeoff: true,
    confidence: true, lastActivity: true, kinds: true, reviewedAt: true
  }).extend({ freshness, mcp: tool.shape.mcp.optional() }),
  why: z.string(), eligible: z.boolean(), requirements: z.array(assessment),
  evidence: tool.shape.sources,
  scores: z.object({
    taskFit: z.int().min(0).max(100), maintenance: z.string(), integration: z.string(), cost: z.string(),
    trust: z.object({ advisoryStatus: z.string(), evidence: tool.shape.confidence })
  }),
  alternatives: z.array(z.object({ id: identifier, name: z.string() }))
});
const summaryResponse = { type: "object", required: ["total", "unverifiedTotal", "results", "unverified", "page", "limit", "constraints"], properties: {
  total: { type: "integer" }, unverifiedTotal: { type: "integer" }, page: { type: "integer" }, limit: { type: "integer" },
  results: { type: "array", items: z.toJSONSchema(item) }, unverified: { type: "array", items: z.toJSONSchema(item) }, constraints: { type: "array", items: z.toJSONSchema(constraint) }
} };
const stackTool = z.object({ id: identifier, name: z.string(), setup: tool.shape.setup, license: tool.shape.license });
const curatedStack = z.object({
  id: identifier, name: z.string(), description: z.string(), reviewedAt: z.iso.datetime(), licensing: z.string(),
  steps: z.array(z.object({ role: z.string(), notes: z.string(), tool: stackTool, alternatives: z.array(stackTool) }))
});
const detailSchema = z.toJSONSchema(tool.extend({ freshness: z.enum(["current", "stale"]) }));
const operation = (summary: string, schema: unknown, input?: z.ZodType) => ({
  summary,
  ...(input ? { requestBody: { required: true, content: json(z.toJSONSchema(input, { io: "input" })) } } : {}),
  responses: {
    200: response("Success", schema), 400: response("Invalid input", routeError), 403: response("Invalid origin", routeError),
    404: response("Missing resource", routeError), 405: response("Invalid method", routeError),
    413: response("Payload too large", routeError), 415: response("Unsupported content type", routeError),
    429: response("Rate limited", routeError), 500: response("Internal error", routeError)
  }
});
const filterSchema = z.toJSONSchema(filters);
export const openapi = {
  openapi: "3.1.0", info: { title: "Agentic Tools", version: "1.0.0", description: "Public, read-only agent tool catalog." },
  servers: [{ url: "/api/v1" }],
  paths: {
    "/health": { get: operation("Read service health and catalog version", z.toJSONSchema(z.object({
      status: z.literal("ok"), version: z.string(), generatedAt: z.iso.datetime(), count: z.int()
    }))) },
    "/tools": { get: { ...operation("List matching catalog tools", summaryResponse), parameters: [
      ...["page", "limit"].map(name => ({ name, in: "query", schema: { type: "integer", minimum: 1, maximum: name === "limit" ? 50 : 10000 } })),
      ...Object.entries(filterSchema.properties ?? {}).map(([name, schema]) => ({ name, in: "query", schema })),
      { name: "query", in: "query", schema: { type: "string", maxLength: 500 } },
      { name: "sort", in: "query", schema: { enum: ["relevance", "recent", "popular"] } }
    ] } },
    "/tools/{id}": { get: { ...operation("Read a tool record", detailSchema), parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] } },
    "/categories": { get: operation("List categories and tool counts", z.toJSONSchema(z.object({
      categories: z.array(z.object({ id: identifier, name: z.string(), count: z.int() })), generatedAt: z.iso.datetime(), count: z.int(),
      facets: z.object({ os: z.array(z.string()), language: z.array(z.string()), license: z.array(z.string()) })
    }))) },
    "/search": { post: operation("Find suitable tools", summaryResponse, searchInput) },
    "/compare": { post: operation("Compare tools", { type: "object", properties: { tools: { type: "array", items: detailSchema }, missing: { type: "array", items: { type: "string" } } } }, comparison) },
    "/recommend-stack": { post: operation("Shortlist components by category", z.toJSONSchema(z.object({
      constraints: z.array(constraint), groups: z.array(z.object({ category: identifier, candidates: z.array(item) })),
      unverified: z.array(item), compatibility: z.string(), curatedStack: curatedStack.optional()
    })), stackInput) }
  }
};
