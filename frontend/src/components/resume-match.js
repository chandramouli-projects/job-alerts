/* "Your resume vs this job" in the job details (only when a resume is uploaded on the Profile page):
   the skills this job asks for that the resume doesn't mention. Company screening software (ATS)
   looks for these words, so the person can add the ones they really have before applying.
   The resume is read once per visit (services/resume-reader.js), in this browser only.
   Ported from frontend/js/components/resume-match.js; the card is ResumeMatch.jsx. */
import { S } from "../core/state.js";
import { loadResume } from "../services/resume-store.js";
import { findSkills, resumeText } from "../services/resume-reader.js";

let resumeWords = null,
  resumeWordsKey = "";
export async function resumeSkillSet() {
  const f = S.U.profile.resumeFile;
  if (!f) return null;
  const key = f.name + "|" + f.at;
  if (key !== resumeWordsKey) {
    const blob = await loadResume();
    resumeWords = new Set(findSkills(await resumeText(new File([blob], f.name, { type: blob.type }))));
    resumeWordsKey = key;
  }
  return resumeWords;
}
// the skills a job asks for (from its title and description)
export const jobSkills = j => findSkills(`${j.title || ""} ${j.description || ""}`);
// what the card shows once the resume is read
export function resumeMatch(want, have) {
  const missing = want.filter(s => !have.has(s)),
    pct = Math.round((100 * (want.length - missing.length)) / want.length);
  return { missing, pct };
}
