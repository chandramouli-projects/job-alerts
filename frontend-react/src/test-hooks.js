/* The browser tests (tests/specs) were written for the old app, where everything was a global
   (U, F, data, saveUser(), render()…). These names keep working on window so the same tests can
   check the React app. They only point at the real state and functions; nothing here is extra logic. */
import { S, refresh, saveUser, savePending, blankUser } from "./core/state.js";
import { hashPw } from "./core/helpers.js";
import { logout } from "./core/nav.js";
import { taste, tasteScore } from "./services/matching.js";
import { checkForNewJobs } from "./services/notifications.js";

for (const k of ["U", "F", "data"])
  Object.defineProperty(window, k, {
    get: () => S[k],
    set: v => {
      S[k] = v;
    },
    configurable: true,
  });
// old names: saveT (a save is waiting), draft (setup screen choices; obValidate() re-checks the button)
Object.defineProperty(window, "saveT", { get: savePending, configurable: true });
Object.defineProperty(window, "draft", { get: () => S.obDraft, configurable: true });
Object.assign(window, {
  saveUser,
  render: refresh,
  obValidate: refresh,
  logout,
  hashPw,
  blankUser,
  taste,
  tasteScore,
  checkForNewJobs,
});
