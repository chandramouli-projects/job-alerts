/* The small message at the bottom (core/helpers.js toast()) */
import { S, useStore } from "../core/state.js";
import { hideToast } from "../core/helpers.js";

export function Toast() {
  useStore();
  const t = S.toast;
  return (
    <div className={"toast" + (t ? " show" : "") + (t?.act ? " has-act" : "")} id="toast" role="status">
      {t?.kind === "ok" && <i className="tk">✓</i>}
      {t && <span>{t.text}</span>}
      {t?.act && (
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
