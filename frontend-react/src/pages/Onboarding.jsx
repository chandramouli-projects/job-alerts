/* "Tell us the job you want" (old #ob): role, experience, city and skill pickers.
   Ported from frontend/js/pages/onboarding.js; startOnboarding is in core/nav.js.
   The choices wait in S.obDraft until "Show my jobs". App.jsx gives this screen a new key on every
   startOnboarding(), so the draft starts again from the saved choices (S.U.prefs). */
import { useEffect, useRef, useState } from "react";
import { S, refresh, useStore, saveUser } from "../core/state.js";
import { ROLES, EXP, CITIES, SKILLS, SENIOR, JUNIOR, CLOSE } from "../core/constants.js";
import { splitList, toast } from "../core/helpers.js";
import { openShell } from "../core/nav.js";
import { roleHitFor } from "../services/matching.js";
import { resetFilters } from "../components/filters.js";
import { syncPrefs } from "../services/github-sync.js";
import { Svg } from "../components/Svg.jsx";
import { ObResume } from "../components/ResumeUpload.jsx";

export const PK = {
  role: { list: "roles", ph: "Choose roles", find: "Search or add a role", add: true },
  exp: { ph: "Choose experience" },
  city: { list: "cities", ph: "Choose cities", find: "Search cities" },
  skill: { list: "skills", ph: "Choose skills", find: "Search or add a skill", add: true },
};

/* dropdown options come from the jobs we actually have, with how many jobs match each */
export function buildOpts() {
  const data = S.data,
    OPTS = {},
    J = data.jobs || [],
    cnt = f => J.filter(f).length,
    byCount = a => a.sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  OPTS.role = byCount(
    [...new Set([...Object.keys(ROLES), ...(data.roles || [])])].map(r => [
      r,
      cnt(j => roleHitFor(j.title, r)),
    ])
  );
  const inCity = (j, c) => {
    const l = ((j.location || "") + " " + (j.city_norm || "")).toLowerCase();
    return (
      l.includes(c.toLowerCase()) ||
      (c === "Bangalore" && l.includes("bengaluru")) ||
      (c === "Gurgaon" && l.includes("gurugram"))
    );
  };
  const cities = [
    ...new Set([
      ...CITIES.filter(c => c !== "Remote" && c !== "Anywhere in India"),
      ...J.map(j => j.city_norm).filter(c => c && c !== "India" && /^[A-Z]/.test(c)),
    ]),
  ];
  OPTS.city = [
    ["Anywhere in India", J.length],
    ["Remote", cnt(j => j.remote)],
    ...byCount(cities.map(c => [c, cnt(j => inCity(j, c))])),
  ];
  OPTS.skill = byCount(
    [...new Set([...SKILLS, ...J.flatMap(j => j.tech || [])])].map(t => [
      t,
      cnt(j => (j.tech || []).includes(t)),
    ])
  );
  OPTS.exp = EXP.map(([v, l]) => [
    l,
    cnt(
      j =>
        !(v < 5 && SENIOR.test(j.title)) &&
        !(v >= 2 && JUNIOR.test(j.title)) &&
        (j.exp_min == null || (j.exp_min <= v + 1 && (j.exp_max == null || j.exp_max >= v - 1)))
    ),
    v,
  ]);
  return OPTS;
}

function newDraft() {
  const draft = JSON.parse(JSON.stringify(S.U.prefs));
  draft.roles = [...new Set([...draft.roles, ...splitList(draft.custom)])];
  draft.skills = [...new Set([...draft.skills, ...splitList(draft.customSkills).map(x => x.toLowerCase())])];
  draft.custom = draft.customSkills = "";
  return draft;
}

// For the resume reader ("Fill from my resume"): the skills picked so far, and adding the ones it found
export const obSkills = () => S.obDraft?.skills || [];
export function obAddSkills(add) {
  if (!S.obDraft) return;
  S.obDraft.skills = [...new Set([...S.obDraft.skills, ...add])];
  refresh();
}

// Close any open picker (Esc in App.jsx)
let closer = null;
export function pkClose() {
  closer?.();
}

function Picker({ k, opts, open, up, setOpen }) {
  const draft = S.obDraft,
    cfg = PK[k];
  const boxRef = useRef(null),
    searchRef = useRef(null);
  const [q, setQ] = useState("");
  // opening: the search box is focused on computers
  useEffect(() => {
    if (!open) return;
    if (searchRef.current && matchMedia("(pointer:fine)").matches) searchRef.current.focus();
  }, [open]);

  const toggle = () => {
    if (open) return setOpen(null);
    const r = boxRef.current.getBoundingClientRect(),
      below = innerHeight - r.bottom;
    setQ(""); // each opening starts with an empty search
    setOpen(k, below < 360 && r.top > below);
  };
  const pick = v => {
    if (k === "exp") {
      draft.exp = +v;
      setOpen(null);
      return refresh();
    }
    const l = cfg.list;
    let a = draft[l].includes(v) ? draft[l].filter(x => x !== v) : [...draft[l], v];
    if (k === "city" && a.includes(v))
      a = v === "Anywhere in India" ? [v] : a.filter(x => x !== "Anywhere in India");
    draft[l] = a;
    if (k === "role") setOpen(null); // owner's rule: the role list closes as soon as a role is picked
    refresh();
  };
  const del = v => {
    draft[cfg.list] = draft[cfg.list].filter(x => x !== v);
    refresh();
  };
  const add = text => {
    const v = k === "skill" ? text.toLowerCase() : text;
    if (!draft[cfg.list].includes(v)) draft[cfg.list].push(v);
    setQ("");
    searchRef.current?.focus();
    refresh();
  };

  // the chosen values in the box
  let chips;
  if (k === "exp") {
    const e = EXP.find(x => x[0] === draft.exp);
    chips = e ? <span className="pk-one">{e[1]}</span> : <span className="pk-ph">{cfg.ph}</span>;
  } else {
    const v = draft[cfg.list];
    chips = v.length ? (
      v.map(x => (
        <span className="pk-chip" key={x}>
          {x}
          <button
            type="button"
            data-pkdel={k}
            data-v={x}
            aria-label={`Remove ${x}`}
            onClick={e => {
              e.stopPropagation();
              del(x);
            }}
          >
            ×
          </button>
        </span>
      ))
    ) : (
      <span className="pk-ph">{cfg.ph}</span>
    );
  }

  // the list
  let list = null;
  if (open) {
    const ql = q.trim().toLowerCase(),
      sel = k === "exp" ? [] : draft[cfg.list];
    const all =
      k === "exp"
        ? opts.exp
        : [...sel.filter(x => !opts[k].some(o => o[0] === x)).map(x => [x, 0]), ...opts[k]];
    const shown = all.filter(o => o[0].toLowerCase().includes(ql)),
      on = o => (k === "exp" ? draft.exp === o[2] : sel.includes(o[0]));
    const canAdd = cfg.add && q.trim() && !all.some(o => o[0].toLowerCase() === ql);
    list = (
      <>
        {canAdd && (
          <button
            type="button"
            className="pk-opt add"
            data-pkadd={k}
            data-v={q.trim()}
            onClick={() => add(q.trim())}
          >
            <i className="pk-check">+</i>
            <span>Add “{q.trim()}”</span>
          </button>
        )}
        {shown.map(o => (
          <button
            type="button"
            key={o[0]}
            className="pk-opt"
            role="option"
            aria-selected={on(o) ? "true" : "false"}
            data-pkval={k}
            data-v={k === "exp" ? o[2] : o[0]}
            onClick={() => pick(k === "exp" ? o[2] : o[0])}
          >
            <i className="pk-check"></i>
            <span>{o[0]}</span>
            {o[1] ? <small>{`${o[1]} job${o[1] === 1 ? "" : "s"}`}</small> : null}
          </button>
        ))}
        {canAdd || shown.length ? null : <p className="pk-none">No match</p>}
      </>
    );
  }

  return (
    <div className={"pk" + (open ? " open" : "") + (up ? " up" : "")} data-pk={k} ref={boxRef}>
      <div
        className="pk-field"
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open ? "true" : "false"}
        aria-labelledby={"q-" + k}
        data-pkopen={k}
        onClick={toggle}
        onKeyDown={e => {
          if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
          e.preventDefault();
          toggle();
        }}
      >
        <span className="pk-chips">{chips}</span>
      </div>
      <div className="pk-pop" hidden={!open}>
        {cfg.find && (
          <input
            className="pk-search"
            placeholder={cfg.find}
            aria-label={cfg.find}
            data-pksearch={k}
            ref={searchRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              boxRef.current.querySelector(".pk-opt")?.click();
            }}
          />
        )}
        <div
          className="pk-list"
          role="listbox"
          aria-labelledby={"q-" + k}
          aria-multiselectable={k === "exp" ? undefined : "true"}
        >
          {list}
        </div>
      </div>
    </div>
  );
}

const QUESTIONS = [
  ["role", "What job are you looking for?"],
  ["exp", "How much experience do you have?"],
  ["city", "Where do you want to work?"],
  ["skill", "What are your skills?"],
];

export function Onboarding() {
  useStore();
  // a new draft each time this screen opens (the key changes), before the pickers draw
  useState(() => {
    S.obDraft = newDraft(); // the choices on this screen, kept in S so the resume reader can add skills
  });
  const [opts] = useState(buildOpts);
  const [open, setOpenK] = useState(null),
    [up, setUp] = useState({});
  const setOpen = (k, isUp) => {
    setOpenK(k);
    if (k) setUp(u => ({ ...u, [k]: isUp })); // "up" is set when a list opens and stays after it closes, as before
  };
  useEffect(() => {
    closer = () => setOpenK(null);
    return () => {
      closer = null;
    };
  }, []);

  const draft = S.obDraft,
    U = S.U,
    ready = draft.roles.length && draft.exp !== null && draft.cities.length;

  function save() {
    U.prefs = draft;
    const first = !U.onboarded;
    U.onboarded = true;
    saveUser();
    resetFilters();
    openShell();
    toast(first ? "Welcome! Here are jobs picked for you." : "Preferences saved");
    syncPrefs(true);
  }

  return (
    <section
      className="ob"
      id="ob"
      onClick={e => {
        if (!e.target.closest(".pk")) setOpenK(null);
      }}
    >
      <div className="ob-card">
        <div className="ob-top">
          <h1>Tell us the job you want</h1>
          <button
            type="button"
            className="icon-btn"
            id="obBack"
            data-tip="Close"
            aria-label="Close"
            hidden={!U.onboarded}
            onClick={() => openShell()}
          >
            <Svg svg={CLOSE} />
          </button>
        </div>
        {QUESTIONS.map(([k, label]) => (
          <div className="q" key={k}>
            <span className="lbl" id={"q-" + k}>
              {label}
            </span>
            <Picker k={k} opts={opts} open={open === k} up={!!up[k]} setOpen={setOpen} />
            {k === "skill" && (
              <div id="obResume">
                <ObResume />
              </div>
            )}
          </div>
        ))}
        <button className="btn ob-go" id="obNext" disabled={!ready} onClick={save}>
          Show my jobs
        </button>
      </div>
    </section>
  );
}
