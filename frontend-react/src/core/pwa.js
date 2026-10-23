/* Install as an app (phone home screen / desktop app) and open without internet (public/sw.js).
   When the browser offers installing, the header shows an "Install app" button (S.installOffer).
   iPhone has no such offer: there it is Share -> Add to Home Screen. Ported from frontend/js/core/pwa.js. */
import { S, refresh } from "./state.js";
import { toast } from "./helpers.js";

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost"))
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  S.installOffer = e;
  refresh();
});
addEventListener("appinstalled", () => {
  S.installOffer = null;
  refresh();
  toast("App installed. Open it from your home screen.", "ok");
});
export async function installApp() {
  const offer = S.installOffer;
  if (!offer) return;
  offer.prompt();
  const { outcome } = await offer.userChoice;
  S.installOffer = null;
  refresh();
  if (outcome === "accepted") toast("Installing…", "ok");
}
