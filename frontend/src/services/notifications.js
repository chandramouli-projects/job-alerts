/* Notifications: what the app tells you about, made from data the app already has (no extra API calls).
   Kinds, most important first:
     status   an application moved forward (from job-site emails: viewed, shortlisted, interview, offer, not selected)
     jobs     new jobs that fit you since the last check (one note per jobs update, with the best match)
     search   a saved search has new jobs
     remind   a job you saved 2+ days ago and haven't applied to yet
     tip      a one-time tip (add your resume)
   Kept in U.notifications (saved with the profile, so "read" is the same on every device):
     {items:[{id,kind,title,body,at,read,to}], jobsAt, statusAt, settings:{status,jobs,search,remind,device}}
   While the app is open it checks jobs.json every 10 minutes and when the tab comes back into view.
   Device alerts (system notifications) show while the app is open or running in the background.
   Ported from frontend/js/services/notifications.js. The app calls startNotes() when the app screen opens
   (after openShell) and stopNotes() on logout; the old file hooked into openShell / logout by itself. */
import { S, refresh, saveUser, api } from "../core/state.js";
import { PREVIEW } from "../core/constants.js";
import { LS, toast, cleanJob } from "../core/helpers.js";
import { go } from "../core/nav.js";
import { findJob, appliedKeys, wasApplied } from "./job-store.js";
import { evaluate } from "./matching.js";
import { isApplied } from "../components/applications.js";
import { newForSearch, searchLabel } from "../components/saved-searches.js";
import { resetFilters } from "../components/filters.js";
import { openNote, closeNotePanel } from "../components/notification-center.js";
export const NOTE_KINDS = [
  ["status", "Application updates", "When a company views, shortlists or interviews you"],
  ["jobs", "New jobs for you", "When new jobs match your role, experience and city"],
  ["search", "Saved searches", "When a saved search has new jobs"],
  ["remind", "Reminders", "Saved jobs you haven't applied to yet"],
];
export const NOTE_MAX = 60,
  NOTE_DAYS = 30,
  NOTE_POLL = 10 * 60e3,
  DAY = 864e5;
export const STATUS_NOTE = {
  viewed: ["Your application was viewed", "{c} viewed your application for {t}."],
  shortlisted: ["You're shortlisted", "{c} shortlisted you for {t}."],
  interview: ["Interview stage", "{c} wants to interview you for {t}. Tips are on the job page."],
  offer: ["You got an offer", "{c} made you an offer for {t}."],
  rejected: ["Not selected this time", "{c} moved ahead with other people for {t}."],
};
let notePoll = null;
// ids of jobs from jobs.json (the bot's list); jobs that live search adds are not "new jobs"
let noteBase = new Set();

export function notesState() {
  const U = S.U;
  const n = U.notifications || (U.notifications = {});
  n.items ||= [];
  // fill missing settings in the same object (a new object each call would lose a change made through an older one)
  n.settings ||= {};
  for (const [k, v] of Object.entries({
    status: true,
    jobs: true,
    search: true,
    remind: true,
    device: false,
  }))
    if (!(k in n.settings)) n.settings[k] = v;
  // first time: count from the previous visit, so a new person isn't flooded
  n.jobsAt ??= U.lastSeen || Date.now();
  n.statusAt ??= Date.now() - 7 * DAY;
  return n;
}
export const unreadNotes = () => notesState().items.filter(x => !x.read).length;

// Add notes that are not there yet; returns the ones that are new
export function addNotes(list) {
  const n = notesState(),
    have = new Set(n.items.map(x => x.id)),
    fresh = list.filter(x => x && !have.has(x.id) && n.settings[x.kind] !== false);
  if (!fresh.length) return [];
  const cut = Date.now() - NOTE_DAYS * DAY;
  n.items = [...fresh.map(x => ({ read: false, at: Date.now(), ...x })), ...n.items]
    .filter(x => x.at > cut)
    .sort((a, b) => b.at - a.at)
    .slice(0, NOTE_MAX);
  return fresh;
}

/* ---------------------------------------------------------------- making notes from the data */
export function statusNotes(n) {
  const U = S.U,
    out = [];
  for (const [id, t] of Object.entries(U.jobs || {})) {
    const j = findJob(id) || t.snap || {};
    for (const h of t.history || []) {
      if (!STATUS_NOTE[h.stage] || !(h.at > n.statusAt)) continue;
      const [title, body] = STATUS_NOTE[h.stage];
      out.push({
        id: `status-${id}-${h.stage}`,
        kind: "status",
        stage: h.stage,
        title,
        at: h.at,
        to: { job: id },
        body: body.replace("{c}", j.company || "The company").replace("{t}", j.title || "this job"),
      });
    }
  }
  return out;
}
export function jobNotes(n) {
  const U = S.U,
    data = S.data,
    applied = appliedKeys(),
    since = n.jobsAt;
  const fit = (data.jobs || [])
    .filter(
      j => noteBase.has(j.id) && new Date(j.found) > since && !U.hidden[j.id] && !wasApplied(j, applied)
    )
    .map(j => ({ j, e: evaluate(j, U.prefs) }))
    .filter(x => x.e.ok)
    .sort((a, b) => b.e.score - a.e.score);
  if (!fit.length) return [];
  const best = fit[0].j,
    count = fit.length;
  return [
    {
      id: `jobs-${data.updated || since}`,
      kind: "jobs",
      title: `${count} new job${count === 1 ? "" : "s"} for you`,
      body: `Best match: ${best.title} at ${best.company}${count > 1 ? ` and ${count - 1} more` : ""}.`,
      to: { view: "jobs", newest: true },
    },
  ];
}
export function searchNotes(n) {
  const U = S.U,
    data = S.data;
  if (typeof newForSearch !== "function") return [];
  return (U.searches || []).map(s => {
    const c = newForSearch({ ...s, seenAt: Math.max(s.seenAt || 0, n.jobsAt) });
    return c
      ? {
          id: `search-${s.id}-${data.updated || n.jobsAt}`,
          kind: "search",
          title: `${c} new job${c === 1 ? "" : "s"} in a saved search`,
          body: searchLabel(s.f),
          to: { search: s.id },
        }
      : null;
  });
}
export function remindNotes() {
  const U = S.U,
    out = [];
  for (const [id, t] of Object.entries(U.jobs || {})) {
    if (!t.saved || isApplied(t) || !t.savedAt || Date.now() - t.savedAt < 2 * DAY) continue;
    const j = findJob(id);
    if (!j) continue; // no longer listed: nothing to apply to
    out.push({
      id: `remind-${id}`,
      kind: "remind",
      title: "Apply before it closes",
      body: `You saved ${j.title} at ${j.company} ${Math.round((Date.now() - t.savedAt) / DAY)} days ago.`,
      to: { job: id },
    });
  }
  return out.slice(0, 3);
}
export function tipNotes() {
  const U = S.U;
  if (U.profile.resumeFile || !U.onboarded || Date.now() - (U.createdAt || Date.now()) < DAY) return [];
  return [
    {
      id: "tip-resume",
      kind: "tip",
      title: "Add your resume",
      body: "We'll pick your skills from it, so “Jobs for me” fits you better.",
      to: { view: "profile" },
    },
  ];
}

// Look at everything and add what's new; quiet = don't pop alerts (the first look when the app opens)
export function refreshNotes({ quiet = false } = {}) {
  const U = S.U,
    data = S.data;
  if (!U || !data) return [];
  const n = notesState();
  const fresh = addNotes([
    ...statusNotes(n),
    ...jobNotes(n),
    ...searchNotes(n),
    ...remindNotes(),
    ...tipNotes(),
  ]);
  n.jobsAt = Math.max(
    n.jobsAt,
    ...(data.jobs || []).filter(j => noteBase.has(j.id)).map(j => +new Date(j.found) || 0)
  );
  n.statusAt = Math.max(
    n.statusAt,
    ...Object.values(U.jobs || {}).flatMap(t => (t.history || []).map(h => h.at || 0))
  );
  if (fresh.length) {
    saveUser();
    refresh(); // the bell
    if (!quiet) announceNotes(fresh);
  }
  return fresh;
}

/* ---------------------------------------------------------------- new jobs while the app is open */
export async function checkForNewJobs() {
  const data = S.data;
  if (!S.U || PREVIEW) return;
  let next;
  try {
    next = await (await fetch("data/jobs.json?t=" + Date.now(), { cache: "no-store" })).json();
  } catch (e) {
    return;
  }
  if (!next?.updated || next.updated === data.updated) return;
  const have = new Map(data.jobs.map(j => [j.id, j]));
  for (const j of (next.jobs || []).map(cleanJob).filter(j => j && j.url))
    if (!have.has(j.id)) data.jobs.push(j);
  for (const j of next.jobs || []) noteBase.add(j.id);
  data.updated = next.updated;
  refreshNotes();
  refresh();
}
export function startNotes() {
  // turned on before (on any device) and allowed on this one: make sure this device gets alerts too
  const st = notesState().settings;
  if (st.push && st.device && "Notification" in window && Notification.permission === "granted")
    subscribePush().catch(() => {});
  else checkPushHere().catch(() => {});
  if (!noteBase.size) noteBase = new Set(S.data.jobs.map(j => j.id)); // before live search adds its jobs
  refreshNotes({ quiet: true });
  clearInterval(notePoll);
  notePoll = setInterval(checkForNewJobs, NOTE_POLL);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.U && S.screen === "shell") checkForNewJobs();
});

/* ---------------------------------------------------------------- telling you */
export function announceNotes(fresh) {
  const top = fresh[0];
  toast(fresh.length > 1 ? `${fresh.length} new notifications` : top.title, "ok");
  if (!notesState().settings.device || !("Notification" in window) || Notification.permission !== "granted")
    return;
  const opts = x => ({
    body: x.body,
    tag: x.id,
    icon: "assets/icon-512.png",
    badge: "assets/logo.png",
    data: { id: x.id },
  });
  for (const x of fresh.slice(0, 3)) {
    navigator.serviceWorker
      ?.getRegistration()
      .then(r => (r ? r.showNotification(x.title, opts(x)) : new Notification(x.title, opts(x))))
      .catch(() => {});
  }
}
export async function askDeviceAlerts() {
  if (!("Notification" in window)) return "unsupported";
  const p =
    Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  notesState().settings.device = p === "granted";
  saveUser();
  if (p === "granted") await subscribePush({ test: true }).catch(() => false);
  return p;
}

/* Alerts with the app closed (Web Push, live site only): this device subscribes with the server's key;
   the job bot then asks the server to send each person one alert per run for the new jobs that fit them. */
export let pushHere = null; // is this device subscribed? (null = not checked yet); read it as `pushHere`
export const keyBytes = k =>
  Uint8Array.from(atob(k.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((k.length + 3) % 4)), c =>
    c.charCodeAt(0)
  );
export const pushReg = async () =>
  "PushManager" in window && navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
export async function pushKey() {
  if (!S.SERVER) return null;
  try {
    return (await api("push/key")).key;
  } catch (e) {
    return null;
  }
}
export async function checkPushHere() {
  const r = await pushReg().catch(() => null);
  pushHere = !!(r && (await r.pushManager.getSubscription()));
  return pushHere;
}
export async function subscribePush({ test = false } = {}) {
  const key = await pushKey(),
    reg = key && (await pushReg());
  if (!reg) {
    pushHere = false;
    return false;
  }
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  await api("push/subscribe", sub.toJSON());
  notesState().settings.push = true;
  saveUser();
  pushHere = true;
  if (test) api("push/test", {}).catch(() => {});
  return true;
}
export async function unsubscribePush({ keep = false } = {}) {
  const sub = await (await pushReg().catch(() => null))?.pushManager.getSubscription();
  if (sub) {
    await api("push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  if (!keep) {
    notesState().settings.push = false;
    saveUser();
  }
  pushHere = false;
}
// a system notification that was clicked: open its note (sw.js sends {note:id}) or the newest jobs
navigator.serviceWorker?.addEventListener("message", e => {
  if (!S.U) return;
  if (e.data?.note) openNote(e.data.note);
  else if (e.data?.go === "jobs-new") {
    resetFilters();
    S.F.sort = "new";
    go("jobs");
  }
});

/* ---------------------------------------------------------------- logout */
// Called on logout (the old file wrapped logout()): stop checking, close the panel, and drop this
// device's push subscription so the next person on this device doesn't get these alerts
export function stopNotes() {
  clearInterval(notePoll);
  notePoll = null;
  closeNotePanel?.();
  const token = LS.get("uv.token", "");
  pushReg()
    .then(r => r?.pushManager.getSubscription())
    .then(sub => {
      if (!sub) return;
      fetch("api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      sub.unsubscribe().catch(() => {});
    })
    .catch(() => {});
  pushHere = false;
}
