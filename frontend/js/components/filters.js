/* Jobs page filters: what is picked (F), which jobs pass, and the filter panel */
function resetFilters() {
  F = {
    q: "",
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
  shown = PAGE;
}
function salaryLpa(j) {
  const m = String(j.salary || "").match(/([\d.]+)(?:\s*[–-]\s*([\d.]+))?\s*LPA/i);
  return m ? parseFloat(m[2] || m[1]) : null;
}
const isNew = j => prevSeen > 0 && new Date(j.found) > prevSeen;
// one name per job type: sites write "Full-time", "Full–time", "FULLTIME", "full_time"
function jobType(j) {
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
function feed() {
  const S = searchParts(F.q.toLowerCase()),
    q = S.what,
    qTag = normQuery(q),
    where = S.where.replace("bengaluru", "bangalore"),
    out = [],
    applied = appliedKeys(),
    tw = taste();
  // smart search (services/smart-search.js): other names for the same thing, and spelling fixes
  const smart = q ? searchGroups(q) : { groups: [], fixed: {} };
  searchFixes = smart.fixed;
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
  out.sort(
    (a, b) =>
      a._rel - b._rel ||
      (F.sort === "new"
        ? new Date(when(b)) - new Date(when(a))
        : isNew(b) - isNew(a) ||
          b._e.score + b._t - a._e.score - a._t ||
          new Date(when(b)) - new Date(when(a)))
  );
  return out;
}
// What the person picked, as removable chips next to the job count: [key, label]
function activeFilters() {
  const days = { 1: "Last 24 hours", 3: "Last 3 days", 21: "Last 3 weeks" };
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
function clearFilter(k) {
  const d = { forYou: true, days: 7, remote: false, sort: "match" };
  F[k] = k in d ? d[k] : "";
  shown = PAGE;
  renderJobs();
}
const fitLabel = e => (!e.ok ? "" : e.score >= 80 ? "Great fit" : "Good fit");

/* The Filters pop-up. Changes wait in FD (a draft) until "Show N jobs"; × or Esc throws them away. */
let FD = null;
const FILTER_DEFAULTS = {
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
function countFor(f) {
  const keep = F;
  F = { ...f, q: keep.q };
  let n = feed().length;
  if (!n && F.forYou && !F.q.trim()) {
    F.forYou = false;
    n = feed().filter(j => myRoleHit(j.title, U.prefs)).length;
  }
  F = keep;
  return n;
}
function filterFields() {
  const uniq = f => [...new Set(allJobs().map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const val = k => (k === "forYou" ? (FD.forYou ? "1" : "0") : FD[k]),
    def = k => (k === "forYou" ? "1" : FILTER_DEFAULTS[k]);
  // every filter in the same format: a small label and a dropdown; a changed one is shown in green
  const sel = (k, label, opts) =>
    `<div class="ff"><label for="f_${k}">${label}</label><select id="f_${k}" data-fsel="${k}" class="${String(val(k)) !== String(def(k)) ? "on" : ""}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val(k)) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
  return (
    sel("forYou", "Show", [
      ["1", "Jobs for me"],
      ["0", "All jobs"],
    ]) +
    sel("days", "Date posted", [
      [1, "Last 24 hours"],
      [3, "Last 3 days"],
      [7, "Last 7 days"],
      [21, "Last 3 weeks"],
    ]) +
    sel("sort", "Sort by", [
      ["match", "Best fit"],
      ["new", "Newest first"],
    ]) +
    sel("role", "Job role", [["", "All roles"], ...Object.keys(ROLES).map(r => [r, r])]) +
    sel("exp", "Experience", [["", "Any experience"], ...EXP.map(([v, l]) => [v, l])]) +
    sel("minSal", "Salary", [
      ["", "Any salary"],
      ["3", "3 LPA and above"],
      ["5", "5 LPA and above"],
      ["8", "8 LPA and above"],
      ["12", "12 LPA and above"],
      ["20", "20 LPA and above"],
    ]) +
    sel("city", "Location", [["", "All India"], ...uniq(j => j.city_norm || "India").map(c => [c, c])]) +
    sel("type", "Job type", [["", "Any type"], ...uniq(jobType).map(t => [t, t])]) +
    sel("company", "Company", [["", "All companies"], ...uniq(j => j.company).map(c => [c, c])]) +
    sel("source", "Posted on", [
      ["", "Any website"],
      ...uniq(j => (j.direct ? "Company site" : j.source)).map(t => [t, t]),
    ]) +
    `<div class="ff"><span class="ff-label">Work mode</span><label class="fremote"><input type="checkbox" data-fchk="remote" ${FD.remote ? "checked" : ""}>Remote only</label></div>`
  );
}
function filterCountLabel() {
  const n = countFor(FD);
  return `Show ${n} job${n === 1 ? "" : "s"}`;
}
function openFilters() {
  FD = { ...F };
  let m = $("fModal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "fModal";
    m.hidden = true;
    m.setAttribute("role", "dialog");
    m.setAttribute("aria-modal", "true");
    m.setAttribute("aria-labelledby", "fTitle");
    document.body.appendChild(m);
    m.addEventListener("change", e => {
      const el = e.target,
        k = el.dataset.fsel;
      if (k) FD[k] = k === "forYou" ? el.value === "1" : k === "days" ? +el.value : el.value;
      else if (el.dataset.fchk) FD[el.dataset.fchk] = el.checked;
      if (k)
        el.classList.toggle("on", String(el.value) !== String(k === "forYou" ? "1" : FILTER_DEFAULTS[k]));
      $("fApply").textContent = filterCountLabel();
    });
    m.addEventListener("click", e => {
      if (e.target === m) {
        closeFilters();
        return;
      }
      const b = e.target.closest("button");
      if (!b) return;
      if ("fx" in b.dataset) closeFilters();
      else if ("freset" in b.dataset) {
        FD = { ...FILTER_DEFAULTS };
        $("fBody").innerHTML = filterFields();
        $("fApply").textContent = filterCountLabel();
      } else if ("fapply" in b.dataset) applyFilters();
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && FD) closeFilters();
    });
  }
  // a panel right under the Filters button and search bar, as wide as they are (css/components/filters.css)
  m.innerHTML = `<div class="fpop" aria-labelledby="fTitle">
    <div class="fhead"><h2 id="fTitle">Filters</h2><button type="button" class="modal-x" data-fx aria-label="Close">×</button></div>
    <div class="fbody" id="fBody">${filterFields()}</div>
    <div class="ffoot"><button type="button" class="freset" data-freset>Reset</button><button type="button" class="btn" id="fApply" data-fapply>${filterCountLabel()}</button></div></div>`;
  m.hidden = false;
  placeFilters();
  document.body.style.overflow = "hidden";
  setTimeout(() => $("f_forYou")?.focus(), 30);
}
// put the panel just below the search row; the page can scroll or resize while it is open
function placeFilters() {
  const pop = $("fModal")?.querySelector(".fpop"),
    row = document.querySelector(".search-row");
  if (!pop || !row || $("fModal").hidden) return;
  const r = row.getBoundingClientRect(),
    top = Math.max(8, Math.min(r.bottom + 10, innerHeight - 320));
  Object.assign(pop.style, {
    top: top + "px",
    left: Math.max(8, r.left) + "px",
    width: Math.min(r.width, innerWidth - 16) + "px",
    maxHeight: innerHeight - top - 12 + "px",
  });
}
addEventListener("resize", placeFilters);
function closeFilters() {
  if (!$("fModal")) return;
  $("fModal").hidden = true;
  FD = null;
  document.body.style.overflow = "";
  document.querySelector("[data-ftoggle]")?.focus();
}
function applyFilters() {
  const moved = ["role", "city", "remote"].some(k => FD[k] !== F[k]);
  F = { ...FD, q: F.q };
  shown = PAGE;
  closeFilters();
  renderJobs();
  if (moved) liveForFilters();
}

/* buttons on this screen */
onAppClick(async (d, t, e) => {
  if ("fclear" in d) {
    const q = F.q;
    resetFilters();
    F.q = q;
    renderJobs();
    return;
  }
  if ("ftoggle" in d) {
    openFilters();
    return;
  }
  if (d.fdel) {
    clearFilter(d.fdel);
    return;
  }
});
