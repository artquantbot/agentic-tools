import { defineConfig, devices } from "@playwright/test";

const external = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: process.env.CI ? 1 : 2,
  use: {
    baseURL: external ?? "http://127.0.0.1:4173",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ],
  webServer: external ? undefined : {
    command: "npm run preview",
    url: "http://127.0.0.1:4173/api/v1/health",
    reuseExistingServer: !process.env.CI
  }
});
