/* Login, Create account and Log out */
function showAuth(mode) {
  renderHead();
  $("shell").hidden = true;
  $("ob").hidden = true;
  $("auth").hidden = false;
  $("loginView").hidden = mode !== "login";
  $("signupView").hidden = mode !== "signup";
  syncEyes();
  // $("authNote").textContent=SERVER?"One account for your phone and computer.":"Your account is saved in this browser.";
  if (mode === "signup" || (!SERVER && !Object.keys(accounts).length)) {
    $("loginView").hidden = true;
    $("signupView").hidden = false;
  }
}
$("toSignup").onclick = () => showAuth("signup");
$("toLogin").onclick = () => {
  $("loginView").hidden = false;
  $("signupView").hidden = true;
};
$("signupForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("sName").value.trim(),
    email = $("sEmail").value.trim().toLowerCase(),
    phone = $("sPhone").value.trim(),
    pw = $("sPass").value;
  if (!name) return ($("sErr").textContent = "Enter your full name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return ($("sErr").textContent = "Enter a valid email.");
  if (pw.length < 6) return ($("sErr").textContent = "Password needs at least 6 characters.");
  if (SERVER) {
    try {
      const d = await api("signup", { name, email, phone, password: pw });
      LS.set("uv.token", d.token);
    } catch (err) {
      return ($("sErr").textContent = err.message);
    }
    U = blankUser(name, email, phone);
    session = { email };
    LS.set("uv.session", session);
    saveUser();
    return startOnboarding();
  }
  if (accounts[email])
    return ($("sErr").textContent = "An account with this email already exists. Log in instead.");
  const salt = crypto.getRandomValues
    ? [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16)).join("")
    : String(Math.random());
  accounts[email] = { name, salt, hash: await hashPw(pw, salt), createdAt: Date.now() };
  LS.set("uv.accounts", accounts);
  U = blankUser(name, email, phone);
  session = { email };
  LS.set("uv.session", session);
  saveUser();
  startOnboarding();
});
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("lEmail").value.trim().toLowerCase(),
    pw = $("lPass").value,
    a = accounts[email];
  if (SERVER) {
    let d,
      moved = false;
    try {
      d = await api("login", { email, password: pw });
    } catch (err) {
      // an account made earlier in this browser only: move it, with everything saved, to the server
      d =
        a && a.hash === (await hashPw(pw, a.salt))
          ? await moveToServer(email, pw, a).catch(() => null)
          : null;
      if (!d) return ($("lErr").textContent = err.message);
      moved = true;
    }
    LS.set("uv.token", d.token);
    session = { email };
    LS.set("uv.session", session);
    view = "jobs";
    U = withDefaults(d.user, d.name, email);
    applyTheme();
    if (moved)
      setTimeout(() => toast("Your account is now online: log in from any phone or computer.", "ok"), 300);
    return U.onboarded ? openShell() : startOnboarding();
  }
  if (!a || a.hash !== (await hashPw(pw, a.salt)))
    return ($("lErr").textContent = "Email or password is wrong.");
  session = { email };
  LS.set("uv.session", session);
  view = "jobs";
  U = LS.get("uv.user." + email, null) || blankUser(a.name, email, "");
  applyTheme();
  U.onboarded ? openShell() : startOnboarding();
});
async function moveToServer(email, pw, a) {
  const user = LS.get("uv.user." + email, null),
    s = await api("signup", { name: a.name, email, phone: user?.profile?.phone || "", password: pw });
  LS.set("uv.token", s.token);
  if (user) await api("user", user, "PUT");
  return { token: s.token, name: a.name, user };
}
function logout() {
  if (SERVER) {
    clearTimeout(saveT);
    api("logout", {}).catch(() => {});
    LS.del("uv.token");
    // the server keeps everything, so nothing personal stays in this browser (a shared computer)
    if (session) {
      LS.del("uv.user." + session.email);
      LS.del("uv.gh." + session.email);
    }
  }
  LS.del("uv.session");
  session = null;
  U = null;
  closeSheet();
  $("lPass").value = "";
  showAuth("login");
  $("loginView").hidden = false;
  $("signupView").hidden = true;
}
