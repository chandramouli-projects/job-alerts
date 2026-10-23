/* "N hidden" next to the job count on the Jobs page, and the Hidden jobs panel it opens.
   Ported from frontend/js/components/hidden-jobs.js (openHiddenJobs and the renderJobs addition). */
import { S, useStore } from "../core/state.js";
import { closeSheet } from "../core/nav.js";
import { Logo } from "./Logo.jsx";
import { registerSheet } from "./Sheet.jsx";
import { cardPlace } from "./job-card.js";
import { hiddenListed, openHiddenJobs, unhideOne, unhideAll } from "./hidden-jobs.js";

// the link, shown inside the results bar: " · 2 hidden"
export function HiddenLink() {
  useStore();
  const n = hiddenListed().length;
  if (!n) return null;
  return (
    <>
      {" · "}
      <button type="button" className="linkbtn hj-link" data-showhidden="" onClick={openHiddenJobs}>
        {n} hidden
      </button>
    </>
  );
}

function HiddenList({ list }) {
  const gone = Object.keys(S.U.hidden || {}).length - list.length;
  if (!list.length)
    return (
      <div className="empty">
        <h3>No hidden jobs</h3>Jobs you hide with Hide or "Not interested" show here.
      </div>
    );
  return (
    <>
      <p className="hj-sub">These jobs don't show in your feed. Unhide one to see it again.</p>
      <div className="hj-list">
        {list.map(j => (
          <div className="hj-row" key={j.id}>
            <Logo job={j} />
            <div className="hj-txt">
              <b>{j.title}</b>
              <span>
                {j.company}
                {j.location ? ` · ${cardPlace(j)}` : ""}
              </span>
            </div>
            <button type="button" className="btn ghost sm" data-unhide={j.id} onClick={() => unhideOne(j.id)}>
              Unhide
            </button>
          </div>
        ))}
      </div>
      {gone > 0 && (
        <p className="hj-sub">
          {gone} more hidden job{gone === 1 ? " is" : "s are"} no longer listed.
        </p>
      )}
    </>
  );
}

registerSheet("hidden", () => {
  if (!S.U) return null;
  const list = hiddenListed();
  return {
    title: "Hidden jobs",
    body: <HiddenList list={list} />,
    foot:
      list.length > 1 ? (
        <>
          <button className="btn ghost" data-unhideall="" onClick={unhideAll}>
            Unhide all
          </button>
          <button className="btn" data-hjclose="" onClick={closeSheet}>
            Done
          </button>
        </>
      ) : null,
  };
});
