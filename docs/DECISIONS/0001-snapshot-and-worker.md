# ADR 0001 — Versioned snapshot and edge runtime

Accepted 2026-11-21. Use a validated, reviewable snapshot, compiled search data and edge Worker. Benefits include reproducible ranking, simple rollback, no runtime source dependency and minimal cost. Trade-offs include bounded coverage and refreshes coupled to releases. Revisit after measuring size, isolate startup and update latency.
