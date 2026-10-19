/*
Gmail for the live site: "Connect Gmail" (Google sign-in, read-only) and reading job-site emails with
the Gmail API. Used by functions/api; WebCrypto and fetch only.

Only emails from the job sites and hiring systems in mail-rules.js SENDERS are asked for (a Gmail search),
and only their subject, sender, date and text are read to find the status. Nothing is sent, changed or
deleted, and the emails are not stored; only the status found in them is.

The Google refresh token is kept encrypted (AES-GCM with the TOKEN_KEY secret). The sign-in "state" is
signed with the same key, so a callback can't be faked for another account.
*/
import { SENDERS, parse, htmlToText } from "./mail-rules.js";

export const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const urls = base => base
  ? { auth: `${base}/auth`, token: `${base}/token`, revoke: `${base}/revoke`, gmail: `${base}/gmail/v1/users/me` }   // a fake Google in the tests
  : { auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
      revoke: "https://oauth2.googleapis.com/revoke", gmail: "https://gmail.googleapis.com/gmail/v1/users/me" };

const b64u = {
  enc: b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: s => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)), c => c.charCodeAt(0)),
};
const te = new TextEncoder(), td = new TextDecoder();

/* ---------------------------------------------------------------- keeping secrets */
const aesKey = k => crypto.subtle.importKey("raw", b64u.dec(k), "AES-GCM", false, ["encrypt", "decrypt"]);
const hmacKey = k => crypto.subtle.importKey("raw", b64u.dec(k), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
export async function seal(text, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return b64u.enc(iv) + "." + b64u.enc(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(key), te.encode(text)));
}
export async function unseal(box, key) {
  const [iv, data] = String(box).split(".");
  return td.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u.dec(iv) }, await aesKey(key), b64u.dec(data)));
}
export async function signState(obj, key) {
  const body = b64u.enc(te.encode(JSON.stringify(obj)));
  return body + "." + b64u.enc(await crypto.subtle.sign("HMAC", await hmacKey(key), te.encode(body)));
}
export async function readState(state, key) {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig || !(await crypto.subtle.verify("HMAC", await hmacKey(key), b64u.dec(sig), te.encode(body)))) return null;
  const o = JSON.parse(td.decode(b64u.dec(body)));
  return o.exp > Date.now() ? o : null;
}

/* ---------------------------------------------------------------- Google sign-in */
export function authUrl({ clientId, redirectUri, state, base, hint }) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state, ...(hint ? { login_hint: hint } : {}) });
  return `${urls(base).auth}?${q}`;
}
async function tokenCall(base, params) {
  const r = await fetch(urls(base).token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(d.error === "invalid_grant" ? "Gmail access was removed or expired. Connect Gmail again." : "Google didn't answer. Try again.");
    e.reconnect = d.error === "invalid_grant";
    throw e;
  }
  return d;
}
export const exchangeCode = ({ base, clientId, clientSecret, code, redirectUri }) =>
  tokenCall(base, { code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" });
export const refreshAccess = ({ base, clientId, clientSecret, refreshToken }) =>
  tokenCall(base, { refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" });
export const revoke = ({ base, token }) => fetch(`${urls(base).revoke}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});

/* ---------------------------------------------------------------- reading the job emails */
async function gmail(base, access, path) {
  const r = await fetch(`${urls(base).gmail}${path}`, { headers: { Authorization: `Bearer ${access}` } });
  if (!r.ok) throw new Error(r.status === 403 ? "Gmail didn't allow reading. Connect Gmail again and tick the Gmail box." : `Gmail answered ${r.status}.`);
  return r.json();
}
export const profile = (base, access) => gmail(base, access, "/profile");

// text of a Gmail API message: plain parts first, else HTML turned into text
function textOf(part) {
  const plain = [], rich = [];
  (function walk(p) {
    if (!p) return;
    if (p.parts) p.parts.forEach(walk);
    else if (p.body?.data && (p.mimeType === "text/plain" || p.mimeType === "text/html") && !p.filename)
      (p.mimeType === "text/plain" ? plain : rich).push(td.decode(b64u.dec(p.body.data)));
  })(part);
  return plain.length ? plain.join("\n") : htmlToText(rich.join("\n"));
}

/* Job emails from the last `days` not seen before, oldest first, at most `max` read per call
   (Cloudflare's free plan allows 50 outside calls per request). -> {events, more} */
export async function readJobEmails({ base, access, seen = [], days = 60, max = 25 }) {
  const q = `from:(${Object.keys(SENDERS).join(" OR ")}) newer_than:${days}d`;
  const list = await gmail(base, access, `/messages?maxResults=100&q=${encodeURIComponent(q)}`);
  const known = new Set(seen), fresh = (list.messages || []).map(m => m.id).filter(id => !known.has(id)).reverse();
  const events = [], read = [];
  for (const id of fresh.slice(0, max)) {
    const m = await gmail(base, access, `/messages/${id}?format=full`);
    read.push(id);
    const h = n => (m.payload?.headers || []).find(x => x.name.toLowerCase() === n)?.value || "";
    const subject = h("subject"), ev = parse(subject, textOf(m.payload), h("from"));
    const at = new Date(+m.internalDate || Date.parse(h("date")) || Date.now()).toISOString();
    if (ev) events.push({ id, at, subject: subject.slice(0, 160), ...ev });
  }
  return { events, read, more: fresh.length > max };
}
