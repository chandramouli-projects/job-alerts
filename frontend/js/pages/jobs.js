/* Jobs page: search box, filters, job list */
const MORE_BELOW = 10; // fewer fits than this: jobs for my role and level in other places show below them
// "More QA / Testing jobs in other cities": right role and level, only the place differs
function elsewhereList(fits, list) {
  if (!list.length) return "";
  const roles = [...U.prefs.roles, ...splitList(U.prefs.custom)].join(" / ") || "your role";
  const room = Math.max(PAGE - fits, 10);
  return `<div class="elsewhere"><h3>More ${esc(roles)} jobs in other cities</h3>
    <p>${fits ? "Only a few jobs match your cities." : "No jobs in your cities right now."} These fit your role and experience, in other places.
    <button type="button" class="linkbtn" data-editprefs>Change my cities</button></p></div>
    <div class="list elsewhere-list">${list
      .slice(0, room)
      .map(j => jobCard(j))
      .join(
        ""
      )}</div>${list.length > room ? `<p class="elsewhere-more">${list.length - room} more: choose All jobs in Filters to see every one.</p>` : ""}`;
}
function renderJobs() {
  const jobs = feed(),
    chips = activeFilters(),
    n = chips.length,
    fresh = jobs.filter(isNew).length;
  let near = [],
    elsewhere = [];
  if (F.forYou && !F.q.trim() && jobs.length < MORE_BELOW) {
    // few fits: also show jobs that fit my role and level in other places (cities are the usual reason)
    const mine = new Set(jobs.map(j => j.id)),
      anyCity = { ...U.prefs, cities: ["Anywhere in India"] };
    F.forYou = false;
    const all = feed();
    F.forYou = true;
    elsewhere = all.filter(j => !mine.has(j.id) && evaluate(j, anyCity).ok);
    if (!jobs.length && !elsewhere.length) near = all.filter(j => myRoleHit(j.title, U.prefs));
  }
  $("main").innerHTML =
    topbar(`Hi ${esc(U.profile.name.split(" ")[0])}`) +
    `
  <div class="search-row"><button type="button" class="fbtn ${n ? "on" : ""}" data-ftoggle aria-haspopup="dialog" aria-label="Filters${n ? ` (${n} on)` : ""}" data-tip="Filters">${ICON.filter}<span class="fbtn-label">Filters</span>${n ? `<span class="fbadge">${n}</span>` : ""}</button>
  <form class="searchbar one" id="searchForm" role="search"><span class="sb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></span><input id="q" placeholder="Search by skill, job title or company" value="${esc(F.q)}" aria-label="Search">
    <button class="btn" type="submit">Search</button></form></div>
  <div class="resbar"><span><b style="color:var(--ink)">${jobs.length || near.length}</b> job${(jobs.length || near.length) === 1 ? "" : "s"}${jobs.length ? (F.forYou && !F.q.trim() ? " for you" : "") : near.length ? " in your role" : F.forYou && !F.q.trim() ? " for you" : ""}${Object.keys(searchFixes).length ? ` · showing results for <b style="color:var(--ink)">${esc(Object.values(searchFixes).join(", "))}</b>` : ""}${liveBusy ? ` · <span style="color:var(--accent)">Searching more jobs…</span>` : ""}${fresh ? ` · <b style="color:var(--accent)">${fresh} new</b> since your last visit` : ""}</span>
    ${chips.length ? `<div class="fchips">${chips.map(([k, l]) => `<span class="fchip">${esc(l)}<button type="button" data-fdel="${k}" aria-label="Remove ${esc(l)}">×</button></span>`).join("")}${chips.length > 1 ? `<button type="button" class="fclear-all" data-fclear>Clear all</button>` : ""}</div>` : ""}</div>
  ${savedSearchBar()}
  ${
    jobs.length
      ? `<div class="list">${jobs
          .slice(0, shown)
          .map(j => jobCard(j))
          .join(
            ""
          )}</div>${jobs.length > shown ? `<button class="btn ghost more" data-more>Show ${Math.min(PAGE, jobs.length - shown)} more</button>` : ""}`
      : near.length
        ? `<div class="card" style="background:var(--accent-soft);border-color:transparent"><b>No exact match.</b> Similar jobs for your role:</div><div class="list">${near
            .slice(0, shown)
            .map(j => jobCard(j))
            .join(
              ""
            )}</div>${near.length > shown ? `<button class="btn ghost more" data-more>Show ${Math.min(PAGE, near.length - shown)} more</button>` : ""}`
        : elsewhere.length
          ? ""
          : `<div class="empty"><h3>No jobs match right now</h3>${liveBusy ? "Searching more jobs…" : "Try All jobs or a longer Posted range."}<br>
     ${n ? `<button class="btn ghost sm" data-fclear>Clear filters</button> ` : ""}<button class="btn ghost sm" data-editprefs>Edit my job details</button></div>`
  }${elsewhereList(jobs.length, elsewhere)}`;
  $("searchForm").onsubmit = e => {
    e.preventDefault();
    F.q = $("q").value;
    shown = PAGE;
    $("q").blur();
    renderJobs();
    const s = searchParts(F.q);
    liveSearch(s.what, s.where);
  };
}

/* buttons on this screen */
onAppClick(async (d, t, e) => {
  if ("more" in d) {
    shown += PAGE;
    renderJobs();
    return;
  }
});
