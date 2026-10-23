/* Saved jobs page: jobs bookmarked and not applied to yet. Ported from frontend/js/pages/saved.js. */
import { useStore } from "../core/state.js";
import { closeSheet, go } from "../core/nav.js";
import { Topbar } from "../components/Layout.jsx";
import { tracked } from "../services/job-store.js";
import { isApplied } from "../components/applications.js";
import { JobCard } from "../components/JobCard.jsx";

export function Saved() {
  useStore();
  const jobs = tracked()
    .filter(j => j._t.saved && !isApplied(j._t))
    .sort((a, b) => (b._t.savedAt || 0) - (a._t.savedAt || 0));
  return (
    <>
      <Topbar title="Saved jobs" />
      {jobs.length ? (
        <>
          <div className="resbar">
            <span>
              <b style={{ color: "var(--ink)" }}>{jobs.length}</b> saved job{jobs.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="list">
            {jobs.map(j => (
              <JobCard key={j.id} job={j} showStage={false} noNew />
            ))}
          </div>
        </>
      ) : (
        <div className="empty">
          <h3>No saved jobs yet</h3>Tap the bookmark on any job to keep it here.
          <br />
          <button
            className="btn ghost sm"
            data-go="jobs"
            onClick={() => {
              closeSheet();
              go("jobs");
            }}
          >
            Find jobs
          </button>
        </div>
      )}
    </>
  );
}
