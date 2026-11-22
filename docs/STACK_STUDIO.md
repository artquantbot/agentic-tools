# Stack Studio

Open `/studio` to build and download a versioned JSON plan. The public site, versioned REST API and Streamable HTTP MCP server use the same deterministic planner. Generic discovery remains available when the planner lacks a reviewed template.

| Example | Reviewed roles | Execution support |
| --- | --- | --- |
| Build me a complete AI video production stack using open-source tools. | Shot analysis, asset generation, composition, encoding | Local synthetic FFmpeg encoding smoke test |
| Design a 3D browser game development stack. | Browser renderer, end-to-end tests | Plan only |
| Build a local AI agent with memory. | Inference, vector storage, agent orchestration | Plan only |
| Build a multi-agent research system. | Inference, source retrieval, orchestration | Plan only |
| Plan an AI-powered SaaS application. | Inference, agent workflows, application tests | Plan only |

The manifests include an installation order, graph edges, component handoffs, alternatives and upstream setup evidence. The video template includes paths for assets and rendered output. Catalog evidence can confirm certain hard constraints (such as open-source status) or identify conflicts. A manifest is a planning artifact. Full-stack setup, version pinning, license compatibility and integration tests still require review. Full-stack totals remain unknown.

## Public contracts

- `POST /api/v1/stacks/build` and `POST /api/v1/stacks/validate` accept `{query, environment?, selections?}`. `selections` contains `{role, toolId}` pairs from the returned alternatives.
- `POST /api/v1/stacks/compare` accepts `{plans: [firstInput, secondInput]}` and returns aligned manifests.
- MCP exposes `build_stack`, `validate_stack` and `compare_stacks` with the same inputs. Use `search_tools` for discovery and `recommend_stack` for the existing shortlist. The MCP server has no route to a Docker daemon or execution credentials.
- Execution requests sent to the Worker return HTTP 501 with code `unsupported`.

## Local Docker execution

Use Node 24 or newer and a trusted local Docker context running Linux containers on amd64 or arm64 over a local Unix socket. Keep the runner on the loopback interface and use a dedicated development daemon or VM. Docker socket access gives the operator broad local privileges. Never expose the runner or its daemon to the internet.

1. Run `npm ci` and `npm run build`.
2. Review the FFmpeg image publisher, build and licensing. If you authorize a network download, explicitly pull the image below. The runner never pulls images, installs arbitrary packages, mounts project files, accepts remote media, or executes code from catalog records.
3. Generate a random key in a terminal and start the loopback service. Transfer the key from this terminal to the local UI password field. Keep it out of chat, shared logs and version control.

```sh
docker pull docker.io/mwader/static-ffmpeg@sha256:33f770f812cbfc3de96c547157fc9faf8bd95a36481753439ffa761045167585
export STACK_RUNNER_KEYS="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')"
npm run studio:local
```

If you need to display the key, use the shell that created it before starting the server. Use `STACK_DOCKER_CONTEXT` to select an existing **local** named context when needed. The default port is 4174, configurable via `STACK_STUDIO_PORT`. Visit `http://127.0.0.1:4174/studio`, build a video plan and enter the key. Preview the run and then explicitly approve it. The only adapter creates a one-second synthetic color-bar MP4, then checks its fragmented MP4 structure and records its SHA-256. The results include downloadable media and FFmpeg logs. It does not run ComfyUI, HyperFrames, rea-video, external model services, or full video workflows.

The bound container uses one CPU, 256 MiB memory, 64 PIDs, a non-root UID, a read-only filesystem, no added capabilities, no host mounts and no network. The running command is bounded to 30 seconds. The runner removes the container after completion and retains bounded logs and artifacts in memory until destruction or shutdown. Concurrent active executions are limited to one across the daemon process. Separate keys (up to eight, comma separated) represent separate owners. One principal cannot use another owner's approval, logs, status or artifact. Approvals are single-use and expire after 120 seconds. Restart loses local in-memory state. Treat local audit output as operator logs. After abrupt process or daemon failure inspect containers bearing label `org.agentic-tools.scope=video-smoke` and remove only confirmed orphaned resources.

Runner HTTP routes are documented at `GET /api/v1/executions/openapi.json` on loopback. Use the local bearer credential for previews, execution and owner-scoped resources. A dry run performs only image inspection. It produces an approval ID when Docker and the pinned image are ready. Execution requires that ID and `approved: true`. The public service never receives a local key. Hosted execution, shared-database persistence and tenant billing require separate infrastructure and are unsupported.

The CI fixture uses no secrets, provisioning accounts, models or paid API. It explicitly downloads the pinned image on the temporary GitHub runner and verifies that the local HTTP runner produces a nonempty MP4, returns a matching SHA-256 and removes the container. Run the same check locally after preparing the image with `node --experimental-strip-types scripts/test-docker.ts`.

[Docker container creation](https://docs.docker.com/reference/cli/docker/container/create/) · [Docker resource limits](https://docs.docker.com/engine/containers/resource_constraints/) · [FFmpeg image publisher](https://hub.docker.com/r/mwader/static-ffmpeg)
