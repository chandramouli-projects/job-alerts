// Starts worker/server.mjs for the tests with a fresh, empty accounts file and no API keys.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const tmp = fileURLToPath(new URL(".tmp/", import.meta.url));
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
writeFileSync(tmp + "empty.env", "");
process.env.USERS_FILE = tmp + "users.json";
process.env.ENV_FILE = tmp + "empty.env";
process.argv[2] = process.argv[2] || "8091";
await import("../worker/server.mjs");
