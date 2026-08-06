import { defineConfig } from "@playwright/test";

const PORT = 3007;

export default defineConfig({
  testDir: "./tests/e2e",
  // One worker, deliberately. These tests drive a single application instance
  // whose scenario and presenter settings are server-side and shared, so two
  // journeys running at once change each other's configuration mid-flight.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
  },
  webServer: {
    command: `cmd.exe /c C:\\PROGRA~1\\nodejs\\npm.cmd run dev -- --hostname 127.0.0.1 --port ${PORT}`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 180000,
  },
});
