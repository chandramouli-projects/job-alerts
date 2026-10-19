/* URL router: every screen has its own link, so Back / Forward, refresh and shared links work.
     /login  /signup  /forgot-password  /setup  /jobs  /saved  /my-jobs  /profile  /job?id=<job id>
   It wraps the screen functions from the other files (showAuth, startOnboarding, openShell, go,
   openJob, closeSheet, openForgot, closeForgot), so those files don't need to know about URLs.
   Load it after the screen files and before app.js. Hosts must answer these links with index.html
   (Cloudflare Pages does; backend/server/server.mjs does for any link without a file extension). */
const ROUTE_OF_VIEW = { jobs: "jobs", saved: "saved", mine: "my-jobs", profile: "profile" };
const VIEW_OF_ROUTE = Object.fromEntries(Object.entries(ROUTE_OF_VIEW).map(([v, r]) => [r, v]));
const AUTH_ROUTES = ["login", "signup", "forgot-password"];
// the folder the app lives in: "/" on Cloudflare and the local server, "/job-alerts/" on GitHub Pages
const APP_BASE = location.pathname.replace(/[^/]*$/, "");
let routing = false; // true while the screen follows the URL (Back / Forward), so no new URL is added

function currentRoute() {
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

const _showAuth = showAuth;
showAuth = function (mode) {
  if (startAuth === "signup" && mode === "login") mode = "signup";
  const forgot = startAuth === "forgot-password";
  startAuth = null;
  _showAuth(mode);
  setRoute($("signupView").hidden ? "login" : "signup", { replace: true });
  if (forgot) openForgot();
};
const _startOnboarding = startOnboarding;
startOnboarding = function () {
  _startOnboarding();
  setRoute("setup");
};
const _openShell = openShell;
openShell = function () {
  if (startView) {
    view = startView;
    startView = null;
  }
  _openShell();
  if (startJob) {
    const id = startJob;
    startJob = null;
    openJob(id);
    // jobs from a live search aren't kept after a refresh; saved / applied ones are
    if (!$("sheet").classList.contains("open")) toast("That job isn't in the list any more.");
  }
};
const _go = go;
go = function (v) {
  _go(v);
  setRoute(ROUTE_OF_VIEW[v] || "jobs");
};
const _openJob = openJob;
openJob = function (id) {
  _openJob(id);
  if ($("sheet").classList.contains("open"))
    setRoute("job", { id, state: { job: id }, replace: currentRoute().name === "job" });
};
const _closeSheet = closeSheet;
closeSheet = function () {
  const wasJob = $("sheet").classList.contains("open") && currentRoute().name === "job";
  _closeSheet();
  if (!wasJob || routing) return;
  // opened from a list in this visit: step back to that list; opened from a shared link: go to the list
  if (history.state?.job) history.back();
  else setRoute(ROUTE_OF_VIEW[view] || "jobs", { replace: true });
};
const _openForgot = openForgot;
openForgot = function () {
  _openForgot();
  setRoute("forgot-password");
};
const _closeForgot = closeForgot;
closeForgot = function () {
  _closeForgot();
  if (currentRoute().name === "forgot-password") setRoute("login", { replace: true });
};
// these buttons were wired to the functions directly; wire them to the URL-aware ones
$("toForgot").onclick = () => openForgot();
$("fpX").onclick = () => closeForgot();
$("sheetX").onclick = $("scrim").onclick = () => closeSheet();
$("toLogin").addEventListener("click", () => setRoute("login", { replace: true }));

// Back / Forward: show the screen the address now names
function followRoute() {
  const { name, id } = currentRoute();
  if (!U) {
    // logged out: only the login screens
    if (name === "forgot-password") {
      if ($("fpModal").hidden) openForgot();
      return;
    }
    if (!$("fpModal").hidden) closeForgot();
    showAuth(name === "signup" ? "signup" : "login");
    return;
  }
  if (AUTH_ROUTES.includes(name)) {
    // logged in: login links lead back to the app
    history.replaceState({}, "", APP_BASE + (ROUTE_OF_VIEW[view] || "jobs"));
    return;
  }
  if (!U.onboarded || name === "setup") {
    if ($("ob").hidden) startOnboarding();
    return;
  }
  if (name === "job" && id) {
    if ($("shell").hidden) openShell();
    openJob(id);
    return;
  }
  if ($("sheet").classList.contains("open")) closeSheet();
  const v = VIEW_OF_ROUTE[name] || "jobs";
  if ($("shell").hidden) {
    view = v;
    openShell();
  } else if (v !== view) go(v);
}
window.addEventListener("popstate", () => {
  routing = true;
  try {
    followRoute();
  } finally {
    routing = false;
  }
});
