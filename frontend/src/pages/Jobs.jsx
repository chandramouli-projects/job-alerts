/* Jobs page: search box, filters, job list. Ported from frontend/js/pages/jobs.js (renderJobs). */
import { useEffect, useState } from "react";
import { S, refresh, useStore } from "../core/state.js";
import { PAGE } from "../core/constants.js";
import { closeSheet, startOnboarding } from "../core/nav.js";
import { searchParts, liveSearch } from "../services/job-store.js";
import { myRoleHit } from "../services/matching.js";
import { searchFixes } from "../services/smart-search.js";
import { Topbar } from "../components/Layout.jsx";
import { feed, activeFilters, isNew, clearAllFilters } from "../components/filters.js";
import { Filters, FilterChips } from "../components/Filters.jsx";
import { JobCard } from "../components/JobCard.jsx";
import { SavedSearchBar } from "../components/SavedSearches.jsx";
import { HiddenLink } from "../components/HiddenJobs.jsx";

const more = () => {
  S.shown += PAGE;
  refresh();
};

function JobList({ jobs }) {
  return (
    <>
      <div className="list">
        {jobs.slice(0, S.shown).map(j => (
          <JobCard job={j} key={j.id} />
        ))}
      </div>
      {jobs.length > S.shown && (
        <button className="btn ghost more" data-more="" onClick={more}>
          Show {Math.min(PAGE, jobs.length - S.shown)} more
        </button>
      )}
    </>
  );
}

export function Jobs() {
  useStore();
  const F = S.F,
    U = S.U;
  const [text, setText] = useState(F.q);
  useEffect(() => setText(F.q), [F.q]); // a saved search or a company link changed the search
  const jobs = feed(),
    n = activeFilters().length,
    fresh = jobs.filter(isNew).length,
    fixes = Object.values(searchFixes || {});
  let near = [];
  if (!jobs.length && F.forYou && !F.q.trim()) {
    F.forYou = false;
    near = feed().filter(j => myRoleHit(j.title, U.prefs));
    F.forYou = true;
  }
  const count = jobs.length || near.length,
    forMe = F.forYou && !F.q.trim();
  const submit = e => {
    e.preventDefault();
    F.q = text;
    S.shown = PAGE;
    document.getElementById("q")?.blur();
    refresh();
    const s = searchParts(F.q);
    liveSearch(s.what, s.where);
  };
  return (
    <>
      <Topbar title={`Hi ${U.profile.name.split(" ")[0]}`} />
      <div className="search-row">
        <Filters />
        <form className="searchbar one" id="searchForm" role="search" onSubmit={submit}>
          <span className="sb-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            id="q"
            placeholder="Search by skill, job title or company"
            value={text}
            onChange={e => setText(e.target.value)}
            aria-label="Search"
          />
          <button className="btn" type="submit">
            Search
          </button>
        </form>
      </div>
      <div className="resbar">
        <span>
          <b style={{ color: "var(--ink)" }}>{count}</b> job{count === 1 ? "" : "s"}
          {jobs.length ? (forMe ? " for you" : "") : near.length ? " in your role" : forMe ? " for you" : ""}
          {fixes.length > 0 && (
            <>
              {" · showing results for "}
              <b style={{ color: "var(--ink)" }}>{fixes.join(", ")}</b>
            </>
          )}
          {S.liveBusy > 0 && (
            <>
              {" · "}
              <span style={{ color: "var(--accent)" }}>Searching more jobs…</span>
            </>
          )}
          {fresh > 0 && (
            <>
              {" · "}
              <b style={{ color: "var(--accent)" }}>{fresh} new</b> since your last visit
            </>
          )}
          <HiddenLink />
        </span>
        <FilterChips />
      </div>
      <SavedSearchBar />
      {jobs.length ? (
        <JobList jobs={jobs} />
      ) : near.length ? (
        <>
          <div className="card" style={{ background: "var(--accent-soft)", borderColor: "transparent" }}>
            <b>No exact match.</b> Similar jobs for your role:
          </div>
          <JobList jobs={near} />
        </>
      ) : (
        <div className="empty">
          <h3>No jobs match right now</h3>
          {S.liveBusy ? "Searching more jobs…" : "Try All jobs or a longer Posted range."}
          <br />
          {n > 0 && (
            <>
              <button className="btn ghost sm" data-fclear="" onClick={clearAllFilters}>
                Clear filters
              </button>{" "}
            </>
          )}
          <button
            className="btn ghost sm"
            data-editprefs=""
            onClick={() => {
              closeSheet();
              startOnboarding();
            }}
          >
            Edit my job details
          </button>
        </div>
      )}
    </>
  );
}
