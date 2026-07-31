import { defineConfig } from "@playwright/test";

const PORT = 3007;

export default defineConfig({
  testDir: "./tests/e2e",
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
