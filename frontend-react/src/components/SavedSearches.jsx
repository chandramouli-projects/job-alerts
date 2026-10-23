/* The saved-search chips under the results bar, with "N new" and "☆ Save this search".
   Ported from frontend/js/components/saved-searches.js (savedSearchBar). */
import { S, useStore } from "../core/state.js";
import {
  MAX_SEARCHES,
  searchOf,
  sameSearch,
  searchLabel,
  newForSearch,
  saveSearch,
  deleteSearch,
  openSearch,
} from "./saved-searches.js";

export function SavedSearchBar() {
  useStore();
  const list = S.U.searches || [],
    cur = searchOf(S.F),
    canSave = Object.keys(cur).length && !list.some(s => sameSearch(s.f, cur));
  if (!list.length && !canSave) return null;
  const full = list.length >= MAX_SEARCHES;
  return (
    <div className="saved-searches" aria-label="Saved searches">
      {list.map(s => {
        const n = newForSearch(s);
        return (
          <span className={"ss-chip " + (sameSearch(s.f, cur) ? "on" : "")} key={s.id}>
            <button type="button" data-sopen={s.id} onClick={() => openSearch(s.id)}>
              {searchLabel(s.f)}
              {n ? <b>{n} new</b> : null}
            </button>
            <button
              type="button"
              className="ss-x"
              data-sdel={s.id}
              aria-label="Delete this saved search"
              onClick={() => deleteSearch(s.id)}
            >
              ×
            </button>
          </span>
        );
      })}
      {canSave ? (
        <button
          type="button"
          className="ss-save"
          data-ssave=""
          disabled={full}
          title={full ? `You can keep ${MAX_SEARCHES} saved searches` : undefined}
          onClick={saveSearch}
        >
          ☆ Save this search
        </button>
      ) : null}
    </div>
  );
}
