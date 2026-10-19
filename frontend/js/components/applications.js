/* Application tracking: status steps, application cards, "Did you apply?" after Apply */
const FLOW = ["applied", "viewed", "shortlisted", "interview", "offer"];
const isApplied = t =>
  !!t && ["applied", "viewed", "shortlisted", "interview", "offer", "rejected"].includes(t.stage);
const statusNote = t =>
  ({
    applied: "Waiting for the recruiter",
    viewed: "The recruiter viewed your application",
    shortlisted: "You are shortlisted",
    interview: "Interview stage: add the date and notes",
    offer: "You got an offer",
    rejected: "Not selected this time",
  })[t.stage];
// the latest update that came from an email, e.g. "LinkedIn email · 2 Oct"
const lastMail = t => [...(t.history || [])].reverse().find(h => h.via === "email");
const stageName = k => STAGES.find(s => s[0] === k)[1];
const fmtShort = t =>
  t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
const fmtWhen = t =>
  new Date(t).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
function stageDate(t, k) {
  const h = [...(t.history || [])].reverse().find(x => x.stage === k);
  return h?.at || (k === "applied" ? t.appliedAt : k === "saved" ? t.savedAt : null);
}
// Applied -> Viewed -> Shortlisted -> Interview -> Offer; "Not selected" ends in a red step after the last stage reached
function stepper(t) {
  const closed = t.stage === "rejected";
  const reached = closed
    ? [...(t.history || [])].reverse().find(h => FLOW.includes(h.stage))?.stage || "applied"
    : t.stage;
  const cur = Math.max(0, FLOW.indexOf(reached)),
    steps = closed ? [...FLOW.slice(0, cur + 1), "rejected"] : FLOW;
  return `<ol class="stepper">${steps
    .map((k, i) => {
      const done = closed || i <= cur,
        now = closed ? k === "rejected" : i === cur;
      return `<li class="${done ? "done" : ""} ${now ? "cur" : ""} ${k === "rejected" ? "end" : ""}"><i></i><b>${stageName(k)}</b><small>${done ? fmtShort(stageDate(t, k)) : ""}</small></li>`;
    })
    .join("")}</ol>`;
}
// The status is shown only; the person doesn't change it by hand (the user wants a tracker, not a status editor)
function statusPill(t) {
  const st = STAGES.find(s => s[0] === t.stage);
  return `<span class="status-pill" style="color:${st[2]}">${st[1]}</span>`;
}
// Where the real status lives: each job site's own "applied jobs" page (Viewed, Shortlisted, Not selected...).
// Judged from the link the person opened to apply, else the site the job came from. null = no such page.
const STATUS_PAGES = [
  ["linkedin", "LinkedIn", "https://www.linkedin.com/my-items/saved-jobs/?cardType=APPLIED"],
  ["naukri", "Naukri", "https://www.naukri.com/myapply/historypage"],
  ["indeed", "Indeed", "https://myjobs.indeed.com/applied"],
  ["internshala", "Internshala", "https://internshala.com/student/applications/"],
];
function statusPage(j) {
  const url = String(j.url || ""),
    m = url.match(/^https:\/\/([^/]+\.myworkdayjobs\.com)\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/);
  if (m) return { site: j.company || "company site", url: `https://${m[1]}/${m[2]}/userHome` }; // Workday: the company's candidate home
  const where = (url.match(/^https?:\/\/([^/]+)/)?.[1] || "") + " " + (j.source || ""),
    hit = STATUS_PAGES.find(([k]) => where.toLowerCase().includes(k));
  return hit ? { site: hit[1], url: hit[2] } : null;
}
const statusLink = (j, cls = "btn ghost sm") => {
  const p = statusPage(j);
  return p
    ? `<a class="${cls}" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener">Check status on ${esc(p.site)} ↗</a>`
    : "";
};
function appCard(j) {
  const t = j._t,
    ap = t.appliedAt || stageDate(t, "applied"),
    m = lastMail(t);
  const quiet = t.stage === "applied" && ap && Date.now() - ap > 7 * 864e5;
  return `<article class="app" data-open="${esc(j.id)}" data-app="${esc(j.id)}" tabindex="0">
    <div class="app-top">${logo(j)}<div class="app-main"><h3>${esc(j.title)}</h3><div class="meta">${esc(j.company)} · ${esc(j.city_norm || j.location || "India")}</div>
      ${ap ? `<div class="app-when">Applied ${fmtDate(ap)} · ${ago(new Date(ap).toISOString())}</div>` : ""}</div>
      ${statusPill(t)}</div>
    ${stepper(t)}
    <div class="app-foot"><span>${quiet ? `<span class="due">No update for over a week</span>` : statusNote(t)}${m ? ` · <span class="via">from ${esc(m.site)} email, ${fmtShort(m.at)}</span>` : ""}</span>
      <span class="app-acts">${statusLink(j)}<button class="btn sm" data-open="${esc(j.id)}">Details</button></span></div>
  </article>`;
}
function flashApp(id) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-app="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 2200);
  });
}

/* after Apply opens the job site, ask when the person comes back to this tab */
let pendingApply = null,
  apId = null;
function noteApply(id) {
  if (isApplied(U.jobs[id]) && U.jobs[id].stage !== "rejected") return;
  pendingApply = { id, at: Date.now() };
  LS.set("uv.pendingApply", pendingApply);
}
function clearApply() {
  pendingApply = null;
  LS.del("uv.pendingApply");
}
function checkApply() {
  const p = pendingApply || LS.get("uv.pendingApply", null);
  if (!p || !U || $("shell").hidden || document.visibilityState !== "visible" || !$("applyModal").hidden)
    return;
  if (Date.now() - p.at < 1500) return;
  clearApply();
  if (Date.now() - p.at < 6 * 36e5) openApplyCheck(p.id);
}
document.addEventListener("visibilitychange", () => setTimeout(checkApply, 300));
window.addEventListener("focus", () => setTimeout(checkApply, 300));
function openApplyCheck(id) {
  const j = findJob(id) || U.jobs[id]?.snap;
  if (!j) return;
  apId = id;
  $("apJob").innerHTML = `${logo(j)}<div><b>${esc(j.title)}</b><small>${esc(j.company)}</small></div>`;
  $("apAsk").hidden = false;
  $("apDone").hidden = true;
  $("applyModal").hidden = false;
  setTimeout(() => $("apYes").focus(), 30);
}
function closeApply() {
  $("applyModal").hidden = true;
}
function markApplied() {
  setStage(apId, "applied");
  const t = U.jobs[apId],
    j = findJob(apId) || t.snap;
  renderNav();
  render();
  if ($("sheet").classList.contains("open")) openJob(apId);
  $("apDoneTxt").textContent = `${j.title} · ${j.company}`;
  $("apStep").innerHTML = stepper(t);
  $("apAsk").hidden = true;
  $("apDone").hidden = false;
  setTimeout(() => $("apView").focus(), 30);
}
$("apYes").onclick = markApplied;
$("apNo").onclick = $("apX").onclick = closeApply;
$("apBrowse").onclick = () => {
  closeApply();
  closeSheet();
}; // applied: back to the list, not the job's details
$("applyModal").onclick = e => {
  if (e.target === $("applyModal")) closeApply();
};
$("apView").onclick = () => {
  closeApply();
  closeSheet();
  go("mine");
  flashApp(apId);
};

/* buttons on this screen */
onAppClick(async (d, t, e) => {
  if (d.markapplied) {
    apId = d.markapplied;
    markApplied();
    $("applyModal").hidden = false;
    return;
  }
});
