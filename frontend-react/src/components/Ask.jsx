/* The "Are you sure?" pop-up (old #askModal). Call: if (await ask("Delete?", "This can't be undone.", "Delete", true)) …
   With { password: true } it also asks for the password and gives back the typed password (or false),
   for things like deleting the account. */
import { useEffect, useRef, useState } from "react";
import { S, refresh, useStore } from "../core/state.js";
import { PasswordField } from "./PasswordField.jsx";

export function ask(title, text, yes = "OK", red = false, { password = false } = {}) {
  return new Promise(resolve => {
    S.ask = { title, text, yes, red, password, resolve, at: Date.now() };
    refresh();
  });
}
export function answerAsk(v) {
  const a = S.ask;
  if (!a) return false;
  S.ask = null;
  refresh();
  a.resolve(v);
  return true;
}

export function AskModal() {
  useStore();
  const a = S.ask,
    yesRef = useRef(null),
    pwRef = useRef(null);
  const [pw, setPw] = useState(""),
    [err, setErr] = useState("");
  useEffect(() => {
    setPw("");
    setErr("");
    if (a) setTimeout(() => (a.password ? pwRef.current : yesRef.current)?.focus(), 30);
  }, [a?.at]);
  if (!a) return null;
  const yes = () => {
    if (!a.password) return answerAsk(true);
    if (!pw) return setErr("Enter your password.");
    answerAsk(pw);
  };
  return (
    <div
      className="modal"
      id="askModal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="askTitle"
      aria-describedby="askText"
      onClick={e => e.target === e.currentTarget && answerAsk(false)}
    >
      <div className="modal-card">
        <h2 id="askTitle">{a.title}</h2>
        <p className="sub" id="askText">
          {a.text}
        </p>
        {a.password && (
          <form
            id="askPwBox"
            noValidate
            onSubmit={e => {
              e.preventDefault();
              yes();
            }}
          >
            <label className="lbl" htmlFor="askPw">
              Password
            </label>
            <PasswordField
              id="askPw"
              autoComplete="current-password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              inputRef={pwRef}
            />
            <div className="err" id="askErr">
              {err}
            </div>
          </form>
        )}
        <div className="ask-btns">
          <button type="button" className="btn ghost" id="askNo" onClick={() => answerAsk(false)}>
            Cancel
          </button>
          <button
            type="button"
            className={"btn" + (a.red ? " red" : "")}
            id="askYes"
            ref={yesRef}
            onClick={yes}
          >
            {a.yes}
          </button>
        </div>
      </div>
    </div>
  );
}
