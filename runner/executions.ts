import { createHash, randomUUID } from "node:crypto";
import * as z from "zod";
import { buildPlan, planInput, videoSmoke } from "../src/studio.ts";
import * as docker from "./docker.ts";

const uuid = z.uuid();
export const executeInput = z.strictObject({ approvalId: uuid, approved: z.literal(true) });
export const jobInput = z.strictObject({ id: uuid });
export class RunnerError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
type State = "queued" | "running" | "succeeded" | "failed" | "stopping" | "stopped";
type Job = {
  id: string; owner: string; state: State; createdAt: string; updatedAt: string;
  stopRequested: boolean; completed: boolean; container?: string; pending: Promise<void>; logs: string;
  artifact?: Buffer; sha256?: string; cleanupPending: boolean; cleanup?: Promise<void>;
};
const maxJobs = 16;
const maxLog = 16_384;
const approvalLifetime = 120_000;

export function createExecutor(runtime = docker, audit = (entry: object) => console.log(JSON.stringify(entry))) {
  const jobs = new Map<string, Job>();
  const approvals = new Map<string, { owner: string; expiration: number }>();
  let closed = false;
  const event = (job: Job, action: string) => audit({
    surface: "local-runner", action, executionId: job.id,
    principal: job.owner.slice(0, 16), state: job.state, time: new Date().toISOString()
  });
  function log(job: Job, line: string) {
    job.logs = (job.logs + line.replace(/[^\x09\x0a\x20-\x7e]/g, "")).slice(-maxLog);
    job.updatedAt = new Date().toISOString();
  }
  function status(job: Job) {
    return { id: job.id, state: job.state, createdAt: job.createdAt, updatedAt: job.updatedAt,
      cleanupPending: job.cleanupPending, completed: job.completed,
      artifact: job.artifact ? { bytes: job.artifact.length, sha256: job.sha256, mediaType: "video/mp4" } : null };
  }
  function owned(owner: string, id: string) {
    const job = jobs.get(id);
    if (!job || job.owner !== owner) throw new RunnerError(404, "not_found", "Execution not found.");
    return job;
  }
  function cleanup(job: Job) {
    if (!job.container) return;
    job.cleanup ??= remove(job, job.container).finally(() => { job.cleanup = undefined; });
    return job.cleanup;
  }
  async function remove(job: Job, container: string) {
    try {
      await runtime.removeContainer(container);
      job.container = undefined;
      job.cleanupPending = false;
    } catch {
      job.cleanupPending = true;
      log(job, "Container cleanup failed. Retry Destroy after restoring Docker access.\n");
    }
  }
  async function run(job: Job) {
    const name = "agentic-tools-" + job.id;
    try {
      if (!(await runtime.imageReady())) throw new Error("Docker or the pinned image is unavailable. Prepare the image locally first.");
      if (job.stopRequested) { job.state = "stopped"; return; }
      job.container = await runtime.createContainer(name);
      if (job.stopRequested) { job.state = "stopped"; return; }
      job.state = "running";
      log(job, "Starting isolated FFmpeg render.\n");
      event(job, "started");
      const output = await runtime.startContainer(job.container, line => log(job, line));
      if (job.stopRequested) { job.state = "stopped"; return; }
      if (output.subarray(4, 8).toString() !== "ftyp" || !output.includes("moof") || !output.includes("mdat")) {
        throw new Error("Rendered output did not pass the fragmented MP4 smoke check.");
      }
      job.artifact = output;
      job.sha256 = createHash("sha256").update(output).digest("hex");
      job.state = "succeeded";
      log(job, "Verified fragmented MP4.\n");
    } catch (error) {
      job.state = job.stopRequested ? "stopped" : "failed";
      log(job, (error instanceof Error ? error.message : "Execution failed.") + "\n");
    } finally {
      await cleanup(job);
      log(job, "Run finished.\n");
      event(job, "finished");
    }
  }
  function stop(job: Job) {
    if (job.state === "queued" || job.state === "running") {
      const wasRunning = job.state === "running";
      job.state = "stopping";
      job.stopRequested = true;
      event(job, "stop-requested");
      if (wasRunning && job.container) void runtime.stopContainer(job.container).catch(() => log(job, "Stop will be completed by the execution timeout or cleanup.\n"));
    }
    return status(job);
  }
  return {
    async dryRun(owner: string, input: unknown) {
      const plan = buildPlan(planInput.parse(input));
      if (!plan.execution) throw new RunnerError(422, "unsupported_stack", "This plan has no supported local execution adapter.");
      const ready = await runtime.imageReady();
      if (closed) throw new RunnerError(503, "runner_unavailable", "Local runner is stopping.");
      for (const [key, item] of approvals) if (item.expiration <= Date.now()) approvals.delete(key);
      if (approvals.size >= 32) throw new RunnerError(429, "approval_limit", "Too many outstanding previews. Try again later.");
      if (!ready) return { ready, approvalId: null, adapter: videoSmoke, expiresInSeconds: 0 };
      const approvalId = randomUUID();
      approvals.set(approvalId, { owner, expiration: Date.now() + approvalLifetime });
      audit({ surface: "local-runner", action: "preview", principal: owner.slice(0, 16), time: new Date().toISOString() });
      return { ready, approvalId, adapter: videoSmoke, expiresInSeconds: approvalLifetime / 1_000 };
    },
    execute(owner: string, input: unknown) {
      const { approvalId } = executeInput.parse(input);
      const approval = approvals.get(approvalId);
      if (!approval || approval.owner !== owner || approval.expiration <= Date.now()) {
        throw new RunnerError(403, "approval_required", "Create a fresh dry run with this credential before approving execution.");
      }
      if (closed || [...jobs.values()].some(job => !job.completed || job.cleanupPending)) {
        throw new RunnerError(409, "runner_busy", "The previous execution or its cleanup is still active.");
      }
      if (jobs.size >= maxJobs) throw new RunnerError(429, "retention_limit", "Destroy a completed execution before starting another.");
      approvals.delete(approvalId);
      const now = new Date().toISOString();
      const job: Job = { id: randomUUID(), owner, state: "queued", createdAt: now,
        updatedAt: now, logs: "", stopRequested: false, cleanupPending: false, completed: false, pending: Promise.resolve() };
      jobs.set(job.id, job);
      event(job, "approved");
      job.pending = run(job).finally(() => { job.completed = true; });
      return status(job);
    },
    status: (owner: string, id: string) => status(owned(owner, id)),
    logs: (owner: string, id: string) => ({ logs: owned(owner, id).logs }),
    artifact(owner: string, id: string) {
      const artifact = owned(owner, id).artifact;
      if (!artifact) throw new RunnerError(404, "not_found", "Artifact is unavailable.");
      return artifact;
    },
    stop: (owner: string, id: string) => stop(owned(owner, id)),
    async destroy(owner: string, id: string) {
      const job = owned(owner, id);
      stop(job);
      await job.pending;
      if (job.cleanupPending) await cleanup(job);
      if (job.cleanupPending) throw new RunnerError(503, "cleanup_failed", "Docker cleanup failed. Restore daemon access and retry.");
      if (jobs.delete(id)) event(job, "destroyed");
      return { id, destroyed: true };
    },
    async shutdown() {
      closed = true;
      await Promise.all([...jobs.values()].map(async job => {
        stop(job);
        await job.pending;
        if (job.cleanupPending) await cleanup(job);
      }));
    }
  };
}
