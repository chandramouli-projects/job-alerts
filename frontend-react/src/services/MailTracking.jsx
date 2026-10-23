/* Above the applications: "Connect Gmail" (live site), or which Gmail is connected and when it was read.
   Old mailBar() in frontend/js/services/mail-tracking.js. */
import { useState } from "react";
import { S, useStore } from "../core/state.js";
import { ago } from "../core/helpers.js";
import { Svg } from "../components/Svg.jsx";
import { MAIL, mailSync, gmailConnect, gmailOff } from "./mail-tracking.js";

export const MAIL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>';

// a "Connect Gmail" / "Connect again" button: says "Opening Google…" while it waits
function ConnectBtn({ className, label }) {
  const [busy, setBusy] = useState(false),
    [text, setText] = useState(label);
  return (
    <button
      type="button"
      className={className}
      data-gmailconnect=""
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setText("Opening Google…");
        if (!(await gmailConnect())) {
          setBusy(false);
          setText("Connect Gmail");
        }
      }}
    >
      {text}
    </button>
  );
}
function SyncBtn() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost sm"
      data-mailsync=""
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await mailSync();
        setBusy(false);
      }}
    >
      {busy ? "Checking…" : "Check now"}
    </button>
  );
}

export function MailBar() {
  useStore();
  if (!S.SERVER) return null;
  if (!MAIL.connected)
    return MAIL.canConnect ? (
      <section className="mail-connect" aria-labelledby="mcTitle">
        <span className="mc-ico">
          <Svg svg={MAIL_ICON} />
        </span>
        <div className="mc-txt">
          <h3 id="mcTitle">Track every application automatically</h3>
          <p>
            Connect Gmail and your applications update by themselves from job-site emails: LinkedIn, Naukri,
            Indeed, Workday and more, even jobs you applied to outside this app.
          </p>
          <small>
            Read-only. Only emails from job sites are looked at. Nothing is sent, changed or kept.
          </small>
        </div>
        <ConnectBtn className="btn" label="Connect Gmail" />
      </section>
    ) : null;
  return (
    <div className={"mailbar " + (MAIL.error ? "bad" : "")}>
      <span className="mb-txt">
        <Svg svg={MAIL_ICON} />
        {MAIL.error
          ? `Couldn't read Gmail: ${MAIL.error}`
          : `Tracking from ${MAIL.gmail || "Gmail"}${MAIL.lastRun ? ` · checked ${ago(new Date(MAIL.lastRun).toISOString())}` : ""}`}
      </span>
      <span className="mb-acts">
        {MAIL.error && MAIL.canConnect !== false && MAIL.gmail !== undefined && (
          <ConnectBtn className="btn sm" label="Connect again" />
        )}
        <SyncBtn />
        {MAIL.gmail !== undefined && (
          <button type="button" className="linkbtn" data-gmailoff="" onClick={gmailOff}>
            Disconnect
          </button>
        )}
      </span>
    </div>
  );
}
