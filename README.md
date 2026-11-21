# Agentic Tools

**Tell us what your agent needs. We find the tools that fit.**

Agentic Tools helps developers and AI agents discover frameworks, MCP servers, skills and infrastructure. The catalog combines GitHub metadata, Official MCP Registry identifiers, Awesome AI Agents discovery links and source-backed capability notes.

## Run locally

Use Node 24 LTS or newer and npm.

```sh
git clone https://github.com/artquantbot/agentic-tools.git
cd agentic-tools
npm ci
npm run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Try **Run an LLM locally on a Mac** or **Find an MCP server for PostgreSQL**. Compare two results from Discover to review licenses, platforms, permissions and evidence.

```sh
curl -fsS http://127.0.0.1:4173/api/v1/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"Run an LLM locally on a Mac","filters":{"openSource":true},"limit":3}'
```

The official MCP SDK serves five read-only tools over Streamable HTTP at `/mcp`. See the [REST and MCP guide](docs/API.md) for endpoint and client examples.

## Architecture

React and Vite render the website. A TypeScript Worker serves the versioned REST API and MCP endpoint against a validated, versioned snapshot. Lexical ranking and documented hard constraints require no external model or database. Source metadata is refreshed offline and deployed with the application.

- [Architecture and cost model](docs/ARCHITECTURE.md)
- [Research](docs/RESEARCH.md) and [competitors](docs/COMPETITORS.md)
- [Catalog attribution](docs/SOURCES.md)
- [Deployment and rollback](docs/DEPLOYMENT.md)
- [Contribution guide](CONTRIBUTING.md) and [security reporting](SECURITY.md)

## Validate

```sh
npm test
npm run evaluate
npm run build
npx playwright install chromium
npm run test:e2e
```

Catalog observations do not establish installation success or security. Review source documentation and deployment settings before adopting a project.

MIT licensed. Upstream projects and source data retain their respective terms.
