/* Vite settings for the React app (this folder).
   - npm run dev: http://localhost:5173, with /api, /search and /data sent to the local server
     (node backend/server/server.mjs, port 8080), so accounts and live search work while editing.
   - npm run build: the site goes to dist/ (Cloudflare Pages and the local server serve that).
     public/ is copied as it is, including the bot's jobs list public/data/jobs.json. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/search": "http://localhost:8080",
      "/data": "http://localhost:8080",
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
