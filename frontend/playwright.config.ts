import { defineConfig, devices } from "@playwright/test";

const backendPort = process.env.E2E_BACKEND_PORT ?? "8100";
const frontendPort = process.env.E2E_FRONTEND_PORT ?? "3100";
const backendUrl = `http://127.0.0.1:${backendPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const backendCommand = `rm -f /tmp/discount-ai-e2e.db && ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port ${backendPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: frontendUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: backendCommand,
      cwd: "../backend",
      url: `${backendUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        DATABASE_URL: "sqlite:////tmp/discount-ai-e2e.db",
        ENVIRONMENT: "e2e",
        SECRET_KEY: "e2e-secret-key-with-at-least-32-bytes",
        DEMO_MODE: "true",
        SEED_DEMO_DATA: "true",
        RATE_LIMIT_PER_MINUTE: "10000",
      },
    },
    {
      command: `npm run dev -- -p ${frontendPort}`,
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        BACKEND_URL: backendUrl,
      },
    },
  ],
});
