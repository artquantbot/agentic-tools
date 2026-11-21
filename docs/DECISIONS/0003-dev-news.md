# ADR 0003 — Reverification events

Accepted 2026-11-21. The future dev-news bridge will submit an authenticated event with event ID, type, observed timestamp, canonical repository/package ID and evidence link. Match stable IDs, deduplicate on event ID and enqueue re-verification for a reviewer. Events can describe a release, MCP capability, deprecation, advisory, license change or API change. Refresh through existing allowlisted connectors. Keep the current catalog serving on event backlog or delivery failure. The initial release has no dev-news runtime dependency.
