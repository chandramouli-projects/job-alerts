/* Application statuses from Gmail (backend/server/mail-sync.mjs reads job-site emails every 15 minutes).
   The server keeps them apart from the profile; here they are merged into the person's applications.
   Ported from frontend/js/services/mail-tracking.js; the bar above the applications is MailTracking.jsx. */
import { S, refresh, api } from "../core/state.js";
import { toast } from "../core/helpers.js";
import { ask } from "../components/Ask.jsx";
import { track } from "./job-store.js";
import { refreshNotes } from "./notifications.js";

// What the server said about Gmail (read it as `MAIL`; only this file changes it)
export let MAIL = { connected: false };
let mailTimer = null;
export const STAGE_RANK = { applied: 1, viewed: 2, shortlisted: 3, interview: 4, offer: 5, rejected: 6 };
export const laterStage = (now, next) =>
  !STAGE_RANK[now] ||
  (next === "rejected" ? now !== "offer" && now !== "rejected" : STAGE_RANK[next] > STAGE_RANK[now]);
export function applyMail() {
  for (const [id, o] of Object.entries(MAIL.jobs || {})) {
    const t = track(id);
    if (o.snap && !t.snap) t.snap = o.snap;
    for (const h of o.history || [])
      if (!t.history.some(x => x.stage === h.stage && x.at === h.at)) t.history.push(h);
    t.history.sort((a, b) => a.at - b.at);
    if (o.stage && laterStage(t.stage, o.stage)) t.stage = o.stage;
    if (!t.appliedAt)
      t.appliedAt = t.history.find(h => h.stage === "applied")?.at || t.history[0]?.at || null;
  }
}
async function readMail() {
  if (!S.SERVER || !S.U) return;
  try {
    MAIL = await api("mail");
  } catch (e) {
    return;
  }
  applyMail();
  refresh();
  if (!mailTimer) mailTimer = setInterval(loadMail, 5 * 60e3);
}
// Get the statuses, then look for notes to make from them (the old notifications.js hooked in here)
export async function loadMail() {
  await readMail();
  refreshNotes();
}

/* buttons on the bar (MailTracking.jsx) */
// "Check now"
export async function mailSync() {
  try {
    MAIL = await api("mail/sync", {});
    applyMail();
    toast("Statuses updated");
  } catch (err) {
    toast(err.message);
  }
  refresh();
}
// "Connect Gmail": off to Google; returns false when that didn't work
export async function gmailConnect() {
  try {
    location.href = (await api("gmail/start", {})).url;
    return true;
  } catch (err) {
    toast(err.message);
    return false;
  }
}
// "Disconnect"
export async function gmailOff() {
  if (
    !(await ask(
      "Disconnect Gmail?",
      "Applications already found stay in My jobs. New emails won't be read.",
      "Disconnect",
      true
    ))
  )
    return;
  try {
    await api("gmail/disconnect", {});
    MAIL = { connected: false, canConnect: true };
    toast("Gmail disconnected");
  } catch (err) {
    toast(err.message);
  }
  refresh();
}

// Back from Google: /my-jobs?gmail=connected | denied | noscope | error
(function gmailReturn() {
  const r = new URLSearchParams(location.search).get("gmail");
  if (!r) return;
  history.replaceState(history.state, "", location.pathname);
  const say = {
    connected: ["Gmail connected. Your applications will update by themselves.", "ok"],
    denied: ["Gmail was not connected."],
    noscope: ["Tick the box that lets the app read your emails, then try again."],
    error: ["Couldn't connect Gmail. Try again."],
  }[r] || ["Couldn't connect Gmail. Try again."];
  setTimeout(() => toast(...say), 900);
})();
