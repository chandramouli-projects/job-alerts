/* One job in a list, laid out like the big job sites: a tick box to pick it, title, company, where it was
   posted, a row of facts (experience | salary | place), one line of the description, the skills, then
   how long ago it was posted with Hide and Save. The company logo sits on the right. A click on the card
   opens the job's details (with View job). Picked jobs can be saved or hidden together. */
const CARD_ICON = {
  exp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12.5h18"/></svg>',
  pay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10M7 8.5h10M9.5 4c3.6 0 5.5 2 5.5 4.5S13.1 13 9.5 13H7l8 7"/></svg>',
  where:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  desc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
  hide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a12.8 12.8 0 0 1-3.2 4.3M6.6 6.6C4.3 8 2.7 10.2 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.6-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
};
// skill names as people write them ("sql" -> "SQL", "spring boot" -> "Spring Boot")
const SKILL_NAME = {
  sql: "SQL",
  aws: "AWS",
  gcp: "GCP",
  html: "HTML",
  css: "CSS",
  "c#": "C#",
  ".net": ".NET",
  rest: "REST",
  "power bi": "Power BI",
  "node.js": "Node.js",
  node: "Node.js",
  javascript: "JavaScript",
  typescript: "TypeScript",
  mongodb: "MongoDB",
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  graphql: "GraphQL",
  ios: "iOS",
  devops: "DevOps",
  sap: "SAP",
  "next.js": "Next.js",
  "react native": "React Native",
  php: "PHP",
  "ci/cd": "CI/CD",
  "ui/ux": "UI/UX",
};
const skillName = s => SKILL_NAME[s] || String(s).replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase());
const cardExp = j =>
  j.exp_min == null
    ? ""
    : j.exp_max != null && j.exp_max !== j.exp_min
      ? `${j.exp_min}-${j.exp_max} Yrs`
      : `${j.exp_min}+ Yrs`;
function cardPlace(j) {
  const loc = String(j.location || "")
    .split(",")
    .map(s => s.trim())
    .filter(s => s && !/^india$/i.test(s))
    .slice(0, 2)
    .join(", ");
  if (isRemote(j)) return loc && !/remote/i.test(loc) ? `${loc} · Remote` : "Remote";
  return loc || j.city_norm || "India";
}
const cardAgo = j => ago(when(j)).replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase()); // "2 days ago" -> "2 Days Ago"
let picked = new Set();

function jobCard(j, opt = {}) {
  const t = U.jobs[j.id],
    e = j._e || evaluate(j, U.prefs),
    st = t?.stage ? STAGES.find(s => s[0] === t.stage) : null;
  const fl = scamCheck(j).risk === "high" ? "" : fitLabel(e); // a possible scam is never a "fit"
  const fresh = isNew(j) && !opt.noNew;
  const facts = [
    cardExp(j) && [CARD_ICON.exp, esc(cardExp(j))],
    [CARD_ICON.pay, j.salary ? esc(j.salary) : "Not disclosed"],
    [CARD_ICON.where, esc(cardPlace(j))],
  ].filter(Boolean);
  const desc = String(j.description || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  const skills = [...new Set([...(e.hits || []), ...(j.tech || [])])].slice(0, 6);
  const by = j.manual
    ? "Added by you"
    : j.direct
      ? "Posted on the company's careers site"
      : `Posted on ${j.source || "a job site"}`;
  const tags = `${fresh ? `<span class="sig sig-new"><i class="dot"></i>New</span>` : ""}${fl ? `<span class="match fit ${fl === "Great fit" ? "great" : "good"}" title="How well it fits your role, experience and city">${fl}</span>` : ""}${j._rel ? `<span class="sig sig-rel">Related</span>` : ""}${insightBadges(j)}${st && opt.showStage !== false ? `<span class="status-pill" style="color:${st[2]}">${st[1]}</span>` : ""}`;
  return `<article class="job ${st ? "tracked" : ""} ${picked.has(j.id) ? "picked" : ""}" data-open="${esc(j.id)}" tabindex="0">
    <label class="job-pick" data-tip="Select"><input type="checkbox" data-pick="${esc(j.id)}" ${picked.has(j.id) ? "checked" : ""} aria-label="Select ${esc(j.title)}"></label>
    <div class="job-main">
      <h3>${esc(j.title)}</h3>
      <div class="job-co">${esc(j.company)}</div>
      <div class="job-by">${esc(by)}</div>
      <ul class="job-meta">${facts.map(([i, v]) => `<li>${i}<span>${v}</span></li>`).join("")}</ul>
      ${desc ? `<p class="job-desc">${CARD_ICON.desc}<span>${esc(desc)}</span></p>` : ""}
      ${skills.length ? `<p class="job-skills">${skills.map(s => `<span>${esc(skillName(s))}</span>`).join("")}</p>` : ""}
    </div>
    <div class="job-logo">${logo(j)}</div>
    <div class="job-foot">
      <span class="job-when"><span>${esc(j.manual ? "Added by you" : cardAgo(j))}</span>${tags}</span>
      <span class="job-acts">
        <button type="button" class="job-act" data-cardhide="${esc(j.id)}" aria-label="Hide this job">${CARD_ICON.hide}<span>Hide</span></button>
        <button type="button" class="job-act" data-save="${esc(j.id)}" aria-pressed="${!!t?.saved}" aria-label="Save job">${ICON.bookmark}<span>${t?.saved ? "Saved" : "Save"}</span></button>
      </span></div>
  </article>`;
}

/* picking several jobs: a bar at the bottom to save or hide them together */
const pickBar = Object.assign(document.createElement("div"), { className: "pick-bar", hidden: true });
pickBar.setAttribute("role", "region");
pickBar.setAttribute("aria-label", "Selected jobs");
document.body.appendChild(pickBar);
function renderPickBar() {
  pickBar.hidden = !picked.size || $("shell").hidden;
  if (pickBar.hidden) return;
  pickBar.innerHTML = `<span class="pb-count"><b>${picked.size}</b> selected</span>
    <span class="pb-acts">
      <button type="button" class="pb-btn primary" data-picksave>${ICON.bookmark}<span>Save</span></button>
      <button type="button" class="pb-btn" data-pickhide>${CARD_ICON.hide}<span>Hide</span></button>
    </span>
    <button type="button" class="pb-x" data-pickclear aria-label="Clear selection" data-tip="Clear selection">×</button>`;
}
function clearPicks() {
  picked.clear();
  document.querySelectorAll(".job-pick input:checked").forEach(i => {
    i.checked = false;
    i.closest(".job")?.classList.remove("picked");
  });
  renderPickBar();
}
const _goCard = go;
go = function (v) {
  picked.clear();
  renderPickBar();
  _goCard(v);
};

document.addEventListener("change", e => {
  const id = e.target.dataset?.pick;
  if (!id) return;
  e.target.checked ? picked.add(id) : picked.delete(id);
  e.target.closest(".job")?.classList.toggle("picked", e.target.checked);
  renderPickBar();
});

/* buttons on this screen */
onAppClick(async (d, t, e) => {
  if (e.target.closest(".job-pick")) return; // the tick box only picks the job
  if (d.apply) {
    noteApply(d.apply);
    return;
  }
  if (d.save) {
    e.stopPropagation();
    const s = toggleSave(d.save);
    document.querySelectorAll(`[data-save="${CSS.escape(d.save)}"]`).forEach(b => {
      b.setAttribute("aria-pressed", s);
      const l = b.querySelector("span");
      if (l) l.textContent = s ? "Saved" : "Save";
    });
    toast(s ? "Saved to Saved jobs" : "Removed from Saved jobs");
    renderNav();
    if (view === "saved") renderSaved();
    return;
  }
  if (d.cardhide) {
    hideJobs([d.cardhide]);
    return;
  } // components/hidden-jobs.js: with Undo
  if ("picksave" in d) {
    for (const id of picked) {
      const tr = track(id);
      if (!tr.saved) {
        tr.saved = true;
        tr.savedAt = Date.now();
        tr.snap ||= findJob(id);
      }
    }
    const n = picked.size;
    picked.clear();
    saveUser();
    renderNav();
    render();
    renderPickBar();
    toast(`Saved ${n} job${n === 1 ? "" : "s"}`, "ok");
    return;
  }
  if ("pickhide" in d) {
    const ids = [...picked];
    picked.clear();
    hideJobs(ids);
    renderPickBar();
    return;
  }
  if ("pickclear" in d) {
    clearPicks();
    return;
  }
  if (d.open) {
    openJob(d.open);
    return;
  }
});
