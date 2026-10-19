/* Notifications: what the app tells you about, made from data the app already has (no extra API calls).
   Kinds, most important first:
     status   an application moved forward (from job-site emails: viewed, shortlisted, interview, offer, not selected)
     jobs     new jobs that fit you since the last check (one note per jobs update, with the best match)
     search   a saved search has new jobs
     remind   a job you saved 2+ days ago and haven't applied to yet
     tip      a one-time tip (add your resume)
   Kept in U.notifications (saved with the profile, so "read" is the same on every device):
     {items:[{id,kind,title,body,at,read,to}], jobsAt, statusAt, settings:{status,jobs,search,remind,device}}
   While the app is open it checks jobs.json every 10 minutes and when the tab comes back into view.
   Device alerts (system notifications) show while the app is open or running in the background. */
const NOTE_KINDS=[["status","Application updates","When a company views, shortlists or interviews you"],
  ["jobs","New jobs for you","When new jobs match your role, experience and city"],
  ["search","Saved searches","When a saved search has new jobs"],
  ["remind","Reminders","Saved jobs you haven't applied to yet"]];
const NOTE_MAX=60, NOTE_DAYS=30, NOTE_POLL=10*60e3, DAY=864e5;
const STATUS_NOTE={viewed:["Your application was viewed","{c} viewed your application for {t}."],
  shortlisted:["You're shortlisted","{c} shortlisted you for {t}."],
  interview:["Interview stage","{c} wants to interview you for {t}. Tips are on the job page."],
  offer:["You got an offer","{c} made you an offer for {t}."],
  rejected:["Not selected this time","{c} moved ahead with other people for {t}."]};
let notePoll=null;
// ids of jobs from jobs.json (the bot's list); jobs that live search adds are not "new jobs"
let noteBase=new Set();

function notesState(){
  const n=U.notifications||(U.notifications={});
  n.items||=[];
  n.settings={status:true,jobs:true,search:true,remind:true,device:false,...n.settings};
  // first time: count from the previous visit, so a new person isn't flooded
  n.jobsAt??=U.lastSeen||Date.now();
  n.statusAt??=Date.now()-7*DAY;
  return n;
}
const unreadNotes=()=>notesState().items.filter(x=>!x.read).length;

// Add notes that are not there yet; returns the ones that are new
function addNotes(list){
  const n=notesState(),have=new Set(n.items.map(x=>x.id)),fresh=list.filter(x=>x&&!have.has(x.id)&&n.settings[x.kind]!==false);
  if(!fresh.length)return [];
  const cut=Date.now()-NOTE_DAYS*DAY;
  n.items=[...fresh.map(x=>({read:false,at:Date.now(),...x})),...n.items].filter(x=>x.at>cut).sort((a,b)=>b.at-a.at).slice(0,NOTE_MAX);
  return fresh;
}

/* ---------------------------------------------------------------- making notes from the data */
function statusNotes(n){
  const out=[];
  for(const [id,t] of Object.entries(U.jobs||{})){
    const j=findJob(id)||t.snap||{};
    for(const h of t.history||[]){
      if(!STATUS_NOTE[h.stage]||!(h.at>n.statusAt))continue;
      const [title,body]=STATUS_NOTE[h.stage];
      out.push({id:`status-${id}-${h.stage}`,kind:"status",stage:h.stage,title,at:h.at,to:{job:id},
        body:body.replace("{c}",j.company||"The company").replace("{t}",j.title||"this job")});
    }
  }
  return out;
}
function jobNotes(n){
  const applied=appliedKeys(),since=n.jobsAt;
  const fit=(data.jobs||[]).filter(j=>noteBase.has(j.id)&&new Date(j.found)>since&&!U.hidden[j.id]&&!wasApplied(j,applied))
    .map(j=>({j,e:evaluate(j,U.prefs)})).filter(x=>x.e.ok).sort((a,b)=>b.e.score-a.e.score);
  if(!fit.length)return [];
  const best=fit[0].j,count=fit.length;
  return [{id:`jobs-${data.updated||since}`,kind:"jobs",title:`${count} new job${count===1?"":"s"} for you`,
    body:`Best match: ${best.title} at ${best.company}${count>1?` and ${count-1} more`:""}.`,to:{view:"jobs",newest:true}}];
}
function searchNotes(n){
  if(typeof newForSearch!=="function")return [];
  return (U.searches||[]).map(s=>{
    const c=newForSearch({...s,seenAt:Math.max(s.seenAt||0,n.jobsAt)});
    return c?{id:`search-${s.id}-${data.updated||n.jobsAt}`,kind:"search",title:`${c} new job${c===1?"":"s"} in a saved search`,
      body:searchLabel(s.f),to:{search:s.id}}:null;
  });
}
function remindNotes(){
  const out=[];
  for(const [id,t] of Object.entries(U.jobs||{})){
    if(!t.saved||isApplied(t)||!t.savedAt||Date.now()-t.savedAt<2*DAY)continue;
    const j=findJob(id);
    if(!j)continue;   // no longer listed: nothing to apply to
    out.push({id:`remind-${id}`,kind:"remind",title:"Apply before it closes",body:`You saved ${j.title} at ${j.company} ${Math.round((Date.now()-t.savedAt)/DAY)} days ago.`,to:{job:id}});
  }
  return out.slice(0,3);
}
function tipNotes(){
  if(U.profile.resumeFile||!U.onboarded||Date.now()-(U.createdAt||Date.now())<DAY)return [];
  return [{id:"tip-resume",kind:"tip",title:"Add your resume",body:"We'll pick your skills from it, so “Jobs for me” fits you better.",to:{view:"profile"}}];
}

// Look at everything and add what's new; quiet = don't pop alerts (the first look when the app opens)
function refreshNotes({quiet=false}={}){
  if(!U||!data)return [];
  const n=notesState();
  const fresh=addNotes([...statusNotes(n),...jobNotes(n),...searchNotes(n),...remindNotes(),...tipNotes()]);
  n.jobsAt=Math.max(n.jobsAt,...(data.jobs||[]).filter(j=>noteBase.has(j.id)).map(j=>+new Date(j.found)||0));
  n.statusAt=Math.max(n.statusAt,...Object.values(U.jobs||{}).flatMap(t=>(t.history||[]).map(h=>h.at||0)));
  if(fresh.length){saveUser();renderNoteBell();if(!quiet)announceNotes(fresh);}
  return fresh;
}

/* ---------------------------------------------------------------- new jobs while the app is open */
async function checkForNewJobs(){
  if(!U||PREVIEW)return;
  let next;
  try{next=await (await fetch("data/jobs.json?t="+Date.now(),{cache:"no-store"})).json();}catch(e){return;}
  if(!next?.updated||next.updated===data.updated)return;
  const have=new Map(data.jobs.map(j=>[j.id,j]));
  for(const j of (next.jobs||[]).map(cleanJob).filter(j=>j&&j.url))if(!have.has(j.id))data.jobs.push(j);
  for(const j of next.jobs||[])noteBase.add(j.id);
  data.updated=next.updated;
  refreshNotes();
  if(view==="jobs"&&document.activeElement?.id!=="q")renderJobs();
}
function startNotes(){
  if(!noteBase.size)noteBase=new Set(data.jobs.map(j=>j.id));   // before live search adds its jobs
  refreshNotes({quiet:true});
  clearInterval(notePoll);notePoll=setInterval(checkForNewJobs,NOTE_POLL);
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&U&&!$("shell").hidden)checkForNewJobs();});

/* ---------------------------------------------------------------- telling you */
function announceNotes(fresh){
  const top=fresh[0];
  toast(fresh.length>1?`${fresh.length} new notifications`:top.title,"ok");
  if(!notesState().settings.device||!("Notification" in window)||Notification.permission!=="granted")return;
  const opts=x=>({body:x.body,tag:x.id,icon:"assets/icon-512.png",badge:"assets/logo.png",data:{id:x.id}});
  for(const x of fresh.slice(0,3)){
    navigator.serviceWorker?.getRegistration().then(r=>r?r.showNotification(x.title,opts(x)):new Notification(x.title,opts(x))).catch(()=>{});
  }
}
async function askDeviceAlerts(){
  if(!("Notification" in window))return "unsupported";
  const p=Notification.permission==="default"?await Notification.requestPermission():Notification.permission;
  notesState().settings.device=p==="granted";saveUser();
  return p;
}
// a system notification that was clicked: open its note (sw.js sends {note:id})
navigator.serviceWorker?.addEventListener("message",e=>{if(e.data?.note&&U)openNote(e.data.note);});

/* ---------------------------------------------------------------- hooks into the app */
const _openShellN=openShell;
openShell=function(){_openShellN();startNotes();};
const _loadMailN=loadMail;
loadMail=async function(){await _loadMailN();refreshNotes();};
const _logoutN=logout;
logout=function(){clearInterval(notePoll);notePoll=null;closeNotePanel?.();_logoutN();};
