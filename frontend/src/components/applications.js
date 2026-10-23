/* Application tracking logic: status steps, where to check the status, "Did you apply?" after Apply.
   Ported from frontend/js/components/applications.js (the HTML parts are in Applications.jsx).
   The pop-up's state: S.applyOpen (shown), S.applyId (which job), S.applyDone (the "Application tracked" step). */
import { S, refresh } from "../core/state.js";
import { STAGES } from "../core/constants.js";
import { LS } from "../core/helpers.js";
import { closeSheet, go, openJob } from "../core/nav.js";
import { findJob, setStage } from "../services/job-store.js";

export const FLOW = ["applied", "viewed", "shortlisted", "interview", "offer"];
export const isApplied = t =>
  !!t && ["applied", "viewed", "shortlisted", "interview", "offer", "rejected"].includes(t.stage);
export const statusNote = t =>
  ({
    applied: "Waiting for the recruiter",
    viewed: "The recruiter viewed your application",
    shortlisted: "You are shortlisted",
    interview: "Interview stage: add the date and notes",
    offer: "You got an offer",
    rejected: "Not selected this time",
  })[t.stage];
// the latest update that came from an email, e.g. "LinkedIn email · 2 Oct"
export const lastMail = t => [...(t.history || [])].reverse().find(h => h.via === "email");
export const stageName = k => STAGES.find(s => s[0] === k)[1];
export const fmtShort = t =>
  t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
export const fmtWhen = t =>
  new Date(t).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
export function stageDate(t, k) {
  const h = [...(t.history || [])].reverse().find(x => x.stage === k);
  return h?.at || (k === "applied" ? t.appliedAt : k === "saved" ? t.savedAt : null);
}
// The steps to show: Applied -> Viewed -> Shortlisted -> Interview -> Offer; "Not selected" ends in a red
// step after the last stage reached. Returns [{ k, done, now }] for <Stepper>.
export function stepperSteps(t) {
  const closed = t.stage === "rejected";
  const reached = closed
    ? [...(t.history || [])].reverse().find(h => FLOW.includes(h.stage))?.stage || "applied"
    : t.stage;
  const cur = Math.max(0, FLOW.indexOf(reached)),
    steps = closed ? [...FLOW.slice(0, cur + 1), "rejected"] : FLOW;
  return steps.map((k, i) => ({ k, done: closed || i <= cur, now: closed ? k === "rejected" : i === cur }));
}
// Where the real status lives: each job site's own "applied jobs" page (Viewed, Shortlisted, Not selected...).
// Judged from the link the person opened to apply, else the site the job came from. null = no such page.
export const STATUS_PAGES = [
  ["linkedin", "LinkedIn", "https://www.linkedin.com/my-items/saved-jobs/?cardType=APPLIED"],
  ["naukri", "Naukri", "https://www.naukri.com/myapply/historypage"],
  ["indeed", "Indeed", "https://myjobs.indeed.com/applied"],
  ["internshala", "Internshala", "https://internshala.com/student/applications/"],
];
export function statusPage(j) {
  const url = String(j.url || ""),
    m = url.match(/^https:\/\/([^/]+\.myworkdayjobs\.com)\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/);
  if (m) return { site: j.company || "company site", url: `https://${m[1]}/${m[2]}/userHome` }; // Workday: the company's candidate home
  const where = (url.match(/^https?:\/\/([^/]+)/)?.[1] || "") + " " + (j.source || ""),
    hit = STATUS_PAGES.find(([k]) => where.toLowerCase().includes(k));
  return hit ? { site: hit[1], url: hit[2] } : null;
}
// After going to My jobs: scroll to this application and make it glow for a moment
export function flashApp(id) {
  // two frames: the first lets React draw the My jobs list
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-app="${CSS.escape(id)}"]`);
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 2200);
    })
  );
}

/* after Apply opens the job site, ask when the person comes back to this tab */
let pendingApply = null;
export function noteApply(id) {
  if (isApplied(S.U.jobs[id]) && S.U.jobs[id].stage !== "rejected") return;
  pendingApply = { id, at: Date.now() };
  LS.set("uv.pendingApply", pendingApply);
}
export function clearApply() {
  pendingApply = null;
  LS.del("uv.pendingApply");
}
export function checkApply() {
  const p = pendingApply || LS.get("uv.pendingApply", null);
  if (!p || !S.U || S.screen !== "shell" || document.visibilityState !== "visible" || S.applyOpen) return;
  if (Date.now() - p.at < 1500) return;
  clearApply();
  if (Date.now() - p.at < 6 * 36e5) openApplyCheck(p.id);
}
document.addEventListener("visibilitychange", () => setTimeout(checkApply, 300));
window.addEventListener("focus", () => setTimeout(checkApply, 300));

export function openApplyCheck(id) {
  const j = findJob(id) || S.U.jobs[id]?.snap;
  if (!j) return;
  S.applyId = id;
  S.applyDone = false;
  S.applyOpen = true;
  refresh();
}
export function closeApply() {
  S.applyOpen = false;
  refresh();
}
// "Yes, I applied" in the pop-up; markApplied(id) is the "I applied to this job" button in the job details
export function markApplied(id) {
  if (id) S.applyId = id;
  const apId = S.applyId;
  setStage(apId, "applied");
  if (S.sheet) openJob(apId);
  S.applyDone = true;
  S.applyOpen = true;
  refresh();
}
// "Keep browsing": back to the list, not the job's details
export function keepBrowsing() {
  closeApply();
  closeSheet();
}
export function viewApplication() {
  closeApply();
  closeSheet();
  go("mine");
  flashApp(S.applyId);
}
