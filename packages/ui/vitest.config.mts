import { defineConfig } from "vitest/config";

// tsconfig keeps JSX as "preserve" for Next.js; tests need it compiled.
export default defineConfig({ oxc: { jsx: { runtime: "automatic" } } });
