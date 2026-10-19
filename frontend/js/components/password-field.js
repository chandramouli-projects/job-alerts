/* Show / hide password eye, used by every password box */
const EYE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const pwInput = (id, ac) =>
  `<div class="pw"><input class="inp" id="${id}" type="password" autocomplete="${ac}"><button type="button" class="eye" data-eye="${id}" aria-label="Show password" aria-pressed="false" disabled>${EYE}</button></div>`;
function setEye(b, show) {
  const i = $(b.dataset.eye);
  i.type = show ? "text" : "password";
  b.setAttribute("aria-pressed", show);
  b.setAttribute("aria-label", show ? "Hide password" : "Show password");
  b.innerHTML = show ? EYE_OFF : EYE;
}
// The eye works only when the field has text; an emptied field hides again
function syncEyes() {
  document.querySelectorAll("[data-eye]").forEach(b => {
    const i = $(b.dataset.eye);
    if (!i) return;
    if (!b.innerHTML) b.innerHTML = EYE;
    b.disabled = !i.value;
    if (!i.value && i.type === "text") setEye(b, false);
  });
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-eye]");
  if (!b || b.disabled) return;
  setEye(b, $(b.dataset.eye).type === "password");
  $(b.dataset.eye).focus();
});
["input", "change", "focusin"].forEach(t =>
  document.addEventListener(t, e => {
    if (e.target.matches?.("input")) {
      syncEyes();
      if (e.target.closest("#fpModal")) fpCheck();
    }
  })
);
syncEyes();
