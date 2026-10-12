// Stands in for backend/mail/track_mail.py in the tests: prints the events a test wrote to .tmp/mail-events.json
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const f = fileURLToPath(new URL((process.env.TEST_TMP || ".tmp/") + "mail-events.json", import.meta.url));
process.stdout.write(existsSync(f) ? readFileSync(f, "utf8") : JSON.stringify({ events: [] }));
