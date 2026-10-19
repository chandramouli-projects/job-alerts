/* Profile page: details, settings, change password, delete account */
const PF = [
  ["name", "Full name"],
  ["email", "Email", "email"],
  ["phone", "Mobile number", "tel"],
  ["linkedin", "LinkedIn URL", "url"],
  ["resume", "Resume link (Google Drive etc.)", "url"],
  ["expectedCtc", "Expected salary", "text", "e.g. 8 LPA"],
  ["notice", "Notice period", "text", "e.g. 30 days / Immediate"],
];
// an uploaded resume counts as the resume link
function completeness() {
  const f = PF.filter(
    ([k]) => String(U.profile[k] || "").trim() || (k === "resume" && U.profile.resumeFile)
  ).length;
  return Math.round((100 * f) / PF.length);
}
const isOwner = () => U.settings.owner || location.hash.includes("owner");
function renderProfile() {
  const P = U.profile,
    p = U.prefs,
    S = U.settings,
    pc = completeness();
  const roles = [...p.roles, ...splitList(p.custom)],
    skills = mySkills(p);
  if (location.hash.includes("owner") && !S.owner) {
    S.owner = true;
    saveUser();
  }
  $("main").innerHTML =
    topbar("Profile") +
    `
  <div class="card"><div class="phead"><span class="avatar">${initials(P.name)}</span><div><h2>${esc(P.name)}</h2><div class="meta">${esc(P.email)}</div></div></div>
    <div class="meter"><i style="width:${pc}%"></i></div><small class="meta">Profile ${pc}% complete</small></div>
  <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0">My job details</h3><button class="btn ghost sm" data-editprefs>Edit</button></div>
    <div class="kv"><div><small>Role</small><b>${esc(roles.join(", ") || "—")}</b></div><div><small>Experience</small><b>${esc(EXP.find(e => e[0] === p.exp)?.[1] || "—")}</b></div>
    <div><small>Cities</small><b>${esc(p.cities.join(", ") || "—")}</b></div><div><small>Skills</small><b>${esc(skills.join(", ") || "—")}</b></div></div></div>
  ${resumeCard()}
  <form class="card form-card" id="profileForm"><h3>Personal details</h3>
    <div class="grid2">${PF.map(([k, l, type = "text", ph = ""]) => `<div class="row"><label class="lbl" for="pf_${k}">${l}</label><input class="inp" id="pf_${k}" data-pf="${k}" type="${type}" value="${esc(P[k])}" placeholder="${esc(ph)}" ${k === "email" ? "readonly" : ""}></div>`).join("")}</div>
    <div class="actions"><button class="btn" type="submit">Save details</button></div></form>
  <div class="card"><h3>Settings</h3>
    <div class="set-row"><div><b>Theme</b></div><div class="seg">${["system", "light", "dark"].map(t => `<button data-theme-set="${t}" aria-pressed="${S.theme === t}">${t === "system" ? "Auto" : t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div></div>
    <div class="set-row"><div><b>Change password</b></div><button class="btn ghost sm" data-pw>Change</button></div>
    <div class="set-row"><div><b>Backup</b></div><span style="display:flex;gap:6px"><button class="btn ghost sm" data-export>Backup</button><label class="btn ghost sm" style="cursor:pointer">Restore<input type="file" id="importFile" accept="application/json" hidden></label></span></div>
    <div class="set-row"><div><b>Log out</b></div><button class="btn ghost sm" data-logout>Log out</button></div>
    <div class="set-row"><div><b>Delete account</b></div><button class="btn danger sm" data-delacc>Delete</button></div></div>
  ${
    isOwner()
      ? `<div class="card"><h3>Telegram alerts (site owner)</h3>
    <div class="set-row"><div><b>Send my matching jobs to Telegram</b></div><label class="toggle"><input type="checkbox" id="setTg" ${S.telegram ? "checked" : ""}><span></span></label></div>
    <div class="set-row"><div><b>Connection key</b><small>${S.ghToken ? "Connected" : "Not connected"}</small></div><button class="btn ghost sm" data-gh>${S.ghToken ? "Change" : "Connect"}</button></div>
    <div class="err" id="syncMsg" style="color:var(--muted)"></div></div>`
      : ""
  }`;
  $("profileForm").onsubmit = e => {
    e.preventDefault();
    document.querySelectorAll("[data-pf]").forEach(el => {
      if (el.dataset.pf !== "email") U.profile[el.dataset.pf] = el.value.trim();
    });
    if (!U.profile.name) {
      toast("Name can't be empty.");
      return;
    }
    if (accounts[session.email]) {
      accounts[session.email].name = U.profile.name;
      LS.set("uv.accounts", accounts);
    }
    saveUser();
    renderNav();
    renderProfile();
    toast("Details saved");
  };
  $("importFile").onchange = importData;
  $("setTg")?.addEventListener("change", e => {
    S.telegram = e.target.checked;
    saveUser();
    syncPrefs();
  });
}

/* buttons on this screen */
onAppClick(async (d, t, e) => {
  if (d.themeSet) {
    U.settings.theme = d.themeSet;
    saveUser();
    applyTheme();
    renderProfile();
    return;
  }
  if ("logout" in d) {
    logout();
    return;
  }
  if ("pw" in d) {
    openSheet(
      "Change password",
      `<div style="margin-bottom:12px"><label class="lbl" for="pwOld">Current password</label>${pwInput("pwOld", "current-password")}</div>
      <div><label class="lbl" for="pwNew">New password</label>${pwInput("pwNew", "new-password")}<div class="hint">At least 6 characters.</div></div><div class="err" id="pwErr"></div>`,
      `<button class="btn" data-pwsave style="flex:1">Change password</button>`
    );
    syncEyes();
    return;
  }
  if ("pwsave" in d && SERVER) {
    try {
      await api("password", { old: $("pwOld").value, new: $("pwNew").value });
    } catch (err) {
      $("pwErr").textContent = err.message;
      return;
    }
    closeSheet();
    toast("Password changed");
    return;
  }
  if ("pwsave" in d) {
    const a = accounts[session.email];
    if (a.hash !== (await hashPw($("pwOld").value, a.salt))) {
      $("pwErr").textContent = "Current password is wrong.";
      return;
    }
    const nw = $("pwNew").value;
    if (nw.length < 6) {
      $("pwErr").textContent = "New password needs at least 6 characters.";
      return;
    }
    a.hash = await hashPw(nw, a.salt);
    LS.set("uv.accounts", accounts);
    closeSheet();
    toast("Password changed");
    return;
  }
  if ("delacc" in d) {
    if (
      !(await ask(
        "Delete your account?",
        "All your data will be removed. This can't be undone.",
        "Delete account",
        true
      ))
    )
      return;
    if (SERVER) {
      try {
        await api("user", null, "DELETE");
      } catch (err) {
        toast(err.message);
        return;
      }
    } else {
      try {
        await dropResume();
      } catch (err) {}
    }
    LS.del("uv.user." + session.email);
    delete accounts[session.email];
    LS.set("uv.accounts", accounts);
    logout();
    toast("Account deleted");
    return;
  }
});
