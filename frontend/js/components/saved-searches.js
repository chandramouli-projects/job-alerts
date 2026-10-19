/* Saved searches on the Jobs page: save what you searched and filtered, and next time each one shows
   how many new jobs it has since you last opened it. Kept in U.searches (saved with the profile). */
const SEARCH_KEYS = ["q", "role", "exp", "city", "remote", "minSal", "type", "source", "company"];
const FILTERS_OFF = {
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
const MAX_SEARCHES = 6;
// the parts of the filters (F) that make a search, leaving out the empty ones
const searchOf = f =>
  Object.fromEntries(
    SEARCH_KEYS.filter(k => f[k] !== "" && f[k] !== false && f[k] != null)
      .map(k => [k, typeof f[k] === "string" ? f[k].trim() : f[k]])
      .filter(([, v]) => v !== "")
  );
const sameSearch = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function searchLabel(f) {
  const exp = f.exp !== undefined ? EXP.find(x => String(x[0]) === String(f.exp))?.[1] : "";
  return [
    f.q,
    f.role,
    f.city,
    exp,
    f.remote && "Remote",
    f.minSal && `${f.minSal}+ LPA`,
    f.type,
    f.source,
    f.company,
  ]
    .filter(Boolean)
    .join(" · ");
}
// jobs this search finds that arrived after it was last opened (any date range, not only "for me")
function newForSearch(s) {
  const keepF = F,
    keepFix = searchFixes;
  F = { ...FILTERS_OFF, ...s.f, forYou: false, days: 21 };
  try {
    return feed().filter(j => new Date(j.found) > s.seenAt).length;
  } finally {
    F = keepF;
    searchFixes = keepFix;
  }
}
function savedSearchBar() {
  const list = U.searches || [],
    cur = searchOf(F),
    canSave = Object.keys(cur).length && !list.some(s => sameSearch(s.f, cur));
  if (!list.length && !canSave) return "";
  return `<div class="saved-searches" aria-label="Saved searches">${list
    .map(s => {
      const n = newForSearch(s);
      return `<span class="ss-chip ${sameSearch(s.f, cur) ? "on" : ""}"><button type="button" data-sopen="${esc(s.id)}">${esc(searchLabel(s.f))}${n ? `<b>${n} new</b>` : ""}</button><button type="button" class="ss-x" data-sdel="${esc(s.id)}" aria-label="Delete this saved search">×</button></span>`;
    })
    .join("")}
    ${canSave ? `<button type="button" class="ss-save" data-ssave ${list.length >= MAX_SEARCHES ? `disabled title="You can keep ${MAX_SEARCHES} saved searches"` : ""}>☆ Save this search</button>` : ""}</div>`;
}

/* buttons on this screen */
onAppClick(async (d, t, e) => {
  if ("ssave" in d) {
    U.searches = [
      ...(U.searches || []),
      { id: "s" + Date.now().toString(36), f: searchOf(F), seenAt: Date.now() },
    ];
    saveUser();
    renderJobs();
    toast("Search saved. New jobs for it show here next time.", "ok");
    return;
  }
  if (d.sdel) {
    U.searches = (U.searches || []).filter(s => s.id !== d.sdel);
    saveUser();
    renderJobs();
    return;
  }
  if (d.sopen) {
    const s = (U.searches || []).find(x => x.id === d.sopen);
    if (!s) return;
    F = { ...FILTERS_OFF, ...s.f, forYou: false, days: 21 };
    s.seenAt = Date.now();
    saveUser();
    shown = PAGE;
    renderJobs();
    if (s.f.q) {
      const p = searchParts(s.f.q);
      liveSearch(p.what, p.where);
    }
    return;
  }
});
