/* Owner only: send preferences to backend/collector/config.json on GitHub (Telegram alerts).
   Ported from frontend/js/services/github-sync.js; the "Connect job search" panel is in GithubSync.jsx. */
import { S, refresh, saveUser } from "../core/state.js";
import { PREVIEW } from "../core/constants.js";
import { toast, splitList } from "../core/helpers.js";
import { openSheet, closeSheet } from "../core/nav.js";
import { mySkills } from "./matching.js";

// The line under "Connection key" on the Profile page (old #syncMsg). Read it as `syncMsg`.
export let syncMsg = "";
function say(text) {
  syncMsg = text;
  refresh();
}

export async function syncPrefs(silent) {
  const st = S.U.settings;
  if (PREVIEW || !st.ghToken) {
    if (!silent)
      say(
        PREVIEW
          ? "Saved here. Connects to the job search on your live site."
          : "Saved. Connect the search to apply this to Telegram alerts."
      );
    return;
  }
  say("Updating your job search…");
  const api = `https://api.github.com/repos/${st.ghRepo}/contents/backend/collector/config.json`,
    H = { Authorization: "Bearer " + st.ghToken, Accept: "application/vnd.github+json" };
  try {
    const cur = await (await fetch(api, { headers: H })).json();
    if (!cur.content) throw new Error(cur.message || "no access");
    const cfg = JSON.parse(decodeURIComponent(escape(atob(cur.content.replace(/\n/g, "")))));
    const p = S.U.prefs,
      roles = [...p.roles, ...splitList(p.custom)];
    cfg.alerts = Object.assign(cfg.alerts || {}, {
      experience_years: p.exp,
      roles,
      skills: mySkills(p),
      locations: p.cities.filter(c => c !== "Remote" && c !== "Anywhere in India"),
      include_remote: p.cities.includes("Remote") || p.cities.includes("Anywhere in India"),
      telegram_enabled: st.telegram,
      min_match: st.minMatch,
    });
    const body = JSON.stringify(cfg, null, 2);
    const r = await fetch(api, {
      method: "PUT",
      headers: H,
      body: JSON.stringify({
        message: "Update preferences from app",
        content: btoa(unescape(encodeURIComponent(body))),
        sha: cur.sha,
      }),
    });
    if (!r.ok) throw new Error((await r.json()).message);
    say("Job search updated. Takes effect from the next search.");
    if (!silent) toast("Job search updated");
  } catch (e) {
    say("Couldn't update the job search: " + e.message + ". Check the connection key.");
  }
}

// The Profile page's "Connect" / "Change" button (old data-gh)
export function openGh() {
  openSheet("gh");
}
// The panel's Connect button (old data-ghsave); token and repo are what was typed in the panel
export function ghSave(token, repo) {
  S.U.settings.ghToken = token.trim();
  S.U.settings.ghRepo = repo.trim() || "chandramouli-projects/job-alerts";
  saveUser();
  closeSheet();
  refresh();
  syncPrefs();
}
