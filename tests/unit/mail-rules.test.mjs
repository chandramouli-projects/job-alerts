// The live site's email rules (backend/mail/mail-rules.js) must read emails exactly like the computer's
// Gmail reader (backend/mail/track_mail.py). Each sample goes through both and the answers must match.
//   node --test tests/unit/mail-rules.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse, applyEvents, mailId } from "../../backend/mail/mail-rules.js";

const LI = "LinkedIn <jobs-noreply@linkedin.com>";
const SAMPLES = [
  [
    "Chandramouli, your application was sent to Acme Technologies",
    "QA Automation Engineer\nAcme Technologies · Hyderabad",
    LI,
  ],
  ["Your application was viewed by Acme Technologies", "", LI],
  [
    "Your application to QA Engineer at Zeta",
    "Unfortunately, we will not be moving forward with your application.",
    LI,
  ],
  [
    "Recruiter shortlisted your application for Software Test Engineer at Mayura Consultancy Services",
    "",
    "Naukri <info@naukri.com>",
  ],
  [
    "Interview invitation",
    "We would like to invite you to an interview for the QA Engineer role at Beta.",
    "Beta Careers <no-reply@greenhouse.io>",
  ],
  [
    "Thank you for applying to Groww",
    "We received your application for the SDET position.",
    "Groww Hiring <no-reply@lever.co>",
  ],
  [
    "Offer letter - Test Engineer at Delta",
    "We are pleased to offer you the role.",
    "Delta <hr@myworkday.com>",
  ],
  ["30 new jobs for you: QA Engineer", "Apply now. You applied to 2 jobs this week.", LI],
  ["Jobs you may be interested in", "", "Naukri <alerts@naukri.com>"],
  ["Your application was sent to Acme", "", "Friend <friend@gmail.com>"],
  ["Complete your profile", "Add a photo to stand out", LI],
  [
    "Re: Update from Okta",
    "Your application is in review. Position: Senior SDET",
    "Okta Recruiting <no-reply@ashbyhq.com>",
  ],
  [
    "Application received",
    'Thanks for applying for the role of "Data Analyst" at Swiggy, Bengaluru.',
    "Swiggy Talent <noreply@smartrecruiters.com>",
  ],
  [
    "Fwd: Your application has been submitted",
    "You applied for Python Developer at Zoho.",
    "Zoho <careers@zohorecruit.com>",
  ],
];

test("same answers as track_mail.py for every sample", () => {
  const py = fileURLToPath(new URL("../../backend/mail", import.meta.url));
  const out = execFileSync(
    process.env.PYTHON || "python",
    [
      "-I",
      "-c",
      "import sys,json;sys.path.insert(0,sys.argv[1]);from track_mail import parse;print(json.dumps([parse(*s) for s in json.load(sys.stdin)]))",
      py,
    ],
    { input: JSON.stringify(SAMPLES), encoding: "utf8" }
  );
  const expected = JSON.parse(out);
  SAMPLES.forEach((s, i) => assert.deepEqual(parse(...s), expected[i], s[0]));
});

test("the Python test cases", () => {
  assert.deepEqual(parse(...SAMPLES[0]), {
    stage: "applied",
    company: "Acme Technologies",
    title: "",
    site: "LinkedIn",
  });
  assert.equal(parse(...SAMPLES[2]).stage, "rejected");
  assert.deepEqual(parse(...SAMPLES[3]), {
    stage: "shortlisted",
    company: "Mayura Consultancy Services",
    title: "Software Test Engineer",
    site: "Naukri",
  });
  assert.equal(parse(...SAMPLES[4]).company, "Beta");
  assert.equal(parse(...SAMPLES[7]), null);
  assert.equal(parse(...SAMPLES[9]), null);
});

test("updates match my applications, move forward only, and new ones get the same id as the computer server", async () => {
  const mine = { j1: { stage: "applied", snap: { title: "QA Engineer", company: "Zeta Technologies" } } };
  const state = {};
  const moved = await applyEvents(state, mine, [
    {
      id: "m1",
      at: "2026-10-01T10:00:00Z",
      stage: "shortlisted",
      company: "Zeta",
      title: "QA Engineer",
      site: "Naukri",
    },
    {
      id: "m2",
      at: "2026-10-02T10:00:00Z",
      stage: "applied",
      company: "Okta",
      title: "SDET",
      site: "LinkedIn",
    },
    {
      id: "m3",
      at: "2026-10-03T10:00:00Z",
      stage: "viewed",
      company: "Zeta",
      title: "QA Engineer",
      site: "Naukri",
    }, // older stage: no move
    {
      id: "m1",
      at: "2026-10-01T10:00:00Z",
      stage: "shortlisted",
      company: "Zeta",
      title: "QA Engineer",
      site: "Naukri",
    },
  ]); // seen
  assert.deepEqual(
    moved.map(m => [m.id.startsWith("mail-") ? "mail" : m.id, m.stage]),
    [
      ["j1", "shortlisted"],
      ["mail", "applied"],
    ]
  );
  assert.equal(state.jobs.j1.stage, "shortlisted");
  const okta = Object.keys(state.jobs).find(k => k.startsWith("mail-"));
  assert.equal(okta, await mailId("Okta", "SDET"));
  assert.match(okta, /^mail-[0-9a-f]{12}$/);
});
