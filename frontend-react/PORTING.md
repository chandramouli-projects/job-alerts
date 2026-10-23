# Porting the old app (frontend/) to React (frontend-react/)

Temporary notes while both apps exist. Delete this file after the switch.

## Goal
The React app must look and behave exactly like the old one. The browser tests in `tests/specs` are
the spec, and they find things by **id, class, data-* attribute, aria-* attribute and visible text**.
So every element keeps the same tag, id, class names, data-* / aria-* attributes and text as the
HTML the old code wrote. The CSS is the old files, read from `../frontend/css` (see `src/main.jsx`);
don't copy or change CSS.

## Where things go (same file names as the old app)
Old file `frontend/js/<dir>/<name>.js` becomes:
- `src/<dir>/<name>.js`: the **logic** (no JSX). Export every top-level function / const of the old
  file under the **same name**, so any file can `import { feed } from "../components/filters.js"`
  before you even look at it. Functions that only drew HTML strings are dropped (they become JSX).
- `src/<dir>/<Name>.jsx` (PascalCase): the React components for that file's screen or part.

Component names follow the old function names, so other files can import them without asking:
an old function that returned HTML becomes a component named in PascalCase without a `render`
prefix, exported from the `.jsx` file of the same old file. Examples: `jobCard(j)` ->
`<JobCard job={j} />` in `components/JobCard.jsx`; `renderObResume()` -> `<ObResume />` in
`components/ResumeUpload.jsx`; `insightBadges(j)` -> `<InsightBadges job={j} />` in
`services/JobInsights.jsx`; `statusPill(t)` -> `<StatusPill t={t} />` in `components/Applications.jsx`;
`renderMine()` -> `<Mine />` in `pages/MyJobs.jsx`. Props keep the old argument names (a job is `job`).
Names `src/App.jsx` already uses: `Header` (components/Header.jsx), `Login` (pages/Login.jsx),
`ForgotPassword` (pages/ForgotPassword.jsx), `Onboarding` + function `pkClose` (pages/Onboarding.jsx),
`Shell` (components/Layout.jsx), `ApplyModal` (components/Applications.jsx, the old #applyModal),
`closeApply` (components/applications.js), `PickBar` (components/JobCard.jsx), `Tooltip`
(components/Tooltip.jsx).

## Shared state (`src/core/state.js`)
The old globals are fields of one object `S`: `S.U` (person), `S.data` (jobs.json), `S.F` (filters),
`S.view`, `S.shown`, `S.SERVER`, `S.session`, `S.accounts`, `S.liveBusy`, `S.liveDone`,
`S.liveLimitSaid`, `S.prevSeen`, `S.filtersOpen`. Add new ones to `S` when a module needs state that
must survive re-draws or be seen by other files (write a comment).
- Change `S`, then call `refresh()`: that is the old `render()` / `renderNav()` / `renderRail()`.
- A component that shows anything from `S` calls `useStore()` at its top so it re-draws on refresh().
- Local UI-only state (an input's text, a dropdown open) can be `useState` in the component.
- `saveUser()`, `api()`, `withDefaults()`, `blankUser()`, `applyTheme()` are exported from state.js.

## Ready-made pieces
- `core/constants.js`: the old constants, exported (`ROLES`, `EXP`, `CITIES`, `SKILLS`, `RESUME_SKILLS`,
  `STAGES`, `SENIOR`, `JUNIOR`, `PAGE`, `PREVIEW`, `ICON`, `LOGOUT`, `CLOSE`).
- `core/helpers.js`: `esc ago fmtDate when initials fixText safeUrl cleanJob normQuery hasWord splitList
  LS toast hideToast hashPw copy`. `toast(text, kind, { act: { label, run }, ms })` (act = one
  button such as Undo; replaces the old toastUndo). `initials()` returns plain text now.
- `core/nav.js`: `showAuth(mode) setAuthMode(mode) openForgot() closeForgot() logout()
  startOnboarding() openShell() go(view) openSheet(kind, props) openJob(id) closeSheet()
  currentRoute() ROUTE_OF_VIEW`. They also keep the URL right. Never touch `location` / `history` yourself.
- `components/Svg.jsx`: `<Svg svg={ICON.jobs} />` draws an SVG string as a real `<svg>`.
- `components/Logo.jsx`: `<Logo job={j} />` replaces the old `logo(j)` string.
- `components/Ask.jsx`: `await ask(title, text, yes, red)` is the old ask().
- `components/Sheet.jsx`: the side panel. A feature registers what it shows:
  `registerSheet("hidden", props => ({ title, body: <HiddenList/>, foot: <…/> or null, head: optional }))`
  and opens it with `openSheet("hidden", {...})`. The job details are kind `"job"` (`openJob(id)`).
  A module that calls `registerSheet` must be imported somewhere; say so in your report.

## Rules
- Old `onAppClick((d, t, e) => …)` handlers become `onClick` on the element itself. Old
  `document.addEventListener` for app-wide keys / clicks become a `useEffect` in the owning component.
- Old `$("x").innerHTML = …` becomes JSX; old `$("x").value` becomes state or a ref.
- Never use `dangerouslySetInnerHTML` for data (jobs, names, emails…). Only `<Svg>` uses it, for our icons.
- Keep links safe: `href={safeUrl(u)}` as before, `target="_blank" rel="noopener"` as before.
- Keep comments short and plain, like the old files (the owner reads them). Start each file with a
  one-line comment saying what it is and which old file it came from.
- Plain modern JS, function components and hooks. No new npm packages.
- Code style: Prettier with the repo's `.prettierrc.json` (`npx prettier@3.3.3 --write <files>`).
