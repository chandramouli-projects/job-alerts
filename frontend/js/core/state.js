/* The logged-in person, the jobs list, current filters, and saving to the server / browser */
let accounts = LS.get("uv.accounts", {});
let session = LS.get("uv.session", null);
let U = null; // current user's data
let data = { jobs: [] };
let liveBusy = 0;
const liveDone = new Set(); // live searches (backend/worker/worker.js) running and already done
let liveLimitSaid = false; // "limit reached" message shown once per visit
let view = "jobs",
  shown = PAGE;
let F = {
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
let prevSeen = 0;
let filtersOpen = false;

function blankUser(name, email, phone) {
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
/* Accounts: kept by backend/server/server.mjs when the app runs from it (same login on every device),
   otherwise only in this browser */
let SERVER = false,
  saveT;
function withDefaults(u, name, email) {
  const b = blankUser(name, email, "");
  if (!u) return b;
  return {
    ...b,
    ...u,
    profile: { ...b.profile, ...u.profile, email },
    prefs: { ...b.prefs, ...u.prefs },
    settings: { ...b.settings, ...u.settings },
  };
}
async function api(path, body, method) {
  const t = LS.get("uv.token", "");
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
function saveUser() {
  if (!session) return;
  LS.set("uv.user." + session.email, U);
  if (SERVER) {
    const u = U;
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      saveT = null;
      api("user", u, "PUT").catch(e => toast(e.message));
    }, 500);
  }
}
// Leaving or refreshing the page inside that half second: send the waiting save now, so nothing is lost
addEventListener("pagehide", () => {
  if (!saveT || !SERVER || !U) return;
  clearTimeout(saveT);
  saveT = null;
  const body = JSON.stringify(U);
  fetch("api/user", {
    method: "PUT",
    keepalive: body.length < 60000,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + LS.get("uv.token", "") },
    body,
  }).catch(() => {});
});
function applyTheme() {
  const t = U?.settings.theme || "system";
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = t;
}
