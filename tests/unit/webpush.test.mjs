// Web Push encryption against the worked example in RFC 8291 (Appendix A): run with
//   node --test tests/unit/webpush.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptPayload, vapidHeader, b64u } from "../../backend/push/webpush.js";

const jwkFrom = (pub, d) => {
  const p = b64u.decode(pub);
  return {
    kty: "EC",
    crv: "P-256",
    x: b64u.encode(p.slice(1, 33)),
    y: b64u.encode(p.slice(33)),
    d,
    ext: true,
  };
};

test("RFC 8291 example: same bytes as the standard", async () => {
  const asPublic = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    jwkFrom(asPublic, "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const publicKey = await crypto.subtle.importKey(
    "raw",
    b64u.decode(asPublic),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
  const body = await encryptPayload(
    {
      keys: {
        p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
        auth: "BTBZMqHH6r4Tts7J_aSIgg",
      },
    },
    "When I grow up, I want to be a watermelon",
    { local: { privateKey, publicKey }, salt: b64u.decode("DGv6ra1nlYgDCS1FRnbzlw") }
  );
  assert.equal(
    b64u.encode(body),
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
  );
});

test("VAPID token is signed with the private key and names the push service", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const publicKey = b64u.encode(await crypto.subtle.exportKey("raw", pair.publicKey));
  const h = await vapidHeader("https://fcm.googleapis.com/fcm/send/abc", {
    publicKey,
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    subject: "https://udyogam-vetuku.pages.dev",
  });
  const [, token, k] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, publicKey);
  const [head, claims, sig] = token.split(".");
  assert.equal(JSON.parse(new TextDecoder().decode(b64u.decode(claims))).aud, "https://fcm.googleapis.com");
  assert.ok(
    await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pair.publicKey,
      b64u.decode(sig),
      new TextEncoder().encode(`${head}.${claims}`)
    )
  );
});
