import { defineConfig, devices } from "@playwright/test";

const backendCommand =
  "rm -f /tmp/discount-ai-e2e.db && ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
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
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer: !process.env.CI,
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
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        BACKEND_URL: "http://127.0.0.1:8000",
      },
    },
  ],
});
