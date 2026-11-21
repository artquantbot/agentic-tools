# Architecture

A TypeScript ingestion CLI refreshes a versioned catalog with provenance. A generated snapshot is validated before it enters the review and deployment pipeline. The same deterministic ranking and constraints power a Worker REST API and the official MCP SDK. A React/Vite SPA uses the REST API. Cloudflare Static Assets serves the UI and the Worker handles API and MCP. The site owns no tool execution capability.

## Trade-offs

React and Vite fit the static shell; Next SSR would add useful indexing for future public detail pages at the cost of more runtime complexity. CSS custom properties and semantic HTML keep the component layer small. Snapshot storage avoids a mutable database for the MVP. D1 or SQLite FTS5 is appropriate for a larger corpus requiring incremental writes and indexed lexical retrieval. PostgreSQL/Supabase becomes useful for user state or richer joins. Start with BM25-style relevance and deterministic rules. Add semantic retrieval only after evaluation identifies missed intent.

## Cost model

As of 2026-11-21, [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) is $0 within Free quotas and $5/month base on Paid, including 10M requests and 30M CPU ms. Assuming 5 ms mean CPU and existing DNS, 30k dynamic calls/month evenly distributed costs $0 if individual invocations fit the Free CPU limit, 5M costs about $5/month, and 25M costs about $11.40/month ($5 + $4.50 requests + $1.90 CPU). Static assets served directly have no invocation charge. These are planning estimates, excluding domain renewal, CI overage, observability overage and future storage. Validate actual CPU and peak counts in production.
