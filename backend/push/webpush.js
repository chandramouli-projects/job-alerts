/*
Web Push: send a notification to a phone or computer even when the app is closed.
Standard browser push (RFC 8291 message encryption + RFC 8292 VAPID), written with WebCrypto only,
so it runs on Cloudflare (functions/api) and in Node (tests) with nothing to install.

  const sub = { endpoint, keys: { p256dh, auth } }   // what the browser gives on subscribe
  await sendPush(sub, { title, body, url }, { publicKey, privateJwk, subject })
  -> { ok, status, gone }   gone = the browser dropped this subscription (404 / 410): delete it

publicKey: the VAPID public key (base64url, 65 bytes raw); also used by the app to subscribe.
privateJwk: the matching private key as a JSON Web Key string (kept as a Cloudflare secret).
*/
const enc = new TextEncoder();
export const b64u = {
  encode: bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  decode: s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0)),
};
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/* RFC 8291: encrypt the message for one browser. `local` and `salt` are only passed by tests. */
export async function encryptPayload(sub, payload, { local, salt } = {}) {
  const uaPublic = b64u.decode(sub.keys.p256dh), authSecret = b64u.decode(sub.keys.auth);
  local ||= await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  salt ||= crypto.getRandomValues(new Uint8Array(16));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const plain = concat(typeof payload === "string" ? enc.encode(payload) : payload, new Uint8Array([2]));   // 2 = last record
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);   // record size
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/* RFC 8292: "Authorization: vapid t=<signed token>, k=<public key>" for the push service */
export async function vapidHeader(endpoint, { publicKey, privateJwk, subject }) {
  const key = await crypto.subtle.importKey("jwk", typeof privateJwk === "string" ? JSON.parse(privateJwk) : privateJwk,
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const part = o => b64u.encode(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64u.encode(sig)}, k=${publicKey}`;
}

export async function sendPush(sub, message, vapid, { ttl = 24 * 3600, fetchFn = fetch } = {}) {
  const body = await encryptPayload(sub, JSON.stringify(message));
  const r = await fetchFn(sub.endpoint, { method: "POST", body, headers: {
    "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl), Urgency: "normal",
    Authorization: await vapidHeader(sub.endpoint, vapid) } });
  return { ok: r.status >= 200 && r.status < 300, status: r.status, gone: r.status === 404 || r.status === 410 };
}
