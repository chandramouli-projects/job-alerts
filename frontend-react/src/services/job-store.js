/* All jobs, live search, and saved / applied jobs. Ported from frontend/js/services/job-store.js */
import { S, refresh, saveUser } from "../core/state.js";
import { ROLES, PREVIEW } from "../core/constants.js";
import { toast, cleanJob, fixText, normQuery, splitList } from "../core/helpers.js";
import { isApplied } from "../components/applications.js";

export function allJobs() {
  return [...S.U.manual, ...S.data.jobs];
}
/* Live search: fresh jobs for any role, from the Worker set in backend/collector/config.json "live_search_url" */
export function searchParts(s) {
  const m = s.trim().match(/^(.*?)\s+(?:jobs?\s+)?in\s+([a-z .]+)$/i);
  return {
    what: (m ? m[1] : s)
      .replace(/\bjobs?\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim(),
    where: m ? m[2].trim() : "",
  };
}
// The words a known role is written with, for the live search to ask "any of these" (ROLES in constants.js):
// "QA Testing" -> "qa,tester,testing,sdet,quality assurance,...". Unknown words: none (searched as typed).
export function roleWords(what) {
  const n = normQuery(what).replace(/\s+/g, " ");
  const role = Object.keys(ROLES).find(
    r => normQuery(r).replace(/\s+/g, " ") === n || ROLES[r].some(k => k.trim().replace(/[-/]$/, "") === n)
  );
  return role ? [...new Set(ROLES[role].map(k => k.trim().replace(/[-/]$/, "")).filter(Boolean))] : [];
}
export async function liveSearch(what, where = "") {
  const api = (S.data.live_api || "").replace(/\/$/, ""),
    key = (what + "|" + where).toLowerCase(),
    any = roleWords(what);
  if (!api || PREVIEW || what.length < 2 || S.liveDone.has(key)) return;
  S.liveDone.add(key);
  S.liveBusy++;
  refresh();
  try {
    const r = await (
      await fetch(
        `${api}/search?q=${encodeURIComponent(what)}&where=${encodeURIComponent(where)}${any.length ? `&any=${encodeURIComponent(any.join(","))}` : ""}`
      )
    ).json();
    // Both job search limits used up: say so once; the saved jobs still show
    if (r.limit) {
      if (!S.liveLimitSaid) {
        S.liveLimitSaid = true;
        toast(r.error);
      }
      S.liveDone.delete(key);
    }
    // Jobs the Worker found by a related title remember this search, so they show for it too
    const byId = new Map(S.data.jobs.map(j => [j.id, j])),
      tag = normQuery(what);
    for (const j of r.jobs || []) {
      const have = byId.get(j.id) || j;
      if (j.related) have.searches = [...new Set([...(have.searches || []), tag])];
      if (have === j && cleanJob(j).url) {
        byId.set(j.id, j);
        S.data.jobs.push(j);
      } else if (have !== j) mergeDuplicate(have, j); // same job from another site: one card, every place to apply
    }
  } catch (e) {
    S.liveDone.delete(key);
  }
  S.liveBusy--;
  refresh();
}
export function liveForMe() {
  const p = S.U.prefs,
    cities = p.cities.filter(c => c !== "Remote" && c !== "Anywhere in India");
  const roles = [...p.roles.map(r => r.replace(" / ", " ")), ...splitList(p.custom)].slice(0, 4);
  roles.forEach(r => {
    if (cities.length || !p.cities.includes("Remote")) liveSearch(r, cities.length === 1 ? cities[0] : "");
    if (p.cities.includes("Remote")) liveSearch(r, "Remote");
  });
}
// The Role / City / Remote filters also fetch fresh jobs for what was picked
export function liveForFilters() {
  const F = S.F;
  if (!F.role && !F.city && !F.remote) return;
  const p = S.U.prefs,
    roles = F.role
      ? [F.role.replace(" / ", " ")]
      : [...p.roles.map(r => r.replace(" / ", " ")), ...splitList(p.custom)].slice(0, 2);
  const where = F.remote || F.city === "Remote" ? "Remote" : F.city && F.city !== "India" ? F.city : "";
  roles.forEach(r => liveSearch(r, where));
}
export function findJob(id) {
  return allJobs().find(j => j.id === id);
}
export function track(id) {
  const U = S.U;
  return U.jobs[id] || (U.jobs[id] = { stage: null, saved: false, notes: "", history: [] });
}
export function setStage(id, stage) {
  const t = track(id);
  if (t.stage === stage) return;
  t.stage = stage;
  t.history.push({ stage, at: Date.now() });
  if (stage === "applied" && !t.appliedAt) t.appliedAt = Date.now();
  if (!t.snap) {
    const j = findJob(id);
    if (j) t.snap = j;
  } // keep job details even after it leaves the feed
  saveUser();
}
export function toggleSave(id) {
  const t = track(id);
  t.saved = !t.saved;
  if (t.saved) t.savedAt = Date.now();
  if (t.saved && !t.snap) t.snap = findJob(id);
  saveUser();
  return t.saved;
}
export function tracked() {
  return Object.entries(S.U.jobs)
    .map(([id, t]) => ({
      ...cleanJob({ ...(findJob(id) || t.snap || { id, title: "Job no longer listed", company: "" }) }),
      id,
      _t: t,
    }))
    .filter(j => j.title);
}
/* an applied job never shows again, even when another site lists the same job under a new id */
export const jobKey = j =>
  (fixText(j.title || "") + "|" + fixText(j.company || "")).toLowerCase().replace(/[^a-z0-9|]+/g, "");
export function appliedKeys() {
  return new Set(
    Object.entries(S.U.jobs)
      .filter(([, t]) => isApplied(t))
      .map(([id, t]) => jobKey(findJob(id) || t.snap || {}))
  );
}
export const wasApplied = (j, keys) => isApplied(S.U.jobs[j.id]) || keys.has(jobKey(j));

/* The same job (same id = same title and company) from another site: keep one card with every
   place to apply, the company's own page first. Same rule as merge_duplicate in fetch_jobs.py. */
export function mergeDuplicate(keep, dup) {
  const own = j =>
    j.apply_links?.length
      ? j.apply_links
      : j.url
        ? [{ site: j.source || "", url: j.url, direct: !!j.direct }]
        : [];
  const links = [...own(keep)],
    seen = new Set(links.map(l => l.url));
  for (const l of own(dup))
    if (l.url && !seen.has(l.url)) {
      links.push(l);
      seen.add(l.url);
    }
  keep.apply_links = links.sort((a, b) => !!b.direct - !!a.direct).slice(0, 6);
  if (dup.direct && !keep.direct) {
    keep.url = dup.url;
    keep.direct = true;
  }
  if (!keep.salary && dup.salary) keep.salary = dup.salary;
}
