/* Profile page: details, settings, change password, delete account. Ported from frontend/js/pages/profile.js. */
import { createRef, useEffect } from "react";
import { S, saveUser, useStore } from "../core/state.js";
import { EXP } from "../core/constants.js";
import { initials, splitList } from "../core/helpers.js";
import { logout, openSheet, closeSheet, startOnboarding } from "../core/nav.js";
import { Topbar } from "../components/Layout.jsx";
import { mySkills } from "../services/matching.js";
import { exportData, importData } from "../services/backup.js";
import { syncPrefs, openGh, syncMsg } from "../services/github-sync.js";
import "../services/GithubSync.jsx"; // the "Connect job search" panel opened by openGh()
import { registerSheet } from "../components/Sheet.jsx";
import { PasswordField } from "../components/PasswordField.jsx";
import { ResumeCard } from "../components/ResumeUpload.jsx";
import {
  PF,
  completeness,
  isOwner,
  markOwner,
  saveDetails,
  setTheme,
  changePassword,
  deleteAccount,
} from "./profile.js";

export function Profile() {
  useStore();
  useEffect(markOwner, []);
  const P = S.U.profile,
    p = S.U.prefs,
    st = S.U.settings,
    pc = completeness();
  const roles = [...p.roles, ...splitList(p.custom)],
    skills = mySkills(p);
  const onSave = e => {
    e.preventDefault();
    const values = {};
    e.currentTarget.querySelectorAll("[data-pf]").forEach(el => (values[el.dataset.pf] = el.value));
    saveDetails(values);
  };
  return (
    <>
      <Topbar title="Profile" />
      <div className="card">
        <div className="phead">
          <span className="avatar">{initials(P.name)}</span>
          <div>
            <h2>{P.name}</h2>
            <div className="meta">{P.email}</div>
          </div>
        </div>
        <div className="meter">
          <i style={{ width: pc + "%" }}></i>
        </div>
        <small className="meta">Profile {pc}% complete</small>
      </div>
      <div className="card">
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}
        >
          <h3 style={{ margin: 0 }}>My job details</h3>
          <button
            className="btn ghost sm"
            data-editprefs
            onClick={() => {
              closeSheet();
              startOnboarding();
            }}
          >
            Edit
          </button>
        </div>
        <div className="kv">
          <div>
            <small>Role</small>
            <b>{roles.join(", ") || "—"}</b>
          </div>
          <div>
            <small>Experience</small>
            <b>{EXP.find(e => e[0] === p.exp)?.[1] || "—"}</b>
          </div>
          <div>
            <small>Cities</small>
            <b>{p.cities.join(", ") || "—"}</b>
          </div>
          <div>
            <small>Skills</small>
            <b>{skills.join(", ") || "—"}</b>
          </div>
        </div>
      </div>
      <ResumeCard />
      <form className="card form-card" id="profileForm" onSubmit={onSave}>
        <h3>Personal details</h3>
        <div className="grid2">
          {PF.map(([k, l, type = "text", ph = ""]) => (
            <div className="row" key={k}>
              <label className="lbl" htmlFor={"pf_" + k}>
                {l}
              </label>
              <input
                className="inp"
                id={"pf_" + k}
                data-pf={k}
                type={type}
                defaultValue={P[k] ?? ""}
                placeholder={ph}
                readOnly={k === "email"}
              />
            </div>
          ))}
        </div>
        <div className="actions">
          <button className="btn" type="submit">
            Save details
          </button>
        </div>
      </form>
      <div className="card">
        <h3>Settings</h3>
        <div className="set-row">
          <div>
            <b>Theme</b>
          </div>
          <div className="seg">
            {["system", "light", "dark"].map(t => (
              <button
                key={t}
                data-theme-set={t}
                aria-pressed={st.theme === t ? "true" : "false"}
                onClick={() => setTheme(t)}
              >
                {t === "system" ? "Auto" : t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="set-row">
          <div>
            <b>Change password</b>
          </div>
          <button className="btn ghost sm" data-pw onClick={() => openSheet("password", { err: "" })}>
            Change
          </button>
        </div>
        <div className="set-row">
          <div>
            <b>Backup</b>
          </div>
          <span style={{ display: "flex", gap: 6 }}>
            <button className="btn ghost sm" data-export onClick={exportData}>
              Backup
            </button>
            <label className="btn ghost sm" style={{ cursor: "pointer" }}>
              Restore
              <input type="file" id="importFile" accept="application/json" hidden onChange={importData} />
            </label>
          </span>
        </div>
        <div className="set-row">
          <div>
            <b>Log out</b>
          </div>
          <button className="btn ghost sm" data-logout onClick={logout}>
            Log out
          </button>
        </div>
        <div className="set-row">
          <div>
            <b>Delete account</b>
          </div>
          <button className="btn danger sm" data-delacc onClick={deleteAccount}>
            Delete
          </button>
        </div>
      </div>
      {isOwner() ? (
        <div className="card">
          <h3>Telegram alerts (site owner)</h3>
          <div className="set-row">
            <div>
              <b>Send my matching jobs to Telegram</b>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                id="setTg"
                checked={!!st.telegram}
                onChange={e => {
                  st.telegram = e.target.checked;
                  saveUser();
                  syncPrefs();
                }}
              />
              <span></span>
            </label>
          </div>
          <div className="set-row">
            <div>
              <b>Connection key</b>
              <small>{st.ghToken ? "Connected" : "Not connected"}</small>
            </div>
            <button className="btn ghost sm" data-gh onClick={openGh}>
              {st.ghToken ? "Change" : "Connect"}
            </button>
          </div>
          <div className="err" id="syncMsg" style={{ color: "var(--muted)" }}>
            {syncMsg}
          </div>
        </div>
      ) : null}
    </>
  );
}

/* The "Change password" panel */
const pwOld = createRef(),
  pwNew = createRef();
registerSheet("password", s => ({
  title: "Change password",
  body: (
    <>
      <div style={{ marginBottom: 12 }}>
        <label className="lbl" htmlFor="pwOld">
          Current password
        </label>
        <PasswordField id="pwOld" autoComplete="current-password" inputRef={pwOld} />
      </div>
      <div>
        <label className="lbl" htmlFor="pwNew">
          New password
        </label>
        <PasswordField id="pwNew" autoComplete="new-password" inputRef={pwNew} />
        <div className="hint">At least 6 characters.</div>
      </div>
      <div className="err" id="pwErr">
        {s.err}
      </div>
    </>
  ),
  foot: (
    <button
      className="btn"
      data-pwsave
      style={{ flex: 1 }}
      onClick={() => changePassword(pwOld.current?.value || "", pwNew.current?.value || "")}
    >
      Change password
    </button>
  ),
}));
