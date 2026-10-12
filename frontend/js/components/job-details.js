/* Job details panel, the "Are you sure?" pop-up, and quick copy of profile details */
function openSheet(title,body,foot=""){$("sheetTitle").textContent=title;$("sheetBody").innerHTML=body;$("sheetFoot").innerHTML=foot;$("sheetFoot").hidden=!foot;$("sheet").classList.add("open");$("scrim").classList.add("open");$("sheetBody").scrollTop=0;}
function closeSheet(){$("sheet").classList.remove("open");$("scrim").classList.remove("open");}
let askDone=null;
function ask(title,text,yes="OK",red=false){return new Promise(res=>{
  $("askTitle").textContent=title;$("askText").textContent=text;$("askYes").textContent=yes;$("askYes").className="btn"+(red?" red":"");
  askDone=v=>{$("askModal").hidden=true;askDone=null;res(v);};$("askModal").hidden=false;setTimeout(()=>$("askYes").focus(),30);});}
$("askYes").onclick=()=>askDone?.(true);$("askNo").onclick=()=>askDone?.(false);
$("askModal").onclick=e=>{if(e.target===$("askModal"))askDone?.(false);};
$("sheetX").onclick=closeSheet;$("scrim").onclick=closeSheet;
document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(askDone)return askDone(false);if(!$("applyModal").hidden)return closeApply();pkClose();closeSheet();}if(e.key==="Enter"&&e.target.dataset?.open)openJob(e.target.dataset.open);});
function openJob(id){
  const j=findJob(id)||U.jobs[id]?.snap;if(!j)return;
  const t=U.jobs[id],e=evaluate(j,U.prefs),stage=t?.stage;
  // skills the job asks for that are not in the profile ("node" counts for "node.js")
  const mine=mySkills(U.prefs),haveSkill=s=>mine.some(m=>hasWord(s,m)||hasWord(m,s)),missing=mine.length?(j.tech||[]).filter(s=>!haveSkill(s)):[];
  const ts=tasteScore(j,taste()),why=[...e.why,...(ts>0?[[true,"Like jobs you saved or applied to"]]:ts<0?[[false,"Like jobs you hid"]]:[])];
  const applied=appliedKeys(),done=isApplied(t),similar=allJobs().filter(x=>x.id!==id&&!U.hidden[x.id]&&!wasApplied(x,applied)&&evaluate(x,U.prefs).ok&&(x.role===j.role||x.company===j.company)).slice(0,3);
  openSheet("Job details",`
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:12px">${logo(j)}<div><h2 style="font-size:1.35rem">${esc(j.title)}</h2>
      <button class="co" data-company="${esc(j.company)}" style="background:none;border:0;padding:0;font-weight:700;color:var(--accent)">${esc(j.company)}</button>
      <div class="meta">${esc(j.location||"India")}${j.remote?" · Remote":""}</div></div></div>
    <div class="kv" style="margin-bottom:12px">
      <div><small>Experience</small><b>${esc(expRange(j))}</b></div><div><small>Salary</small><b>${esc(j.salary||"Not disclosed")}</b></div>
      <div><small>Job type</small><b>${esc(j.type||"Not stated")}</b></div><div><small>Posted</small><b>${j.manual?"Added by you":`${esc(j.source)} · ${ago(when(j))}`}</b></div></div>
    <div class="card"><h3>${e.ok?`${fitLabel(e)} for you`:"Why it's not in your feed"}</h3><ul class="why">${why.map(([ok,w])=>`<li class="${ok?"ok":""}">${ok===false?"✕ ":ok?"✓ ":"• "}${esc(w)}</li>`).join("")}</ul></div>
    <div class="card">${isApplied(t)?`<div class="app-head"><h3>Application status</h3>${statusPill(t)}</div><div style="margin:-6px 0 6px">${stepper(t)}</div><p class="wait">${statusNote(t)}</p>
      <ul class="tl">${t.history.filter(h=>h.stage!=="saved").slice().reverse().map(h=>{const s=STAGES.find(x=>x[0]===h.stage);return `<li><i class="dot" style="background:${s[2]}"></i><b style="color:var(--ink);font-weight:600">${s[1]}</b> · ${fmtWhen(h.at)}</li>`}).join("")}</ul>`
      :`<h3>Your application</h3><button class="btn ghost sm" data-markapplied="${esc(id)}">I applied to this job</button>`}
      <div style="margin-top:14px"><label class="lbl" for="notes">My notes</label><textarea class="inp" id="notes" data-id="${esc(id)}" placeholder="Recruiter name, interview date, questions asked…">${esc(t?.notes||"")}</textarea></div></div>
    ${(j.tech||[]).length?`<div class="card"><h3>Skills mentioned</h3><div class="facts" style="margin:0">${j.tech.map(s=>`<span class="${haveSkill(s)?"good":"t"}">${esc(s)}</span>`).join("")}</div>${missing.length?`<p class="miss">Your skills don't have: <b>${esc(missing.join(", "))}</b></p>`:""}</div>`:""}
    ${j.description?`<div class="card"><h3>About the job</h3><div class="desc">${esc(j.description)}${j.description.length>=3400?"…":""}</div></div>`:""}
    ${!done&&(j.apply_links||[]).length>1?`<div class="card"><h3>Where you can apply</h3><div class="list" style="gap:8px">${j.apply_links.map(l=>`<a class="cocard" style="grid-template-columns:1fr auto;text-decoration:none;color:var(--ink)" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener" data-apply="${esc(id)}"><span><b>${esc(l.site)}</b><small>${l.direct?"Company's own page":"Job website"}</small></span><span class="match ${l.direct?"hi":""}">${l.direct?"Direct":"View"}</span></a>`).join("")}</div></div>`:""}
    ${done?"":quickCopy()}
    ${similar.length?`<div class="card"><h3>Similar jobs for you</h3><div class="list">${similar.map(s=>`<button class="cocard" data-open="${esc(s.id)}" style="width:100%">${logo(s)}<span><b>${esc(s.title)}</b><small>${esc(s.company)} · ${esc(s.city_norm||s.location||"")}</small></span></button>`).join("")}</div></div>`:""}
    <div style="display:flex;gap:8px;flex-wrap:wrap">${j.manual?`<button class="btn danger sm" data-delmanual="${esc(id)}">Delete this job</button>`:done?"":`<button class="btn ghost sm" data-hide="${esc(id)}">Not interested</button>`}</div>`,
  done?`<div class="applied-bar"><i class="tk">✓</i>Applied on ${fmtDate(t.appliedAt||stageDate(t,"applied"))}</div>${statusLink(j,"btn ghost")}`
  :`<button class="icon-btn" data-save="${esc(id)}" aria-pressed="${!!t?.saved}" aria-label="Save job" style="width:50px;height:auto">${ICON.bookmark}</button><a class="apply" href="${esc(safeUrl(j.url))}" target="_blank" rel="noopener" data-apply="${esc(id)}">${j.manual?"View job":j.direct?"View job on company site":"View job on "+esc(j.source)}</a>`);
  $("notes")?.addEventListener("change",ev=>{track(id).notes=ev.target.value;if(!U.jobs[id].snap)U.jobs[id].snap=j;saveUser();toast("Notes saved");});
}
function quickCopy(){
  const P=U.profile,items=[["Name",P.name],["Email",P.email],["Phone",P.phone],["LinkedIn",P.linkedin],["Resume link",P.resume],["Expected salary",P.expectedCtc],["Notice period",P.notice]].filter(x=>x[1]);
  return `<div class="card"><h3>Quick copy for the application form</h3>${items.length?`<div style="display:flex;flex-wrap:wrap;gap:6px">${items.map(([l,v])=>`<button class="btn ghost sm" data-copy="${esc(v)}">${l}</button>`).join("")}</div>`:`<p class="meta" style="margin:0">Fill your profile to copy details here in one tap. <button class="btn ghost sm" data-go="profile">Open profile</button></p>`}</div>`;
}

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if(d.copy!==undefined){copy(d.copy);return;}
  if(d.company!==undefined){closeSheet();resetFilters();F.forYou=false;F.company=d.company;filtersOpen=true;go("jobs");return;}
  // jobs added by hand in older versions can still be deleted
  if(d.delmanual){if(!await ask("Delete this job?","The job and your notes on it will be removed.","Delete",true))return;U.manual=U.manual.filter(j=>j.id!==d.delmanual);delete U.jobs[d.delmanual];saveUser();closeSheet();renderNav();render();toast("Job deleted");return;}
  if(d.hide){U.hidden[d.hide]=1;saveUser();closeSheet();render();toast("Hidden from your feed");return;}
});
