/* Saved jobs page: jobs bookmarked and not applied to yet */
function renderSaved(){
  const jobs=tracked().filter(j=>j._t.saved&&!isApplied(j._t)).sort((a,b)=>(b._t.savedAt||0)-(a._t.savedAt||0));
  $("main").innerHTML=topbar("Saved jobs")+
  (jobs.length?`<div class="resbar"><span><b style="color:var(--ink)">${jobs.length}</b> saved job${jobs.length===1?"":"s"}</span></div>
    <div class="list">${jobs.map(j=>jobCard(j,{showStage:false,noNew:true})).join("")}</div>`
  :`<div class="empty"><h3>No saved jobs yet</h3>Tap the bookmark on any job to keep it here.<br><button class="btn ghost sm" data-go="jobs">Find jobs</button></div>`);
}
