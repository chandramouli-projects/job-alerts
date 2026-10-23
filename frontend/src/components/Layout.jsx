/* App frame after login (old #shell): side menu with counts, the screen in #main, the right-hand panel
   and the bottom menu on phones. Ported from frontend/js/components/layout.js; openShell / go are in core/nav.js. */
import { S, useStore } from "../core/state.js";
import { ICON } from "../core/constants.js";
import { go, closeSheet } from "../core/nav.js";
import { isApplied } from "./applications.js";
import { Svg } from "./Svg.jsx";
import { Rail } from "./Rail.jsx";
import { Jobs } from "../pages/Jobs.jsx";
import { Saved } from "../pages/Saved.jsx";
import { Mine } from "../pages/MyJobs.jsx";
import { Profile } from "../pages/Profile.jsx";

export const NAV = [
  ["jobs", "Jobs", ICON.jobs],
  ["saved", "Saved jobs", ICON.saved],
  ["mine", "My jobs", ICON.applied],
  ["profile", "Profile", ICON.me],
];
// counts on the menu: saved (not applied yet) and applied
export function navCounts() {
  const t = Object.values(S.U.jobs);
  return { saved: t.filter(x => x.saved && !isApplied(x)).length, mine: t.filter(isApplied).length };
}
// a menu button (and the rail's "Complete profile"): close any panel, then show that screen
export function goTo(v) {
  closeSheet();
  go(v);
}

const VIEWS = { jobs: Jobs, saved: Saved, mine: Mine, profile: Profile };

export function Topbar({ title, extra, children }) {
  return (
    <div className="topbar">
      <h1>{title}</h1>
      {extra}
      {children}
    </div>
  );
}

export function Shell() {
  useStore();
  if (!S.U) return null;
  const n = navCounts(),
    View = VIEWS[S.view] || Jobs;
  return (
    <div className="shell" id="shell">
      <aside className="side" id="side">
        {NAV.map(([k, l, i]) => (
          <button
            key={k}
            className="nav"
            data-go={k}
            aria-current={S.view === k ? "page" : "false"}
            onClick={() => goTo(k)}
          >
            <Svg svg={i} />
            {l}
            {n[k] ? <span className="n">{n[k]}</span> : null}
          </button>
        ))}
      </aside>
      <main className="main" id="main">
        <View />
      </main>
      <Rail />
      <nav className="bottom" id="bottom" aria-label="Sections">
        {NAV.map(([k, l, i]) => (
          <button key={k} data-go={k} aria-current={S.view === k ? "page" : "false"} onClick={() => goTo(k)}>
            <Svg svg={i} />
            {l}
          </button>
        ))}
      </nav>
    </div>
  );
}
