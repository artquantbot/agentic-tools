export const useCases = [
  {
    slug: "local-document-search",
    title: "Search documents locally",
    category: "inference",
    description: "Build a retrieval pipeline for documents on your own machine.",
    query: "Build a local RAG pipeline with document indexing and vector search",
    tools: [
      { id: "gh-560704231", name: "LlamaIndex", role: "Index documents" },
      { id: "gh-268163609", name: "Qdrant", role: "Store and retrieve vectors" },
      { id: "gh-658928958", name: "Ollama", role: "Run inference locally" }
    ],
    steps: [
      "Start with a small set of non-sensitive documents and confirm which file types the indexer supports.",
      "Select an embedding model and configure the vector store with the corresponding dimensions.",
      "Generate answers from retrieved passages and check the citations against source files."
    ],
    caution: "Keep the model, embedding service and vector database local if documents must stay on the machine. Check model licenses and memory requirements."
  },
  {
    slug: "browser-workflow-testing",
    title: "Test browser workflows",
    category: "browser",
    description: "Check navigation, page state and accessibility in an isolated browser.",
    query: "Find browser automation tools for testing web workflows",
    tools: [
      { id: "gh-221981891", name: "Playwright", role: "Script repeatable browser tests" },
      { id: "gh-952688112", name: "Playwright MCP", role: "Expose browser actions to an agent" }
    ],
    steps: [
      "Create a separate browser profile and use an authorized test environment.",
      "Verify navigation, accessibility and expected page state with repeatable test cases.",
      "Add the MCP server only when an agent needs exploratory browser interaction."
    ],
    caution: "Treat page content as untrusted. Use test accounts and keep production sessions, credentials and browser storage out of the agent’s profile."
  },
  {
    slug: "postgres-exploration",
    title: "Explore a PostgreSQL schema",
    category: "mcp",
    description: "Let an agent inspect tables with restricted database permissions.",
    query: "Find an MCP server for read-only PostgreSQL schema exploration",
    tools: [
      { id: "gh-954215474", name: "Postgres MCP", role: "Expose database inspection through MCP" }
    ],
    steps: [
      "Start with a development database or a restricted replica.",
      "Create a database role with explicit read permissions for the schemas the task requires.",
      "Check what metadata and query capabilities the server exposes before sharing the connection."
    ],
    caution: "Enforce read-only access at the database role. Keep the connection string in secret storage and apply query timeouts."
  }
] as const;

export type UseCase = typeof useCases[number];
