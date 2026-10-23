/* Ported from frontend/js/core/helpers.js. Small helpers used everywhere.
   React escapes text by itself, so text goes straight into JSX (esc() is only for the rare HTML string). */
import { S, refresh } from "./state.js";

export const esc = s =>
  String(s ?? "").replace(
    /[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
export const ago = iso => {
  const t = new Date(iso);
  if (isNaN(t)) return "";
  const h = Math.round((Date.now() - t) / 36e5);
  return h < 1
    ? "just now"
    : h < 24
      ? h + "h ago"
      : Math.round(h / 24) === 1
        ? "1 day ago"
        : Math.round(h / 24) + " days ago";
};
export const fmtDate = t =>
  t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
export const when = j => j.posted || j.found;
// "Chandra Mouli" -> "CM" (plain text; JSX escapes it)
export const initials = n =>
  (n || "?")
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const CP1252 = {
  "€": 128,
  "‚": 130,
  ƒ: 131,
  "„": 132,
  "…": 133,
  "†": 134,
  "‡": 135,
  ˆ: 136,
  "‰": 137,
  Š: 138,
  "‹": 139,
  Œ: 140,
  Ž: 142,
  "‘": 145,
  "’": 146,
  "“": 147,
  "”": 148,
  "•": 149,
  "–": 150,
  "—": 151,
  "˜": 152,
  "™": 153,
  š: 154,
  "›": 155,
  œ: 156,
  ž: 158,
  Ÿ: 159,
};
export function fixText(v) {
  if (typeof v !== "string" || !/[ÂÃâ][\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/.test(v)) return v;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from([...v], c => {
        const n = c.charCodeAt(0);
        if (n < 256) return n;
        if (CP1252[c]) return CP1252[c];
        throw 0;
      })
    );
  } catch (e) {
    return v;
  }
}
export const safeUrl = u => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "#"); // never a javascript: link
export const cleanJob = j => {
  if (j) {
    ["title", "company", "location", "description", "type"].forEach(k => {
      j[k] = fixText(j[k]);
    });
    // only http(s) links reach the page; a job with none left has no url and is not listed
    j.apply_links = (j.apply_links || []).filter(l => safeUrl(l.url) !== "#");
    j.url = safeUrl(j.url) !== "#" ? j.url : j.apply_links[0]?.url || "";
  }
  return j;
};
export const normQuery = s =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim(); // "QA  Engineer!" -> "qa engineer"
// whole word: "java" is not in "javascript", but "react" is in "reactjs" and "qa " is in "qa engineer"
export const hasWord = (text, w) =>
  new RegExp(
    "(^|[^a-z0-9])" +
      w
        .trim()
        .replace(/[-/]$/, "")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "(js)?($|[^a-z0-9])"
  ).test(text);
export const splitList = s =>
  String(s || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
export const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      return false;
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch (e) {}
  },
};

/* The small message at the bottom (components/Toast.jsx shows S.toast).
   kind "ok" adds a green tick; act = { label, run } adds one button (e.g. Undo); ms = how long it stays. */
let toastTimer;
export function toast(text, kind, { act, ms } = {}) {
  clearTimeout(toastTimer);
  S.toast = { text, kind, act, id: Date.now() };
  refresh();
  toastTimer = setTimeout(
    () => {
      S.toast = null;
      refresh();
    },
    ms || (act ? 6000 : 2000)
  );
}
export function hideToast() {
  clearTimeout(toastTimer);
  S.toast = null;
  refresh();
}

export async function hashPw(pw, salt) {
  const enc = new TextEncoder();
  try {
    const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(salt), iterations: 120000, hash: "SHA-256" },
      key,
      256
    );
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    let h = 0;
    for (const c of salt + pw) h = (h * 31 + c.charCodeAt(0)) | 0;
    return "x" + h;
  }
}
export async function copy(text, msg = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg, "ok");
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast(msg, "ok");
    } catch (_) {
      toast("Couldn't copy. Long-press to copy instead.");
    }
    ta.remove();
  }
}
