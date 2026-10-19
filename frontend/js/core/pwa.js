/* Install as an app (phone home screen / desktop app) and open without internet (sw.js).
   When the browser offers installing, an "Install app" button appears in the header.
   iPhone has no such offer: there it is Share -> Add to Home Screen. */
let installOffer = null;
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost"))
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  installOffer = e;
  if (U) renderHead();
});
addEventListener("appinstalled", () => {
  installOffer = null;
  if (U) renderHead();
  toast("App installed. Open it from your home screen.", "ok");
});
// the header is drawn by components/header.js; add the button after it
const _renderHead = renderHead;
renderHead = function () {
  _renderHead();
  if (U && installOffer && !$("headInstall"))
    $("headR").insertAdjacentHTML(
      "afterbegin",
      `<button type="button" class="btn ghost sm" id="headInstall">Install app</button>`
    );
};
document.addEventListener("click", async e => {
  if (!e.target.closest("#headInstall") || !installOffer) return;
  installOffer.prompt();
  const { outcome } = await installOffer.userChoice;
  installOffer = null;
  renderHead();
  if (outcome === "accepted") toast("Installing…", "ok");
});
