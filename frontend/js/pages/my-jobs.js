/* My jobs page: the jobs you applied to and where each application stands. Saved jobs have their own page. */
function renderMine() {
  const jobs = tracked()
    .filter(j => isApplied(j._t))
    .sort((a, b) => (b._t.history.at(-1)?.at || 0) - (a._t.history.at(-1)?.at || 0));
  const due = jobs.filter(
    j => j._t.stage === "applied" && j._t.appliedAt && Date.now() - j._t.appliedAt > 7 * 864e5
  ).length;
  $("main").innerHTML =
    topbar("My jobs") +
    mailBar() +
    (jobs.length ? progressCard(jobs) : "") +
    `
  ${due ? `<div class="card" style="background:var(--accent-soft);border-color:transparent"><b>${due} application${due > 1 ? "s" : ""} with no update for over a week.</b></div>` : ""}
  ${
    jobs.length
      ? `<div class="resbar"><span><b style="color:var(--ink)">${jobs.length}</b> application${jobs.length === 1 ? "" : "s"}</span></div><div class="list">${jobs.map(appCard).join("")}</div>`
      : `<div class="empty"><h3>No applications yet</h3>Jobs you apply to show up here.<br><button class="btn ghost sm" data-go="jobs">Find jobs</button></div>`
  }`;
}
