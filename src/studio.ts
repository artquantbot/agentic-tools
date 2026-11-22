import * as z from "zod";
import { byId } from "./catalog.ts";
import { assessConstraint, parseConstraints } from "./ranking.ts";
import { id, label, url } from "./schema.ts";

export const videoSmoke = {
  id: "ffmpeg-color-smoke-v1",
  image: "docker.io/mwader/static-ffmpeg@sha256:33f770f812cbfc3de96c547157fc9faf8bd95a36481753439ffa761045167585",
  cpu: 1, memoryMiB: 256, pids: 64, timeoutSeconds: 30,
  network: "none", externalApiCostUsd: 0, fixture: "1 second of generated color bars, 160 × 90, 10 fps"
} as const;
export const environmentSchema = z.strictObject({
  os: z.enum(["Linux", "macOS", "Windows"]).optional(),
  hosting: z.enum(["local", "cloud"]).optional(),
  hardware: label.optional(), performance: label.optional(),
  privacy: z.enum(["offline", "local-data"]).optional(),
  budgetUsd: z.number().min(0).max(1_000_000).optional(),
  openSource: z.boolean().optional(), license: label.optional()
});
export const planInput = z.strictObject({
  query: z.string().trim().min(1).max(500), environment: environmentSchema.default({}),
  selections: z.array(z.strictObject({ role: id, toolId: id })).max(8)
    .refine(items => new Set(items.map(item => item.role)).size === items.length).default([])
});
export const comparePlansInput = z.strictObject({ plans: z.array(planInput).min(2).max(3) });

type Step = readonly [role: string, title: string, tool: string, needs: readonly string[], handoff: string, alternatives?: readonly string[]];
type Recipe = { id: string; title: string; match: RegExp; steps: readonly Step[] };
const recipes: Recipe[] = [
  { id: "ai-film-studio", title: "AI Film Studio", match: /\b(video|film|cinematic|footage)\b/i, steps: [
    ["analyze", "Plan and analyze shots", "gh-1438661890", ["encode"], "Document shot timings in a shot list."],
    ["assets", "Generate visual assets", "gh-589831718", [], "Export available clips or frames using compatible, licensed models."],
    ["render", "Compose and render", "gh-1177402105", ["assets", "analyze", "encode"], "Combine clips and timings in an HTML composition.", ["gh-274495425"]],
    ["encode", "Encode and inspect", "gh-1614410", [], "Provide FFmpeg for upstream steps and encode the rendered master."]
  ] },
  { id: "browser-game", title: "3D Browser Game Development", match: /\b(3d|browser game|webgl|webgpu)\b/i, steps: [
    ["render", "Render the game", "gh-576201", [], "Add a browser entry point, scene and selected WebGL or WebGPU renderer."],
    ["test", "Test the game in a browser", "gh-221981891", ["render"], "Test the game over a local HTTP origin in supported browsers."]
  ] },
  { id: "local-memory", title: "Local AI Agent with Memory", match: /\b(memory|vector store|persistent context)\b/i, steps: [
    ["model", "Serve local inference", "gh-658928958", [], "Select a model that fits local memory and check its license."],
    ["memory", "Store embeddings", "gh-546206616", [], "Select an embedding model and persistent index.", ["gh-268163609"]],
    ["agent", "Connect the agent", "gh-818331198", ["model", "memory"], "Implement model and recall connectors, including deletion and persistence tests.", ["gh-676672661"]]
  ] },
  { id: "research", title: "Multi-Agent Research System", match: /\b(research|multi[- ]agent)\b/i, steps: [
    ["model", "Serve inference", "gh-658928958", [], "Select the model, resource budget and endpoint."],
    ["search", "Retrieve sources", "gh-357241735", [], "Review upstream search engine policies and use results as untrusted evidence."],
    ["coordinate", "Coordinate research roles", "gh-676672661", ["model", "search"], "Implement retrieval, synthesis, evidence review and request limits.", ["gh-710601088"]]
  ] },
  { id: "saas", title: "AI-Powered SaaS Application", match: /\b(saas|software as a service)\b/i, steps: [
    ["model", "Select inference for development", "gh-658928958", [], "Choose a deployment model separately and verify provider charges."],
    ["agent", "Implement typed agent workflows", "gh-818331198", ["model"], "Connect model and tenant-scoped storage behind the application server.", ["gh-676672661"]],
    ["test", "Test application and tenant boundaries", "gh-221981891", ["agent"], "Add authentication, storage, billing controls and browser tests."]
  ] }
];

const evidenceTool = z.object({
  id, name: z.string(), license: label.nullable(), licenseTerms: z.string().optional(),
  setup: url.nullable(), prerequisites: z.array(label).nullable(), installation: z.array(label).nullable()
});
export const planOutput = z.object({
  schemaVersion: z.literal(1), query: z.string(), environment: environmentSchema,
  recipe: z.object({ id, title: z.string() }).nullable(),
  components: z.array(z.object({
    role: id, title: z.string(), tool: evidenceTool, alternatives: z.array(evidenceTool),
    dependsOn: z.array(id), handoff: z.string()
  })),
  installationOrder: z.array(id),
  issues: z.array(z.object({ role: id.optional(), level: z.enum(["conflict", "unverified"]), message: z.string() })),
  compatibility: z.enum(["conflict", "review-required"]),
  configuration: z.object({ paths: z.object({ assets: z.string(), output: z.string() }).optional() }),
  cost: z.object({ totalUsd: z.null(), note: z.string() }),
  execution: z.object({ scope: z.literal("synthetic-encode-smoke"), adapter: z.literal(videoSmoke.id) }).nullable()
});
export type Plan = z.infer<typeof planOutput>;
const getTool = (toolId: string) => {
  const record = byId.get(toolId);
  if (!record) throw new Error("Invalid reviewed stack recipe");
  return record;
};
function evidence(toolId: string) {
  const { id, name, license, licenseTerms, setup, dependencies, installation } = getTool(toolId);
  return { id, name, license, licenseTerms, setup, prerequisites: dependencies, installation };
}

function orderComponents(components: Plan["components"]) {
  const order = new Set<string>();
  const visiting = new Set<string>();
  function visit(role: string) {
    if (order.has(role)) return;
    const component = components.find(item => item.role === role);
    if (!component || visiting.has(role)) throw new Error("Invalid stack dependency graph");
    visiting.add(role);
    component.dependsOn.forEach(visit);
    visiting.delete(role);
    order.add(role);
  }
  components.forEach(component => visit(component.role));
  return [...order];
}

export function buildPlan({ query, environment, selections }: z.infer<typeof planInput>): Plan {
  const matches = recipes.filter(recipe => recipe.match.test(query));
  const selected = matches.length === 1 ? matches[0] : undefined;
  const issues: Plan["issues"] = [];
  if (!selected) issues.push({ level: "unverified", message: matches.length ? "Multiple stack templates match. Describe one primary workflow." : "No reviewed template matches. Use catalog discovery for a shortlist." });
  const components = selected?.steps.map(([role, title, primary, dependsOn, handoff, alternatives = []]) => {
    const choice = selections.find(item => item.role === role)?.toolId ?? primary;
    const available = [primary, ...alternatives];
    const toolId = available.includes(choice) ? choice : primary;
    if (toolId !== choice) issues.push({ role, level: "conflict", message: "Selected tool is unavailable for this role." });
    return { role, title, dependsOn: [...dependsOn], handoff, tool: evidence(toolId), alternatives: available.filter(item => item !== toolId).map(evidence) };
  }) ?? [];
  for (const selection of selections) if (!components.some(item => item.role === selection.role)) issues.push({ level: "conflict", message: "Selection references an unknown role." });
  const { os, hosting, openSource, license, privacy, hardware, performance, budgetUsd } = environment;
  const requested = { os, hosting, openSource, license };
  for (const constraint of parseConstraints(query, requested)) {
    for (const component of components) {
      const assessment = assessConstraint(getTool(component.tool.id), constraint);
      if (assessment.status === "satisfied") continue;
      issues.push({ role: component.role, level: constraint.required ? assessment.status : "unverified",
        message: `${constraint.required ? "Required" : "Preferred"} ${constraint.field} ${constraint.value}: ${assessment.status}.` });
    }
  }
  if (privacy || /\b(privacy|offline|no network|air[- ]gapped)\b/i.test(query)) {
    const cloud = hosting === "cloud" || components.some(component => getTool(component.tool.id).hosting === "cloud");
    issues.push({ level: cloud ? "conflict" : "unverified", message: cloud
      ? "Cloud hosting conflicts with the requested local-data or offline policy."
      : "Review data flows and network access of the full stack." });
  }
  if (hardware || /\b(gpu|vram|cuda|ram|apple silicon)\b/i.test(query)) issues.push({ level: "unverified", message: "Verify hardware and memory requirements for selected versions and models." });
  if (performance || /\b(latency|throughput|real[- ]time|fps)\b/i.test(query)) issues.push({ level: "unverified", message: "Measure performance on the target environment." });
  if (budgetUsd !== undefined || /\b(budget|free|cost|usd)\b|\$\d/i.test(query)) issues.push({ level: "unverified", message: "The complete workflow cost is unknown. Check hardware, models, hosting and licensing." });
  if (selected) issues.push({ level: "unverified", message: "The full workflow requires version pinning, integration wiring and license review before use." });
  const conflict = issues.some(issue => issue.level === "conflict");
  return {
    schemaVersion: 1, query, environment, recipe: selected ? { id: selected.id, title: selected.title } : null, components,
    installationOrder: orderComponents(components), issues, compatibility: conflict ? "conflict" : "review-required",
    configuration: { ...(selected?.id === "ai-film-studio" ? { paths: { assets: "./assets", output: "./out" } } : {}) },
    cost: { totalUsd: null, note: "Actual full-stack costs depend on chosen versions, models, licenses and hosting." },
    execution: selected?.id === "ai-film-studio" && !conflict ? { scope: "synthetic-encode-smoke", adapter: videoSmoke.id } : null
  };
}
