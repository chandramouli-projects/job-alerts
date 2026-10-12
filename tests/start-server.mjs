// Starts worker/server.mjs for the tests with a fresh, empty accounts file and no API keys.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const tmp = fileURLToPath(new URL(".tmp/", import.meta.url));
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
writeFileSync(tmp + "empty.env", "");
process.env.USERS_FILE = tmp + "users.json";
process.env.ENV_FILE = tmp + "empty.env";
// Gmail status tracking: a fake mail reader that prints tests/.tmp/mail-events.json
process.env.MAIL_CMD = `node "${fileURLToPath(new URL("fake-mail.mjs", import.meta.url))}"`;
process.env.MAIL_ACCOUNT = "mail-owner@example.com";
process.env.MAIL_SYNC_GAP_MS = "0";
process.argv[2] = process.argv[2] || "8091";
await import("../worker/server.mjs");
