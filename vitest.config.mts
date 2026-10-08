import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The pipeline test seeds 180 days of 15-second heart rate and scores them.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
