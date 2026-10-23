/* Application cards, status steps and the "Did you apply?" pop-up (old #applyModal).
   Ported from frontend/js/components/applications.js and the #applyModal HTML of frontend/index.html. */
import { useEffect, useRef } from "react";
import { S, useStore } from "../core/state.js";
import { STAGES } from "../core/constants.js";
import { ago, fmtDate, safeUrl } from "../core/helpers.js";
import { openJob } from "../core/nav.js";
import { findJob } from "../services/job-store.js";
import { Logo } from "./Logo.jsx";
import {
  stageDate,
  stepperSteps,
  stageName,
  fmtShort,
  statusNote,
  lastMail,
  statusPage,
  closeApply,
  markApplied,
  keepBrowsing,
  viewApplication,
} from "./applications.js";

// Applied -> Viewed -> Shortlisted -> Interview -> Offer; "Not selected" ends in a red step
export function Stepper({ t }) {
  return (
    <ol className="stepper">
      {stepperSteps(t).map(({ k, done, now }) => (
        <li key={k} className={`${done ? "done" : ""} ${now ? "cur" : ""} ${k === "rejected" ? "end" : ""}`}>
          <i></i>
          <b>{stageName(k)}</b>
          <small>{done ? fmtShort(stageDate(t, k)) : ""}</small>
        </li>
      ))}
    </ol>
  );
}
// The status is shown only; the person doesn't change it by hand (the user wants a tracker, not a status editor)
export function StatusPill({ t }) {
  const st = STAGES.find(s => s[0] === t.stage);
  return (
    <span className="status-pill" style={{ color: st[2] }}>
      {st[1]}
    </span>
  );
}
export function StatusNote({ t }) {
  return <>{statusNote(t)}</>;
}
export function StatusLink({ job: j, cls = "btn ghost sm" }) {
  const p = statusPage(j);
  return p ? (
    <a className={cls} href={safeUrl(p.url)} target="_blank" rel="noopener">
      Check status on {p.site} ↗
    </a>
  ) : null;
}
export function AppCard({ job: j }) {
  const t = j._t,
    ap = t.appliedAt || stageDate(t, "applied"),
    m = lastMail(t);
  const quiet = t.stage === "applied" && ap && Date.now() - ap > 7 * 864e5;
  return (
    <article
      className="app"
      data-open={j.id}
      data-app={j.id}
      tabIndex="0"
      onClick={e => {
        if (e.target.closest("a")) return; // "Check status" opens the job site only
        openJob(j.id);
      }}
      onKeyDown={e => e.key === "Enter" && e.target === e.currentTarget && openJob(j.id)}
    >
      <div className="app-top">
        <Logo job={j} />
        <div className="app-main">
          <h3>{j.title}</h3>
          <div className="meta">
            {j.company} · {j.city_norm || j.location || "India"}
          </div>
          {ap ? (
            <div className="app-when">
              Applied {fmtDate(ap)} · {ago(new Date(ap).toISOString())}
            </div>
          ) : null}
        </div>
        <StatusPill t={t} />
      </div>
      <Stepper t={t} />
      <div className="app-foot">
        <span>
          {quiet ? <span className="due">No update for over a week</span> : statusNote(t)}
          {m ? (
            <>
              {" · "}
              <span className="via">
                from {m.site} email, {fmtShort(m.at)}
              </span>
            </>
          ) : null}
        </span>
        <span className="app-acts">
          <StatusLink job={j} />
          <button className="btn sm" data-open={j.id}>
            Details
          </button>
        </span>
      </div>
    </article>
  );
}

/* "Did you apply?" after the person comes back from the job site, then "Application tracked" */
export function ApplyModal() {
  useStore();
  const open = !!S.applyOpen && !!S.U,
    done = !!S.applyDone,
    id = S.applyId;
  const yesRef = useRef(null),
    viewRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    setTimeout(() => (done ? viewRef : yesRef).current?.focus(), 30);
  }, [open, done]);
  const t = open ? S.U.jobs[id] : null,
    j = open ? findJob(id) || t?.snap : null;
  return (
    <div
      className="modal"
      id="applyModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apTitle"
      hidden={!open || !j}
      onClick={e => e.target === e.currentTarget && closeApply()}
    >
      <div className="modal-card">
        <button type="button" className="modal-x" id="apX" aria-label="Close" onClick={closeApply}>
          ×
        </button>
        <div id="apAsk" hidden={done}>
          <h2 id="apTitle">Did you apply?</h2>
          <div className="ap-job" id="apJob">
            {j && (
              <>
                <Logo job={j} />
                <div>
                  <b>{j.title}</b>
                  <small>{j.company}</small>
                </div>
              </>
            )}
          </div>
          <div className="ask-btns">
            <button type="button" className="btn ghost" id="apNo" onClick={closeApply}>
              Not yet
            </button>
            <button type="button" className="btn" id="apYes" ref={yesRef} onClick={() => markApplied()}>
              Yes, I applied
            </button>
          </div>
        </div>
        <div id="apDone" hidden={!done} style={{ textAlign: "center" }}>
          <div className="ok-badge">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h2>Application tracked</h2>
          <p className="sub" id="apDoneTxt">
            {done && j ? `${j.title} · ${j.company}` : ""}
          </p>
          <div id="apStep">{done && t ? <Stepper t={t} /> : null}</div>
          <div className="ask-btns">
            <button type="button" className="btn ghost" id="apBrowse" onClick={keepBrowsing}>
              Keep browsing
            </button>
            <button type="button" className="btn" id="apView" ref={viewRef} onClick={viewApplication}>
              View application
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
