/* One job in a list, laid out like the big job sites: a tick box to pick it, title, company, where it was
   posted, a row of facts (experience | salary | place), one line of the description, the skills, then
   how long ago it was posted with Hide and Save. The company logo sits on the right. A click on the card
   opens the job's details. Picked jobs can be saved or hidden together (PickBar).
   Ported from frontend/js/components/job-card.js. */
import { useEffect, useRef } from "react";
import { S, useStore } from "../core/state.js";
import { STAGES, ICON } from "../core/constants.js";
import { openJob } from "../core/nav.js";
import { Svg } from "./Svg.jsx";
import { Logo } from "./Logo.jsx";
import { evaluate } from "../services/matching.js";
import { scamCheck } from "../services/job-insights.js";
import { InsightBadges } from "../services/JobInsights.jsx";
import { fitLabel, isNew } from "./filters.js";
import { hideJobs } from "./hidden-jobs.js";
import {
  CARD_ICON,
  cardExp,
  cardPlace,
  cardAgo,
  skillName,
  picked,
  pick,
  clearPicks,
  savePicked,
  hidePicked,
  saveJob,
} from "./job-card.js";
// the panels these cards open (they register themselves with components/Sheet.jsx)
import "./JobDetails.jsx";
import "./HiddenJobs.jsx";

// opt (old second argument): { showStage: false, noNew: true }; the same keys work as plain props too
export function JobCard({ job: j, opt = {}, ...rest }) {
  const o = { ...opt, ...rest };
  const t = S.U.jobs[j.id],
    e = j._e || evaluate(j, S.U.prefs),
    st = t?.stage ? STAGES.find(s => s[0] === t.stage) : null;
  const fl = scamCheck(j).risk === "high" ? "" : fitLabel(e); // a possible scam is never a "fit"
  const fresh = isNew(j) && !o.noNew;
  const facts = [
    cardExp(j) && [CARD_ICON.exp, cardExp(j)],
    [CARD_ICON.pay, j.salary || "Not disclosed"],
    [CARD_ICON.where, cardPlace(j)],
  ].filter(Boolean);
  const desc = String(j.description || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  const skills = [...new Set([...(e.hits || []), ...(j.tech || [])])].slice(0, 6);
  const by = j.manual
    ? "Added by you"
    : j.direct
      ? "Posted on the company's careers site"
      : `Posted on ${j.source || "a job site"}`;
  const on = picked.has(j.id);
  return (
    <article
      className={`job ${st ? "tracked" : ""} ${on ? "picked" : ""}`}
      data-open={j.id}
      tabIndex={0}
      onClick={() => openJob(j.id)}
      onKeyDown={ev => ev.key === "Enter" && ev.target === ev.currentTarget && openJob(j.id)}
    >
      {/* the tick box only picks the job */}
      <label className="job-pick" data-tip="Select" onClick={ev => ev.stopPropagation()}>
        <input
          type="checkbox"
          data-pick={j.id}
          checked={on}
          onChange={ev => pick(j.id, ev.target.checked)}
          aria-label={"Select " + j.title}
        />
      </label>
      <div className="job-main">
        <h3>{j.title}</h3>
        <div className="job-co">{j.company}</div>
        <div className="job-by">{by}</div>
        <ul className="job-meta">
          {facts.map(([i, v], k) => (
            <li key={k}>
              <Svg svg={i} />
              <span>{v}</span>
            </li>
          ))}
        </ul>
        {desc && (
          <p className="job-desc">
            <Svg svg={CARD_ICON.desc} />
            <span>{desc}</span>
          </p>
        )}
        {skills.length > 0 && (
          <p className="job-skills">
            {skills.map(s => (
              <span key={s}>{skillName(s)}</span>
            ))}
          </p>
        )}
      </div>
      <div className="job-logo">
        <Logo job={j} />
      </div>
      <div className="job-foot">
        <span className="job-when">
          <span>{j.manual ? "Added by you" : cardAgo(j)}</span>
          {fresh && (
            <span className="sig sig-new">
              <i className="dot"></i>New
            </span>
          )}
          {fl && (
            <span
              className={"match fit " + (fl === "Great fit" ? "great" : "good")}
              title="How well it fits your role, experience and city"
            >
              {fl}
            </span>
          )}
          {j._rel && <span className="sig sig-rel">Related</span>}
          <InsightBadges job={j} />
          {st && o.showStage !== false && (
            <span className="status-pill" style={{ color: st[2] }}>
              {st[1]}
            </span>
          )}
        </span>
        <span className="job-acts">
          <button
            type="button"
            className="job-act"
            data-cardhide={j.id}
            aria-label="Hide this job"
            onClick={ev => {
              ev.stopPropagation();
              hideJobs([j.id]); // components/hidden-jobs.js: with Undo
            }}
          >
            <Svg svg={CARD_ICON.hide} />
            <span>Hide</span>
          </button>
          <button
            type="button"
            className="job-act"
            data-save={j.id}
            aria-pressed={!!t?.saved}
            aria-label="Save job"
            onClick={ev => {
              ev.stopPropagation();
              saveJob(j.id);
            }}
          >
            <Svg svg={ICON.bookmark} />
            <span>{t?.saved ? "Saved" : "Save"}</span>
          </button>
        </span>
      </div>
    </article>
  );
}

/* the bar at the bottom when jobs are picked: Save / Hide them together */
export function PickBar() {
  useStore();
  // moving to another tab drops the picks (the old code did this in go())
  const lastView = useRef(S.view);
  useEffect(() => {
    if (lastView.current !== S.view && picked.size) clearPicks();
    lastView.current = S.view;
  }, [S.view]);
  const hidden = !picked.size || S.screen !== "shell";
  return (
    <div className="pick-bar" hidden={hidden} role="region" aria-label="Selected jobs">
      {!hidden && (
        <>
          <span className="pb-count">
            <b>{picked.size}</b> selected
          </span>
          <span className="pb-acts">
            <button type="button" className="pb-btn primary" data-picksave="" onClick={savePicked}>
              <Svg svg={ICON.bookmark} />
              <span>Save</span>
            </button>
            <button type="button" className="pb-btn" data-pickhide="" onClick={hidePicked}>
              <Svg svg={CARD_ICON.hide} />
              <span>Hide</span>
            </button>
          </span>
          <button
            type="button"
            className="pb-x"
            data-pickclear=""
            aria-label="Clear selection"
            data-tip="Clear selection"
            onClick={clearPicks}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
