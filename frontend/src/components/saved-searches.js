/* Saved searches on the Jobs page: save what you searched and filtered, and next time each one shows
   how many new jobs it has since you last opened it. Kept in U.searches (saved with the profile).
   Ported from frontend/js/components/saved-searches.js; the chips are in SavedSearches.jsx. */
import { S, refresh, saveUser } from "../core/state.js";
import { PAGE, EXP } from "../core/constants.js";
import { toast } from "../core/helpers.js";
import { searchParts, liveSearch } from "../services/job-store.js";
import { feed } from "./filters.js";
import { searchFixes, setSearchFixes } from "../services/smart-search.js";

export const SEARCH_KEYS = ["q", "role", "exp", "city", "remote", "minSal", "type", "source", "company"];
export const FILTERS_OFF = {
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
export const MAX_SEARCHES = 6;
// the parts of the filters (F) that make a search, leaving out the empty ones
export const searchOf = f =>
  Object.fromEntries(
    SEARCH_KEYS.filter(k => f[k] !== "" && f[k] !== false && f[k] != null)
      .map(k => [k, typeof f[k] === "string" ? f[k].trim() : f[k]])
      .filter(([, v]) => v !== "")
  );
export const sameSearch = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function searchLabel(f) {
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
export function newForSearch(s) {
  const keepF = S.F,
    keepFix = searchFixes;
  S.F = { ...FILTERS_OFF, ...s.f, forYou: false, days: 21 };
  try {
    return feed().filter(j => new Date(j.found) > s.seenAt).length;
  } finally {
    S.F = keepF;
    setSearchFixes(keepFix);
  }
}

export function saveSearch() {
  const U = S.U;
  U.searches = [
    ...(U.searches || []),
    { id: "s" + Date.now().toString(36), f: searchOf(S.F), seenAt: Date.now() },
  ];
  saveUser();
  refresh();
  toast("Search saved. New jobs for it show here next time.", "ok");
}
export function deleteSearch(id) {
  S.U.searches = (S.U.searches || []).filter(s => s.id !== id);
  saveUser();
  refresh();
}
export function openSearch(id) {
  const s = (S.U.searches || []).find(x => x.id === id);
  if (!s) return;
  S.F = { ...FILTERS_OFF, ...s.f, forYou: false, days: 21 };
  s.seenAt = Date.now();
  saveUser();
  S.shown = PAGE;
  refresh();
  if (s.f.q) {
    const p = searchParts(s.f.q);
    liveSearch(p.what, p.where);
  }
}
