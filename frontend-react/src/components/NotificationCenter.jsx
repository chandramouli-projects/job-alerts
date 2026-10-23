/* Notification bell (top bar, next to your name) and its panel: newest first, grouped Today / Earlier,
   unread dot, "Mark all as read", and settings for what to be told about. On phones the panel opens
   from the bottom. Ported from frontend/js/components/notification-center.js. */
import { Fragment, useEffect } from "react";
import { createPortal } from "react-dom";
import { S, refresh, saveUser, useStore } from "../core/state.js";
import { ago, toast } from "../core/helpers.js";
import { Svg } from "./Svg.jsx";
import {
  notesState,
  unreadNotes,
  NOTE_KINDS,
  pushHere,
  checkPushHere,
  askDeviceAlerts,
  subscribePush,
  unsubscribePush,
} from "../services/notifications.js";
import {
  NOTE_ICON,
  noteGroups,
  openNote,
  openNotePanel,
  closeNotePanel,
  readAllNotes,
} from "./notification-center.js";

/* the bell, plus its panel (drawn at the end of the page, like before) */
export function Bell() {
  useStore();
  // a click outside the panel closes it; Esc closes it before anything else
  useEffect(() => {
    const onClick = e => {
      if (!S.noteOpen) return;
      // the path is taken when the click happens, so a button React already removed still counts as inside
      const inside = e.composedPath().some(el => el.id === "notePanel" || el.id === "noteBell");
      if (!inside) closeNotePanel();
    };
    const onKey = e => {
      if (e.key === "Escape" && S.noteOpen) {
        e.stopPropagation();
        closeNotePanel();
      }
    };
    document.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);
  if (!S.U) return null;
  const n = unreadNotes(),
    open = !!S.noteOpen;
  return (
    <>
      <button
        type="button"
        className="icon-btn np-bell"
        id="noteBell"
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
        aria-controls="notePanel"
        aria-label={"Notifications" + (n ? `, ${n} unread` : "")}
        data-tip="Notifications"
        onClick={() => (open ? closeNotePanel() : openNotePanel())}
      >
        <Svg svg={NOTE_ICON.bell} />
        {n ? (
          <span className="np-badge" aria-hidden="true">
            {n > 9 ? "9+" : n}
          </span>
        ) : null}
      </button>
      {createPortal(
        <>
          <div className="np-scrim" hidden={!open}></div>
          <section
            id="notePanel"
            className="np"
            role="dialog"
            aria-label="Notifications"
            hidden={!open}
            style={open && S.notePos ? S.notePos : undefined}
          >
            {open && (S.noteMode === "settings" ? <NoteSettings /> : <NoteList />)}
          </section>
        </>,
        document.body
      )}
    </>
  );
}

function NoteItem({ x }) {
  const kind = x.kind === "status" ? `status st-${x.stage || ""}` : x.kind;
  return (
    <button
      type="button"
      className={"np-item" + (x.read ? "" : " unread")}
      data-note={x.id}
      onClick={() => openNote(x.id)}
    >
      <span className={"np-ico k-" + kind}>
        <Svg svg={NOTE_ICON[x.kind] || NOTE_ICON.bell} />
      </span>
      <span className="np-txt">
        <b>{x.title}</b>
        <span>{x.body}</span>
        <small>{ago(new Date(x.at).toISOString())}</small>
      </span>
      {x.read ? null : <i className="np-dot" aria-label="Unread"></i>}
    </button>
  );
}

function NoteList() {
  const tab = S.noteTab || "all",
    all = notesState().items,
    items = tab === "unread" ? all.filter(x => !x.read) : all,
    unread = unreadNotes(),
    groups = noteGroups(items);
  const setTab = t => {
    S.noteTab = t;
    refresh();
  };
  return (
    <>
      <div className="np-head">
        <h2>Notifications</h2>
        <div className="np-acts">
          <button type="button" className="linkbtn" data-npreadall disabled={!unread} onClick={readAllNotes}>
            Mark all as read
          </button>
          <button
            type="button"
            className="icon-btn"
            data-npsettings
            aria-label="Notification settings"
            data-tip="Settings"
            onClick={() => {
              S.noteMode = "settings";
              refresh();
              checkPushHere()
                .then(refresh)
                .catch(() => {});
            }}
          >
            <Svg svg={NOTE_ICON.gear} />
          </button>
        </div>
      </div>
      <div className="np-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          data-nptab="all"
          aria-selected={tab === "all" ? "true" : "false"}
          onClick={() => setTab("all")}
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          data-nptab="unread"
          aria-selected={tab === "unread" ? "true" : "false"}
          onClick={() => setTab("unread")}
        >
          Unread
          {unread ? (
            <>
              {" "}
              <span>{unread}</span>
            </>
          ) : null}
        </button>
      </div>
      <div className="np-list">
        {groups.length ? (
          groups.map(([g, l]) => (
            <Fragment key={g}>
              <div className="np-group">{g}</div>
              {l.map(x => (
                <NoteItem key={x.id} x={x} />
              ))}
            </Fragment>
          ))
        ) : (
          <div className="np-empty">
            <span className="np-ico k-jobs">
              <Svg svg={NOTE_ICON.bell} />
            </span>
            <b>{tab === "unread" ? "You're all caught up" : "No notifications yet"}</b>
            <span>New jobs for you, saved-search matches and application updates will show here.</span>
          </div>
        )}
      </div>
    </>
  );
}

function DeviceRow() {
  const s = notesState().settings;
  if (!("Notification" in window))
    return (
      <div className="np-set">
        <div>
          <b>Phone / computer alerts</b>
          <small>This browser can't show alerts.</small>
        </div>
      </div>
    );
  const p = Notification.permission;
  if (p === "denied")
    return (
      <div className="np-set">
        <div>
          <b>Phone / computer alerts</b>
          <small>
            Blocked for this site. Allow notifications in your browser's site settings, then come back.
          </small>
        </div>
      </div>
    );
  const on = p === "granted" && s.device;
  const how = !on
    ? "Get an alert on this device for new jobs and updates."
    : pushHere
      ? "On. Alerts reach this device even when the app is closed."
      : S.SERVER
        ? "On while the app is open. Install the app, or allow it, to get alerts when it's closed."
        : "On while the app is open or running in the background.";
  return (
    <div className="np-set">
      <div>
        <b>Phone / computer alerts</b>
        <small>{how}</small>
      </div>
      {p === "granted" ? (
        <label className="toggle">
          <input
            type="checkbox"
            id="npDevice"
            checked={!!s.device}
            aria-label="Phone / computer alerts"
            onChange={e => {
              const on = e.target.checked;
              s.device = on;
              saveUser();
              refresh();
              (on ? subscribePush({ test: true }) : unsubscribePush()).catch(() => {}).finally(refresh);
            }}
          />
          <span></span>
        </label>
      ) : (
        <button type="button" className="btn sm" data-npdevice onClick={turnOnDevice}>
          Turn on
        </button>
      )}
    </div>
  );
}
async function turnOnDevice() {
  const p = await askDeviceAlerts();
  refresh();
  p === "granted"
    ? toast("Alerts are on for this device", "ok")
    : toast("Alerts were not allowed. You can allow them in your browser's site settings.");
  // with Web Push the server sends the "Alerts are on" test itself; otherwise show one here
  if (p === "granted" && !pushHere)
    navigator.serviceWorker?.getRegistration().then(r =>
      r?.showNotification("Alerts are on", {
        body: "You'll get new jobs and application updates here.",
        icon: "assets/icon-512.png",
        tag: "alerts-on",
      })
    );
  refresh();
}

function NoteSettings() {
  const s = notesState().settings;
  return (
    <>
      <div className="np-head">
        <button
          type="button"
          className="icon-btn"
          data-npback
          aria-label="Back to notifications"
          onClick={() => {
            S.noteMode = "list";
            refresh();
          }}
        >
          <Svg svg={NOTE_ICON.back} />
        </button>
        <h2>Notify me about</h2>
        <span></span>
      </div>
      <div className="np-list np-sets">
        {NOTE_KINDS.map(([k, l, d]) => (
          <div className="np-set" key={k}>
            <div>
              <b>{l}</b>
              <small>{d}</small>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                data-npkind={k}
                checked={s[k] !== false}
                aria-label={l}
                onChange={e => {
                  s[k] = e.target.checked;
                  saveUser();
                  refresh();
                }}
              />
              <span></span>
            </label>
          </div>
        ))}
        <DeviceRow />
      </div>
    </>
  );
}
