/* Start: load jobs, check the server, then open login, onboarding or the app.
   Ported from frontend/js/core/app.js; App.jsx calls boot() once. */
import { S, api, withDefaults, applyTheme } from "./state.js";
import { PREVIEW } from "./constants.js";
import { LS, cleanJob } from "./helpers.js";
import { showAuth, startOnboarding, openShell } from "./nav.js";

export async function boot() {
  let data;
  try {
    data = PREVIEW ? window.__JOBS__ : await (await fetch("data/jobs.json?t=" + Date.now())).json();
  } catch (e) {
    data = { jobs: [] };
  }
  if (!data || typeof data !== "object") data = {};
  data.jobs = (Array.isArray(data.jobs) ? data.jobs : []).map(cleanJob).filter(j => j && j.url); // a broken jobs file still opens the app
  S.data = data;
  // Only an accounts server answers {"ok":true}; some hosts answer any unknown link with the home page
  if (!PREVIEW) {
    try {
      S.SERVER = (await (await fetch("api/ping")).json()).ok === true;
    } catch (e) {}
  }
  const session = S.session;
  if (S.SERVER) {
    if (session && LS.get("uv.token", "")) {
      try {
        const d = await api("user");
        S.U = withDefaults(d.user, d.name, session.email);
        applyTheme();
        return S.U.onboarded ? openShell() : startOnboarding();
      } catch (e) {
        LS.del("uv.token");
      }
    }
    return showAuth("login");
  }
  if (session && S.accounts[session.email]) {
    S.U = LS.get("uv.user." + session.email, null);
    if (S.U) {
      applyTheme();
      return S.U.onboarded ? openShell() : startOnboarding();
    }
  }
  showAuth("login");
}

// Loading screen (in index.html): stays at least 0.9 s from page start so it doesn't just flash, then fades out
export function hideBoot() {
  const b = document.getElementById("boot");
  if (!b) return;
  setTimeout(
    () => {
      b.classList.add("done");
      setTimeout(() => b.remove(), 350);
    },
    Math.max(0, 900 - performance.now())
  );
}
