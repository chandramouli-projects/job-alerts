/* All jobs, live search, and saved / applied jobs */
function allJobs(){return [...U.manual,...data.jobs];}
/* Live search: fresh jobs for any role, from the Worker set in backend/collector/config.json "live_search_url" */
function searchParts(s){
  const m=s.trim().match(/^(.*?)\s+(?:jobs?\s+)?in\s+([a-z .]+)$/i);
  return {what:(m?m[1]:s).replace(/\bjobs?\b/ig," ").replace(/\s+/g," ").trim(),where:m?m[2].trim():""};
}
async function liveSearch(what,where=""){
  const api=(data.live_api||"").replace(/\/$/,""),key=(what+"|"+where).toLowerCase();
  if(!api||PREVIEW||what.length<2||liveDone.has(key))return;
  liveDone.add(key);liveBusy++;if(view==="jobs")renderJobs();
  try{
    const r=await (await fetch(`${api}/search?q=${encodeURIComponent(what)}&where=${encodeURIComponent(where)}`)).json();
    // Both job search limits used up: say so once; the saved jobs still show
    if(r.limit){if(!liveLimitSaid){liveLimitSaid=true;toast(r.error);}liveDone.delete(key);}
    // Jobs the Worker found by a related title remember this search, so they show for it too
    const byId=new Map(data.jobs.map(j=>[j.id,j])),tag=normQuery(what);
    for(const j of r.jobs||[]){
      const have=byId.get(j.id)||j;
      if(j.related)have.searches=[...new Set([...(have.searches||[]),tag])];
      if(have===j&&cleanJob(j).url){byId.set(j.id,j);data.jobs.push(j);}
    }
  }catch(e){liveDone.delete(key);}
  liveBusy--;
  if(view==="jobs"&&document.activeElement?.id!=="q")renderJobs();
}
function liveForMe(){
  const p=U.prefs,cities=p.cities.filter(c=>c!=="Remote"&&c!=="Anywhere in India");
  const roles=[...p.roles.map(r=>r.replace(" / "," ")),...splitList(p.custom)].slice(0,4);
  roles.forEach(r=>{if(cities.length||!p.cities.includes("Remote"))liveSearch(r,cities.length===1?cities[0]:"");if(p.cities.includes("Remote"))liveSearch(r,"Remote");});
}
// The Role / City / Remote filters also fetch fresh jobs for what was picked
function liveForFilters(){
  if(!F.role&&!F.city&&!F.remote)return;
  const p=U.prefs,roles=F.role?[F.role.replace(" / "," ")]:[...p.roles.map(r=>r.replace(" / "," ")),...splitList(p.custom)].slice(0,2);
  const where=F.remote||F.city==="Remote"?"Remote":F.city&&F.city!=="India"?F.city:"";
  roles.forEach(r=>liveSearch(r,where));
}
function findJob(id){return allJobs().find(j=>j.id===id);}
function track(id){return U.jobs[id]||(U.jobs[id]={stage:null,saved:false,notes:"",history:[]});}
function setStage(id,stage){
  const t=track(id);if(t.stage===stage)return;
  t.stage=stage;t.history.push({stage,at:Date.now()});if(stage==="applied"&&!t.appliedAt)t.appliedAt=Date.now();
  if(!t.snap){const j=findJob(id);if(j)t.snap=j;}  // keep job details even after it leaves the feed
  saveUser();
}
function toggleSave(id){const t=track(id);t.saved=!t.saved;if(t.saved)t.savedAt=Date.now();if(t.saved&&!t.snap)t.snap=findJob(id);saveUser();return t.saved;}
function tracked(){return Object.entries(U.jobs).map(([id,t])=>({...cleanJob({...(findJob(id)||t.snap||{id,title:"Job no longer listed",company:""})}),id,_t:t})).filter(j=>j.title);}
/* an applied job never shows again, even when another site lists the same job under a new id */
const jobKey=j=>(fixText(j.title||"")+"|"+fixText(j.company||"")).toLowerCase().replace(/[^a-z0-9|]+/g,"");
function appliedKeys(){return new Set(Object.entries(U.jobs).filter(([,t])=>isApplied(t)).map(([id,t])=>jobKey(findJob(id)||t.snap||{})));}
const wasApplied=(j,keys)=>isApplied(U.jobs[j.id])||keys.has(jobKey(j));
