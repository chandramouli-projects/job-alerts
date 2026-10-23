/* Password box with the show / hide eye, used by every password box. Ported from frontend/js/components/password-field.js.
   Use like an <input>: <PasswordField id="lPass" autoComplete="current-password" value={v} onChange={…} />.
   The eye works only when the box has text; an emptied box hides the password again. */
import { useEffect, useRef, useState } from "react";
import { Svg } from "./Svg.jsx";

export const EYE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
export const EYE_OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

export function PasswordField({ id, inputRef, value, onChange, ...rest }) {
  const own = useRef(null),
    ref = inputRef || own;
  const [show, setShow] = useState(false);
  const [typed, setTyped] = useState(""); // only used when no value is passed in
  const text = value !== undefined ? value : typed;
  // an emptied box hides again
  useEffect(() => {
    if (!text && show) setShow(false);
  }, [text, show]);
  return (
    <div className="pw">
      <input
        className="inp"
        id={id}
        ref={ref}
        type={show ? "text" : "password"}
        value={value}
        onChange={e => {
          if (value === undefined) setTyped(e.target.value);
          onChange?.(e);
        }}
        {...rest}
      />
      <button
        type="button"
        className="eye"
        data-eye={id}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show ? "true" : "false"}
        disabled={!text}
        onClick={() => {
          setShow(!show);
          ref.current?.focus();
        }}
      >
        <Svg svg={show ? EYE_OFF : EYE} />
      </button>
    </div>
  );
}
