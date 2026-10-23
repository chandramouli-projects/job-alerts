/* The side panel (old #sheet / #scrim). What it shows depends on S.sheet.kind; each feature registers
   its own: registerSheet("job", props => ({ title, body: <…/>, foot: <…/> or null })).
   Open with openSheet(kind, props) / openJob(id) and close with closeSheet() from core/nav.js. */
import { useEffect, useRef } from "react";
import { S, useStore } from "../core/state.js";
import { closeSheet } from "../core/nav.js";

const SHEETS = {};
export function registerSheet(kind, fn) {
  SHEETS[kind] = fn;
}

export function Sheet() {
  useStore();
  const s = S.sheet,
    body = useRef(null);
  const view = s && SHEETS[s.kind] ? SHEETS[s.kind](s) : null;
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [s?.kind, s?.id, s?.at]);
  const open = !!view;
  return (
    <>
      <div className={"scrim" + (open ? " open" : "")} id="scrim" onClick={closeSheet}></div>
      <section
        className={"sheet" + (open ? " open" : "")}
        id="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheetTitle"
      >
        <div className="sheet-head">
          <h2 id="sheetTitle">{view?.title}</h2>
          {view?.head}
          <button className="x" id="sheetX" aria-label="Close" onClick={closeSheet}>
            ×
          </button>
        </div>
        <div className="sheet-body" id="sheetBody" ref={body}>
          {view?.body}
        </div>
        <div className="sheet-foot" id="sheetFoot" hidden={!view?.foot}>
          {view?.foot}
        </div>
      </section>
    </>
  );
}
