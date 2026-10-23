/* The interview prep card in the job details (Shortlisted / Interview).
   Ported from frontend/js/components/interview-prep.js (interviewPrep). */
import { safeUrl } from "../core/helpers.js";
import { interviewPrep, PREP_BEFORE } from "./interview-prep.js";

const List = ({ items }) => (
  <ul className="prep-list">
    {items.map((x, i) => (
      <li key={i}>{x}</li>
    ))}
  </ul>
);

export function InterviewPrep({ job: j, t }) {
  const p = interviewPrep(j, t);
  if (!p) return null;
  return (
    <div className="card prep-card">
      <h3>{p.heading}</h3>
      <b className="prep-h">Common questions</b>
      <List items={p.questions} />
      <b className="prep-h">Research {p.co}</b>
      <div className="prep-links">
        {p.links.map(([l, u]) => (
          <a className="btn ghost sm" key={l} href={safeUrl(u)} target="_blank" rel="noopener">
            {l} ↗
          </a>
        ))}
      </div>
      <b className="prep-h">Before the interview</b>
      <List items={PREP_BEFORE} />
    </div>
  );
}
