/* Jobs page: search box, filters, job list */
function renderJobs(){
  const jobs=feed(),chips=activeFilters(),n=chips.length,fresh=jobs.filter(isNew).length;
  let near=[];if(!jobs.length&&F.forYou&&!F.q.trim()){const kw=roleKeywords(U.prefs);F.forYou=false;near=feed().filter(j=>kw.some(k=>(j.title||"").toLowerCase().includes(k)));F.forYou=true;}
  $("main").innerHTML=topbar(`Hi ${esc(U.profile.name.split(" ")[0])}`,`<span style="color:var(--muted);font-size:.82rem">${data.updated?"Updated "+ago(data.updated):""}</span>`)+`
  <form class="searchbar one" id="searchForm"><input id="q" placeholder="Search by skill, job title or company" value="${esc(F.q)}" aria-label="Search">
    <button type="button" class="fbtn ${n?"on":""}" data-ftoggle aria-expanded="${filtersOpen}" aria-controls="fpanel" aria-label="Filters${n?` (${n} on)`:""}" data-tip="Filters">${ICON.filter}${n?`<span class="fbadge">${n}</span>`:""}</button>
    <button class="btn" type="submit">Search</button></form>
  ${filterPanel(n)}
  <div class="resbar"><span><b style="color:var(--ink)">${jobs.length}</b> job${jobs.length===1?"":"s"}${F.forYou&&!F.q.trim()?" for you":""}${liveBusy?` · <span style="color:var(--accent)">Searching more jobs…</span>`:""}${fresh?` · <b style="color:var(--accent)">${fresh} new</b> since your last visit`:""}</span>
    ${chips.length?`<div class="fchips">${chips.map(([k,l])=>`<span class="fchip">${esc(l)}<button type="button" data-fdel="${k}" aria-label="Remove ${esc(l)}">×</button></span>`).join("")}${chips.length>1?`<button type="button" class="fclear-all" data-fclear>Clear all</button>`:""}</div>`:""}</div>
  ${jobs.length?`<div class="list">${jobs.slice(0,shown).map(j=>jobCard(j)).join("")}</div>${jobs.length>shown?`<button class="btn ghost more" data-more>Show ${Math.min(PAGE,jobs.length-shown)} more</button>`:""}`
   :near.length?`<div class="card" style="background:var(--accent-soft);border-color:transparent"><b>No exact match yet.</b> Jobs for your role in other places or levels:</div><div class="list">${near.slice(0,shown).map(j=>jobCard(j)).join("")}</div>${near.length>shown?`<button class="btn ghost more" data-more>Show ${Math.min(PAGE,near.length-shown)} more</button>`:""}`
   :`<div class="empty"><h3>No jobs match right now</h3>${liveBusy?"Searching more jobs…":"Try All jobs or a longer Posted range."}<br>
     ${n?`<button class="btn ghost sm" data-fclear>Clear filters</button> `:""}<button class="btn ghost sm" data-editprefs>Edit my job details</button></div>`}`;
  $("searchForm").onsubmit=e=>{e.preventDefault();F.q=$("q").value;shown=PAGE;$("q").blur();renderJobs();const s=searchParts(F.q);liveSearch(s.what,s.where);};
  bindFilters();
}

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if("more" in d){shown+=PAGE;renderJobs();return;}
});
