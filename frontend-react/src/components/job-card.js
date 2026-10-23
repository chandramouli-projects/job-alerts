/* One job in a list: the small helpers, the picked jobs and the card buttons' actions.
   Ported from frontend/js/components/job-card.js; the card itself is components/JobCard.jsx. */
import { S, refresh, saveUser } from "../core/state.js";
import { ago, when, toast } from "../core/helpers.js";
import { isRemote } from "../services/matching.js";
import { toggleSave, track, findJob } from "../services/job-store.js";
import { hideJobs } from "./hidden-jobs.js";

export const CARD_ICON = {
  exp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12.5h18"/></svg>',
  pay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10M7 8.5h10M9.5 4c3.6 0 5.5 2 5.5 4.5S13.1 13 9.5 13H7l8 7"/></svg>',
  where:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  desc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
  hide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a12.8 12.8 0 0 1-3.2 4.3M6.6 6.6C4.3 8 2.7 10.2 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.6-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
};
// skill names as people write them ("sql" -> "SQL", "spring boot" -> "Spring Boot")
export const SKILL_NAME = {
  sql: "SQL",
  aws: "AWS",
  gcp: "GCP",
  html: "HTML",
  css: "CSS",
  "c#": "C#",
  ".net": ".NET",
  rest: "REST",
  "power bi": "Power BI",
  "node.js": "Node.js",
  node: "Node.js",
  javascript: "JavaScript",
  typescript: "TypeScript",
  mongodb: "MongoDB",
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  graphql: "GraphQL",
  ios: "iOS",
  devops: "DevOps",
  sap: "SAP",
  "next.js": "Next.js",
  "react native": "React Native",
  php: "PHP",
  "ci/cd": "CI/CD",
  "ui/ux": "UI/UX",
};
export const skillName = s =>
  SKILL_NAME[s] || String(s).replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase());
export const cardExp = j =>
  j.exp_min == null
    ? ""
    : j.exp_max != null && j.exp_max !== j.exp_min
      ? `${j.exp_min}-${j.exp_max} Yrs`
      : `${j.exp_min}+ Yrs`;
export function cardPlace(j) {
  const loc = String(j.location || "")
    .split(",")
    .map(s => s.trim())
    .filter(s => s && !/^india$/i.test(s))
    .slice(0, 2)
    .join(", ");
  if (isRemote(j)) return loc && !/remote/i.test(loc) ? `${loc} · Remote` : "Remote";
  return loc || j.city_norm || "India";
}
export const cardAgo = j => ago(when(j)).replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase()); // "2 days ago" -> "2 Days Ago"

/* picking several jobs: a bar at the bottom (PickBar in JobCard.jsx) saves or hides them together */
export const picked = new Set();
export function pick(id, on) {
  on ? picked.add(id) : picked.delete(id);
  refresh();
}
export function clearPicks() {
  picked.clear();
  refresh();
}
export function savePicked() {
  for (const id of picked) {
    const tr = track(id);
    if (!tr.saved) {
      tr.saved = true;
      tr.savedAt = Date.now();
      tr.snap ||= findJob(id);
    }
  }
  const n = picked.size;
  picked.clear();
  saveUser();
  refresh();
  toast(`Saved ${n} job${n === 1 ? "" : "s"}`, "ok");
}
export function hidePicked() {
  const ids = [...picked];
  picked.clear();
  hideJobs(ids);
  refresh();
}

// the Save / Saved button on a card or in the job details
export function saveJob(id) {
  const s = toggleSave(id);
  toast(s ? "Saved to Saved jobs" : "Removed from Saved jobs");
  refresh();
  return s;
}
export const isSaved = id => !!S.U?.jobs[id]?.saved;
