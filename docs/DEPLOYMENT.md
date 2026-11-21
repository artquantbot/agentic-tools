# Deployment

The initial release was deployed on 2026-11-21. The [production smoke run](https://github.com/artquantbot/agentic-tools/actions/runs/44939771849) verified HTTPS, browser entry routing, REST search and all five MCP tools.

Use Node 24+, npm and the locked Cloudflare CLI. From a clean checkout:

```sh
npm ci
npm test
npm run evaluate
npm run build
npx playwright install chromium
npm run test:e2e
npx cf deploy --prebuilt --dry-run
```

Use an authorized Cloudflare account with Workers deployment permission and access to the active `ususuni.com` zone. The production config assigns `agentic-tools.ususuni.com` as this Worker's custom domain. Cloudflare provisions DNS and TLS for this hostname. Check for an existing record or deployment before a first launch. Set an explicit account ID if the CLI can see several accounts.

```sh
npx cf auth login
npx cf previews deploy
npx cf deploy --prebuilt
curl -fsS https://agentic-tools.ususuni.com/api/v1/health
```

For CI, set `CLOUDFLARE_ACCOUNT_ID` as an environment variable and configure `CLOUDFLARE_API_TOKEN` as a GitHub environment secret in each authorized environment. Scope the token to the appropriate account and zone with Workers Scripts Write and custom-domain permissions. Both GitHub deployment environments accept only main and require owner approval. Run the manual Deploy workflow from main after connecting the scoped token. Preview mode omits the production domain. Public version URLs are disabled. Use the preview workflow only with an authorized, isolated environment.

The production hostname has two host-scoped Cloudflare rules. HTTP redirects to HTTPS with status 308 and preserves the path and query. HTTPS responses use a one-day HSTS policy. Keep these rules when updating the Worker. Workers Logs and sampled traces are enabled. Monitor HTTP errors and CPU time in Cloudflare Analytics, then run the health and MCP smoke tests. For rollback, select a previously verified version with the current security fixes under Workers & Pages → Agentic Tools → Deployments, deploy it at 100%, and check HTTPS, the snapshot timestamp and MCP connectivity. The previous version carries its original catalog and assets.

Refresh the catalog by running `GITHUB_TOKEN=… npm run import` with an optional public metadata read token, reviewing the snapshot diff and passing CI before deployment.
