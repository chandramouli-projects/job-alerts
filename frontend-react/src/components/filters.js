/* Jobs page filters: what is picked (S.F), which jobs pass, and the filter panel's logic.
   Ported from frontend/js/components/filters.js; the panel itself is components/Filters.jsx. */
import { S, refresh, FILTER_START } from "../core/state.js";
import { PAGE, EXP, SENIOR, JUNIOR } from "../core/constants.js";
import { normQuery, when } from "../core/helpers.js";
import { evaluate, roleHitFor, taste, tasteScore, isRemote, myRoleHit } from "../services/matching.js";
import { allJobs, searchParts, appliedKeys, wasApplied, liveForFilters } from "../services/job-store.js";
import { searchGroups, matchesSearch, setSearchFixes } from "../services/smart-search.js";
import { insightBoost } from "../services/job-insights.js";

export function resetFilters() {
  S.F = { ...FILTER_START };
  S.shown = PAGE;
}
export function salaryLpa(j) {
  const m = String(j.salary || "").match(/([\d.]+)(?:\s*[–-]\s*([\d.]+))?\s*LPA/i);
  return m ? parseFloat(m[2] || m[1]) : null;
}
export const isNew = j => S.prevSeen > 0 && new Date(j.found) > S.prevSeen;
// one name per job type: sites write "Full-time", "Full–time", "FULLTIME", "full_time"
export function jobType(j) {
  const t = String(j.type || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return !t
    ? "Not stated"
    : t.startsWith("full")
      ? "Full-time"
      : t.startsWith("part")
        ? "Part-time"
        : /contract/.test(t)
          ? "Contract"
          : /intern/.test(t)
            ? "Internship"
            : j.type;
}
export function feed() {
  const F = S.F,
    U = S.U,
    sp = searchParts(F.q.toLowerCase()),
    q = sp.what,
    qTag = normQuery(q),
    where = sp.where.replace("bengaluru", "bangalore"),
    out = [],
    applied = appliedKeys(),
    tw = taste();
  // smart search (services/smart-search.js): other names for the same thing, and spelling fixes
  const smart = q ? searchGroups(q) : { groups: [], fixed: {} };
  setSearchFixes(smart.fixed); // spelling fixes in the last search, shown on the Jobs page
  // A Role / City / Remote filter picked here wins over the saved answers for "Jobs for me"
  const p = {
    ...U.prefs,
    ...(F.role ? { roles: [F.role], custom: "" } : {}),
    ...(F.exp !== "" ? { exp: +F.exp } : {}),
    ...(F.remote || F.city === "Remote"
      ? { cities: ["Remote"] }
      : F.city
        ? { cities: [F.city === "India" ? "Anywhere in India" : F.city] }
        : {}),
  };
  for (const j of allJobs()) {
    if (U.hidden[j.id]) continue;
    if (U.jobs[j.id]?.stage || wasApplied(j, applied)) continue;
    if (!j.manual && !((Date.now() - new Date(when(j))) / 864e5 <= F.days)) continue; // no date or a bad date: not shown, it can't be proved recent
    if (F.company && j.company !== F.company) continue;
    // A search shows jobs that have every word, plus related jobs the live search found for it
    const exact =
      !q ||
      matchesSearch(
        [j.title, j.company, j.location, j.city_norm, (j.tech || []).join(" "), j.description].join(" "),
        smart.groups
      );
    if (!exact && !(j.searches || []).includes(qTag)) continue;
    if (
      where &&
      !(j.location + " " + (j.city_norm || ""))
        .toLowerCase()
        .replace("bengaluru", "bangalore")
        .includes(where)
    )
      continue;
    if (F.remote && !isRemote(j)) continue;
    if (F.type && jobType(j) !== F.type) continue;
    if (F.source && (j.direct ? "Company site" : j.source) !== F.source) continue;
    if (F.city && (F.city === "Remote" ? !isRemote(j) : (j.city_norm || "India") !== F.city)) continue;
    if (F.role && !roleHitFor(j.title, F.role)) continue;
    if (F.exp !== "") {
      const x = +F.exp;
      if (j.exp_min != null && (j.exp_min > x + 1 || (j.exp_max != null && j.exp_max < x - 1))) continue;
      if (x < 5 && SENIOR.test(j.title)) continue;
      if (x >= 2 && JUNIOR.test(j.title)) continue;
    }
    if (F.minSal !== "") {
      const s = salaryLpa(j);
      if (s == null || s < +F.minSal) continue;
    }
    const ev = evaluate(j, p);
    if (F.forYou && !q && !ev.ok) continue; // a search shows every match, not only my roles
    out.push({ ...j, _e: ev, _rel: !exact, _t: tasteScore(j, tw) + insightBoost(j) }); // insightBoost: services/job-insights.js
  }
  // exact matches first, then related ones
  // Best fit: fresh jobs first (posted in the last 24 hours, then 3 days, then older), best fit inside each
  const fresh = j => {
    const d = (Date.now() - new Date(when(j))) / 864e5;
    return d <= 1 ? 0 : d <= 3 ? 1 : 2;
  };
  out.sort(
    (a, b) =>
      a._rel - b._rel ||
      (F.sort === "new"
        ? new Date(when(b)) - new Date(when(a))
        : fresh(a) - fresh(b) ||
          isNew(b) - isNew(a) ||
          b._e.score + b._t - a._e.score - a._t ||
          new Date(when(b)) - new Date(when(a)))
  );
  return out;
}
// What the person picked, as removable chips next to the job count: [key, label]
export function activeFilters() {
  const F = S.F,
    days = { 1: "Last 24 hours", 3: "Last 3 days", 21: "Last 3 weeks" };
  return [
    !F.forYou && ["forYou", "All jobs"],
    F.role && ["role", F.role],
    F.exp !== "" && ["exp", EXP.find(x => String(x[0]) === String(F.exp))?.[1]],
    F.city && ["city", F.city],
    F.days !== 7 && ["days", days[F.days]],
    F.minSal && ["minSal", `${F.minSal} LPA and above`],
    F.company && ["company", F.company],
    F.source && ["source", F.source],
    F.type && ["type", F.type],
    F.remote && ["remote", "Remote only"],
    F.sort !== "match" && ["sort", "Newest first"],
  ].filter(Boolean);
}
export function clearFilter(k) {
  const d = { forYou: true, days: 7, remote: false, sort: "match" };
  S.F[k] = k in d ? d[k] : "";
  S.shown = PAGE;
  refresh();
}
// "Clear all": every filter back, the search text stays
export function clearAllFilters() {
  const q = S.F.q;
  resetFilters();
  S.F.q = q;
  refresh();
}
export const fitLabel = e => (!e.ok ? "" : e.score >= 80 ? "Great fit" : "Good fit");

/* The Filters pop-up. Changes wait in a draft until "Show N jobs"; × or Esc throws them away. */
export const FILTER_DEFAULTS = {
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
// how many jobs a set of filters would show: the same rule as the Jobs page, related role jobs when nothing matches
export function countFor(f) {
  const keep = S.F;
  S.F = { ...f, q: keep.q };
  try {
    let n = feed().length;
    if (!n && S.F.forYou && !S.F.q.trim()) {
      S.F.forYou = false;
      n = feed().filter(j => myRoleHit(j.title, S.U.prefs)).length;
    }
    return n;
  } finally {
    S.F = keep;
  }
}
export function filterCountLabel(fd) {
  const n = countFor(fd);
  return `Show ${n} job${n === 1 ? "" : "s"}`;
}
// the choices in each dropdown that depend on the jobs we have
export function filterChoices() {
  const uniq = f => [...new Set(allJobs().map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    cities: uniq(j => j.city_norm || "India"),
    types: uniq(jobType),
    companies: uniq(j => j.company),
    sources: uniq(j => (j.direct ? "Company site" : j.source)),
  };
}
// "Show N jobs": use the draft, back to the first page, and fetch fresh jobs for a new role / city
export function applyFilters(fd) {
  const moved = ["role", "city", "remote"].some(k => fd[k] !== S.F[k]);
  S.F = { ...fd, q: S.F.q };
  S.shown = PAGE;
  refresh();
  if (moved) liveForFilters();
}
