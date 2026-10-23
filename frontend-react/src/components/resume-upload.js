/* Resume: upload a PDF / Word file (Profile page, or the skills question when setting up), keep it,
   and pick skills from it. The person sees the skills found and chooses which to add.
   Ported from frontend/js/components/resume-upload.js (the cards are in ResumeUpload.jsx). */
import { S, refresh, saveUser } from "../core/state.js";
import { hasWord, toast } from "../core/helpers.js";
import { openSheet, closeSheet } from "../core/nav.js";
import { ask } from "./Ask.jsx";
import { mySkills } from "../services/matching.js";
import { resumeProblem, resumeText, resumeKind, findSkills } from "../services/resume-reader.js";
import { storeResume, loadResume, dropResume } from "../services/resume-store.js";
import { obSkills, obAddSkills } from "../pages/Onboarding.jsx";

// read by ResumeUpload.jsx (live bindings); every change is followed by refreshResume()
export let resumeBusy = false,
  resumeErr = "", // the Profile card's problem line
  resumeTarget = "profile";
// The setup screen keeps its own problem line in ObResume's state (it starts empty with each new setup screen)
let obErr = null;
export function setObErr(fn) {
  obErr = fn;
}
// a problem (or "" to clear it) for the card that started the upload
function setErr(text) {
  if (resumeTarget === "ob" && obErr) obErr(text);
  else resumeErr = text;
}
export const RESUME_ACCEPT =
  ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";
export const resumeInput = Object.assign(document.createElement("input"), {
  type: "file",
  accept: RESUME_ACCEPT,
  hidden: true,
  id: "resumeInput",
});
document.body.appendChild(resumeInput);
resumeInput.onchange = () => {
  const f = resumeInput.files[0];
  resumeInput.value = "";
  if (f) useResume(f);
};

export function refreshResume() {
  refresh();
}

/* "Upload" / "Replace" / "Fill from my resume": target is "profile" or "ob" (setting up) */
export function pickResume(target) {
  if (resumeBusy) return;
  resumeTarget = target;
  setErr("");
  resumeInput.click();
}
// a file dropped on the upload box
export function dropFile(f) {
  if (f && !resumeBusy) {
    resumeTarget = "profile";
    useResume(f);
  }
}

/* Upload: check, keep the file, read it, then show the skills found */
export async function useResume(file) {
  const bad = resumeProblem(file);
  setErr(bad);
  if (bad) {
    refreshResume();
    return;
  }
  resumeBusy = true;
  refreshResume();
  let text = "",
    readErr = "";
  try {
    S.U.profile.resumeFile = await storeResume(file);
    saveUser();
  } catch (e) {
    resumeBusy = false;
    setErr(e.message);
    refreshResume();
    return;
  }
  try {
    text = await resumeText(file);
  } catch (e) {
    readErr = e.message;
  }
  resumeBusy = false;
  refreshResume();
  showFoundSkills(file.name, text, readErr);
}
export function currentSkills() {
  return resumeTarget === "ob" ? obSkills() : mySkills(S.U.prefs);
}
// Opens the "Skills from your resume" panel (ResumeUpload.jsx registers it as "resumeSkills")
export function showFoundSkills(name, text, readErr) {
  const found = findSkills(text),
    have = currentSkills(),
    known = s => have.some(h => h === s || hasWord(h, s) || hasWord(s, h));
  const foundNew = found.filter(s => !known(s));
  const already = found.filter(known);
  const why =
    readErr ||
    (text.trim().length < 40
      ? "No text was found in it. It may be a scanned picture: upload a PDF made from Word or Google Docs instead."
      : "");
  openSheet("resumeSkills", { name, found, foundNew, already, why, picked: [...foundNew] });
}
// the chips the person kept switched on
export function pickedSkills() {
  return S.sheet?.kind === "resumeSkills" ? S.sheet.picked : [];
}
export function toggleSkill(s) {
  const p = S.sheet.picked;
  S.sheet.picked = p.includes(s) ? p.filter(x => x !== s) : [...p, s];
  refresh();
}
export function pickAllSkills() {
  S.sheet.picked = [...S.sheet.foundNew];
  refresh();
}
export function addFoundSkills() {
  const add = pickedSkills();
  if (resumeTarget === "ob") {
    obAddSkills(add);
  } else {
    S.U.prefs.skills = [...new Set([...S.U.prefs.skills, ...add])];
    saveUser();
  }
  closeSheet();
  refresh();
  toast(`Added ${add.length} skill${add.length === 1 ? "" : "s"} to your profile`, "ok");
}
export async function viewResume() {
  resumeErr = "";
  const R = S.U.profile.resumeFile,
    inTab = resumeKind(R.name) !== "docx",
    w = inTab ? window.open("", "_blank") : null;
  try {
    const blob = await loadResume(),
      url = URL.createObjectURL(new Blob([blob], { type: R.type || blob.type }));
    if (w) w.location.href = url;
    else Object.assign(document.createElement("a"), { href: url, download: R.name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    w?.close();
    resumeErr = e.message;
    refreshResume();
  }
}
export async function removeResume() {
  if (
    !(await ask(
      "Remove your resume?",
      "The file is deleted. The skills you added stay in your profile.",
      "Remove",
      true
    ))
  )
    return;
  try {
    await dropResume();
  } catch (err) {
    resumeErr = err.message;
    refreshResume();
    return;
  }
  delete S.U.profile.resumeFile;
  resumeErr = "";
  saveUser();
  refreshResume();
  toast("Resume removed");
}
// "Find skills again": read the kept file once more
export async function scanResume() {
  resumeTarget = "profile";
  setErr("");
  resumeBusy = true;
  refreshResume();
  try {
    const R = S.U.profile.resumeFile,
      file = new File([await loadResume()], R.name, { type: R.type });
    resumeBusy = false;
    refreshResume();
    let text = "",
      readErr = "";
    try {
      text = await resumeText(file);
    } catch (err) {
      readErr = err.message;
    }
    showFoundSkills(R.name, text, readErr);
  } catch (err) {
    resumeBusy = false;
    setErr(err.message);
    refreshResume();
  }
}
