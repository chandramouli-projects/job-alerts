/* Owner only: send preferences to backend/collector/config.json on GitHub (Telegram alerts) */
async function syncPrefs(silent){
  const S=U.settings,msg=$("syncMsg");
  if(PREVIEW||!S.ghToken){ if(!silent&&msg) msg.textContent=PREVIEW?"Saved here. Connects to the job search on your live site.":"Saved. Connect the search to apply this to Telegram alerts."; return; }
  if(msg) msg.textContent="Updating your job search…";
  const api=`https://api.github.com/repos/${S.ghRepo}/contents/backend/collector/config.json`,H={Authorization:"Bearer "+S.ghToken,Accept:"application/vnd.github+json"};
  try{
    const cur=await (await fetch(api,{headers:H})).json(); if(!cur.content) throw new Error(cur.message||"no access");
    const cfg=JSON.parse(decodeURIComponent(escape(atob(cur.content.replace(/\n/g,"")))));
    const p=U.prefs,roles=[...p.roles,...splitList(p.custom)];
    cfg.alerts=Object.assign(cfg.alerts||{},{experience_years:p.exp,roles,skills:mySkills(p),
      locations:p.cities.filter(c=>c!=="Remote"&&c!=="Anywhere in India"),include_remote:p.cities.includes("Remote")||p.cities.includes("Anywhere in India"),
      telegram_enabled:S.telegram,min_match:S.minMatch});
    const body=JSON.stringify(cfg,null,2);
    const r=await fetch(api,{method:"PUT",headers:H,body:JSON.stringify({message:"Update preferences from app",content:btoa(unescape(encodeURIComponent(body))),sha:cur.sha})});
    if(!r.ok) throw new Error((await r.json()).message);
    if(msg) msg.textContent="Job search updated. Takes effect from the next search.";
    if(!silent) toast("Job search updated");
  }catch(e){ if(msg) msg.textContent="Couldn't update the job search: "+e.message+". Check the connection key."; }
}
function openGh(){
  openSheet("Connect job search",`<div class="card"><h3>Make a key</h3><ol class="why" style="color:var(--ink)"><li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → New fine-grained token</a></li><li>Repository access: only <b>job-alerts</b></li><li>Permissions: <b>Contents → Read and write</b> (nothing else)</li><li>Expiration: 1 year. Generate and copy the key.</li></ol></div>
    <label class="lbl" for="ghTok">Paste the key</label><input class="inp" id="ghTok" placeholder="github_pat_…" value="${esc(U.settings.ghToken)}">
    <div style="margin-top:12px"><label class="lbl" for="ghRepo">Repository</label><input class="inp" id="ghRepo" value="${esc(U.settings.ghRepo)}"></div>`,
    `<button class="btn" data-ghsave style="flex:1">Connect</button>`);
}

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if("gh" in d){openGh();return;}
  if("ghsave" in d){U.settings.ghToken=$("ghTok").value.trim();U.settings.ghRepo=$("ghRepo").value.trim()||"chandramouli-projects/job-alerts";saveUser();closeSheet();renderProfile();syncPrefs();return;}
});
