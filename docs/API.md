# API and MCP

The local base URL is `http://127.0.0.1:4173`. The production target is `https://agentic-tools.ususuni.com`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Check service status and snapshot timestamp |
| GET | `/api/v1/categories` | Read categories, counts and filter values |
| GET | `/api/v1/tools` | Browse with query parameters for page, limit, sort and filters |
| GET | `/api/v1/tools/{id}` | Get the complete evidence record |
| POST | `/api/v1/search` | Rank a task with optional explicit filters |
| POST | `/api/v1/compare` | Compare two to five catalog IDs |
| POST | `/api/v1/recommend-stack` | Group candidate components by role |
| GET | `/api/v1/openapi.json` | Get the OpenAPI 3.1 document |

```sh
curl -fsS http://127.0.0.1:4173/api/v1/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"Run an LLM locally on a Mac","filters":{"openSource":true},"limit":3}'
```

Search and listing responses include eligible `results`, separate `unverified` candidates, normalized `constraints`, both totals and pagination. `limit` is 1–50. Recent and popular sorting use published activity and GitHub stars respectively. REST errors use an `error` object with stable `code` and human-readable `message`. The public rate limit is 120 requests per minute per client IP per Cloudflare location, except health. POST requests use JSON bodies up to 16 KiB. Browser requests are same-origin.

## MCP

Connect a Streamable HTTP client to `http://127.0.0.1:4173/mcp`. Substitute the production URL when using a deployed instance. Discover `search_tools`, `compare_tools`, `get_tool_details`, `recommend_stack` and `get_setup_guide`. Discovery and invocation are tested with the official TypeScript SDK client. The following sample host configurations follow each host's documentation.

Codex CLI configuration in `config.toml`

```toml
[mcp_servers.agentic-tools]
url = "http://127.0.0.1:4173/mcp"
```

VS Code workspace configuration in `.vscode/mcp.json`

```json
{"servers":{"agentic-tools":{"type":"http","url":"http://127.0.0.1:4173/mcp"}}}
```

[Codex MCP guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) · [VS Code MCP guide](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

Run the SDK smoke test against an actual endpoint with `MCP_TEST_URL=http://127.0.0.1:4173/mcp node --test tests/mcp.test.ts`.

MCP accepts one JSON-RPC message per HTTP request. A JSON array receives HTTP 400 with `mcp_batch_not_supported`. Tool results mark third-party data with `untrusted: true` and cap the serialized tool result at 96 KiB. Request fewer records or use narrower filters if a response exceeds that cap.

## Creative production

`creative-production` is the Video & Creative Production category. The optional `kind` filter works on GET and POST search and MCP `search_tools`. Reviewed creative results add optional `kinds`, `mcp`, and `reviewedAt` fields. Details add licensing restrictions, installation and evidence. A project with a separate MCP integration can have `mcp: true` while its tool type remains a library, CLI or application.

Request `{"query":"AI Film Studio"}` through REST recommendation or MCP `recommend_stack` to get the optional `curatedStack` guide. Explicit filters get regular constraint-aware search results. See [creative catalog evidence](CREATIVE_PRODUCTION.md).
