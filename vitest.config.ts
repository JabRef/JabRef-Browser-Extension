import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_PATH = path.resolve(ROOT_DIR, "public/sandbox.js");

export default defineConfig({
  // Otherwise we get "Error: Cannot import non-asset file /sandbox.js which is inside /public."
  publicDir: false,
  test: {
    alias: [
      {
        find: /^\/sandbox\.js$/,
        replacement: SANDBOX_PATH,
      },
    ],
  },
});
