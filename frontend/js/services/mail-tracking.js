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
// Above the applications: "Connect Gmail" (live site), or which Gmail is connected and when it was read
const MAIL_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>';
function mailBar(){
  if(!SERVER)return "";
  if(!MAIL.connected)return MAIL.canConnect?`<section class="mail-connect" aria-labelledby="mcTitle">
      <span class="mc-ico">${MAIL_ICON}</span>
      <div class="mc-txt"><h3 id="mcTitle">Track every application automatically</h3>
        <p>Connect Gmail and your applications update by themselves from job-site emails: LinkedIn, Naukri, Indeed, Workday and more, even jobs you applied to outside this app.</p>
        <small>Read-only. Only emails from job sites are looked at. Nothing is sent, changed or kept.</small></div>
      <button type="button" class="btn" data-gmailconnect>Connect Gmail</button></section>`:"";
  return `<div class="mailbar ${MAIL.error?"bad":""}"><span class="mb-txt">${MAIL_ICON}${MAIL.error?`Couldn't read Gmail: ${esc(MAIL.error)}`
      :`Tracking from ${esc(MAIL.gmail||"Gmail")}${MAIL.lastRun?` · checked ${ago(new Date(MAIL.lastRun).toISOString())}`:""}`}</span>
    <span class="mb-acts">${MAIL.error&&MAIL.canConnect!==false&&MAIL.gmail!==undefined?`<button type="button" class="btn sm" data-gmailconnect>Connect again</button>`:""}
      <button type="button" class="btn ghost sm" data-mailsync>Check now</button>
      ${MAIL.gmail!==undefined?`<button type="button" class="linkbtn" data-gmailoff>Disconnect</button>`:""}</span></div>`;
}

// Back from Google: /my-jobs?gmail=connected | denied | noscope | error
(function gmailReturn(){
  const r=new URLSearchParams(location.search).get("gmail");if(!r)return;
  history.replaceState(history.state,"",location.pathname);
  const say={connected:["Gmail connected. Your applications will update by themselves.","ok"],
    denied:["Gmail was not connected."],noscope:["Tick the box that lets the app read your emails, then try again."],
    error:["Couldn't connect Gmail. Try again."]}[r]||["Couldn't connect Gmail. Try again."];
  setTimeout(()=>toast(...say),900);
})();

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if("mailsync" in d){
    t.disabled=true;t.textContent="Checking…";
    try{MAIL=await api("mail/sync",{});applyMail();toast("Statuses updated");}catch(err){toast(err.message);}
    renderNav();if(view==="mine")renderMine();return;
  }
  if("gmailconnect" in d){
    t.disabled=true;t.textContent="Opening Google…";
    try{location.href=(await api("gmail/start",{})).url;}catch(err){toast(err.message);t.disabled=false;t.textContent="Connect Gmail";}
    return;
  }
  if("gmailoff" in d){
    if(!await ask("Disconnect Gmail?","Applications already found stay in My jobs. New emails won't be read.","Disconnect",true))return;
    try{await api("gmail/disconnect",{});MAIL={connected:false,canConnect:true};toast("Gmail disconnected");}catch(err){toast(err.message);}
    if(view==="mine")renderMine();return;
  }
});
