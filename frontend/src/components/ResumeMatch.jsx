/* The "Your resume vs this job" card in the job details.
   Ported from frontend/js/components/resume-match.js (resumeMatchSlot + fillResumeMatch). */
import { useEffect, useState } from "react";
import { S } from "../core/state.js";
import { resumeSkillSet, jobSkills, resumeMatch } from "./resume-match.js";

export function ResumeMatch({ job: j, done }) {
  const show = !done && !!S.U.profile.resumeFile;
  const want = show ? jobSkills(j) : [];
  const [st, setSt] = useState({ id: null }); // { id, have } or { id, error }
  useEffect(() => {
    if (!show || !want.length) return;
    let gone = false;
    resumeSkillSet().then(
      have => !gone && setSt({ id: j.id, have }),
      e => !gone && setSt({ id: j.id, error: e.message })
    );
    return () => {
      gone = true; // another job was opened meanwhile
    };
  }, [show, j.id, S.U.profile.resumeFile?.at]);
  if (!show || !want.length) return null;
  const mine = st.id === j.id ? st : {};
  let card;
  if (mine.error || !mine.have)
    card = (
      <div className="card">
        <h3>Your resume vs this job</h3>
        <p className="meta" style={{ margin: 0 }}>
          {mine.error || "Reading your resume…"}
        </p>
      </div>
    );
  else {
    const have = mine.have,
      { missing, pct } = resumeMatch(want, have);
    card = (
      <div className="card resume-match">
        <h3>
          Your resume vs this job <span className={"match " + (pct >= 70 ? "hi" : "")}>{pct}% match</span>
        </h3>
        {missing.length ? (
          <p>
            This job asks for <b>{missing.join(", ")}</b>, but your resume doesn't mention{" "}
            {missing.length > 1 ? "them" : "it"}. If you have this experience, add these words to your resume
            before applying: screening software looks for them.
          </p>
        ) : (
          <p>Your resume mentions every skill this job asks for.</p>
        )}
        <div className="facts" style={{ margin: 0 }}>
          {want.map(s => (
            <span
              key={s}
              className={have.has(s) ? "good" : "t"}
              title={have.has(s) ? "In your resume" : "Not in your resume"}
            >
              {have.has(s) ? "✓ " : ""}
              {s}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div id="resumeMatch" data-job={j.id}>
      {card}
    </div>
  );
}
