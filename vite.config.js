import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React app lives in client/ and builds to server/public/. In production
// it's deployed as a static site to GitHub Pages by .github/workflows/deploy.yml.
//
// GitHub project pages serve under /<repo>/, so assets and the data.json fetch
// must be base-pathed there. Override with BASE_PATH=/ for local root serving.
export default defineConfig({
  root: "client",
  base: process.env.BASE_PATH || "/sweepnostakes/",
  plugins: [react()],
  // Allow importing ../shared/logic.js (above the client root) in dev.
  server: { fs: { allow: [".."] } },
  build: {
    outDir: "../server/public",
    emptyOutDir: true,
  },
});
