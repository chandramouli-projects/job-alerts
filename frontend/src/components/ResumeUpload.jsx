/* Resume card on the Profile page, the "Fill from my resume" line when setting up, and the
   "Skills from your resume" panel. Ported from frontend/js/components/resume-upload.js. */
import { useEffect, useState } from "react";
import { S, useStore } from "../core/state.js";
import { ICON } from "../core/constants.js";
import { fmtDate } from "../core/helpers.js";
import { closeSheet } from "../core/nav.js";
import { Svg } from "./Svg.jsx";
import { registerSheet } from "./Sheet.jsx";
import { RESUME_KINDS, resumeKind, fileSize } from "../services/resume-reader.js";
import {
  resumeBusy,
  resumeErr,
  pickResume,
  setObErr,
  dropFile,
  viewResume,
  removeResume,
  scanResume,
  toggleSkill,
  pickAllSkills,
  addFoundSkills,
} from "./resume-upload.js";

/* Profile page card */
export function ResumeCard() {
  useStore();
  const [over, setOver] = useState(false);
  const R = S.U.profile.resumeFile,
    kind = R && resumeKind(R.name);
  const body = resumeBusy ? (
    <div className="rs-busy" role="status">
      <span className="rs-spin"></span>Reading your resume…
    </div>
  ) : R ? (
    <>
      <div className="rs-file">
        <span className="rs-ico" data-kind={kind || ""}>
          <Svg svg={ICON.file} />
          <b>{RESUME_KINDS[kind] || "File"}</b>
        </span>
        <div className="rs-name">
          <b title={R.name}>{R.name}</b>
          <small>
            {fileSize(R.size || 0)} · Uploaded {fmtDate(R.at)}
            {S.SERVER ? "" : " · Kept in this browser"}
          </small>
        </div>
        <div className="rs-acts">
          <button type="button" className="btn ghost sm" data-rsview onClick={viewResume}>
            {kind === "docx" ? "Download" : "View"}
          </button>
          <button
            type="button"
            className="btn ghost sm"
            data-rsupload="profile"
            onClick={() => pickResume("profile")}
          >
            Replace
          </button>
          <button
            type="button"
            className="btn danger sm"
            data-rsremove
            aria-label="Remove resume"
            onClick={removeResume}
          >
            Remove
          </button>
        </div>
      </div>
      <div className="rs-foot">
        <span>Added new skills to your resume?</span>
        <button type="button" className="linkbtn" data-rsscan onClick={scanResume}>
          Find skills again
        </button>
      </div>
    </>
  ) : (
    <button
      type="button"
      className={"rs-drop" + (over ? " over" : "")}
      data-rsupload="profile"
      onClick={() => pickResume("profile")}
      onDragOver={e => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault();
        setOver(false);
        dropFile(e.dataTransfer.files[0]);
      }}
    >
      <span className="rs-up">
        <Svg svg={ICON.upload} />
      </span>
      <b>Upload your resume</b>
      <span>Drag it here or click to choose · PDF or Word (.docx), up to 2 MB</span>
    </button>
  );
  return (
    <div className="card" id="resumeCard">
      <div className="rs-head">
        <h3>Resume</h3>
      </div>
      {body}
      <div className="err" id="resumeErr" role="alert">
        {resumeErr}
      </div>
    </div>
  );
}

/* Setting up: a short line under "What are your skills?" (goes inside the old #obResume box) */
export function ObResume() {
  useStore();
  // its own problem line: starts empty with each new setup screen
  const [err, setErr] = useState("");
  useEffect(() => {
    setObErr(setErr);
    return () => setObErr(null);
  }, []);
  const R = S.U?.profile.resumeFile;
  return (
    <>
      {resumeBusy ? (
        <span className="rs-busy sm" role="status">
          <span className="rs-spin"></span>Reading your resume…
        </span>
      ) : (
        <>
          <button
            type="button"
            className="btn ghost sm rs-obbtn"
            data-rsupload="ob"
            onClick={() => pickResume("ob")}
          >
            <Svg svg={ICON.upload} />
            {R ? "Upload another resume" : "Fill from my resume"}
          </button>
          <span className="meta">
            {R ? `${R.name} uploaded` : "PDF or Word · we pick the skills for you"}
          </span>
          {err ? (
            <div className="err" role="alert">
              {err}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

/* The "Skills from your resume" panel: s comes from showFoundSkills() */
function FoundSkills({ s }) {
  const { name, found, foundNew, already, why, picked } = s;
  if (why)
    return (
      <div className="rs-note">
        <Svg svg={ICON.file} />
        <div>
          <b>Your resume is saved, but we couldn't read skills from it.</b>
          <p>{why}</p>
        </div>
      </div>
    );
  if (!found.length)
    return (
      <div className="rs-note">
        <Svg svg={ICON.file} />
        <div>
          <b>Your resume is saved.</b>
          <p>No skills found in it. Add them yourself.</p>
        </div>
      </div>
    );
  return (
    <>
      <p className="rs-sub">
        We found{" "}
        <b>
          {found.length} skill{found.length === 1 ? "" : "s"}
        </b>{" "}
        in {name}.
        {foundNew.length
          ? " Choose the ones to add to your profile."
          : " They are all in your profile already."}
      </p>
      {foundNew.length ? (
        <>
          <div className="rs-pickhead">
            <span>New skills</span>
            <button type="button" className="linkbtn" data-rsall onClick={pickAllSkills}>
              Select all
            </button>
          </div>
          <div className="rs-chips">
            {foundNew.map(k => (
              <button
                type="button"
                key={k}
                className="rs-chip"
                data-rsk={k}
                aria-pressed={picked.includes(k) ? "true" : "false"}
                onClick={() => toggleSkill(k)}
              >
                {k}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {already.length ? (
        <>
          <div className="rs-pickhead">
            <span>Already in your profile</span>
          </div>
          <div className="rs-chips">
            {already.map(k => (
              <span key={k} className="rs-chip have">
                {k}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
registerSheet("resumeSkills", s => {
  const n = s.picked.length;
  return {
    title: "Skills from your resume",
    body: <FoundSkills s={s} />,
    foot:
      s.foundNew.length && !s.why ? (
        <>
          <button className="btn ghost" data-rsskip onClick={closeSheet}>
            Not now
          </button>
          <button className="btn" data-rsadd disabled={!n} onClick={addFoundSkills}>
            {n ? `Add ${n} skill${n === 1 ? "" : "s"}` : "Pick skills to add"}
          </button>
        </>
      ) : (
        <button className="btn" data-rsskip onClick={closeSheet}>
          Done
        </button>
      ),
  };
});
