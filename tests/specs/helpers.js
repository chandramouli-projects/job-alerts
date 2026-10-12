// Shared test data and shortcuts.
import { expect } from "@playwright/test";

const DAY = 864e5;
const iso = msAgo => new Date(Date.now() - msAgo).toISOString().slice(0, 19) + "+00:00";

export const PASSWORD = "Test@1234";
export const uniqueEmail = tag => `t-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

// A fixed set of jobs, each one built to prove one rule
export const makeJob = (id, o) => ({
    id, title: "", company: "Acme", logo: "", company_site: "", city: "", location: "India", remote: false,
    type: "Full-time", url: `https://jobs.example.com/${id}`, direct: false,
    apply_links: [{ site: "Example", url: `https://jobs.example.com/${id}`, direct: false }],
    description: "", posted: iso(DAY), salary: "", source: "LinkedIn", exp_min: null, exp_max: null,
    city_norm: "India", tech: [], found: iso(DAY), role: "", ...o,
});
export function fixtureJobs() {
  const job = makeJob;
  return [
    job("qa-hyd", { title: "QA Automation Engineer", company: "Acme", city: "Hyderabad", location: "Hyderabad, Telangana", city_norm: "Hyderabad", exp_min: 2, exp_max: 4, tech: ["selenium", "java"], description: "Selenium and Java, 2-4 years", salary: "₹6–9 LPA" }),
    job("qa-senior", { title: "Senior QA Engineer", company: "Beta", city: "Hyderabad", location: "Hyderabad, Telangana", city_norm: "Hyderabad", exp_min: 5, exp_max: 8 }),
    job("qa-intern", { title: "QA Intern", company: "Gamma", city: "Hyderabad", location: "Hyderabad", city_norm: "Hyderabad", exp_min: 0, exp_max: 1 }),
    job("qa-old", { title: "Test Engineer", company: "Delta", city: "Hyderabad", location: "Hyderabad", city_norm: "Hyderabad", posted: iso(10 * DAY), found: iso(10 * DAY) }),
    job("qa-remote", { title: "Remote QA Tester", company: "Epsilon", location: "India", city_norm: "Remote", remote: true }),
    job("qa-blr", { title: "QA Engineer", company: "Zeta", city: "Bangalore", location: "Bengaluru, Karnataka", city_norm: "Bangalore", exp_min: 3, exp_max: 5, salary: "₹12–15 LPA" }),
    job("java-pune", { title: "Java Developer", company: "Eta", city: "Pune", location: "Pune", city_norm: "Pune", exp_min: 1, exp_max: 3, tech: ["java", "spring"] }),
    job("js-dev", { title: "JavaScript Developer", company: "Theta", city: "Pune", location: "Pune", city_norm: "Pune", exp_min: 2, exp_max: 4, tech: ["javascript"] }),
    job("xss", { title: '<img src=x onerror="window.__xss=1">QA Tester', company: "<b>Evil</b>", city: "Hyderabad", location: "Hyderabad", city_norm: "Hyderabad", url: "javascript:window.__xss2=1" }),
  ];
}

// Serve the fixture instead of frontend/data/jobs.json, and fake the live search so no API quota is used
export async function useFixtures(page, { live = {} } = {}) {
  const calls = [];
  await page.route("**/jobs.json*", r => r.fulfill({ json: { updated: iso(3600e3), roles: [], live_api: `http://127.0.0.1:${process.env.TEST_PORT || 8091}`, jobs: fixtureJobs() } }));
  await page.route("**/search?**", r => {
    const u = new URL(r.request().url()); const q = u.searchParams.get("q") || "";
    calls.push({ q, where: u.searchParams.get("where") || "" });
    r.fulfill({ json: { q, jobs: live[q.toLowerCase()] || [] } });
  });
  await page.route("https://jobs.example.com/**", r => r.fulfill({ body: "<h1>Job page</h1>", contentType: "text/html" }));
  return calls;
}

// Make an account through the API and open the app already logged in
export async function signupApi(request, email = uniqueEmail("u"), password = PASSWORD, name = "Test User") {
  const r = await request.post("/api/signup", { data: { name, email, password } });
  expect(r.status(), await r.text()).toBe(200);
  return { email: email.toLowerCase(), password, token: (await r.json()).token };
}

export async function saveUser(request, token, user) {
  const r = await request.put("/api/user", { headers: { Authorization: `Bearer ${token}` }, data: user });
  expect(r.status()).toBe(200);
}

export const blankUser = (email, prefs) => ({
  profile: { name: "Test User", email, phone: "" }, prefs: { roles: [], custom: "", exp: null, cities: [], skills: [], customSkills: "", ...prefs },
  jobs: {}, manual: [], hidden: {}, settings: { theme: "light" }, onboarded: !!prefs,
});

export async function openLoggedIn(page, account) {
  await page.addInitScript(([email, token]) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("uv.session", JSON.stringify({ email }));
      localStorage.setItem("uv.token", JSON.stringify(token));
      sessionStorage.setItem("seeded", "1");
    }
  }, [account.email, account.token]);
  await page.goto("/");
}

export async function loginUi(page, email, password) {
  await page.goto("/");
  await expect(page.locator("#loginView")).toBeVisible();
  await page.fill("#lEmail", email);
  await page.fill("#lPass", password);
  await page.click("#loginForm button[type=submit]");
}

export const jobTitles = page => page.locator("#main .job h3").allTextContents();
