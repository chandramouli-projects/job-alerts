/* The whole page: header, then the login screens, the "Tell us the job you want" screen or the app,
   plus the pop-ups that can open over any screen. Which one shows is S.screen (core/nav.js). */
import { useEffect } from "react";
import { S, useStore } from "./core/state.js";
import { boot, hideBoot } from "./core/app.js";
import { closeSheet } from "./core/nav.js";
import { Header } from "./components/Header.jsx";
import { Login } from "./pages/Login.jsx";
import { ForgotPassword } from "./pages/ForgotPassword.jsx";
import { Onboarding, pkClose } from "./pages/Onboarding.jsx";
import { Shell } from "./components/Layout.jsx";
import { Sheet } from "./components/Sheet.jsx";
import { AskModal, answerAsk } from "./components/Ask.jsx";
import { ApplyModal } from "./components/Applications.jsx";
import { closeApply } from "./components/applications.js";
import { PickBar } from "./components/JobCard.jsx";
import { Toast } from "./components/Toast.jsx";
import { Tooltip } from "./components/Tooltip.jsx";
// panels that register themselves with components/Sheet.jsx
import "./services/GithubSync.jsx";

let started = false;

export function App() {
  useStore();
  useEffect(() => {
    if (started) return; // React runs effects twice in development; boot only once
    started = true;
    boot().finally(hideBoot);
  }, []);
  // Esc closes the top-most thing: the Are-you-sure pop-up, the Did-you-apply pop-up, a picker, the panel
  useEffect(() => {
    const onKey = e => {
      if (e.key !== "Escape") return;
      if (answerAsk(false)) return;
      if (S.applyOpen) return closeApply();
      pkClose();
      closeSheet();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <Header />
      {S.screen === "auth" && <Login />}
      {S.screen === "ob" && <Onboarding key={S.obKey} />}
      {S.screen === "shell" && <Shell />}
      <Sheet />
      {S.forgotOpen && <ForgotPassword />}
      <AskModal />
      <ApplyModal />
      <PickBar />
      <Toast />
      <Tooltip />
    </>
  );
}
