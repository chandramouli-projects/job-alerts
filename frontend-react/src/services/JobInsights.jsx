/* What the screens show from services/job-insights.js (old insightBadges, salaryChip, insightCard) */
import { scamCheck, postingAge, salaryGuess } from "./job-insights.js";

const AGE_ICON = { fresh: "⚡", old: "⏳", reposted: "↻" };

// small labels on a job card (css/components/job-insights.css)
export function InsightBadges({ job: j }) {
  const scam = scamCheck(j),
    age = postingAge(j);
  return (
    <>
      {scam.risk === "high" && (
        <span className="sig sig-scam" title={scam.reasons.join(". ")}>
          ⚠ Possible scam
        </span>
      )}
      {age && (
        <span className={"sig sig-" + age.kind} title={age.tip}>
          {AGE_ICON[age.kind]} {age.label}
        </span>
      )}
    </>
  );
}
// on a card without a salary: the typical one, marked as a guess
export function SalaryChip({ job: j }) {
  const g = salaryGuess(j);
  return g ? (
    <span className="t" title={`Typical salary from ${g.count} similar jobs in ${g.where}`}>
      ≈ {g.text}
    </span>
  ) : null;
}
// a card in the job details: warnings and tips about this posting
export function InsightCard({ job: j }) {
  const scam = scamCheck(j),
    age = postingAge(j),
    g = salaryGuess(j);
  if (!scam.risk && !age && !g) return null;
  return (
    <div className="card insight-card">
      <h3>Good to know</h3>
      <ul className="insights">
        {scam.risk && (
          <li className={scam.risk === "high" ? "bad" : ""}>
            <b>{scam.risk === "high" ? "⚠ This may be a fake job." : "Be careful."}</b>{" "}
            {scam.reasons.join(". ")}. Real companies never ask you to pay to get a job.
          </li>
        )}
        {age && (
          <li className={age.kind === "fresh" ? "ok" : ""}>
            <b>{age.label}.</b> {age.tip}
          </li>
        )}
        {g && (
          <li>
            <b>Salary not shared.</b> Similar jobs in {g.where} usually pay <b>{g.text}</b> (from {g.count}{" "}
            jobs).
          </li>
        )}
      </ul>
    </div>
  );
}
