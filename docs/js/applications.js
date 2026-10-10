/* Application tracking: status steps, application cards, "Did you apply?" after Apply */
const FLOW=["applied","interview"];
const isApplied=t=>!!t&&["applied","interview","offer","rejected"].includes(t.stage);
const statusNote=t=>({applied:"Waiting for the recruiter to update",interview:"The recruiter moved you to interview",offer:"You got an offer",rejected:"The recruiter closed this application"})[t.stage];
const stageName=k=>STAGES.find(s=>s[0]===k)[1];
const fmtShort=t=>t?new Date(t).toLocaleDateString(undefined,{day:"numeric",month:"short"}):"";
const fmtWhen=t=>new Date(t).toLocaleString(undefined,{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"});
function stageDate(t,k){const h=[...(t.history||[])].reverse().find(x=>x.stage===k);return h?.at||(k==="applied"?t.appliedAt:k==="saved"?t.savedAt:null);}
function stepper(t){
  const st=t.stage;
  const cur=Math.max(0,FLOW.indexOf(st));
  return `<ol class="stepper">${FLOW.map((k,i)=>`<li class="${i<=cur?"done":""} ${i===cur?"cur":""}"><i></i><b>${stageName(k)}</b><small>${i<=cur?fmtShort(stageDate(t,k)):""}</small></li>`).join("")}</ol>`;
}
function appCard(j){
  const t=j._t,st=STAGES.find(s=>s[0]===t.stage),ap=t.appliedAt||stageDate(t,"applied");
  const follow=t.stage==="applied"&&ap&&Date.now()-ap>7*864e5;
  return `<article class="app" data-open="${esc(j.id)}" data-app="${esc(j.id)}" tabindex="0">
    <div class="app-top">${logo(j)}<div class="app-main"><h3>${esc(j.title)}</h3><div class="meta">${esc(j.company)} · ${esc(j.city_norm||j.location||"India")}</div></div>
      <span class="status-pill" style="color:${st[2]}">${st[1]}</span></div>
    ${stepper(t)}
    <div class="app-foot">${ap?`<span>Applied ${fmtDate(ap)} · ${ago(new Date(ap).toISOString())}</span>`:""}${follow?`<span class="due">Follow-up due</span>`:`<span>${statusNote(t)}</span>`}
      <span class="app-acts"><button class="btn ghost sm" data-followup="${esc(j.id)}">Follow up</button><button class="btn ghost sm" data-open="${esc(j.id)}">Notes</button><button class="btn sm" data-open="${esc(j.id)}">Details</button></span></div>
  </article>`;
}
function flashApp(id){requestAnimationFrame(()=>{const el=document.querySelector(`[data-app="${CSS.escape(id)}"]`);if(!el)return;el.scrollIntoView({block:"center",behavior:"smooth"});el.classList.add("flash");setTimeout(()=>el.classList.remove("flash"),2200);});}

/* after Apply opens the job site, ask when the person comes back to this tab */
let pendingApply=null,apId=null;
function noteApply(id){if(["applied","interview","offer"].includes(U.jobs[id]?.stage))return;pendingApply={id,at:Date.now()};LS.set("uv.pendingApply",pendingApply);}
function clearApply(){pendingApply=null;LS.del("uv.pendingApply");}
function checkApply(){
  const p=pendingApply||LS.get("uv.pendingApply",null);
  if(!p||!U||$("shell").hidden||document.visibilityState!=="visible"||!$("applyModal").hidden)return;
  if(Date.now()-p.at<1500)return;
  clearApply();if(Date.now()-p.at<6*36e5)openApplyCheck(p.id);
}
document.addEventListener("visibilitychange",()=>setTimeout(checkApply,300));
window.addEventListener("focus",()=>setTimeout(checkApply,300));
function openApplyCheck(id){
  const j=findJob(id)||U.jobs[id]?.snap;if(!j)return;apId=id;
  $("apJob").innerHTML=`${logo(j)}<div><b>${esc(j.title)}</b><small>${esc(j.company)}</small></div>`;
  $("apAsk").hidden=false;$("apDone").hidden=true;$("applyModal").hidden=false;setTimeout(()=>$("apYes").focus(),30);
}
function closeApply(){$("applyModal").hidden=true;}
function markApplied(){
  setStage(apId,"applied");const t=U.jobs[apId],j=findJob(apId)||t.snap;renderNav();render();
  if($("sheet").classList.contains("open"))openJob(apId);
  $("apDoneTxt").textContent=`${j.title} · ${j.company}`;$("apStep").innerHTML=stepper(t);
  $("apAsk").hidden=true;$("apDone").hidden=false;setTimeout(()=>$("apView").focus(),30);
}
$("apYes").onclick=markApplied;
$("apNo").onclick=$("apX").onclick=$("apBrowse").onclick=closeApply;
$("applyModal").onclick=e=>{if(e.target===$("applyModal"))closeApply();};
$("apView").onclick=()=>{closeApply();closeSheet();trackStage="applied";go("mine");flashApp(apId);};

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if(d.followup){const t=U.jobs[d.followup],j=findJob(d.followup)||t.snap,P=U.profile;
    copy(`Hello,\n\nI applied for the ${fixText(j.title)} role at ${fixText(j.company)} on ${fmtDate(t.appliedAt)}. I am still very interested in this position and would be glad to share anything else you need.\n\nThank you for your time.\n${P.name}${P.phone?"\n"+P.phone:""}\n${P.email}`,"Follow-up message copied. Send it to the recruiter.");return;}
  if(d.markapplied){apId=d.markapplied;markApplied();$("applyModal").hidden=false;return;}
});
