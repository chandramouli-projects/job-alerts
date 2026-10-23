/* The small message at the bottom (core/helpers.js toast()) */
import { useRef } from "react";
import { S, useStore } from "../core/state.js";
import { hideToast } from "../core/helpers.js";

export function Toast() {
  useStore();
  // keep showing the last message while it fades out, so an empty box never shows
  const last = useRef(null);
  if (S.toast) last.current = S.toast;
  const t = last.current;
  return (
    <div className={"toast" + (S.toast ? " show" : "") + (t?.act ? " has-act" : "")} id="toast" role="status">
      {t?.kind === "ok" && <i className="tk">✓</i>}
      {t && <span>{t.text}</span>}
      {S.toast?.act && (
        <button
          type="button"
          className="toast-act"
          onClick={() => {
            hideToast();
            t.act.run();
          }}
        >
          {t.act.label}
        </button>
      )}
    </div>
  );
}
