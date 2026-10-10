/* App frame after login: menu, switching screens, page title */
const NAV=[["jobs","Jobs",ICON.jobs],["mine","My jobs",ICON.saved],["profile","Profile",ICON.me]];
function markVisit(){if(!U.thisVisit||Date.now()-U.thisVisit>30*60e3){U.lastSeen=U.thisVisit||0;U.thisVisit=Date.now();saveUser();}prevSeen=U.lastSeen||0;}
function openShell(){markVisit();renderHead();$("auth").hidden=true;$("ob").hidden=true;$("shell").hidden=false;go(view);liveForMe();setTimeout(checkApply,600);}
function go(v){view=v;shown=PAGE;renderNav();render();window.scrollTo(0,0);}
function myCount(){return Object.values(U.jobs).filter(t=>t.saved||t.stage).length;}
function renderNav(){
  renderHead();
  const n=myCount();
  $("side").innerHTML=NAV.map(([k,l,i])=>`<button class="nav" data-go="${k}" aria-current="${view===k?"page":"false"}">${i}${l}${k==="mine"&&n?`<span class="n">${n}</span>`:""}</button>`).join("");
  $("bottom").innerHTML=NAV.map(([k,l,i])=>`<button data-go="${k}" aria-current="${view===k?"page":"false"}">${i}${l}</button>`).join("");
}
function render(){({jobs:renderJobs,mine:renderMine,profile:renderProfile})[view]();}
function topbar(title,extra=""){return `<div class="topbar"><h1>${title}</h1>${extra}</div>`;}

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if(d.go){closeSheet();go(d.go);return;}
});
