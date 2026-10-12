/*
Application statuses from Gmail. Runs backend/mail/track_mail.py (or MAIL_CMD in the tests), matches each update
to the person's applications by company and job title, and keeps the result in db.mail[account].
That is separate from the profile the app saves, so a save from the app never wipes a status.
An update for an application the app doesn't know (applied straight on LinkedIn) becomes a new one.
*/
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const RANK = { applied: 1, viewed: 2, shortlisted: 3, interview: 4, offer: 5, rejected: 6 };
const FILLER = /\b(pvt|private|ltd|limited|inc|llp|llc|technologies|technology|solutions|services|india|software|consultancy|consulting|corp|corporation|co|the)\b/g;
const norm = s => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const core = s => norm(s).replace(FILLER, " ").replace(/\s+/g, " ").trim() || norm(s);
const words = s => new Set(norm(s).split(" ").filter(w => w.length > 1));
export function sameCompany(a, b) {
  const x = core(a), y = core(b);
  return !!x && !!y && (x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y)));
}
export function titleScore(a, b) {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  return [...x].filter(w => y.has(w)).length / Math.min(x.size, y.size);
}
// a later email moves the status forward; "Not selected" can follow anything but an offer
const better = (now, next) => !now || (next === "rejected" ? now !== "offer" && now !== "rejected" : RANK[next] > RANK[now]);

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

  function apply(acc, events) {
    const st = db.mail[acc] ||= { seen: [], jobs: {}, lastRun: 0, error: "" };
    const ujobs = db.users[acc]?.jobs || {};
    let changed = 0;
    for (const ev of events) {
      if (!ev.company || st.seen.includes(ev.id)) continue;
      st.seen.push(ev.id);
      // the person's own applications first, then ones made from earlier emails
      const pool = [...Object.entries(ujobs).map(([id, t]) => [id, t.snap]), ...Object.entries(st.jobs).map(([id, o]) => [id, o.snap])]
        .filter(([, s]) => s && sameCompany(s.company, ev.company));
      const scored = pool.map(([id, s]) => [id, ev.title ? titleScore(s.title, ev.title) : 0.5]).sort((a, b) => b[1] - a[1]);
      let id = scored.length && (scored[0][1] >= 0.34 || pool.length === 1) ? scored[0][0] : null;
      const at = Date.parse(ev.at) || Date.now();
      if (!id) {
        id = "mail-" + createHash("sha1").update(core(ev.company) + "|" + norm(ev.title)).digest("hex").slice(0, 12);
        st.jobs[id] ||= { stage: null, history: [], snap: { id, title: ev.title || "Application", company: ev.company, source: ev.site,
          url: "", location: "", city_norm: "", posted: "", found: new Date(at).toISOString(), tech: [], fromEmail: true } };
      }
      const o = st.jobs[id] ||= { stage: null, history: [] };
      if (!o.history.some(h => h.stage === ev.stage && h.at === at))
        o.history.push({ stage: ev.stage, at, via: "email", site: ev.site, subject: ev.subject });
      const current = [o.stage, ujobs[id]?.stage].filter(s => RANK[s]).sort((a, b) => RANK[b] - RANK[a])[0] || null;
      if (better(current, ev.stage)) { o.stage = ev.stage; changed++; }
    }
    st.seen = st.seen.slice(-3000);
    return changed;
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
      const changed = r.error ? 0 : apply(acc, r.events || []);
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
