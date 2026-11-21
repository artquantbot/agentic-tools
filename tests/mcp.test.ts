import test from "node:test";
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { handle } from "../src/index.ts";

test("official MCP client discovers and invokes all read-only tools over Streamable HTTP", async () => {
  const client = new Client({ name: "agentic-tools-test", version: "1.0.0" });
  const url = new URL(process.env.MCP_TEST_URL ?? "https://agentic-tools.example.org/mcp");
  const transport = new StreamableHTTPClientTransport(url, process.env.MCP_TEST_URL ? {} : {
    fetch: (input, init) => handle(new Request(input, init), { LIMIT: { limit: async () => ({ success: true }) } })
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(item => item.name).sort(), ["compare_tools", "get_setup_guide", "get_tool_details", "recommend_stack", "search_tools"]);
    assert.ok(tools.every(item => item.annotations?.readOnlyHint === true));
    const found = await client.callTool({ name: "search_tools", arguments: { query: "Run an LLM locally on a Mac", limit: 3 } });
    assert.equal(found.isError, false);
    assert.equal((found.structuredContent as { untrusted: boolean }).untrusted, true);
    const broad = await client.callTool({ name: "search_tools", arguments: { limit: 50 } });
    assert.ok(new TextEncoder().encode(JSON.stringify(broad)).byteLength <= 96 * 1024);
    const rows = (found.structuredContent as { results: { tool: { id: string } }[] }).results;
    assert.ok(rows.length >= 2);
    const ids = rows.slice(0, 2).map(row => row.tool.id);
    for (const [name, args] of [
      ["compare_tools", { ids }], ["get_setup_guide", { id: ids[0] }], ["get_tool_details", { id: ids[0] }],
      ["recommend_stack", { query: "Find an MCP server for PostgreSQL." }]
    ] as const) {
      const response = await client.callTool({ name, arguments: args });
      assert.equal(response.isError, false);
      assert.ok(response.structuredContent);
    }
  } finally {
    await client.close();
  }
});
