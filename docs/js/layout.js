/* App frame after login: menu, switching screens, page title */
const NAV=[["jobs","Jobs",ICON.jobs],["saved","Saved jobs",ICON.saved],["mine","My jobs",ICON.applied],["profile","Profile",ICON.me]];
function markVisit(){if(!U.thisVisit||Date.now()-U.thisVisit>30*60e3){U.lastSeen=U.thisVisit||0;U.thisVisit=Date.now();saveUser();}prevSeen=U.lastSeen||0;}
function openShell(){markVisit();renderHead();$("auth").hidden=true;$("ob").hidden=true;$("shell").hidden=false;go(view);liveForMe();setTimeout(checkApply,600);}
function go(v){view=v;shown=PAGE;renderNav();render();renderRail();window.scrollTo(0,0);}
// counts on the menu: saved (not applied yet) and applied
function navCounts(){const t=Object.values(U.jobs);return {saved:t.filter(x=>x.saved&&!isApplied(x)).length,mine:t.filter(isApplied).length};}
function renderNav(){
  renderHead();
  const n=navCounts();
  $("side").innerHTML=NAV.map(([k,l,i])=>`<button class="nav" data-go="${k}" aria-current="${view===k?"page":"false"}">${i}${l}${n[k]?`<span class="n">${n[k]}</span>`:""}</button>`).join("");
  $("bottom").innerHTML=NAV.map(([k,l,i])=>`<button data-go="${k}" aria-current="${view===k?"page":"false"}">${i}${l}</button>`).join("");
}
function render(){({jobs:renderJobs,saved:renderSaved,mine:renderMine,profile:renderProfile})[view]();}
function topbar(title,extra=""){return `<div class="topbar"><h1>${title}</h1>${extra}</div>`;}

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if(d.go){closeSheet();go(d.go);return;}
});
