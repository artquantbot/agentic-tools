import { defineConfig } from "cf/config";

export default defineConfig(({ isPreview }) => ({
  worker: {
    name: "agentic-tools",
    entrypoint: "./src/index.ts",
    compatibilityDate: "2026-11-19",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api", "/api/*", "/mcp"]
    },
    env: {
      ASSETS: { type: "assets" },
      LIMIT: { type: "rate-limit", namespace: "4173", simple: { limit: 120, period: 60 } }
    },
    domains: isPreview ? [] : ["agentic-tools.ususuni.com"],
    workersDev: false,
    previewUrls: false,
    observability: {
      enabled: true,
      logs: { enabled: true, invocationLogs: false, headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 0.01 }
    }
  }
}));
