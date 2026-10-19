// Live search (backend/worker/worker.js) for a known role: any of its words, titles checked.
//   node --test tests/unit/worker-search.test.mjs
// Adzuna is faked here: no key or quota is used.
import { test } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.caches = {
  default: {
    async match(r) {
      return store.get(r.url)?.clone();
    },
    async put(r, res) {
      store.set(r.url, new Response(await res.text()));
    },
  },
};
const asked = [];
const job = (title, desc = "") => ({
  title,
  description: desc,
  company: { display_name: "Acme" },
  location: { display_name: "Hyderabad, Telangana" },
  redirect_url: `https://adzuna.example/${encodeURIComponent(title)}`,
  created: "2026-10-18T10:00:00Z",
});
globalThis.fetch = async url => {
  const p = new URL(url).searchParams;
  asked.push(Object.fromEntries(p));
  if (p.get("what_or"))
    return Response.json({
      results: [
        job("QA Test Engineer", "remote role"),
        job("SDET II"),
        job("Qatar Sales Executive"),
        job("Java Developer", "testing"),
      ],
    });
  return Response.json({
    results: [
      job("QA Analyst"),
      job("Team Leader", "qa testing team"),
      job("Software Tester", "work from office"),
    ],
  });
};
const worker = (await import("../../backend/worker/worker.js")).default;
const env = { ADZUNA_APP_ID: "id", ADZUNA_APP_KEY: "key" };
const search = async qs =>
  (await worker.fetch(new Request(`https://w/search?${qs}`), env, { waitUntil() {} })).json();
const ANY = encodeURIComponent("qa,quality assurance,tester,testing,sdet,test engineer");

test("a known role: any of its words, only titles that have one, and no unrelated jobs", async () => {
  asked.length = 0;
  const r = await search(`q=QA%20Testing&where=Hyderabad&any=${ANY}`);
  const titles = r.jobs.filter(j => !j.related).map(j => j.title);
  assert.deepEqual(titles.sort(), ["QA Analyst", "QA Test Engineer", "SDET II", "Software Tester"]);
  assert.ok(
    asked.some(a => a.what_or === "qa tester testing sdet"),
    "asked Adzuna for any of the single words"
  );
  assert.ok(asked.every(a => a.where === "Hyderabad"));
});

test("remote: the broad search asks for 'remote' too; office-only snippets are not marked remote", async () => {
  asked.length = 0;
  const r = await search(`q=QA%20Testing&where=Remote&any=${ANY}`);
  assert.ok(asked.some(a => a.what_or && a.what === "remote"));
  const by = Object.fromEntries(r.jobs.map(j => [j.title, j.remote]));
  assert.equal(by["QA Test Engineer"], true);
  assert.equal(by["Software Tester"], false); // "work from office"
});

test("an unknown search (no role words) works as before: the typed words, no title check", async () => {
  asked.length = 0;
  const r = await search("q=Nurse&where=Chennai");
  assert.ok(asked.every(a => !a.what_or));
  assert.ok(r.jobs.some(j => j.title === "Team Leader"));
});
