/*
Application statuses from Gmail. Runs backend/mail/track_mail.py (or MAIL_CMD in the tests), matches each update
to the person's applications by company and job title (backend/mail/mail-rules.js, the same rules as the
live site), and keeps the result in db.mail[account].
That is separate from the profile the app saves, so a save from the app never wipes a status.
An update for an application the app doesn't know (applied straight on LinkedIn) becomes a new one.
*/
import { spawn } from "node:child_process";
import { join } from "node:path";
import { applyEvents } from "../mail/mail-rules.js";   // matching rules shared with the live site

export function createMailSync({ root, db, saveDb, env }) {
  const account = () => String(process.env.MAIL_ACCOUNT || env().TRACK_ACCOUNT || env().GMAIL_ADDRESS || "").trim().toLowerCase();
  const configured = () => !!(process.env.MAIL_CMD || (env().GMAIL_ADDRESS && env().GMAIL_APP_PASSWORD));
  let running = null;

  function readMail() {
    return new Promise(resolve => {
      const p = process.env.MAIL_CMD
        ? spawn(process.env.MAIL_CMD, { shell: true, cwd: root })
        : spawn(process.env.PYTHON || "python", [join(root, "backend", "mail", "track_mail.py"), "--json"], { cwd: root });
      let out = "", err = "";
      p.stdout.on("data", c => out += c);
      p.stderr.on("data", c => err += c);
      p.on("error", e => resolve({ error: "Could not start the mail reader: " + e.message }));
      p.on("close", () => {
        try { resolve(JSON.parse(out)); } catch { resolve({ error: (err || out || "The mail reader gave no answer").trim().slice(0, 200) }); }
      });
    });
  }

  // match each update to the person's applications (backend/mail/mail-rules.js); returns how many moved
  async function apply(acc, events) {
    const st = db.mail[acc] ||= { seen: [], jobs: {}, lastRun: 0, error: "" };
    return (await applyEvents(st, db.users[acc]?.jobs || {}, events)).length;
  }

  async function run() {
    const acc = account();
    if (!configured() || !acc) return;
    if (running) return running;
    running = (async () => {
      const r = await readMail();
      const st = db.mail[acc] ||= { seen: [], jobs: {}, lastRun: 0, error: "" };
      st.lastRun = Date.now();
      st.error = r.error || "";
      const changed = r.error ? 0 : await apply(acc, r.events || []);
      saveDb();
      console.log(`mail check: ${r.error ? "error: " + r.error : `${(r.events || []).length} updates read, ${changed} statuses changed`}`);
    })().finally(() => { running = null; });
    return running;
  }

  // what the app shows: only the owner of the Gmail sees its statuses
  function status(email) {
    if (!configured() || email !== account()) return { connected: false };
    const st = db.mail[email] || {};
    return { connected: true, lastRun: st.lastRun || 0, error: st.error || "", jobs: st.jobs || {} };
  }

  return { run, status, account, configured };
}
