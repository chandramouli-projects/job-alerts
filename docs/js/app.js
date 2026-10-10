/* Start: load jobs, check the server, then open login, onboarding or the app. Loaded last. */
async function boot(){
  try{ data = PREVIEW ? window.__JOBS__ : await (await fetch("jobs.json?t="+Date.now())).json(); }catch(e){ data={jobs:[]}; }
  data.jobs.forEach(cleanJob);
  // Only worker/server.mjs answers {"ok":true}; some hosts (Cloudflare Pages) answer any unknown link with the home page
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
boot();
