// Starts the live site's accounts code (functions/api, Cloudflare Pages Functions + a local D1 database)
// for the tests, with a fresh, empty database each run. Uses wrangler from tests/node_modules.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const state = fileURLToPath(new URL(".tmp-cf/", import.meta.url));
rmSync(state, { recursive: true, force: true });
const port = process.argv[2] || "8093";
const bin = fileURLToPath(new URL("node_modules/wrangler/bin/wrangler.js", import.meta.url));
// test-only push keys (never the real ones): the server gets them as bindings, the tests read push-keys.json
mkdirSync(state, { recursive: true });
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const keys = { publicKey: Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64url"),
  privateJwk: JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey)), notifySecret: "test-notify-secret" };
writeFileSync(state + "push-keys.json", JSON.stringify(keys));
const bindings = ["--binding", `VAPID_PUBLIC_KEY=${keys.publicKey}`, "--binding", `VAPID_PRIVATE_JWK=${keys.privateJwk}`, "--binding", `NOTIFY_SECRET=${keys.notifySecret}`];
// Gmail tracking against a fake Google that tests/specs/gmail.cloudflare.js runs on port 8094
bindings.push("--binding", "GOOGLE_CLIENT_ID=test-client", "--binding", "GOOGLE_CLIENT_SECRET=test-secret",
  "--binding", `TOKEN_KEY=${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`, "--binding", "GOOGLE_BASE=http://127.0.0.1:8094");
const child = spawn(process.execPath, [bin, "pages", "dev", "frontend", "--port", port, "--persist-to", state, ...bindings], { cwd: root, stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { child.kill(); process.exit(0); });
child.on("exit", code => process.exit(code ?? 0));
