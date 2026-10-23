/* Hidden jobs: hiding one (card Hide, details "Not interested", or several picked) shows "Undo" for a few
   seconds; the Jobs page shows "N hidden", which opens the list of hidden jobs to unhide them.
   Ported from frontend/js/components/hidden-jobs.js; the link and panel are in HiddenJobs.jsx. */
import { S, refresh, saveUser } from "../core/state.js";
import { toast } from "../core/helpers.js";
import { openSheet, closeSheet } from "../core/nav.js";
import { findJob } from "../services/job-store.js";
import { picked } from "./job-card.js";

export const UNDO_MS = 6000;

export function hideJobs(ids) {
  const U = S.U,
    fresh = [...new Set(ids)].filter(id => !U.hidden[id]);
  if (!fresh.length) return;
  fresh.forEach(id => {
    U.hidden[id] = 1;
    picked.delete(id);
  });
  saveUser();
  refresh();
  toast(fresh.length === 1 ? "Job hidden" : `${fresh.length} jobs hidden`, "", {
    ms: UNDO_MS,
    act: {
      label: "Undo",
      run: () => {
        fresh.forEach(id => delete S.U.hidden[id]);
        saveUser();
        refresh();
        toast("Back in your feed", "ok");
      },
    },
  });
}
export function unhideJobs(ids) {
  ids.forEach(id => delete S.U.hidden[id]);
  saveUser();
  refresh();
}

// hidden jobs that are still listed (others have left the job list)
export const hiddenListed = () =>
  Object.keys(S.U?.hidden || {})
    .map(id => findJob(id) || S.U.jobs[id]?.snap)
    .filter(j => j && j.title);

export function openHiddenJobs() {
  openSheet("hidden");
}
export function unhideOne(id) {
  unhideJobs([id]);
  toast("Back in your feed", "ok");
  if (!hiddenListed().length) closeSheet();
}
export function unhideAll() {
  const n = Object.keys(S.U.hidden).length;
  unhideJobs(Object.keys(S.U.hidden));
  closeSheet();
  toast(`${n} job${n === 1 ? "" : "s"} back in your feed`, "ok");
}
// "Not interested" in the job details: close it and hide the job, with Undo
export function notInterested(id) {
  closeSheet();
  hideJobs([id]);
}
