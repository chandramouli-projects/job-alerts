/* Notification bell (top bar, next to your name) and its panel: newest first, grouped Today / Earlier,
   unread dot, "Mark all as read", and settings for what to be told about. On phones the panel opens
   from the bottom. The notes themselves come from services/notifications.js. */
const NOTE_ICON={
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  status:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5h6v2M9 13.5l2 2 4-4"/></svg>',
  jobs:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4z"/><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  remind:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 2M9 3h6"/></svg>',
  tip:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>'};
let notePanelMode="list",noteTab="all";

/* ---------------------------------------------------------------- the bell */
function noteBellHtml(){
  const n=unreadNotes(),open=!$("notePanel").hidden;
  return `<button type="button" class="icon-btn np-bell" id="noteBell" aria-haspopup="dialog" aria-expanded="${open}" aria-controls="notePanel"
    aria-label="Notifications${n?`, ${n} unread`:""}" data-tip="Notifications">${NOTE_ICON.bell}${n?`<span class="np-badge" aria-hidden="true">${n>9?"9+":n}</span>`:""}</button>`;
}
function renderNoteBell(){
  const r=$("headR");if(!r||!U)return;
  const old=$("noteBell");
  if(old)old.outerHTML=noteBellHtml();
  else{const who=r.querySelector(".who")||r.querySelector(".avatar");who?who.insertAdjacentHTML("beforebegin",noteBellHtml()):r.insertAdjacentHTML("afterbegin",noteBellHtml());}
}
const _renderHeadN=renderHead;
renderHead=function(){_renderHeadN();if(U)renderNoteBell();};

/* ---------------------------------------------------------------- the panel */
const notePanel=Object.assign(document.createElement("section"),{id:"notePanel",className:"np",hidden:true});
notePanel.setAttribute("role","dialog");notePanel.setAttribute("aria-label","Notifications");
const noteScrim=Object.assign(document.createElement("div"),{className:"np-scrim",hidden:true});
document.body.append(noteScrim,notePanel);

function noteItem(x){
  const kind=x.kind==="status"?`status st-${x.stage||""}`:x.kind;
  return `<button type="button" class="np-item ${x.read?"":"unread"}" data-note="${esc(x.id)}">
    <span class="np-ico k-${esc(kind)}">${NOTE_ICON[x.kind]||NOTE_ICON.bell}</span>
    <span class="np-txt"><b>${esc(x.title)}</b><span>${esc(x.body)}</span><small>${esc(ago(new Date(x.at).toISOString()))}</small></span>
    ${x.read?"":'<i class="np-dot" aria-label="Unread"></i>'}</button>`;
}
function noteListHtml(){
  const n=notesState(),items=noteTab==="unread"?n.items.filter(x=>!x.read):n.items,unread=unreadNotes();
  const today=new Date().setHours(0,0,0,0),groups=[["Today",items.filter(x=>x.at>=today)],["Earlier",items.filter(x=>x.at<today)]].filter(g=>g[1].length);
  return `<div class="np-head"><h2>Notifications</h2><div class="np-acts">
      <button type="button" class="linkbtn" data-npreadall ${unread?"":"disabled"}>Mark all as read</button>
      <button type="button" class="icon-btn" data-npsettings aria-label="Notification settings" data-tip="Settings">${NOTE_ICON.gear}</button></div></div>
    <div class="np-tabs" role="tablist"><button type="button" role="tab" data-nptab="all" aria-selected="${noteTab==="all"}">All</button>
      <button type="button" role="tab" data-nptab="unread" aria-selected="${noteTab==="unread"}">Unread${unread?` <span>${unread}</span>`:""}</button></div>
    <div class="np-list">${groups.length?groups.map(([g,l])=>`<div class="np-group">${g}</div>${l.map(noteItem).join("")}`).join("")
      :`<div class="np-empty"><span class="np-ico k-jobs">${NOTE_ICON.bell}</span><b>${noteTab==="unread"?"You're all caught up":"No notifications yet"}</b>
        <span>New jobs for you, saved-search matches and application updates will show here.</span></div>`}</div>`;
}
function deviceRow(){
  const s=notesState().settings;
  if(!("Notification" in window))return `<div class="np-set"><div><b>Phone / computer alerts</b><small>This browser can't show alerts.</small></div></div>`;
  const p=Notification.permission;
  if(p==="denied")return `<div class="np-set"><div><b>Phone / computer alerts</b><small>Blocked for this site. Allow notifications in your browser's site settings, then come back.</small></div></div>`;
  return `<div class="np-set"><div><b>Phone / computer alerts</b><small>A system alert while the app is open or running in the background.</small></div>
    ${p==="granted"?`<label class="toggle"><input type="checkbox" id="npDevice" ${s.device?"checked":""}><span></span></label>`:`<button type="button" class="btn sm" data-npdevice>Turn on</button>`}</div>`;
}
function noteSettingsHtml(){
  const s=notesState().settings;
  return `<div class="np-head"><button type="button" class="icon-btn" data-npback aria-label="Back to notifications">${NOTE_ICON.back}</button><h2>Notify me about</h2><span></span></div>
    <div class="np-list np-sets">${NOTE_KINDS.map(([k,l,d])=>`<div class="np-set"><div><b>${l}</b><small>${d}</small></div>
      <label class="toggle"><input type="checkbox" data-npkind="${k}" ${s[k]!==false?"checked":""} aria-label="${l}"><span></span></label></div>`).join("")}
      ${deviceRow()}</div>`;
}
function renderNotePanel(){notePanel.innerHTML=notePanelMode==="settings"?noteSettingsHtml():noteListHtml();}
function openNotePanel(){
  notePanelMode="list";renderNotePanel();notePanel.hidden=false;noteScrim.hidden=false;
  const b=$("noteBell")?.getBoundingClientRect();
  if(b&&innerWidth>560){notePanel.style.top=Math.round(b.bottom+10)+"px";notePanel.style.right=Math.max(12,Math.round(innerWidth-b.right-8))+"px";}
  else{notePanel.style.top="";notePanel.style.right="";}
  renderNoteBell();notePanel.querySelector(".np-item,button")?.focus();
}
function closeNotePanel(){if(notePanel.hidden)return;notePanel.hidden=true;noteScrim.hidden=true;renderNoteBell();$("noteBell")?.focus();}

/* ---------------------------------------------------------------- opening a note */
function openNote(id){
  const x=notesState().items.find(n=>n.id===id);if(!x)return;
  x.read=true;saveUser();closeNotePanel();renderNoteBell();
  const to=x.to||{};
  if(to.job){if(findJob(to.job)||U.jobs[to.job]?.snap)openJob(to.job);else go("mine");return;}
  if(to.search){
    const s=(U.searches||[]).find(v=>v.id===to.search);
    if(s){F={...FILTERS_OFF,...s.f,forYou:false,days:21};s.seenAt=Date.now();saveUser();go("jobs");if(s.f.q){const p=searchParts(s.f.q);liveSearch(p.what,p.where);}return;}
  }
  if(to.newest){resetFilters();F.sort="new";go("jobs");return;}
  go(to.view||"jobs");
}

document.addEventListener("click",async e=>{
  if(!U)return;
  const t=e.target.closest("#noteBell,[data-note],[data-npreadall],[data-npsettings],[data-npback],[data-nptab],[data-npdevice]");
  if(!t){if(!notePanel.hidden&&!e.target.closest("#notePanel"))closeNotePanel();return;}
  const d=t.dataset;
  if(t.id==="noteBell"){notePanel.hidden?openNotePanel():closeNotePanel();return;}
  if(d.note){openNote(d.note);return;}
  if("npreadall" in d){notesState().items.forEach(x=>x.read=true);saveUser();renderNotePanel();renderNoteBell();return;}
  if("npsettings" in d){notePanelMode="settings";renderNotePanel();return;}
  if("npback" in d){notePanelMode="list";renderNotePanel();return;}
  if(d.nptab){noteTab=d.nptab;renderNotePanel();return;}
  if("npdevice" in d){
    const p=await askDeviceAlerts();renderNotePanel();
    p==="granted"?toast("Alerts are on for this device","ok"):toast("Alerts were not allowed. You can allow them in your browser's site settings.");
    if(p==="granted")navigator.serviceWorker?.getRegistration().then(r=>r?.showNotification("Alerts are on",{body:"You'll get new jobs and application updates here.",icon:"assets/icon-512.png",tag:"alerts-on"}));
  }
});
notePanel.addEventListener("change",e=>{
  const k=e.target.dataset.npkind;
  if(k){notesState().settings[k]=e.target.checked;saveUser();return;}
  if(e.target.id==="npDevice"){notesState().settings.device=e.target.checked;saveUser();}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!notePanel.hidden){e.stopPropagation();closeNotePanel();}},true);
