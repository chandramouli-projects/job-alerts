/*
Application emails -> statuses, shared by the computer server (backend/server/mail-sync.mjs) and the
live site (functions/api, Gmail connected with Google). Plain JavaScript, no Node-only parts.

parse(subject, body, sender) is a copy of parse() in backend/mail/track_mail.py (the computer's Gmail
reader): same senders, rules and patterns. tests/unit/mail-rules.test.mjs runs the Python test cases
on it, so change both together.

applyEvents(state, userJobs, events, idFor) matches each update to the person's applications by company
and title (else makes a "mail-<hash>" application) and moves statuses forward. state = {seen, jobs}.
*/
export const SENDERS = { "linkedin.com": "LinkedIn", "naukri.com": "Naukri", "indeed.com": "Indeed", "foundit.in": "Foundit",
  "instahyre.com": "Instahyre", "glassdoor.com": "Glassdoor", "internshala.com": "Internshala",
  "wellfound.com": "Wellfound", "cutshort.io": "Cutshort", "hirist.tech": "Hirist", "apna.co": "Apna",
  "greenhouse.io": "Greenhouse", "lever.co": "Lever", "myworkday.com": "Workday",
  "smartrecruiters.com": "SmartRecruiters", "ashbyhq.com": "Ashby", "zohorecruit.com": "Zoho Recruit" };
const JOB_SITES = ["LinkedIn", "Naukri", "Indeed", "Foundit", "Instahyre", "Glassdoor", "Internshala", "Wellfound", "Cutshort", "Hirist", "Apna"];

// Most advanced first: an email that says "unfortunately" is a rejection even if it also says "applied"
const STAGE_RULES = [
  ["rejected", /unfortunately|not (?:be )?moving forward|decided (?:to )?(?:move|go|proceed) forward with other|not (?:been )?selected|regret to inform|position (?:has been|is now) filled|will not be proceeding|not a (?:fit|match) at this time|no longer under consideration/],
  ["offer", /offer letter|pleased to (?:extend|offer)|job offer|we(?:'d| would) like to offer you/],
  ["interview", /interview (?:invitation|invite|scheduled|call|round)|invit\w* you (?:to|for) (?:an? )?interview|schedule (?:an?|your) interview|interview with/],
  ["shortlisted", /shortlist|moved (?:you )?(?:to|forward to) the next (?:round|step|stage)|recruiter (?:is|was) interested|interested in your (?:profile|application)|under consideration|in review/],
  ["viewed", /(?:application|profile) (?:was |has been )?viewed|viewed your (?:application|profile)/],
  ["applied", /application (?:was )?sent|application (?:has been |was )?(?:received|submitted)|thank(?:s| you) for applying|you(?:'ve| have)? applied|successfully applied|applied (?:for|to)|we received your application/],
];
// Emails about other things (job alerts, newsletters) that could share words with the rules above
const SKIP = /jobs? (?:alert|for you|you may be interested)|recommended jobs|new jobs|apply now|people also viewed|who viewed your profile/;
const COMPANY_PATTERNS = [
  /application (?:was )?(?:sent|viewed|submitted) (?:to|by) (?<company>.+?)$/i,
  /application to (?<title>.+?) at (?<company>.+?)$/i,
  /(?:for|as) (?:the |a |an )?(?<title>.+?) (?:role |position |job )?at (?<company>.+?)$/i,
  /(?:update|news|message) from (?<company>.+?)$/i,
  /(?<company>.+?) (?:viewed|received|reviewed) your application/i,
  /thank(?:s| you) for applying (?:to|at) (?<company>.+?)$/i,
];
const TITLE_PATTERNS = [
  /(?:applied|application) (?:for|to) (?:the )?(?:position |role |job )?(?:of )?["'“]?(?<title>[^\n"'”]{3,80}?)["'”]? (?:position |role |job )?at (?<company>[^\n.,]{2,60})/i,
  /(?:position|role|job)(?: title)?:\s*(?<title>[^\n]{3,80})/i,
];

const STRIP = " -–|:.,!\"'“”";
export function clean(s) {
  s = String(s || "").replace(/\s+/g, " ");
  let a = 0, b = s.length;
  while (a < b && STRIP.includes(s[a])) a++;
  while (b > a && STRIP.includes(s[b - 1])) b--;
  return s.slice(a, b).replace(/^(?:the|a|an) /i, "").slice(0, 80);
}
// "Acme Careers <no-reply@greenhouse.io>" -> ["Acme Careers", "no-reply@greenhouse.io"]
export function splitSender(sender) {
  const m = String(sender || "").match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? [m[1].trim(), m[2].trim()] : ["", String(sender || "").trim()];
}
export function siteOf(sender) {
  const domain = splitSender(sender)[1].split("@").pop().toLowerCase();
  const hit = Object.entries(SENDERS).find(([d]) => domain === d || domain.endsWith("." + d));
  return hit ? hit[1] : null;
}
export function htmlToText(html) {
  return String(html || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

/* One email -> {stage, company, title, site} or null when it is not an application update */
export function parse(subject, body, sender) {
  subject = String(subject || ""); body = String(body || "");
  const site = siteOf(sender);
  if (!site) return null;
  const low = `${subject}\n${body.slice(0, 3000)}`.toLowerCase().replace(/\s+/g, " ");
  if (SKIP.test(subject.toLowerCase())) return null;
  const stage = (STAGE_RULES.find(([, rx]) => rx.test(low)) || [])[0];
  if (!stage) return null;
  let company = "", title = "";
  const subj = subject.trim().replace(/^(?:re|fwd?):\s*|^[^,]{1,40},\s*/i, "");   // drop "Re:" and a leading "Name, "
  for (const rx of COMPANY_PATTERNS) {
    const m = subj.match(rx);
    if (m) { company = clean(m.groups.company); title = clean(m.groups.title || ""); break; }
  }
  if (!title || !company) {
    for (const rx of TITLE_PATTERNS) {
      const m = body.slice(0, 4000).match(rx);
      if (m) { title = title || clean(m.groups.title); company = company || clean(m.groups.company || ""); break; }
    }
  }
  if (!company && !JOB_SITES.includes(site))   // company hiring systems send in the company's name
    company = clean(splitSender(sender)[0].replace(/\b(careers?|hiring|talent|recruiting|team|jobs|via \w+)\b/gi, ""));
  if (!company) return null;
  return { stage, company, title, site };
}

/* ---------------------------------------------------------------- matching updates to applications */
export const RANK = { applied: 1, viewed: 2, shortlisted: 3, interview: 4, offer: 5, rejected: 6 };
const FILLER = /\b(pvt|private|ltd|limited|inc|llp|llc|technologies|technology|solutions|services|india|software|consultancy|consulting|corp|corporation|co|the)\b/g;
export const norm = s => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
export const core = s => norm(s).replace(FILLER, " ").replace(/\s+/g, " ").trim() || norm(s);
const words = s => new Set(norm(s).split(" ").filter(w => w.length > 1));
export function sameCompany(a, b) {
  const x = core(a), y = core(b);
  return !!x && !!y && (x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y)));
}
export function titleScore(a, b) {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  return [...x].filter(w => y.has(w)).length / Math.min(x.size, y.size);
}
// a later email moves the status forward; "Not selected" can follow anything but an offer
export const better = (now, next) => !now || (next === "rejected" ? now !== "offer" && now !== "rejected" : RANK[next] > RANK[now]);
// the id of an application known only from email: "mail-" + 12 hex of sha1(company core | title)
export async function mailId(company, title) {
  const h = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(core(company) + "|" + norm(title)));
  return "mail-" + [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

// returns the updates that moved a status forward: [{id, stage, company, title}]
export async function applyEvents(state, userJobs, events) {
  state.seen ||= []; state.jobs ||= {};
  const moved = [];
  for (const ev of events) {
    if (!ev.company || state.seen.includes(ev.id)) continue;
    state.seen.push(ev.id);
    // the person's own applications first, then ones made from earlier emails
    const pool = [...Object.entries(userJobs || {}).map(([id, t]) => [id, t?.snap]), ...Object.entries(state.jobs).map(([id, o]) => [id, o.snap])]
      .filter(([, s]) => s && sameCompany(s.company, ev.company));
    const scored = pool.map(([id, s]) => [id, ev.title ? titleScore(s.title, ev.title) : 0.5]).sort((a, b) => b[1] - a[1]);
    let id = scored.length && (scored[0][1] >= 0.34 || pool.length === 1) ? scored[0][0] : null;
    const at = Date.parse(ev.at) || Date.now();
    if (!id) {
      id = await mailId(ev.company, ev.title);
      state.jobs[id] ||= { stage: null, history: [], snap: { id, title: ev.title || "Application", company: ev.company, source: ev.site,
        url: "", location: "", city_norm: "", posted: "", found: new Date(at).toISOString(), tech: [], fromEmail: true } };
    }
    const o = state.jobs[id] ||= { stage: null, history: [] };
    if (!o.history.some(h => h.stage === ev.stage && h.at === at))
      o.history.push({ stage: ev.stage, at, via: "email", site: ev.site, subject: ev.subject });
    const current = [o.stage, userJobs?.[id]?.stage].filter(s => RANK[s]).sort((a, b) => RANK[b] - RANK[a])[0] || null;
    if (better(current, ev.stage)) {
      o.stage = ev.stage;
      const s = o.snap || userJobs?.[id]?.snap || {};
      moved.push({ id, stage: ev.stage, company: s.company || ev.company, title: s.title || ev.title });
    }
  }
  state.seen = state.seen.slice(-3000);
  return moved;
}
