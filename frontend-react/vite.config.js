/* Vite settings for the React app.
   - npm run dev: http://localhost:5173, with /api, /search and /data sent to the local server
     (node backend/server/server.mjs, port 8080), so accounts and live search work while editing.
   - npm run build: the site goes to dist/, with the bot's jobs list (frontend/data/jobs.json) copied in. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const JOBS = resolve(__dirname, "../frontend/data/jobs.json");

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "copy-jobs-json",
      apply: "build",
      closeBundle() {
        if (!existsSync(JOBS)) return;
        mkdirSync(resolve(__dirname, "dist/data"), { recursive: true });
        copyFileSync(JOBS, resolve(__dirname, "dist/data/jobs.json"));
      },
    },
  ],
  server: {
    fs: { allow: [".."] }, // the styles are read from ../frontend/css
    proxy: {
      "/api": "http://localhost:8080",
      "/search": "http://localhost:8080",
      "/data": "http://localhost:8080",
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
