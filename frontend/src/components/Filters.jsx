/* The Filters button, its drop-down panel (#fModal) and the chips of the filters that are on.
   Ported from frontend/js/components/filters.js (openFilters, placeFilters, the chips in renderJobs). */
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { S, useStore } from "../core/state.js";
import { ROLES, EXP, ICON } from "../core/constants.js";
import { Svg } from "./Svg.jsx";
import {
  FILTER_DEFAULTS,
  activeFilters,
  applyFilters,
  clearAllFilters,
  clearFilter,
  filterChoices,
  filterCountLabel,
} from "./filters.js";

const val = (fd, k) => (k === "forYou" ? (fd.forYou ? "1" : "0") : fd[k]);
const def = k => (k === "forYou" ? "1" : FILTER_DEFAULTS[k]);

// put the panel just below the search row; the page can scroll or resize while it is open
function placeFilters(pop) {
  const row = document.querySelector(".search-row");
  if (!pop || !row) return;
  const r = row.getBoundingClientRect(),
    top = Math.max(8, Math.min(r.bottom + 10, innerHeight - 320));
  Object.assign(pop.style, {
    top: top + "px",
    left: Math.max(8, r.left) + "px",
    width: Math.min(r.width, innerWidth - 16) + "px",
    maxHeight: innerHeight - top - 12 + "px",
  });
}

export function Filters() {
  useStore();
  const [fd, setFd] = useState(null); // the draft; null = panel closed
  const btn = useRef(null);
  const n = activeFilters().length;
  const close = () => {
    setFd(null);
    document.body.style.overflow = "";
    btn.current?.focus();
  };
  const open = () => {
    setFd({ ...S.F });
    document.body.style.overflow = "hidden";
  };
  useEffect(() => {
    if (!fd) return;
    const onKey = e => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [!!fd]);
  useEffect(() => () => (document.body.style.overflow = ""), []); // leaving the Jobs page with it open
  return (
    <>
      <button
        type="button"
        ref={btn}
        className={"fbtn " + (n ? "on" : "")}
        data-ftoggle=""
        aria-haspopup="dialog"
        aria-label={"Filters" + (n ? ` (${n} on)` : "")}
        data-tip="Filters"
        onClick={open}
      >
        <Svg svg={ICON.filter} />
        <span className="fbtn-label">Filters</span>
        {n ? <span className="fbadge">{n}</span> : null}
      </button>
      {fd &&
        createPortal(
          <FilterPanel
            fd={fd}
            setFd={setFd}
            close={close}
            apply={() => {
              close();
              applyFilters(fd);
            }}
          />,
          document.body
        )}
    </>
  );
}

function FilterPanel({ fd, setFd, close, apply }) {
  const pop = useRef(null);
  const ch = filterChoices();
  useLayoutEffect(() => {
    placeFilters(pop.current);
    const onResize = () => placeFilters(pop.current);
    addEventListener("resize", onResize);
    const t = setTimeout(() => document.getElementById("f_forYou")?.focus(), 30);
    return () => {
      removeEventListener("resize", onResize);
      clearTimeout(t);
    };
  }, []);
  const set = (k, v) => setFd({ ...fd, [k]: k === "forYou" ? v === "1" : k === "days" ? +v : v });
  // every filter in the same format: a small label and a dropdown; a changed one is shown in green
  const sel = (k, label, opts) => (
    <div className="ff">
      <label htmlFor={"f_" + k}>{label}</label>
      <select
        id={"f_" + k}
        data-fsel={k}
        className={String(val(fd, k)) !== String(def(k)) ? "on" : ""}
        value={String(val(fd, k))}
        onChange={e => set(k, e.target.value)}
      >
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <div
      className="modal"
      id="fModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fTitle"
      onClick={e => e.target === e.currentTarget && close()}
    >
      <div className="fpop" aria-labelledby="fTitle" ref={pop}>
        <div className="fhead">
          <h2 id="fTitle">Filters</h2>
          <button type="button" className="modal-x" data-fx="" aria-label="Close" onClick={close}>
            ×
          </button>
        </div>
        <div className="fbody" id="fBody">
          {sel("forYou", "Show", [
            ["1", "Jobs for me"],
            ["0", "All jobs"],
          ])}
          {sel("days", "Date posted", [
            [1, "Last 24 hours"],
            [3, "Last 3 days"],
            [7, "Last 7 days"],
            [21, "Last 3 weeks"],
          ])}
          {sel("sort", "Sort by", [
            ["match", "Best fit"],
            ["new", "Newest first"],
          ])}
          {sel("role", "Job role", [["", "All roles"], ...Object.keys(ROLES).map(r => [r, r])])}
          {sel("exp", "Experience", [["", "Any experience"], ...EXP.map(([v, l]) => [v, l])])}
          {sel("minSal", "Salary", [
            ["", "Any salary"],
            ["3", "3 LPA and above"],
            ["5", "5 LPA and above"],
            ["8", "8 LPA and above"],
            ["12", "12 LPA and above"],
            ["20", "20 LPA and above"],
          ])}
          {sel("city", "Location", [["", "All India"], ...ch.cities.map(c => [c, c])])}
          {sel("type", "Job type", [["", "Any type"], ...ch.types.map(t => [t, t])])}
          {sel("company", "Company", [["", "All companies"], ...ch.companies.map(c => [c, c])])}
          {sel("source", "Posted on", [["", "Any website"], ...ch.sources.map(t => [t, t])])}
          <div className="ff">
            <span className="ff-label">Work mode</span>
            <label className="fremote">
              <input
                type="checkbox"
                data-fchk="remote"
                checked={!!fd.remote}
                onChange={e => setFd({ ...fd, remote: e.target.checked })}
              />
              Remote only
            </label>
          </div>
        </div>
        <div className="ffoot">
          <button
            type="button"
            className="freset"
            data-freset=""
            onClick={() => setFd({ ...FILTER_DEFAULTS })}
          >
            Reset
          </button>
          <button type="button" className="btn" id="fApply" data-fapply="" onClick={apply}>
            {filterCountLabel(fd)}
          </button>
        </div>
      </div>
    </div>
  );
}

// the filters that are on, as removable chips next to the job count
export function FilterChips() {
  useStore();
  const chips = activeFilters();
  if (!chips.length) return null;
  return (
    <div className="fchips">
      {chips.map(([k, l]) => (
        <span className="fchip" key={k}>
          {l}
          <button type="button" data-fdel={k} aria-label={"Remove " + l} onClick={() => clearFilter(k)}>
            ×
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button type="button" className="fclear-all" data-fclear="" onClick={clearAllFilters}>
          Clear all
        </button>
      )}
    </div>
  );
}
