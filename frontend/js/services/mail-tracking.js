/* Application statuses from Gmail (backend/server/mail-sync.mjs reads job-site emails every 15 minutes).
   The server keeps them apart from the profile; here they are merged into the person's applications. */
let MAIL={connected:false},mailTimer=null;
const STAGE_RANK={applied:1,viewed:2,shortlisted:3,interview:4,offer:5,rejected:6};
const laterStage=(now,next)=>!STAGE_RANK[now]||(next==="rejected"?now!=="offer"&&now!=="rejected":STAGE_RANK[next]>STAGE_RANK[now]);
function applyMail(){
  for(const [id,o] of Object.entries(MAIL.jobs||{})){
    const t=track(id);
    if(o.snap&&!t.snap)t.snap=o.snap;
    for(const h of o.history||[])if(!t.history.some(x=>x.stage===h.stage&&x.at===h.at))t.history.push(h);
    t.history.sort((a,b)=>a.at-b.at);
    if(o.stage&&laterStage(t.stage,o.stage))t.stage=o.stage;
    if(!t.appliedAt)t.appliedAt=t.history.find(h=>h.stage==="applied")?.at||t.history[0]?.at||null;
  }
}
async function loadMail(){
  if(!SERVER||!U)return;
  try{MAIL=await api("mail");}catch(e){return;}
  applyMail();renderNav();if(view==="mine")renderMine();
  if(!mailTimer)mailTimer=setInterval(loadMail,5*60e3);
}
// the line above the applications: is Gmail connected, when was it last read
function mailBar(){
  if(!SERVER)return "";
  if(!MAIL.connected)return "";
  return `<div class="mailbar ${MAIL.error?"bad":""}"><span>${MAIL.error?`Couldn't read Gmail: ${esc(MAIL.error)}`:`Synced from Gmail${MAIL.lastRun?` · ${ago(new Date(MAIL.lastRun).toISOString())}`:""}`}</span>
    <button type="button" class="btn ghost sm" data-mailsync>Check now</button></div>`;
}

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if("mailsync" in d){
    t.disabled=true;t.textContent="Checking…";
    try{MAIL=await api("mail/sync",{});applyMail();toast("Statuses updated");}catch(err){toast(err.message);}
    renderNav();if(view==="mine")renderMine();return;
  }
});
