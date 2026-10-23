/* Profile page logic: details, theme, change password, delete account.
   Ported from frontend/js/pages/profile.js (the page itself is in Profile.jsx). */
import { S, refresh, saveUser, api, applyTheme } from "../core/state.js";
import { LS, toast, hashPw } from "../core/helpers.js";
import { logout, closeSheet } from "../core/nav.js";
import { ask } from "../components/Ask.jsx";
import { dropResume } from "../services/resume-store.js";

export const PF = [
  ["name", "Full name"],
  ["email", "Email", "email"],
  ["phone", "Mobile number", "tel"],
  ["linkedin", "LinkedIn URL", "url"],
  ["resume", "Resume link (Google Drive etc.)", "url"],
  ["expectedCtc", "Expected salary", "text", "e.g. 8 LPA"],
  ["notice", "Notice period", "text", "e.g. 30 days / Immediate"],
];
// an uploaded resume counts as the resume link
export function completeness() {
  const P = S.U.profile;
  const f = PF.filter(([k]) => String(P[k] || "").trim() || (k === "resume" && P.resumeFile)).length;
  return Math.round((100 * f) / PF.length);
}
export const isOwner = () => S.U.settings.owner || location.hash.includes("owner");
// opening the site with #owner once turns on the owner card for good
export function markOwner() {
  if (location.hash.includes("owner") && !S.U.settings.owner) {
    S.U.settings.owner = true;
    saveUser();
  }
}

/* "Save details": values = { name, phone, … } from the form (email can't change) */
export function saveDetails(values) {
  for (const [k, v] of Object.entries(values)) if (k !== "email") S.U.profile[k] = v.trim();
  if (!S.U.profile.name) {
    toast("Name can't be empty.");
    return;
  }
  if (S.accounts[S.session.email]) {
    S.accounts[S.session.email].name = S.U.profile.name;
    LS.set("uv.accounts", S.accounts);
  }
  saveUser();
  refresh();
  toast("Details saved");
}
export function setTheme(t) {
  S.U.settings.theme = t;
  saveUser();
  applyTheme();
  refresh();
}

/* Change password (panel "password"): shows a problem in S.sheet.err */
function pwError(text) {
  if (S.sheet?.kind === "password") S.sheet.err = text;
  refresh();
}
export async function changePassword(old, nw) {
  if (S.SERVER) {
    try {
      await api("password", { old, new: nw });
    } catch (err) {
      pwError(err.message);
      return;
    }
    closeSheet();
    toast("Password changed");
    return;
  }
  const a = S.accounts[S.session.email];
  if (a.hash !== (await hashPw(old, a.salt))) {
    pwError("Current password is wrong.");
    return;
  }
  if (nw.length < 6) {
    pwError("New password needs at least 6 characters.");
    return;
  }
  a.hash = await hashPw(nw, a.salt);
  LS.set("uv.accounts", S.accounts);
  closeSheet();
  toast("Password changed");
}

export async function deleteAccount() {
  const pw = await ask(
    "Delete your account?",
    S.SERVER
      ? "All your data will be removed. This can't be undone. Enter your password to confirm."
      : "All your data will be removed. This can't be undone.",
    "Delete account",
    true,
    { password: S.SERVER }
  );
  if (!pw) return;
  if (S.SERVER) {
    try {
      await api("user", { password: pw }, "DELETE");
    } catch (err) {
      toast(err.message);
      return;
    }
  } else {
    try {
      await dropResume();
    } catch (err) {}
  }
  const email = S.session.email;
  LS.del("uv.user." + email);
  delete S.accounts[email];
  LS.set("uv.accounts", S.accounts);
  logout();
  toast("Account deleted");
}
