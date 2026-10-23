/* Login and Create account (old #auth). Ported from frontend/js/pages/login.js; showAuth / logout are in core/nav.js. */
import { useEffect, useRef, useState } from "react";
import { S, useStore, api, saveUser, blankUser, withDefaults, applyTheme } from "../core/state.js";
import { LS, toast, hashPw } from "../core/helpers.js";
import { setAuthMode, openForgot, startOnboarding, openShell } from "../core/nav.js";
import { PasswordField } from "../components/PasswordField.jsx";
import { LoginBackground } from "./LoginBackground.jsx";

/* Forgot password reads the typed email (S.loginEmail) and, when done, puts the email back here with an
   empty password box (fillLogin). */
let filler = null;
export function fillLogin(email) {
  filler?.(email);
}

// an account made earlier in this browser only: move it, with everything saved, to the server
export async function moveToServer(email, pw, a) {
  const user = LS.get("uv.user." + email, null),
    s = await api("signup", { name: a.name, email, phone: user?.profile?.phone || "", password: pw });
  LS.set("uv.token", s.token);
  if (user) await api("user", user, "PUT");
  return { token: s.token, name: a.name, user };
}

function Brand({ className = "brand" }) {
  return (
    <div className={className}>
      <img className="brand-logo" src="assets/logo.png" alt="" />
      Udyogam Vetuku
    </div>
  );
}

export function Login() {
  useStore();
  const mode = S.authMode;
  const [lEmail, setLEmail] = useState(S.loginEmail || ""),
    [lPass, setLPass] = useState(""),
    [lErr, setLErr] = useState("");
  const [sName, setSName] = useState(""),
    [sEmail, setSEmail] = useState(""),
    [sPhone, setSPhone] = useState(""),
    [sPass, setSPass] = useState(""),
    [sErr, setSErr] = useState("");
  const lPassRef = useRef(null);

  useEffect(() => {
    S.loginEmail = lEmail; // kept in S so Forgot password can start with it (old $("lEmail").value)
  }, [lEmail]);
  useEffect(() => {
    filler = email => {
      setAuthMode("login");
      setLEmail(email);
      setLPass("");
      setLErr("");
      setTimeout(() => lPassRef.current?.focus(), 0);
    };
    return () => {
      filler = null;
    };
  }, []);

  async function signup(e) {
    e.preventDefault();
    const name = sName.trim(),
      email = sEmail.trim().toLowerCase(),
      phone = sPhone.trim(),
      pw = sPass;
    if (!name) return setSErr("Enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setSErr("Enter a valid email.");
    if (pw.length < 6) return setSErr("Password needs at least 6 characters.");
    if (S.SERVER) {
      try {
        const d = await api("signup", { name, email, phone, password: pw });
        LS.set("uv.token", d.token);
      } catch (err) {
        return setSErr(err.message);
      }
      S.U = blankUser(name, email, phone);
      S.session = { email };
      LS.set("uv.session", S.session);
      saveUser();
      return startOnboarding();
    }
    if (S.accounts[email]) return setSErr("An account with this email already exists. Log in instead.");
    const salt = crypto.getRandomValues
      ? [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16)).join("")
      : String(Math.random());
    S.accounts[email] = { name, salt, hash: await hashPw(pw, salt), createdAt: Date.now() };
    LS.set("uv.accounts", S.accounts);
    S.U = blankUser(name, email, phone);
    S.session = { email };
    LS.set("uv.session", S.session);
    saveUser();
    startOnboarding();
  }

  async function login(e) {
    e.preventDefault();
    const email = lEmail.trim().toLowerCase(),
      pw = lPass,
      a = S.accounts[email];
    if (S.SERVER) {
      let d,
        moved = false;
      try {
        d = await api("login", { email, password: pw });
      } catch (err) {
        d =
          a && a.hash === (await hashPw(pw, a.salt))
            ? await moveToServer(email, pw, a).catch(() => null)
            : null;
        if (!d) return setLErr(err.message);
        moved = true;
      }
      LS.set("uv.token", d.token);
      S.session = { email };
      LS.set("uv.session", S.session);
      S.view = "jobs";
      S.U = withDefaults(d.user, d.name, email);
      applyTheme();
      if (moved)
        setTimeout(() => toast("Your account is now online: log in from any phone or computer.", "ok"), 300);
      return S.U.onboarded ? openShell() : startOnboarding();
    }
    if (!a || a.hash !== (await hashPw(pw, a.salt))) return setLErr("Email or password is wrong.");
    S.session = { email };
    LS.set("uv.session", S.session);
    S.view = "jobs";
    S.U = LS.get("uv.user." + email, null) || blankUser(a.name, email, "");
    applyTheme();
    S.U.onboarded ? openShell() : startOnboarding();
  }

  return (
    <section className="auth" id="auth">
      <LoginBackground />
      <div className="auth-box">
        <div className="auth-side">
          <Brand />
          <div className="auth-pitch">
            <h1>Every job for you, in one place.</h1>
            <ul>
              <li>Jobs from LinkedIn, Naukri, Indeed, Glassdoor and company sites</li>
              <li>Only roles that fit your experience</li>
              <li>Apply on the original page, track every application</li>
            </ul>
          </div>
        </div>
        <div className="auth-main">
          <div className="auth-card">
            <Brand className="brand mbrand" />
            <div id="loginView" hidden={mode !== "login"}>
              <h2>Welcome back</h2>
              <form id="loginForm" noValidate onSubmit={login}>
                <div>
                  <label className="lbl" htmlFor="lEmail">
                    Email
                  </label>
                  <input
                    className="inp"
                    id="lEmail"
                    type="email"
                    autoComplete="email"
                    required
                    value={lEmail}
                    onChange={e => setLEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="lbl" htmlFor="lPass">
                    Password
                  </label>
                  <PasswordField
                    id="lPass"
                    autoComplete="current-password"
                    required
                    inputRef={lPassRef}
                    value={lPass}
                    onChange={e => setLPass(e.target.value)}
                  />
                </div>
                <div className="forgot-row">
                  <button type="button" className="linkbtn" id="toForgot" onClick={() => openForgot()}>
                    Forgot password?
                  </button>
                </div>
                <div className="err" id="lErr">
                  {lErr}
                </div>
                <button className="btn" type="submit">
                  Log in
                </button>
              </form>
              <p className="switch">
                New here?{" "}
                <button id="toSignup" onClick={() => setAuthMode("signup")}>
                  Create account
                </button>
              </p>
              <p className="auth-note" id="authNote"></p>
            </div>
            <div id="signupView" hidden={mode !== "signup"}>
              <h2>Create your account</h2>
              <form id="signupForm" noValidate onSubmit={signup}>
                <div>
                  <label className="lbl" htmlFor="sName">
                    Full name
                  </label>
                  <input
                    className="inp"
                    id="sName"
                    autoComplete="name"
                    required
                    value={sName}
                    onChange={e => setSName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="lbl" htmlFor="sEmail">
                    Email
                  </label>
                  <input
                    className="inp"
                    id="sEmail"
                    type="email"
                    autoComplete="email"
                    required
                    value={sEmail}
                    onChange={e => setSEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="lbl" htmlFor="sPhone">
                    Mobile number
                  </label>
                  <input
                    className="inp"
                    id="sPhone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+91"
                    value={sPhone}
                    onChange={e => setSPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="lbl" htmlFor="sPass">
                    Password
                  </label>
                  <PasswordField
                    id="sPass"
                    autoComplete="new-password"
                    minLength={6}
                    required
                    value={sPass}
                    onChange={e => setSPass(e.target.value)}
                  />
                  <div className="hint">At least 6 characters.</div>
                </div>
                <div className="err" id="sErr">
                  {sErr}
                </div>
                <button className="btn" type="submit">
                  Create account
                </button>
              </form>
              <p className="switch">
                Have an account?{" "}
                <button id="toLogin" onClick={() => setAuthMode("login")}>
                  Log in
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
