import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
      args: process.platform === "linux" ? ["--no-sandbox"] : [],
    },
  },
  reporter: "list",
});
