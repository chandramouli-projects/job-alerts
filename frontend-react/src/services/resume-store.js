/* Where the resume file is kept: on the accounts server (database table "resumes") when there is one,
   otherwise in this browser (IndexedDB, per browser like the rest of the data).
   The profile only keeps its details: U.profile.resumeFile = {name, type, size, at}.
   Ported from frontend/js/services/resume-store.js. */
import { S, api } from "../core/state.js";
import { LS } from "../core/helpers.js";
import { resumeKind } from "./resume-reader.js";

export const RESUME_TYPE = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

export function resumeDb() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open("uv-files", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("resumes");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(new Error("This browser can't keep files. Try another browser."));
  });
}
export async function resumeIdb(mode, fn) {
  const db = await resumeDb();
  return new Promise((ok, fail) => {
    const tx = db.transaction("resumes", mode),
      r = fn(tx.objectStore("resumes"));
    tx.oncomplete = () => {
      db.close();
      ok(r.result);
    };
    tx.onerror = () => {
      db.close();
      fail(new Error("Couldn't save the file in this browser."));
    };
  });
}
export const asBase64 = file =>
  new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => fail(new Error("Couldn't read this file."));
    r.readAsDataURL(file);
  });

export async function storeResume(file) {
  const type = RESUME_TYPE[resumeKind(file.name)];
  if (S.SERVER) return await api("resume", { name: file.name, type, data: await asBase64(file) }, "PUT");
  const meta = { name: file.name, type, size: file.size, at: Date.now() };
  await resumeIdb("readwrite", s => s.put({ ...meta, blob: file }, S.session.email));
  return meta;
}
export async function loadResume() {
  if (S.SERVER) {
    const r = await fetch("api/resume", { headers: { Authorization: "Bearer " + LS.get("uv.token", "") } });
    if (!r.ok)
      throw new Error(
        r.status === 404
          ? "The file is not on the server any more. Upload it again."
          : "Couldn't open the resume. Try again."
      );
    return await r.blob();
  }
  const rec = await resumeIdb("readonly", s => s.get(S.session.email));
  if (!rec) throw new Error("The file is not in this browser. Upload it again.");
  return rec.blob;
}
export async function dropResume() {
  if (S.SERVER) await api("resume", null, "DELETE");
  else await resumeIdb("readwrite", s => s.delete(S.session.email));
}
