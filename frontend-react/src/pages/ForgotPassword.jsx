/* Forgot password (old #fpModal): email -> PIN shown on screen -> verify PIN -> new password -> done.
   Ported from frontend/js/pages/forgot-password.js. App.jsx shows it while S.forgotOpen (openForgot / closeForgot in core/nav.js). */
import { useEffect, useRef, useState } from "react";
import { S, api } from "../core/state.js";
import { LS, toast, copy, hashPw } from "../core/helpers.js";
import { closeForgot } from "../core/nav.js";
import { PasswordField } from "../components/PasswordField.jsx";
import { fillLogin } from "./Login.jsx";

let fpLocal = null; // without the server: { email, pin, until, tries } for this browser's accounts
const isEmail = v => /^\S+@\S+\.\S+$/.test(v.trim());

// close and give the focus back to "Forgot password?"
function closeFp() {
  closeForgot();
  setTimeout(() => document.getElementById("toForgot")?.focus(), 0);
}

export function ForgotPassword() {
  const [step, setStepRaw] = useState(1);
  const [email, setEmail] = useState(() => (S.loginEmail || "").trim()),
    [pin, setPin] = useState(""),
    [pw1, setPw1] = useState(""),
    [pw2, setPw2] = useState("");
  const [err, setErr] = useState({ 1: "", 2: "", 3: "" });
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState({ pin: "", email: "" }); // the PIN on screen and the email it is for
  const fpEmail = useRef(""),
    fpPin = useRef("");
  const refs = { 1: useRef(null), 2: useRef(null), 3: useRef(null), 4: useRef(null) };

  const setErr1 = (n, t) => setErr(e => ({ ...e, [n]: t }));
  const setStep = n => {
    setStepRaw(n);
    setErr({ 1: "", 2: "", 3: "" });
  };
  // focus the box of each step (the email box a moment after opening)
  useEffect(() => {
    const t = setTimeout(() => refs[step].current?.focus(), step === 1 ? 60 : 0);
    return () => clearTimeout(t);
  }, [step]);
  useEffect(() => {
    const onKey = e => e.key === "Escape" && closeFp();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Checks the PIN; the server counts wrong tries (5 max) for both verify and reset. Returns an error text or "".
  async function checkPin(p) {
    if (S.SERVER) {
      try {
        await api("verify", { email: fpEmail.current, pin: p });
        return "";
      } catch (e) {
        return e.message;
      }
    }
    const f = fpLocal;
    if (!f || f.email !== fpEmail.current || Date.now() > f.until)
      return "This PIN has expired. Get a new PIN.";
    if (f.pin !== p) {
      if (++f.tries >= 5) {
        fpLocal = null;
        return "Too many wrong PINs. Get a new PIN.";
      }
      return `Wrong PIN. ${5 - f.tries} tries left.`;
    }
    return "";
  }
  // Makes a PIN for the typed email. Returns an error text or "".
  async function generate() {
    const em = email.trim().toLowerCase();
    let p;
    if (S.SERVER) {
      try {
        p = (await api("forgot", { email: em })).pin;
      } catch (e) {
        return e.message;
      }
    } else {
      // without the server, accounts live only in this browser
      if (!S.accounts[em]) return "No account with this email.";
      p = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, "0");
      fpLocal = { email: em, pin: p, until: Date.now() + 600e3, tries: 0 };
    }
    fpEmail.current = em;
    fpPin.current = "";
    setShown({ pin: p, email: em });
    setPin("");
    return "";
  }

  async function submit1(e) {
    e.preventDefault();
    setErr1(1, "");
    setBusy(true);
    const bad = await generate();
    setBusy(false);
    if (bad) return setErr1(1, bad);
    setStep(2);
  }
  async function again() {
    const bad = await generate();
    if (!bad) {
      setErr1(2, "");
      toast("New PIN generated");
    } else setErr1(2, bad);
  }
  // Step 2: PIN must be right before the new-password step opens
  async function submit2(e) {
    e.preventDefault();
    const p = pin.trim();
    setErr1(2, "");
    setBusy(true);
    const bad = await checkPin(p);
    setBusy(false);
    if (bad) return setErr1(2, bad);
    fpPin.current = p;
    setPw1("");
    setPw2("");
    setStep(3);
  }
  async function submit3(e) {
    e.preventDefault();
    setErr1(3, "");
    if (pw1 !== pw2) return setErr1(3, "The two passwords don't match.");
    if (S.SERVER) {
      try {
        await api("reset", { email: fpEmail.current, pin: fpPin.current, password: pw1 });
      } catch (er) {
        return setErr1(3, er.message);
      }
    } else {
      const bad = await checkPin(fpPin.current);
      if (bad) return setErr1(3, bad);
      const a = S.accounts[fpEmail.current];
      a.hash = await hashPw(pw1, a.salt);
      LS.set("uv.accounts", S.accounts);
      fpLocal = null;
    }
    setStep(4);
  }
  function done() {
    const em = fpEmail.current;
    closeForgot();
    fillLogin(em);
  }

  return (
    <div className="modal" id="fpModal" role="dialog" aria-modal="true" aria-labelledby="fpTitle">
      <div className="modal-card fp-card">
        <div className="fp-side">
          <div className="brand">
            <img className="brand-logo" src="assets/logo.png" alt="" />
            Udyogam Vetuku
          </div>
          <div className="fp-pitch">
            <h3>Forgot your password?</h3>
            <ol className="fp-list">
              {["Enter your email", "Verify the PIN", "Set a new password"].map((t, i) => (
                <li
                  key={i}
                  data-n={i + 1}
                  className={i < step - 1 ? "done" : i === step - 1 ? "on" : undefined}
                >
                  {t}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="fp-main">
          <button type="button" className="modal-x" id="fpX" aria-label="Close" onClick={closeFp}>
            ×
          </button>
          <div data-fp="1" hidden={step !== 1}>
            <h2 id="fpTitle">Reset password</h2>
            <form id="fpForm1" noValidate onSubmit={submit1}>
              <div>
                <label className="lbl" htmlFor="fpEmail">
                  Email
                </label>
                <input
                  className="inp"
                  id="fpEmail"
                  type="email"
                  autoComplete="email"
                  ref={refs[1]}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="err" id="fpErr1">
                {err[1]}
              </div>
              <button className="btn" id="fpGen" type="submit" disabled={busy || !isEmail(email)}>
                Continue
              </button>
            </form>
          </div>
          <div data-fp="2" hidden={step !== 2}>
            <h2>Verify PIN</h2>
            <p className="sub fp-for">{shown.email}</p>
            <div className="pin-box">
              <b id="fpPinShow">{shown.pin}</b>
              <button type="button" className="btn ghost sm" id="fpCopy" onClick={() => copy(shown.pin)}>
                Copy
              </button>
            </div>
            <div className="fp-meta">
              <span>Expires in 10 minutes</span>
              <button type="button" className="linkbtn" id="fpAgain" onClick={again}>
                Resend PIN
              </button>
            </div>
            <form id="fpForm2" noValidate onSubmit={submit2}>
              <div>
                <label className="lbl" htmlFor="fpPin">
                  Enter PIN
                </label>
                <input
                  className="inp pin-inp"
                  id="fpPin"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="••••••"
                  ref={refs[2]}
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                />
              </div>
              <div className="err" id="fpErr2">
                {err[2]}
              </div>
              <button
                className="btn"
                id="fpVerify"
                type="submit"
                disabled={busy || !/^\d{6}$/.test(pin.trim())}
              >
                Verify
              </button>
            </form>
          </div>
          <div data-fp="3" hidden={step !== 3}>
            <h2>New password</h2>
            <p className="sub fp-for">{shown.email}</p>
            <form id="fpForm3" noValidate onSubmit={submit3}>
              <div>
                <label className="lbl" htmlFor="fpNew">
                  New password
                </label>
                <PasswordField
                  id="fpNew"
                  autoComplete="new-password"
                  placeholder="Minimum 6 characters"
                  inputRef={refs[3]}
                  value={pw1}
                  onChange={e => setPw1(e.target.value)}
                />
              </div>
              <div>
                <label className="lbl" htmlFor="fpNew2">
                  Confirm password
                </label>
                <PasswordField
                  id="fpNew2"
                  autoComplete="new-password"
                  value={pw2}
                  onChange={e => setPw2(e.target.value)}
                />
              </div>
              <div className="err" id="fpErr3">
                {err[3]}
              </div>
              <button className="btn" id="fpSave" type="submit" disabled={!(pw1.length >= 6 && pw2)}>
                Update password
              </button>
            </form>
          </div>
          <div data-fp="4" hidden={step !== 4} style={{ textAlign: "center" }}>
            <div className="modal-ico" style={{ margin: "0 auto 16px" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </div>
            <h2>Password updated</h2>
            <button className="btn" type="button" id="fpDone" ref={refs[4]} onClick={done}>
              Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
