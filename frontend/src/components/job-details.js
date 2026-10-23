/* Job details panel: its data and button actions. The panel is JobDetails.jsx; ask() is in Ask.jsx and
   openJob / closeSheet are in core/nav.js. Ported from frontend/js/components/job-details.js. */
import { S, refresh, saveUser } from "../core/state.js";
import { hasWord, toast } from "../core/helpers.js";
import { closeSheet, go } from "../core/nav.js";
import { ask } from "./Ask.jsx";
import { evaluate, mySkills, taste, tasteScore } from "../services/matching.js";
import { allJobs, appliedKeys, wasApplied, track } from "../services/job-store.js";
import { resetFilters } from "./filters.js";

export const JD_POSTED =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';

// skills the job asks for that are not in the profile ("node" counts for "node.js")
export function skillCheck(j) {
  const mine = mySkills(S.U.prefs),
    haveSkill = s => mine.some(m => hasWord(s, m) || hasWord(m, s)),
    missing = mine.length ? (j.tech || []).filter(s => !haveSkill(s)) : [];
  return { haveSkill, missing };
}
// the reasons it fits (or not), plus what it learned from saved / applied / hidden jobs
export function whyList(j, e) {
  const ts = tasteScore(j, taste());
  return [
    ...e.why,
    ...(ts > 0
      ? [[true, "Like jobs you saved or applied to"]]
      : ts < 0
        ? [[false, "Like jobs you hid"]]
        : []),
  ];
}
export function similarJobs(j, id) {
  const U = S.U,
    applied = appliedKeys();
  return allJobs()
    .filter(
      x =>
        x.id !== id &&
        !U.hidden[x.id] &&
        !wasApplied(x, applied) &&
        evaluate(x, U.prefs).ok &&
        (x.role === j.role || x.company === j.company)
    )
    .slice(0, 3);
}
// profile details to copy into a job site's form
export function quickCopyItems() {
  const P = S.U.profile;
  return [
    ["Name", P.name],
    ["Email", P.email],
    ["Phone", P.phone],
    ["LinkedIn", P.linkedin],
    ["Resume link", P.resume],
    ["Expected salary", P.expectedCtc],
    ["Notice period", P.notice],
  ].filter(x => x[1]);
}
export function saveNotes(id, text, j) {
  track(id).notes = text;
  if (!S.U.jobs[id].snap) S.U.jobs[id].snap = j;
  saveUser();
  toast("Notes saved");
}
// the company name: every job at that company
export function showCompany(company) {
  closeSheet();
  resetFilters();
  S.F.forYou = false;
  S.F.company = company;
  S.filtersOpen = true;
  go("jobs");
}
// jobs added by hand in older versions can still be deleted
export async function deleteManual(id) {
  if (!(await ask("Delete this job?", "The job and your notes on it will be removed.", "Delete", true)))
    return;
  S.U.manual = S.U.manual.filter(j => j.id !== id);
  delete S.U.jobs[id];
  saveUser();
  closeSheet();
  refresh();
  toast("Job deleted");
}
