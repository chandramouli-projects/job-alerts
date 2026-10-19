/*
"Does this job fit this person?" for alerts sent while the app is closed (functions/api, push/run).
A copy of the rules in frontend/js/services/matching.js (role words, experience, city), which the
app uses when it is open. ROLES, SENIOR and JUNIOR are copies of frontend/js/core/constants.js;
tests/unit/push-match.test.mjs fails when the two drift apart, so change both together.
*/
export const ROLES = {
  "Software Engineer": [
    "software engineer",
    "software developer",
    "sde",
    "programmer",
    "application developer",
  ],
  "Frontend Developer": ["frontend", "front end", "front-end", "ui developer", "react", "angular", "vue"],
  "Backend Developer": ["backend", "back end", "back-end", "node", "golang", "api developer"],
  "Full Stack Developer": ["full stack", "fullstack", "full-stack", "mern", "mean"],
  "Java Developer": ["java", "spring"],
  "Python Developer": ["python", "django", "flask"],
  "React Developer": ["react"],
  ".NET Developer": [".net", "dotnet", "c#", "asp.net"],
  "Data Analyst": ["data analyst", "business analyst", "power bi", "analytics"],
  "Data Scientist": ["data scientist", "machine learning", "ml engineer", "ai engineer"],
  "DevOps Engineer": ["devops", "cloud engineer", "sre", "site reliability"],
  "QA / Testing": [
    "qa ",
    "qa-",
    "qa/",
    "quality assurance",
    "quality analyst",
    "test engineer",
    "test analyst",
    "test lead",
    "tester",
    "testing",
    "sdet",
    "automation test",
    "selenium",
  ],
  "Android Developer": ["android", "kotlin", "flutter", "mobile developer"],
  "UI UX Designer": ["ui/ux", "ux designer", "ui designer", "product designer"],
};
export const SENIOR = /\b(senior|sr\.?|lead|principal|staff|architect|manager|head|director)\b/i,
  JUNIOR = /\b(intern|internship|trainee|fresher)\b/i;
export const hasWord = (text, w) =>
  new RegExp(
    "(^|[^a-z0-9])" +
      w
        .trim()
        .replace(/[-/]$/, "")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "(js)?($|[^a-z0-9])"
  ).test(text);
const splitList = s =>
  String(s || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
const isRemote = j =>
  j.remote || /\b(remote|work from home|wfh)\b/i.test([j.title, j.location, j.type].join(" "));

// same "ok" as evaluate() in matching.js: role in the title, experience fits, city fits
export function fits(j, p) {
  const title = (j.title || "").toLowerCase();
  const kw = [
    ...(p.roles || []).flatMap(r => ROLES[r] || [r.toLowerCase()]),
    ...splitList(p.custom).map(r => r.toLowerCase()),
  ];
  if (!kw.some(k => hasWord(title, k))) return false;
  const my = p.exp;
  if (my != null) {
    if (my < 5 && SENIOR.test(j.title)) return false;
    if (my >= 2 && JUNIOR.test(j.title)) return false;
    if (j.exp_min != null && (j.exp_min > my + 1 || (j.exp_max != null && j.exp_max < my - 2))) return false;
  }
  const cities = p.cities || [],
    loc = ((j.location || "") + " " + (j.city_norm || "")).toLowerCase();
  const cityHit = cities.some(
    c =>
      c !== "Remote" &&
      c !== "Anywhere in India" &&
      (loc.includes(c.toLowerCase()) ||
        (c === "Bangalore" && loc.includes("bengaluru")) ||
        (c === "Gurgaon" && loc.includes("gurugram")))
  );
  return cityHit || (cities.includes("Remote") && isRemote(j)) || cities.includes("Anywhere in India");
}
