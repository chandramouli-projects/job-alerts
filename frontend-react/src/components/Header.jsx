/* Top bar: Install app, notification bell, name, avatar, log out. Ported from frontend/js/components/header.js
   (plus the Install app button from core/pwa.js and the bell's place from components/notification-center.js). */
import { S, useStore } from "../core/state.js";
import { LOGOUT } from "../core/constants.js";
import { initials } from "../core/helpers.js";
import { logout } from "../core/nav.js";
import { installApp } from "../core/pwa.js";
import { Svg } from "./Svg.jsx";
import { Bell } from "./NotificationCenter.jsx";

export function Header() {
  useStore();
  const U = S.U;
  return (
    <div className="headwrap">
      <header className="apphead" id="apphead">
        <div className="brand">
          <img className="brand-logo" src="assets/logo.png" alt="" />
          Udyogam Vetuku
        </div>
        <div className="head-r" id="headR">
          {U && (
            <>
              {S.installOffer && (
                <button type="button" className="btn ghost sm" id="headInstall" onClick={installApp}>
                  Install app
                </button>
              )}
              <Bell />
              <span className="who">{U.profile.name}</span>
              <span className="avatar">{initials(U.profile.name)}</span>
              <button
                type="button"
                className="icon-btn"
                id="headOut"
                data-tip="Log out"
                aria-label="Log out"
                onClick={logout}
              >
                <Svg svg={LOGOUT} />
              </button>
            </>
          )}
        </div>
      </header>
    </div>
  );
}
