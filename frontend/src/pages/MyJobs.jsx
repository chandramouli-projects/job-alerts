/* My jobs page: the jobs you applied to and where each application stands. Saved jobs have their own page.
   Ported from frontend/js/pages/my-jobs.js. */
import { useStore } from "../core/state.js";
import { closeSheet, go } from "../core/nav.js";
import { Topbar } from "../components/Layout.jsx";
import { tracked } from "../services/job-store.js";
import { MailBar } from "../services/MailTracking.jsx";
import { isApplied } from "../components/applications.js";
import { AppCard } from "../components/Applications.jsx";
import { ProgressCard } from "../components/Progress.jsx";

export function Mine() {
  useStore();
  const jobs = tracked()
    .filter(j => isApplied(j._t))
    .sort((a, b) => (b._t.history.at(-1)?.at || 0) - (a._t.history.at(-1)?.at || 0));
  const due = jobs.filter(
    j => j._t.stage === "applied" && j._t.appliedAt && Date.now() - j._t.appliedAt > 7 * 864e5
  ).length;
  return (
    <>
      <Topbar title="My jobs" />
      <MailBar />
      {jobs.length ? <ProgressCard jobs={jobs} /> : null}
      {due ? (
        <div className="card" style={{ background: "var(--accent-soft)", borderColor: "transparent" }}>
          <b>
            {due} application{due > 1 ? "s" : ""} with no update for over a week.
          </b>
        </div>
      ) : null}
      {jobs.length ? (
        <>
          <div className="resbar">
            <span>
              <b style={{ color: "var(--ink)" }}>{jobs.length}</b> application{jobs.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="list">
            {jobs.map(j => (
              <AppCard key={j.id} job={j} />
            ))}
          </div>
        </>
      ) : (
        <div className="empty">
          <h3>No applications yet</h3>Jobs you apply to show up here.
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
