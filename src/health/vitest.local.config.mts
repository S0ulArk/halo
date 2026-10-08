// Local vitest config for src/health until the project-wide one lands:
//   npx vitest run -c src/health/vitest.local.config.mts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": src } },
  test: { include: ["src/health/**/*.test.ts"], environment: "node" },
});
