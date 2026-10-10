/* My jobs page: Saved and Applied tabs */
function renderMine(){
  const all=tracked();if(trackStage!=="saved")trackStage="applied";
  const groups={saved:all.filter(j=>j._t.saved&&!isApplied(j._t)),applied:all.filter(j=>isApplied(j._t))};
  const jobs=groups[trackStage].sort((a,b)=>(b._t.history.at(-1)?.at||b._t.savedAt||0)-(a._t.history.at(-1)?.at||a._t.savedAt||0));
  const due=groups.applied.filter(j=>j._t.appliedAt&&Date.now()-j._t.appliedAt>7*864e5).length;
  const empty={saved:"Tap the bookmark on any job to keep it here.",applied:"Jobs you apply to show up here."};
  $("main").innerHTML=topbar("My jobs",`<button class="btn ghost sm" data-addjob>+ Add a job</button>`)+`
  <div class="pipe two">${[["saved","Saved","var(--muted)"],["applied","Applied","var(--applied)"]].map(([k,l,c])=>`<button data-stage-tab="${k}" aria-pressed="${trackStage===k}" style="--c:${c}"><b>${groups[k].length}</b><small>${l}</small></button>`).join("")}</div>
  ${due&&trackStage==="applied"?`<div class="card" style="background:var(--accent-soft);border-color:transparent"><b>${due} application${due>1?"s":""} waiting over a week.</b> Use Follow up to message the recruiter.</div>`:""}
  ${jobs.length?`<div class="list">${jobs.map(j=>trackStage==="saved"?jobCard(j,{showStage:false,noNew:true}):appCard(j)).join("")}</div>`:`<div class="empty"><h3>Nothing here yet</h3>${empty[trackStage]}<br><button class="btn ghost sm" data-go="jobs">Find jobs</button></div>`}`;
}

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if(d.stageTab){trackStage=d.stageTab;renderMine();return;}
});
