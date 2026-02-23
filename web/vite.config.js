import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => ({
  plugins: [react(), tsconfigPaths()],
  // Use root base in local dev, project subpath only for production build.
  base: command === "serve" ? "/" : "/brand-wala-uk/",
}));
