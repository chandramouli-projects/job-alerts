/* Right-hand panel on wide screens (#rail): free career tools for the job hunt (links to other sites, not ads).
   Ported from frontend/js/components/rail.js. */
import { S, useStore } from "../core/state.js";
import { completeness } from "../pages/profile.js";
import { goTo } from "./Layout.jsx";

export const RAIL_LINKS = {
  resume: [
    ["Canva Resume Builder", "Free designer templates", "https://www.canva.com/create/resumes/"],
    [
      "Overleaf CV templates",
      "Clean, ATS-friendly resumes",
      "https://www.overleaf.com/latex/templates/tagged/cv",
    ],
    ["Resume Worded", "Free resume score and fixes", "https://resumeworded.com/"],
  ],
  // {q} becomes the person's role, so each link opens questions for that role
  prep: [
    [
      "GeeksforGeeks",
      "Questions asked by companies",
      "https://www.geeksforgeeks.org/search/?gq={q}%20interview%20questions",
    ],
    [
      "YouTube",
      "Mock interviews you can watch",
      "https://www.youtube.com/results?search_query={q}+interview+questions",
    ],
    ["InterviewBit", "Interview questions and practice", "https://www.interviewbit.com/"],
  ],
  learn: [
    ["NPTEL", "Free IIT courses with certificates", "https://nptel.ac.in/"],
    ["Skill India Digital", "Government skill courses", "https://www.skillindiadigital.gov.in/"],
    ["freeCodeCamp", "Free coding certifications", "https://www.freecodecamp.org/"],
  ],
};
export const TIPS = [
  "Apply within 3 days of a job being posted. Early applicants are read first.",
  "Copy 3–4 skills from the job post into your resume, in the same words.",
  "Keep your resume to 1 page if you have under 5 years of experience.",
  "Follow up 7 days after applying with a short, polite message.",
  'Put numbers in your resume: "cut test time by 30%" beats "improved testing".',
  "Keep your LinkedIn headline the same as the job title you want.",
  "Save your resume as PDF named Firstname-Lastname-Role.pdf.",
  "Before an interview, read the company's last 3 news items.",
  'Prepare a 60-second answer to "Tell me about yourself".',
  "Ask one question at the end of every interview; it shows interest.",
];

function Box({ title, items, role }) {
  return (
    <section className="rail-card">
      <h3>{title}</h3>
      <ul className="rail-list">
        {items.map(([n, d, u]) => (
          <li key={n}>
            <a href={u.replace("{q}", encodeURIComponent(role || "job"))} target="_blank" rel="noopener">
              <span className="rail-ico">{n[0]}</span>
              <span>
                <b>{n}</b>
                <small>{d}</small>
              </span>
              <i aria-hidden="true">↗</i>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Rail() {
  useStore();
  const U = S.U;
  return (
    <aside className="rail" id="rail" aria-label="Career tools">
      {U && <RailBody />}
    </aside>
  );
}

function RailBody() {
  const pc = completeness(),
    role = (S.U.prefs.roles[0] || "").replace(" / ", " "),
    tip = TIPS[Math.floor(Date.now() / 864e5) % TIPS.length];
  return (
    <>
      {pc < 100 && (
        <section className="rail-card">
          <h3>{`Your profile is ${pc}% complete`}</h3>
          <div className="rail-bar">
            <i style={{ width: pc + "%" }}></i>
          </div>
          <button className="btn ghost sm" data-go="profile" onClick={() => goTo("profile")}>
            Complete profile
          </button>
        </section>
      )}
      <Box title="Build your resume" items={RAIL_LINKS.resume} role={role} />
      <Box
        title={role ? `Prepare for ${role} interviews` : "Prepare for interviews"}
        items={RAIL_LINKS.prep}
        role={role}
      />
      <Box title="Learn a new skill" items={RAIL_LINKS.learn} role={role} />
      <section className="rail-card rail-tip">
        <h3>Tip of the day</h3>
        <p>{tip}</p>
      </section>
    </>
  );
}
