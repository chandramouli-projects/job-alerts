/* The job details panel (side sheet kind "job", opened with openJob(id) from core/nav.js):
   title, facts, fit, application status, notes, skills, description, where to apply, interview prep,
   quick copy and similar jobs; the foot has View job (Apply) or "Applied on …".
   Ported from frontend/js/components/job-details.js (openJob, quickCopy and its buttons). */
import { S } from "../core/state.js";
import { STAGES, ICON } from "../core/constants.js";
import { ago, when, fmtDate, safeUrl, copy } from "../core/helpers.js";
import { openJob, closeSheet, go } from "../core/nav.js";
import { Svg } from "./Svg.jsx";
import { Logo } from "./Logo.jsx";
import { registerSheet } from "./Sheet.jsx";
import { evaluate, expRange } from "../services/matching.js";
import { findJob } from "../services/job-store.js";
import { scamCheck, postingAge, salaryGuess } from "../services/job-insights.js";
import { InsightBadges, InsightCard, SalaryChip } from "../services/JobInsights.jsx";
import { isApplied, statusNote, fmtWhen, stageDate, noteApply, markApplied } from "./applications.js";
import { StatusPill, Stepper, StatusLink } from "./Applications.jsx";
import { fitLabel } from "./filters.js";
import { CARD_ICON, saveJob } from "./job-card.js";
import { notInterested } from "./hidden-jobs.js";
import {
  JD_POSTED,
  skillCheck,
  whyList,
  similarJobs,
  quickCopyItems,
  saveNotes,
  showCompany,
  deleteManual,
} from "./job-details.js";
import { ResumeMatch } from "./ResumeMatch.jsx";
import { InterviewPrep } from "./InterviewPrep.jsx";

function QuickCopy() {
  const items = quickCopyItems();
  return (
    <div className="card">
      <h3>Quick copy for the application form</h3>
      {items.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map(([l, v]) => (
            <button className="btn ghost sm" data-copy={v} key={l} onClick={() => copy(v)}>
              {l}
            </button>
          ))}
        </div>
      ) : (
        <p className="meta" style={{ margin: 0 }}>
          Fill your profile to copy details here in one tap.{" "}
          <button
            className="btn ghost sm"
            data-go="profile"
            onClick={() => {
              closeSheet();
              go("profile");
            }}
          >
            Open profile
          </button>
        </p>
      )}
    </div>
  );
}

function JobBody({ job: j, id }) {
  const U = S.U,
    t = U.jobs[id],
    e = evaluate(j, U.prefs),
    done = isApplied(t);
  const { haveSkill, missing } = skillCheck(j),
    why = whyList(j, e),
    similar = similarJobs(j, id);
  // top of the panel: logo, title, company and place, then the same facts and signals as the job card
  const fl = scamCheck(j).risk === "high" ? "" : fitLabel(e);
  const badges = scamCheck(j).risk === "high" || !!postingAge(j); // InsightBadges shows something
  const facts = [
    j.exp_min != null && [CARD_ICON.exp, expRange(j)],
    (j.salary || salaryGuess(j)) && [CARD_ICON.pay, j.salary || <SalaryChip job={j} />],
    j.type && [null, j.type],
    [
      JD_POSTED,
      j.manual ? "Added by you" : `${j.direct ? "Company site" : j.source || "Job site"} · ${ago(when(j))}`,
    ],
  ].filter(Boolean);
  return (
    <>
      <div className="jd-hero">
        <Logo job={j} />
        <div className="jd-title">
          <h2>
            {j.title}
            {!done && (
              <button
                type="button"
                className="jd-save"
                id="jdSave"
                data-save={id}
                aria-pressed={!!t?.saved}
                aria-label="Save job"
                title="Save job"
                onClick={() => saveJob(id)}
              >
                <Svg svg={ICON.bookmark} />
              </button>
            )}
          </h2>
          <button
            className="jd-co"
            data-company={j.company}
            title={`See all jobs at ${j.company}`}
            onClick={() => showCompany(j.company)}
          >
            {j.company}
          </button>
          <div className="jd-where">
            <Svg svg={CARD_ICON.where} />
            {j.location || "India"}
            {j.remote ? " · Remote" : ""}
          </div>
        </div>
        <div className="jd-side">
          {(fl || badges) && (
            <div className="jd-signals">
              {fl && (
                <span className={"match fit " + (fl === "Great fit" ? "great" : "good")}>
                  <span className="bars">
                    <i></i>
                    <i></i>
                    <i></i>
                  </span>
                  {fl}
                </span>
              )}
              <InsightBadges job={j} />
            </div>
          )}
        </div>
      </div>
      <ul className="jd-facts">
        {facts.map(([i, v], k) => (
          <li key={k}>
            {i && <Svg svg={i} />}
            <span>{v}</span>
          </li>
        ))}
      </ul>
      <InsightCard job={j} />
      <ResumeMatch job={j} done={done} />
      <div className="card">
        <h3>{e.ok ? `${fitLabel(e)} for you` : "Why it's not in your feed"}</h3>
        <ul className="why">
          {why.map(([ok, w], k) => (
            <li key={k} className={ok ? "ok" : ok === false ? "no" : ""}>
              <i>{ok === false ? "✕" : ok ? "✓" : "•"}</i>
              {w}
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        {done ? (
          <>
            <div className="app-head">
              <h3>Application status</h3>
              <StatusPill t={t} />
            </div>
            <div style={{ margin: "-6px 0 6px" }}>
              <Stepper t={t} />
            </div>
            <p className="wait">{statusNote(t)}</p>
            <ul className="tl">
              {t.history
                .filter(h => h.stage !== "saved")
                .slice()
                .reverse()
                .map((h, k) => {
                  const s = STAGES.find(x => x[0] === h.stage);
                  return (
                    <li key={k}>
                      <i className="dot" style={{ background: s[2] }}></i>
                      <b style={{ color: "var(--ink)", fontWeight: 600 }}>{s[1]}</b> · {fmtWhen(h.at)}
                    </li>
                  );
                })}
            </ul>
          </>
        ) : (
          <>
            <h3>Your application</h3>
            <button className="btn ghost sm" data-markapplied={id} onClick={() => markApplied(id)}>
              I applied to this job
            </button>
          </>
        )}
        <div style={{ marginTop: 14 }}>
          <label className="lbl" htmlFor="notes">
            My notes
          </label>
          {/* saved when the box loses focus with a change, like the old "change" event */}
          <textarea
            className="inp"
            id="notes"
            key={id}
            data-id={id}
            placeholder="Recruiter name, interview date, questions asked…"
            defaultValue={t?.notes || ""}
            onBlur={ev =>
              ev.target.value !== (S.U.jobs[id]?.notes || "") && saveNotes(id, ev.target.value, j)
            }
          />
        </div>
      </div>
      {(j.tech || []).length > 0 && (
        <div className="card">
          <h3>Skills mentioned</h3>
          <div className="facts" style={{ margin: 0 }}>
            {j.tech.map(s => (
              <span key={s} className={haveSkill(s) ? "good" : "t"}>
                {s}
              </span>
            ))}
          </div>
          {missing.length > 0 && (
            <p className="miss">
              Your skills don't have: <b>{missing.join(", ")}</b>
            </p>
          )}
        </div>
      )}
      {j.description && (
        <div className="card">
          <h3>About the job</h3>
          <div className="desc">
            {j.description}
            {j.description.length >= 3400 ? "…" : ""}
          </div>
        </div>
      )}
      {!done && (j.apply_links || []).length > 1 && (
        <div className="card">
          <h3>Where you can apply</h3>
          <div className="list" style={{ gap: 8 }}>
            {j.apply_links.map((l, k) => (
              <a
                key={k}
                className="cocard"
                style={{ gridTemplateColumns: "1fr auto", textDecoration: "none", color: "var(--ink)" }}
                href={safeUrl(l.url)}
                target="_blank"
                rel="noopener"
                data-apply={id}
                onClick={() => noteApply(id)}
              >
                <span>
                  <b>{l.site}</b>
                  <small>{l.direct ? "Company's own page" : "Job website"}</small>
                </span>
                <span className={"match " + (l.direct ? "hi" : "")}>{l.direct ? "Direct" : "View"}</span>
              </a>
            ))}
          </div>
        </div>
      )}
      <InterviewPrep job={j} t={t} />
      {!done && <QuickCopy />}
      {similar.length > 0 && (
        <div className="card">
          <h3>Similar jobs for you</h3>
          <div className="list">
            {similar.map(s => (
              <button
                className="cocard"
                data-open={s.id}
                key={s.id}
                style={{ width: "100%" }}
                onClick={() => openJob(s.id)}
              >
                <Logo job={s} />
                <span>
                  <b>{s.title}</b>
                  <small>
                    {s.company} · {s.city_norm || s.location || ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {j.manual ? (
          <button className="btn danger sm" data-delmanual={id} onClick={() => deleteManual(id)}>
            Delete this job
          </button>
        ) : done ? null : (
          <button className="btn ghost sm" data-hide={id} onClick={() => notInterested(id)}>
            Not interested
          </button>
        )}
      </div>
    </>
  );
}

function JobFoot({ job: j, id }) {
  const t = S.U.jobs[id];
  if (isApplied(t))
    return (
      <>
        <div className="applied-bar">
          <i className="tk">✓</i>Applied on {fmtDate(t.appliedAt || stageDate(t, "applied"))}
        </div>
        <StatusLink job={j} cls="btn ghost" />
      </>
    );
  return (
    <a
      className="apply"
      href={safeUrl(j.url)}
      target="_blank"
      rel="noopener"
      data-apply={id}
      onClick={() => noteApply(id)}
    >
      {j.manual ? "View job" : j.direct ? "View job on company site" : "View job on " + j.source}
    </a>
  );
}

registerSheet("job", s => {
  const j = S.U && (findJob(s.id) || S.U.jobs[s.id]?.snap);
  if (!j) return null;
  return {
    title: "Job details",
    body: <JobBody job={j} id={s.id} />,
    foot: <JobFoot job={j} id={s.id} />,
  };
});
