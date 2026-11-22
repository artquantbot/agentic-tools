import * as z from "zod";
import { planInput } from "../src/studio.ts";
import { executeInput, jobInput } from "./executions.ts";

const errors = Object.fromEntries([
  [400, "Invalid request"], [401, "Invalid bearer credential"], [403, "Origin or approval rejected"],
  [404, "Resource unavailable for this principal"], [409, "Execution already in progress"],
  [413, "Request exceeds 8 KiB"], [415, "Use application/json"], [422, "Unsupported stack"],
  [429, "Runner limit exceeded"], [500, "Internal runner error"], [503, "Runner or cleanup unavailable"]
].map(([status, description]) => [status, { description }]));
const secured = { security: [{ runnerKey: [] }] };
const identifier = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const request = (summary: string, input: z.ZodType, code = 200) => ({
  summary, ...secured, requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(input, { io: "input" }) } } },
  responses: { [code]: { description: "Operation accepted" }, ...errors }
});
const read = (summary: string) => ({ summary, ...secured, parameters: [identifier], responses: {
  200: { description: "Owner-scoped result" }, ...errors
} });
export const runnerOpenApi = {
  openapi: "3.1.0", info: { title: "Agentic Tools local runner", version: "1.0.0" },
  servers: [{ url: "/api/v1/executions" }],
  components: { securitySchemes: { runnerKey: { type: "http", scheme: "bearer" } } },
  paths: {
    "/capability": { get: { summary: "Check whether the local HTTP runner is present", responses: { 200: { description: "Local runner present" } } } },
    "/dry-run": { post: request("Preview the fixed adapter and issue a short-lived approval ID", planInput) },
    "/execute": { post: request("Start the approved adapter", executeInput, 202) },
    "/{id}": { get: read("Read execution status and artifact checksum") },
    "/{id}/logs": { get: read("Read bounded execution logs") },
    "/{id}/artifact": { get: read("Download the verified MP4") },
    "/stop": { post: request("Request execution stop", jobInput) },
    "/destroy": { post: request("Stop, remove resources and delete the execution record", jobInput) }
  }
};
