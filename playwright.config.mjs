// Browser tests (e2e/*.spec.mjs) against the real server, with the model faked in the page
// (window.ct.useFakeLlm), so they're fast, free and repeatable.   npm run test:e2e
import { defineConfig, devices } from "@playwright/test";

const PORT = 8981;
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.mjs",
  fullyParallel: true,
  reporter: [["list"]],
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ["--mute-audio"] },
    trace: "off",
  },
  webServer: {
    command: `node server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/`,
    // never reuse: a stray server on this port would get tested instead
    reuseExistingServer: false,
    stderr: "ignore",
  },
});
