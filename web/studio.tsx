import { useEffect, useState, type FormEvent } from "react";
import type { Plan, planInput, videoSmoke } from "../src/studio.ts";
import type * as z from "zod";

type Input = z.input<typeof planInput>;
type Preview = { ready: boolean; approvalId: string | null; adapter: typeof videoSmoke; expiresInSeconds: number };
type Execution = {
  id: string; state: string; cleanupPending: boolean; completed: boolean;
  artifact: { bytes: number; sha256: string } | null
};
const examples = [
  "Build me a complete AI video production stack using open-source tools.",
  "Design a 3D browser game development stack.",
  "Build a local AI agent with memory.",
  "Build a multi-agent research system.",
  "Plan an AI-powered SaaS application."
];
const executionPath = "/api/v1/executions";

async function request<T>(path: string, input?: unknown, key?: string): Promise<T> {
  const response = await fetch(path, {
    method: input === undefined ? "GET" : "POST", cache: "no-store",
    headers: { ...(input === undefined ? {} : { "Content-Type": "application/json" }), ...(key ? { Authorization: "Bearer " + key } : {}) },
    ...(input === undefined ? {} : { body: JSON.stringify(input) })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Request could not be completed.");
  }
  return response.json();
}

function download(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const anchor = Object.assign(document.createElement("a"), { href: url, download: filename });
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
const errorText = (error: unknown) => error instanceof Error ? error.message : "Request failed.";

export function Studio() {
  const [query, setQuery] = useState(examples[0]);
  const [environment, setEnvironment] = useState<NonNullable<Input["environment"]>>({});
  const [plan, setPlan] = useState<{ input: Input; result: Plan }>();
  const [comparison, setComparison] = useState<Plan[]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  function setting<K extends keyof NonNullable<Input["environment"]>>(key: K, value: NonNullable<Input["environment"]>[K]) {
    setEnvironment(current => ({ ...current, [key]: value }));
  }
  async function build(input: Input, validate = false) {
    setBusy(true); setError(""); setComparison(undefined);
    try {
      const result = await request<Plan>("/api/v1/stacks/" + (validate ? "validate" : "build"), input);
      setPlan({ input, result }); setRevision(value => value + 1);
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void build({ query, environment }); }
  async function compare() {
    if (!plan) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ plans: Plan[] }>("/api/v1/stacks/compare", {
        plans: [{ ...plan.input, selections: [] }, plan.input]
      });
      setComparison(result.plans);
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><h1>Stack Studio</h1><p>Turn a goal into a dependency map, check requirements and export a stack manifest.</p></div>
    <form className="panel studio-form" onSubmit={submit}>
      <label>Describe your workflow<textarea required maxLength={500} value={query} onChange={event => setQuery(event.target.value)}/></label>
      <div className="tags">{examples.map(example => <button key={example} type="button" className="button" onClick={() => setQuery(example)}>{example}</button>)}</div>
      <fieldset><legend>Environment requirements</legend><div className="studio-fields">
        <label>Operating system<select value={environment.os ?? ""} onChange={event => setting("os", (event.target.value || undefined) as typeof environment.os)}>
          <option value="">Any</option><option>Linux</option><option>macOS</option><option>Windows</option>
        </select></label>
        <label>Hosting<select value={environment.hosting ?? ""} onChange={event => setting("hosting", (event.target.value || undefined) as typeof environment.hosting)}>
          <option value="">Any</option><option value="local">Local</option><option value="cloud">Cloud</option>
        </select></label>
        <label>Budget in USD<input type="number" min="0" max="1000000" step="0.01" value={environment.budgetUsd ?? ""} onChange={event => setting("budgetUsd", event.target.value ? Number(event.target.value) : undefined)}/></label>
        <label>Hardware<input maxLength={80} value={environment.hardware ?? ""} onChange={event => setting("hardware", event.target.value || undefined)}/></label>
        <label>Performance target<input maxLength={80} value={environment.performance ?? ""} onChange={event => setting("performance", event.target.value || undefined)}/></label>
        <label>Required license<input maxLength={80} value={environment.license ?? ""} onChange={event => setting("license", event.target.value || undefined)}/></label>
        <label>Privacy<select value={environment.privacy ?? ""} onChange={event => setting("privacy", (event.target.value || undefined) as typeof environment.privacy)}>
          <option value="">Any</option><option value="offline">Offline</option><option value="local-data">Keep data local</option>
        </select></label>
        <label className="studio-check"><input type="checkbox" checked={!!environment.openSource} onChange={event => setting("openSource", event.target.checked || undefined)}/>Require open source</label>
      </div></fieldset>
      <button className="button primary" disabled={busy}>Build stack</button>
    </form>
    {error && <p role="alert" className="notice">{error}</p>}
    {plan && <section className="home-section panel" aria-labelledby="studio-plan-title">
      <h2 id="studio-plan-title">{plan.result.recipe?.title ?? "No reviewed stack matches"}</h2>
      <p>{plan.result.query}</p>
      {plan.result.components.length ? <>
        <p>Compatibility · {plan.result.compatibility === "conflict" ? "Requirements conflict" : "Review required"}</p>
        <h3>Dependency graph and installation order</h3>
        <ol className="studio-graph">{plan.result.installationOrder.map(role => {
          const component = plan.result.components.find(item => item.role === role)!;
          return <li key={role}>
            <h4>{component.title}</h4><a href={"/tools/" + component.tool.id}>{component.tool.name}</a>
            <p>{component.dependsOn.length ? "Depends on " + component.dependsOn.map(dep => plan.result.components.find(item => item.role === dep)!.tool.name).join(", ") : "No dependency within this plan"}</p>
            <p>{component.handoff}</p>
            <p>License · {component.tool.license ?? "Unknown"}</p>
            {component.tool.licenseTerms && <p>{component.tool.licenseTerms}</p>}
            {component.tool.prerequisites?.length ? <p>Prerequisites · {component.tool.prerequisites.join(", ")}</p> : null}
            {component.tool.installation?.length ? <p>{component.tool.installation.join(". ")}</p> : null}
            {component.tool.setup && <a className="text-link" href={component.tool.setup}>Upstream setup</a>}
            {!!component.alternatives.length && <label>Tool for {component.title}<select value={component.tool.id} disabled={busy} onChange={event => {
              const selections = (plan.input.selections ?? []).filter(item => item.role !== role);
              void build({ ...plan.input, selections: [...selections, { role, toolId: event.target.value }] }, true);
            }}><option value={component.tool.id}>{component.tool.name}</option>{component.alternatives.map(tool => <option key={tool.id} value={tool.id}>{tool.name}</option>)}</select></label>}
          </li>;
        })}</ol>
        <div className="action-row">
          <button className="button" onClick={() => download(new Blob([JSON.stringify(plan.result, null, 2)], { type: "application/json" }), "stack-manifest.json")}>Export manifest</button>
          {!!plan.input.selections?.length && <button className="button" disabled={busy} onClick={() => void compare()}>Compare with defaults</button>}
        </div>
        {comparison && <div className="detail-grid">{comparison.map((entry, i) => <section key={i}><h3>{i === 0 ? "Default plan" : "Edited plan"}</h3>
          <ul>{entry.components.map(item => <li key={item.role}>{item.tool.name} · {item.tool.license ?? "Unknown license"}</li>)}</ul>
          <p>{entry.compatibility === "conflict" ? "Requirements conflict" : "Review required"}</p>
          <ul>{entry.issues.map((item, index) => <li key={index}>{item.message}</li>)}</ul>
        </section>)}</div>}
      </> : <a className="text-link" href={"/discover?" + new URLSearchParams({ query: plan.input.query })}>Search the full catalog</a>}
      <h3>Requirements and cost</h3>
      <ul>{plan.result.issues.map((item, index) => <li key={index}>{item.role ? item.role + " · " : ""}{item.message}</li>)}</ul>
      <p>{plan.result.cost.note}</p>
      {plan.result.configuration.paths && <details><summary>Project paths template</summary><pre>{JSON.stringify(plan.result.configuration, null, 2)}</pre></details>}
    </section>}
    {plan && <Runner plan={plan.result.execution ? plan.input : undefined} revision={revision}/>}
  </>;
}

function Runner({ plan, revision }: { plan?: Input; revision: number }) {
  const [local, setLocal] = useState(false);
  const [key, setKey] = useState("");
  const [preview, setPreview] = useState<{ value: Preview; revision: number }>();
  const [approved, setApproved] = useState(false);
  const [run, setRun] = useState<{ id: string; key: string }>();
  const [status, setStatus] = useState<Execution>();
  const [logs, setLogs] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (location.hostname !== "127.0.0.1") return;
    let active = true;
    request<{ local: boolean }>(executionPath + "/capability").then(data => { if (active) setLocal(data.local); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!run) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [execution, output] = await Promise.all([
          request<Execution>(executionPath + "/" + run.id, undefined, run.key),
          request<{ logs: string }>(executionPath + "/" + run.id + "/logs", undefined, run.key)
        ]);
        if (!active) return;
        setStatus(execution); setLogs(output.logs);
        if (!execution.completed) timer = setTimeout(poll, 1_500);
      } catch (error) { if (active) setError(errorText(error)); }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [run]);
  const dryRun = preview?.revision === revision ? preview.value : undefined;
  async function action(kind: "dry-run" | "execute" | "stop" | "destroy" | "download") {
    setBusy(true); setError("");
    try {
      if (kind === "dry-run" && plan) {
        setPreview(undefined); setApproved(false);
        const value = await request<Preview>(executionPath + "/dry-run", plan, key);
        setPreview({ value, revision });
      }
      if (kind === "execute" && approved && dryRun?.approvalId) {
        const execution = await request<Execution>(executionPath + "/execute", { approvalId: dryRun.approvalId, approved: true }, key);
        setStatus(execution); setRun({ id: execution.id, key }); setPreview(undefined); setApproved(false);
      }
      if (run && kind === "stop") {
        setStatus(await request<Execution>(executionPath + "/stop", { id: run.id }, run.key));
      }
      if (run && kind === "destroy") {
        await request(executionPath + "/destroy", { id: run.id }, run.key);
        setRun(undefined); setStatus(undefined); setLogs("");
      }
      if (run && kind === "download") {
        const response = await fetch(executionPath + "/" + run.id + "/artifact", { headers: { Authorization: "Bearer " + run.key } });
        if (!response.ok) throw new Error("Artifact download failed.");
        download(await response.blob(), "video-smoke.mp4");
      }
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  if (!plan && !run) return null;
  return <section className="panel home-section">
    <h2>FFmpeg encoding smoke test</h2>
    <p>Render a one-second synthetic video and verify the MP4 output. The full film production workflow requires manual setup.</p>
    {!local ? <p>Execution is available through the separate <a href="https://github.com/artquantbot/agentic-tools/blob/main/docs/STACK_STUDIO.md">local Docker runner</a>.</p> : <>
      <label className="studio-key">Local runner key<input type="password" autoComplete="off" maxLength={128} value={key} disabled={busy || !!run} onChange={event => {
        setKey(event.target.value); setPreview(undefined); setApproved(false);
      }}/></label>
      {!run && plan && <button className="button" disabled={busy || !key} onClick={() => void action("dry-run")}>Preview dry run</button>}
      {dryRun && <>
        <p>{dryRun.adapter.fixture} · {dryRun.adapter.cpu} CPU · {dryRun.adapter.memoryMiB} MiB · {dryRun.adapter.timeoutSeconds}s timeout · Network disabled · $0 external API charges</p>
        {dryRun.ready ? <>
          <p>The pinned image is available locally. Approval expires in {dryRun.expiresInSeconds} seconds.</p>
          <label className="studio-check"><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)}/>Approve this local Docker run</label>
          <button className="button primary" disabled={!approved || busy} onClick={() => void action("execute")}>Start approved run</button>
        </> : <p>Prepare the pinned image in Docker before requesting approval.</p>}
      </>}
      {status && <div><p role="status">Execution {status.state}{status.cleanupPending ? " · cleanup pending" : ""}</p>
        {logs && <pre aria-label="Execution logs">{logs}</pre>}
        {status.artifact && <p className="studio-digest">{status.artifact.bytes} bytes · SHA-256 <code>{status.artifact.sha256}</code></p>}
        <div className="action-row">
          {["queued", "running"].includes(status.state) && <button className="button" disabled={busy} onClick={() => void action("stop")}>Stop</button>}
          {status.artifact && <button className="button" disabled={busy} onClick={() => void action("download")}>Download MP4</button>}
          <button className="button" disabled={busy} onClick={() => void action("destroy")}>Destroy execution</button>
        </div>
      </div>}
      {error && <p role="alert" className="notice">{error}</p>}
    </>}
  </section>;
}
