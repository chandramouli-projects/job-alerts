/* Start: load jobs, check the server, then open login, onboarding or the app. Loaded last. */
async function boot(){
  try{ data = PREVIEW ? window.__JOBS__ : await (await fetch("data/jobs.json?t="+Date.now())).json(); }catch(e){ data={jobs:[]}; }
  if(!data||typeof data!=="object")data={};
  data.jobs=(Array.isArray(data.jobs)?data.jobs:[]).map(cleanJob).filter(j=>j&&j.url);   // a broken jobs file still opens the app
  // Only backend/server/server.mjs answers {"ok":true}; some hosts (Cloudflare Pages) answer any unknown link with the home page
  if(!PREVIEW){try{SERVER=(await (await fetch("api/ping")).json()).ok===true;}catch(e){}}
  if(SERVER){
    if(session&&LS.get("uv.token","")){
      try{const d=await api("user");U=withDefaults(d.user,d.name,session.email);applyTheme();return U.onboarded?openShell():startOnboarding();}
      catch(e){LS.del("uv.token");}
    }
    return showAuth("login");
  }
  if(session && accounts[session.email]){ U=LS.get("uv.user."+session.email,null); if(U){ applyTheme(); return U.onboarded?openShell():startOnboarding(); } }
  showAuth("login");
}
// Loading screen: stays at least 0.9 s from page start so it doesn't just flash, then fades out
function hideBoot(){
  const b=$("boot");if(!b)return;
  setTimeout(()=>{b.classList.add("done");setTimeout(()=>b.remove(),350);},Math.max(0,900-performance.now()));
}
boot().finally(hideBoot);
