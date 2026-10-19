// Starts the live site's accounts code (functions/api, Cloudflare Pages Functions + a local D1 database)
// for the tests, with a fresh, empty database each run. Uses wrangler from tests/node_modules.
import { rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const state = fileURLToPath(new URL(".tmp-cf/", import.meta.url));
rmSync(state, { recursive: true, force: true });
const port = process.argv[2] || "8093";
const bin = fileURLToPath(new URL("node_modules/wrangler/bin/wrangler.js", import.meta.url));
const child = spawn(process.execPath, [bin, "pages", "dev", "frontend", "--port", port, "--persist-to", state], { cwd: root, stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { child.kill(); process.exit(0); });
child.on("exit", code => process.exit(code ?? 0));
