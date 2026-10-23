/* Which screen is on, and its link. Ported from frontend/js/core/router.js plus the screen functions
   of pages/login.js (showAuth, logout), pages/onboarding.js (startOnboarding),
   components/layout.js (openShell, go), components/job-details.js (openJob, closeSheet) and
   pages/forgot-password.js (openForgot, closeForgot).

   Every screen has its own link, so Back / Forward, refresh and shared links work:
     /login  /signup  /forgot-password  /setup  /jobs  /saved  /my-jobs  /profile  /job?id=<job id>
   Hosts must answer these links with index.html (Cloudflare Pages does; backend/server/server.mjs
   does for any link without a file extension). */
import { S, refresh, saveUser, api, cancelSave } from "./state.js";
import { PAGE } from "./constants.js";
import { LS, toast } from "./helpers.js";
import { findJob, liveForMe } from "../services/job-store.js";
import { loadMail } from "../services/mail-tracking.js";
import { checkApply } from "../components/applications.js";
import { startNotes, stopNotes } from "../services/notifications.js";
import { clearPicks } from "../components/job-card.js";

export const ROUTE_OF_VIEW = { jobs: "jobs", saved: "saved", mine: "my-jobs", profile: "profile" };
const VIEW_OF_ROUTE = Object.fromEntries(Object.entries(ROUTE_OF_VIEW).map(([v, r]) => [r, v]));
const AUTH_ROUTES = ["login", "signup", "forgot-password"];
// the folder the app lives in: "/" on Cloudflare and the local server
const APP_BASE = location.pathname.replace(/[^/]*$/, "");
let routing = false; // true while the screen follows the URL (Back / Forward), so no new URL is added

export function currentRoute() {
  return {
    name: location.pathname.slice(APP_BASE.length).replace(/\/+$/, ""),
    id: new URLSearchParams(location.search).get("id"),
  };
}
function setRoute(name, { id, replace, state } = {}) {
  if (routing) return;
  const url = APP_BASE + name + (id ? "?id=" + encodeURIComponent(id) : "");
  if (url === location.pathname + location.search) return;
  // the first move away from the bare address ("/") replaces it, so Back doesn't land on an empty page
  history[replace || currentRoute().name === "" ? "replaceState" : "pushState"](state || {}, "", url);
}

// What the address asked for when the page opened; used once, after login if needed
const startRoute = currentRoute();
let startView = VIEW_OF_ROUTE[startRoute.name] || (startRoute.name === "job" ? "jobs" : null);
let startJob = startRoute.name === "job" ? startRoute.id : null;
let startAuth = startRoute.name;

/* ---- login screens ---- */
export function showAuth(mode) {
  if (startAuth === "signup" && mode === "login") mode = "signup";
  const forgot = startAuth === "forgot-password";
  startAuth = null;
  // no accounts in this browser and no server: the first thing anyone needs is Create account
  if (!S.SERVER && !Object.keys(S.accounts).length) mode = "signup";
  S.screen = "auth";
  S.authMode = mode;
  S.sheet = null;
  refresh();
  setRoute(mode, { replace: true });
  if (forgot) openForgot();
}
export function setAuthMode(mode) {
  S.authMode = mode;
  refresh();
  setRoute(mode, { replace: true });
}
export function openForgot() {
  S.forgotOpen = true;
  document.body.style.overflow = "hidden";
  refresh();
  setRoute("forgot-password");
}
export function closeForgot() {
  S.forgotOpen = false;
  document.body.style.overflow = "";
  refresh();
  if (currentRoute().name === "forgot-password") setRoute("login", { replace: true });
}
export function logout() {
  stopNotes(); // stop the 10-minute check, close the bell panel, drop this device's push alerts
  if (S.SERVER) {
    cancelSave();
    api("logout", {}).catch(() => {});
    LS.del("uv.token");
    // the server keeps everything, so nothing personal stays in this browser (a shared computer)
    if (S.session) {
      LS.del("uv.user." + S.session.email);
      LS.del("uv.gh." + S.session.email);
    }
  }
  LS.del("uv.session");
  S.session = null;
  S.U = null;
  S.sheet = null;
  showAuth("login");
}

/* ---- "Tell us the job you want" ---- */
export function startOnboarding() {
  S.screen = "ob";
  S.obKey = (S.obKey || 0) + 1; // a new key makes the Onboarding screen start from the saved choices again
  S.sheet = null;
  refresh();
  window.scrollTo(0, 0);
  setRoute("setup");
}

/* ---- the app after login ---- */
function markVisit() {
  const U = S.U;
  if (!U.thisVisit || Date.now() - U.thisVisit > 30 * 60e3) {
    U.lastSeen = U.thisVisit || 0;
    U.thisVisit = Date.now();
    saveUser();
  }
  S.prevSeen = U.lastSeen || 0;
}
export function openShell() {
  if (startView) {
    S.view = startView;
    startView = null;
  }
  markVisit();
  S.screen = "shell";
  go(S.view);
  liveForMe();
  loadMail();
  setTimeout(checkApply, 600);
  if (startJob) {
    const id = startJob;
    startJob = null;
    openJob(id);
    // jobs from a live search aren't kept after a refresh; saved / applied ones are
    if (S.sheet?.kind !== "job") toast("That job isn't in the list any more.");
  }
  startNotes(); // notifications: check now and every 10 minutes
}
export function go(v) {
  clearPicks(); // ticked jobs belong to the list they were ticked in
  S.view = v;
  S.shown = PAGE;
  refresh();
  window.scrollTo(0, 0);
  const main = document.getElementById("main");
  if (main) main.scrollTop = 0; // the middle box scrolls by itself on wide screens
  setRoute(ROUTE_OF_VIEW[v] || "jobs");
}

/* ---- the side panel (old #sheet): job details, hidden jobs, resume, ... ----
   S.sheet = { kind, ...props }; components/Sheet.jsx draws the kind registered with registerSheet(). */
export function openSheet(kind, props = {}) {
  S.sheet = { kind, ...props, at: Date.now() };
  refresh();
}
export function openJob(id) {
  const j = findJob(id) || S.U?.jobs[id]?.snap;
  if (!j) return;
  openSheet("job", { id });
  setRoute("job", { id, state: { job: id }, replace: currentRoute().name === "job" });
}
export function closeSheet() {
  if (!S.sheet) return;
  const wasJob = S.sheet.kind === "job" && currentRoute().name === "job";
  S.sheet = null;
  refresh();
  if (!wasJob || routing) return;
  // opened from a list in this visit: step back to that list; opened from a shared link: go to the list
  if (history.state?.job) history.back();
  else setRoute(ROUTE_OF_VIEW[S.view] || "jobs", { replace: true });
}

// Back / Forward: show the screen the address now names
function followRoute() {
  const { name, id } = currentRoute();
  if (!S.U) {
    // logged out: only the login screens
    if (name === "forgot-password") {
      if (!S.forgotOpen) openForgot();
      return;
    }
    if (S.forgotOpen) closeForgot();
    showAuth(name === "signup" ? "signup" : "login");
    return;
  }
  if (AUTH_ROUTES.includes(name)) {
    // logged in: login links lead back to the app
    history.replaceState({}, "", APP_BASE + (ROUTE_OF_VIEW[S.view] || "jobs"));
    return;
  }
  if (!S.U.onboarded || name === "setup") {
    if (S.screen !== "ob") startOnboarding();
    return;
  }
  if (name === "job" && id) {
    if (S.screen !== "shell") openShell();
    openJob(id);
    return;
  }
  if (S.sheet) closeSheet();
  const v = VIEW_OF_ROUTE[name] || "jobs";
  if (S.screen !== "shell") {
    S.view = v;
    openShell();
  } else if (v !== S.view) go(v);
}
window.addEventListener("popstate", () => {
  routing = true;
  try {
    followRoute();
  } finally {
    routing = false;
  }
});
