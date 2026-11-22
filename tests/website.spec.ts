import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("search, apply a filter, compare and read provenance", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Find the right tools/);
  await page.getByRole("textbox", { name: "Describe what your agent needs" }).fill("Run an LLM locally on a Mac");
  await page.getByRole("button", { name: "Search tools" }).click();
  await expect(page).toHaveURL(/discover/);
  await page.getByRole("checkbox", { name: "Open source only" }).check();
  await expect(page.getByText("Required · true")).toBeVisible();
  await page.getByRole("button", { name: "Add Ollama to comparison" }).click();
  await page.getByRole("button", { name: "Add llama.cpp to comparison" }).click();
  await page.getByRole("link", { name: "Compare tools", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("link", { name: "Ollama", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Evidence & trade-offs" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Setup documentation" })).toHaveAttribute("href", /ollama/);
});

test("stack, categories and developer links use live data", async ({ page, request }) => {
  await page.goto("/stack");
  await page.getByRole("textbox").fill("Find an MCP server for PostgreSQL.");
  await page.getByRole("button", { name: "Find components" }).click();
  await expect(page.getByRole("link", { name: "Postgres MCP", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  await expect(page.getByRole("link", { name: /Local inference/ })).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Developers" }).click();
  await expect(page.getByRole("heading", { name: "Model Context Protocol" })).toBeVisible();
  expect((await request.get("/api/v1/health")).ok()).toBe(true);
});

test("home and discover pass automated accessibility and fit the viewport", async ({ page }) => {
  for (const path of ["/", "/discover"]) {
    await page.goto(path);
    await expect(page.getByRole("article").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations).toEqual([]);
  }
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const light = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(light.violations).toEqual([]);
});

test("workflow guides lead to catalog entries and saved tools persist", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Search documents locally/ }).click();
  await expect(page.getByRole("heading", { name: "Search documents locally" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Before you connect" })).toBeVisible();
  await page.getByRole("link", { name: "Ollama", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ollama" })).toBeVisible();
  await page.getByRole("button", { name: "Save Ollama" }).click();
  await page.getByRole("link", { name: "Saved tools (1)" }).click();
  await expect(page.getByRole("heading", { name: "Saved tools" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Ollama", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove Ollama from saved tools" }).click();
  await expect(page.getByText("Your shelf is empty", { exact: false })).toBeVisible();
});

test("quick search accepts keyboard input without putting free text in the URL", async ({ page }) => {
  await page.goto("/use-cases");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Quick search" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox")).toBeFocused();
  await dialog.getByRole("textbox").fill("Run an LLM locally on a Mac");
  await dialog.getByRole("button", { name: "Search tools" }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.getByRole("textbox", { name: "Describe what your agent needs" })).toHaveValue("Run an LLM locally on a Mac");
  await expect(page.getByRole("link", { name: "Ollama", exact: true })).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "No paid API required" }).click();
  await expect(page.getByRole("checkbox", { name: "No paid API required" })).toBeChecked();
});
