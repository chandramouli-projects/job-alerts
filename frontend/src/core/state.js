/* Ported from frontend/js/core/state.js. The logged-in person, the jobs list, current filters, and
   saving to the server / browser.

   Everything the old app kept in global variables lives in one object, S. Code changes S (for example
   S.U.jobs[id].saved = true) and then calls refresh(), which re-draws every React component that called
   useStore(). That is the old render(), so ported code reads almost the same as before. */
import { useSyncExternalStore } from "react";
import { PAGE } from "./constants.js";
import { toast } from "./helpers.js"; // helpers imports this file too; both only call each other later, so that is fine

const lsGet = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch (e) {
    return d;
  }
};

export const FILTER_START = {
  q: "",
  forYou: true,
  days: 7,
  role: "",
  exp: "",
  city: "",
  type: "",
  source: "",
  company: "",
  minSal: "",
  remote: false,
  sort: "match",
};

export const S = {
  accounts: lsGet("uv.accounts", {}),
  session: lsGet("uv.session", null),
  U: null, // current user's data
  data: { jobs: [] },
  SERVER: false, // true when an accounts server answers api/ping (server.mjs or Cloudflare functions)
  liveBusy: 0,
  liveDone: new Set(), // live searches (backend/worker/worker.js) running and already done
  liveLimitSaid: false, // "limit reached" message shown once per visit
  view: "jobs", // jobs | saved | mine | profile
  shown: PAGE,
  F: { ...FILTER_START },
  prevSeen: 0,
  filtersOpen: false,

  // which screen is on (the old code showed / hid #auth, #ob, #shell)
  screen: "boot", // boot | auth | ob | shell
  authMode: "login", // login | signup
  forgotOpen: false,
  sheet: null, // the side panel (old #sheet): { kind: "job", id } etc., see core/nav.js openSheet
  toast: null, // { text, kind, act, id }
  ask: null, // { title, text, yes, red, resolve } for the Cancel / OK pop-up
  obKey: 0, // a new number starts the setup screen again from the saved choices (nav.js startOnboarding)
  obDraft: null, // the choices on the setup screen before "Show my jobs" (pages/Onboarding.jsx)
  loginEmail: "", // email typed on Log in, so Forgot password starts with it
  installOffer: null, // the browser's "install this app" offer (core/pwa.js)
  // "Did you apply?" pop-up (components/applications.js)
  applyOpen: false,
  applyId: null,
  applyDone: false, // showing "Application tracked"
  // notifications panel (components/notification-center.js)
  noteOpen: false,
  noteMode: "list", // list | settings
  noteTab: "all", // all | unread
  notePos: null,
};

/* re-draw: components that call useStore() run again */
let version = 0;
const subs = new Set();
export function refresh() {
  version++;
  subs.forEach(f => f());
}
export function useStore() {
  return useSyncExternalStore(
    cb => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => version
  );
}

export function blankUser(name, email, phone) {
  return {
    profile: {
      name,
      email,
      phone,
      headline: "",
      location: "",
      about: "",
      currentCompany: "",
      currentCtc: "",
      expectedCtc: "",
      notice: "",
      education: "",
      linkedin: "",
      github: "",
      portfolio: "",
      resume: "",
    },
    prefs: { roles: [], custom: "", exp: null, cities: [], skills: [], customSkills: "" },
    jobs: {},
    manual: [],
    hidden: {},
    settings: {
      theme: "system",
      days: 7,
      hideApplied: true,
      telegram: false,
      minMatch: 70,
      ghToken: "",
      ghRepo: "chandramouli-projects/job-alerts",
    },
    onboarded: false,
    createdAt: Date.now(),
  };
}
/* Accounts: kept by the server when there is one (same login on every device), otherwise only in this browser */
export function withDefaults(u, name, email) {
  const b = blankUser(name, email, "");
  if (!u) return b;
  return {
    ...b,
    ...u,
    profile: { ...b.profile, ...u.profile, email },
    prefs: { ...b.prefs, ...u.prefs },
    // the GitHub key is never kept on the server (see saveUser), only in this browser
    settings: { ...b.settings, ...u.settings, ghToken: u.settings?.ghToken || lsGet("uv.gh." + email, "") },
  };
}
export async function api(path, body, method) {
  const t = lsGet("uv.token", "");
  const r = await fetch("api/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  // a web page instead of JSON means there is no accounts server here
  const d = await r.json().catch(() => null);
  if (!d) throw new Error("Can't reach the accounts server. Refresh the page and try again.");
  if (!r.ok) throw new Error(d.error || "Server error, try again.");
  return d;
}
let saveT = null;
export function saveUser() {
  if (!S.session) return;
  const email = S.session.email;
  try {
    localStorage.setItem("uv.user." + email, JSON.stringify(S.U));
    // the GitHub key stays in this browser; the server drops it from what it saves
    if (S.U.settings.ghToken) localStorage.setItem("uv.gh." + email, JSON.stringify(S.U.settings.ghToken));
    else localStorage.removeItem("uv.gh." + email);
  } catch (e) {}
  if (S.SERVER) {
    const u = S.U;
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      saveT = null;
      api("user", u, "PUT").catch(e => toast(e.message));
    }, 500);
  }
}
export const savePending = () => !!saveT; // a save is waiting to be sent to the server
export function cancelSave() {
  clearTimeout(saveT);
  saveT = null;
}
// Leaving or refreshing the page inside that half second: send the waiting save now, so nothing is lost
addEventListener("pagehide", () => {
  if (!saveT || !S.SERVER || !S.U) return;
  cancelSave();
  const body = JSON.stringify(S.U);
  fetch("api/user", {
    method: "PUT",
    keepalive: body.length < 60000,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + lsGet("uv.token", "") },
    body,
  }).catch(() => {});
});
export function applyTheme() {
  const t = S.U?.settings.theme || "system";
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = t;
}
