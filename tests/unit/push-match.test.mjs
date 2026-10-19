// The alert matcher (backend/push/match.js) must use the same lists and rules as the app.
//   node --test tests/unit/push-match.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ROLES, SENIOR, JUNIOR, hasWord, fits } from "../../backend/push/match.js";

const app = {};
vm.createContext(app);
vm.runInContext(readFileSync(new URL("../../frontend/js/core/constants.js", import.meta.url), "utf8").replace(/const PREVIEW=.*$/m, "") +
  "\n;globalThis.out={ROLES,SENIOR:String(SENIOR),JUNIOR:String(JUNIOR)}", app);
const helpers = readFileSync(new URL("../../frontend/js/core/helpers.js", import.meta.url), "utf8");

test("same role words and senior / junior rules as the app", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(ROLES)), JSON.parse(JSON.stringify(app.out.ROLES)));
  assert.equal(String(SENIOR), app.out.SENIOR);
  assert.equal(String(JUNIOR), app.out.JUNIOR);
  assert.ok(helpers.includes(`const hasWord=${hasWord.toString()}`), "hasWord is the same as in helpers.js");
});

test("fits: role, experience and city like 'Jobs for me'", () => {
  const me = { roles: ["QA / Testing"], exp: 3, cities: ["Hyderabad"] };
  assert.equal(fits({ title: "QA Automation Engineer", location: "Hyderabad", exp_min: 2, exp_max: 4 }, me), true);
  assert.equal(fits({ title: "Senior QA Engineer", location: "Hyderabad" }, me), false);
  assert.equal(fits({ title: "QA Intern", location: "Hyderabad" }, me), false);
  assert.equal(fits({ title: "QA Engineer", location: "Pune" }, me), false);
  assert.equal(fits({ title: "QA Engineer", location: "Hyderabad", exp_min: 6 }, me), false);
  assert.equal(fits({ title: "JavaScript Developer", location: "Pune" }, { roles: ["Java Developer"], exp: 3, cities: ["Pune"] }), false);
  assert.equal(fits({ title: "Remote QA Tester", location: "India", remote: true }, { ...me, cities: ["Remote"] }), true);
  assert.equal(fits({ title: "QA Engineer", location: "Bengaluru" }, { ...me, cities: ["Bangalore"] }), true);
});
