/* Signals about a job, worked out from the jobs we already have (no outside data, no API calls).
   Ported from frontend/js/services/job-insights.js; what the screens show is in JobInsights.jsx.
   - scamCheck:     "Possible scam" when the text asks for money or shows other common fake-job signs
   - postingAge:    "Posted today: apply early", "Old posting" (30+ days), "Reposted" (collector flag)
   - salaryGuess:   typical salary from similar jobs, for a job that doesn't say its salary
   - insightBoost:  small push up / down in the "Best fit" order from the signals above */
import { ROLES } from "../core/constants.js";
import { hasWord, normQuery } from "../core/helpers.js";
import { allJobs } from "./job-store.js";

/* ---------------------------------------------------------------- scam / fake job signs */
// strong: one is enough; soft: two together are enough
export const SCAM_STRONG = [
  [
    /\b(registration|processing|security|training|joining|documentation|document|interview|application|kit)\s+(fee|fees|charges?|amount|deposit)\b/i,
    "Asks for a fee to get the job",
  ],
  [/\b(pay|deposit|transfer)\b.{0,30}(rs\.?\s?\d|₹\s?\d|inr\s?\d|rupees|\bfee)/i, "Asks you to pay money"],
  [/\brefundable\b/i, "Mentions a 'refundable' amount"],
  [
    /\b(no interview|without (any )?interview|direct joining|(100%|guaranteed) (job|placement))/i,
    "Promises a job without a proper interview",
  ],
];
export const SCAM_SOFT = [
  [
    /\b(whats ?app|telegram)\b.{0,40}\b(only|contact|message|ping|send|share)/i,
    "Asks to talk only on WhatsApp / Telegram",
  ],
  [/\b(earn|income)\b.{0,25}\b(per day|daily|weekly|from home)\b/i, "Promises easy daily income"],
  [
    /\b(data entry|typing|copy paste|form filling)\b.{0,40}\b(from home|part time)\b/i,
    "Home typing / data entry offer",
  ],
  [
    /[a-z0-9._%+-]+@(gmail|yahoo|outlook|hotmail|rediffmail)\.com/i,
    "Recruiter uses a personal email address",
  ],
];
// "No registration fee", "we never charge" are good signs, not bad ones
export const NEGATED =
  /\b(no|not|never|don'?t|do not|does not|doesn'?t|without|free of|zero)\b[^.!?]{0,20}$/i;
export function signsIn(text, list) {
  return list
    .filter(([re]) => {
      const m = text.match(re);
      return m && !NEGATED.test(text.slice(Math.max(0, m.index - 30), m.index));
    })
    .map(([, why]) => why);
}
// -> {risk:"high"|"some"|null, reasons:[...]}; remembered per job, since the list redraws often
const scamSeen = new Map();
export function scamCheck(j) {
  const key = j.id + "|" + (j.description || "").length;
  if (!scamSeen.has(key)) {
    const text = `${j.title || ""} ${j.description || ""}`,
      strong = signsIn(text, SCAM_STRONG),
      soft = signsIn(text, SCAM_SOFT);
    scamSeen.set(key, {
      risk: strong.length || soft.length > 1 ? "high" : soft.length ? "some" : null,
      reasons: [...strong, ...soft],
    });
  }
  return scamSeen.get(key);
}

/* ---------------------------------------------------------------- posting age */
export const daysOld = j => {
  const t = new Date(j.posted || "");
  return isNaN(t) ? null : (Date.now() - t) / 864e5;
};
// -> {label, kind} or null; kind is "fresh" | "old" | "reposted"
export function postingAge(j) {
  if (j.manual) return null;
  const d = daysOld(j);
  if (j.reposted)
    return {
      label: "Reposted",
      kind: "reposted",
      tip: "This company posted the same job again. It may be hard to fill, or not really open.",
    };
  if (d != null && d > 30)
    return {
      label: "Old posting",
      kind: "old",
      tip: `Posted ${Math.round(d)} days ago. It may already be filled.`,
    };
  if (d != null && d < 1)
    return {
      label: "Posted today",
      kind: "fresh",
      tip: "Apply early: recruiters see the first applications first.",
    };
  return null;
}

/* ---------------------------------------------------------------- typical salary */
// "₹5–6 LPA" -> [5, 6]. Job sites sometimes give a monthly amount as yearly (₹0.1 LPA = ₹10,000 a month).
export function salaryRange(j) {
  const m = String(j.salary || "").match(/₹\s*([\d.]+)(?:\s*[–-]\s*([\d.]+))?\s*LPA/i);
  if (!m) return null;
  let lo = +m[1],
    hi = +(m[2] || m[1]);
  if (hi < 1) {
    lo *= 12;
    hi *= 12;
  }
  return lo >= 1 && hi <= 100 && lo <= hi ? [lo, hi] : null;
}
export const median = a => {
  const s = [...a].sort((x, y) => x - y),
    i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
export const lpa = v => (Math.round(v * 2) / 2).toString().replace(/\.0$/, "");
// -> {text:"₹6–10 LPA", count, where:"Hyderabad"|"India"} or null (fewer than 3 similar jobs with a salary)
export function salaryGuess(j) {
  if (salaryRange(j)) return null;
  const title = (j.title || "").toLowerCase(),
    kw =
      Object.values(ROLES).find(k => k.some(w => hasWord(title, w))) ||
      normQuery(j.role || "")
        .split(" ")
        .filter(w => w.length > 2);
  if (!kw.length) return null;
  const similar = allJobs()
    .filter(
      x =>
        x.id !== j.id &&
        kw.some(w => hasWord((x.title || "").toLowerCase(), w)) &&
        (j.exp_min == null || x.exp_min == null || Math.abs(x.exp_min - j.exp_min) <= 2)
    )
    .map(x => [x, salaryRange(x)])
    .filter(([, r]) => r);
  const here = similar.filter(([x]) => j.city_norm && x.city_norm === j.city_norm);
  const pick = here.length >= 3 ? here : similar,
    where = here.length >= 3 ? j.city_norm : "India";
  if (pick.length < 3) return null;
  return {
    text: `₹${lpa(median(pick.map(([, r]) => r[0])))}–${lpa(median(pick.map(([, r]) => r[1])))} LPA`,
    count: pick.length,
    where,
  };
}

/* ---------------------------------------------------------------- order in "Best fit" */
export function insightBoost(j) {
  const age = postingAge(j),
    scam = scamCheck(j).risk;
  return (
    (scam === "high" ? -30 : 0) +
    (age?.kind === "old" ? -8 : age?.kind === "reposted" ? -5 : age?.kind === "fresh" ? 5 : 0)
  );
}
