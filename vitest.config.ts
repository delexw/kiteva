import { credentialEnvironmentVariables } from "./src/server/runtime/credential-environment.ts";
import { browserAliases } from "./vite.resolve.ts";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: browserAliases },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 15000,
    setupFiles: ["tests/setup.ts"],
    // Never inherit real provider credentials or load them from local dotenv files.
    env: Object.fromEntries(
      Object.values(credentialEnvironmentVariables).map((name) => [name, ""]),
    ),
    pool: "threads",
    // Workflow mocks and environment changes must stay scoped to each test file.
    isolate: true,
  },
});
