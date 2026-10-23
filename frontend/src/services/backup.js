/* Download / restore a backup of the person's data. Ported from frontend/js/services/backup.js.
   The Profile page calls exportData() from its Backup button and importData(e) from the Restore file input. */
import { S, saveUser, applyTheme } from "../core/state.js";
import { toast } from "../core/helpers.js";
import { go } from "../core/nav.js";

export function exportData() {
  const U = S.U;
  const blob = new Blob(
    [
      JSON.stringify(
        {
          version: 1,
          account: { email: S.session.email, name: U.profile.name },
          user: { ...U, settings: { ...U.settings, ghToken: "" } },
        },
        null,
        1
      ),
    ],
    { type: "application/json" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "udyogam-vetuku-backup.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast("Backup downloaded");
}
export function importData(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d.user?.profile) throw 0;
      const tok = S.U.settings.ghToken;
      S.U = { ...d.user, settings: { ...d.user.settings, ghToken: tok } };
      S.U.profile.email = S.session.email;
      saveUser();
      applyTheme();
      toast("Backup restored");
      go("jobs");
    } catch (_) {
      toast("That file isn't a valid backup.");
    }
  };
  r.readAsText(f);
}
