/* "Tell us the job you want": role, experience, city and skill pickers */
let draft,OPTS={};
const PK={role:{list:"roles",ph:"Choose roles",find:"Search or add a role",add:true},exp:{ph:"Choose experience"},city:{list:"cities",ph:"Choose cities",find:"Search cities"},skill:{list:"skills",ph:"Choose skills",find:"Search or add a skill",add:true}};
/* dropdown options come from the jobs we actually have, with how many jobs match each */
function buildOpts(){
  const J=data.jobs||[],cnt=f=>J.filter(f).length,byCount=a=>a.sort((x,y)=>y[1]-x[1]||x[0].localeCompare(y[0]));
  OPTS.role=byCount([...new Set([...Object.keys(ROLES),...(data.roles||[])])].map(r=>[r,cnt(j=>roleHitFor(j.title,r))]));
  const inCity=(j,c)=>{const l=((j.location||"")+" "+(j.city_norm||"")).toLowerCase();return l.includes(c.toLowerCase())||(c==="Bangalore"&&l.includes("bengaluru"))||(c==="Gurgaon"&&l.includes("gurugram"));};
  const cities=[...new Set([...CITIES.filter(c=>c!=="Remote"&&c!=="Anywhere in India"),...J.map(j=>j.city_norm).filter(c=>c&&c!=="India"&&/^[A-Z]/.test(c))])];
  OPTS.city=[["Anywhere in India",J.length],["Remote",cnt(j=>j.remote)],...byCount(cities.map(c=>[c,cnt(j=>inCity(j,c))]))];
  OPTS.skill=byCount([...new Set([...SKILLS,...J.flatMap(j=>j.tech||[])])].map(t=>[t,cnt(j=>(j.tech||[]).includes(t))]));
  OPTS.exp=EXP.map(([v,l])=>[l,cnt(j=>!(v<5&&SENIOR.test(j.title))&&!(v>=2&&JUNIOR.test(j.title))&&(j.exp_min==null||(j.exp_min<=v+1&&(j.exp_max==null||j.exp_max>=v-1)))),v]);
}
const pkEl=k=>document.querySelector(`[data-pk="${k}"]`);
function pkField(k){
  const box=pkEl(k).querySelector(".pk-chips");
  if(k==="exp"){const e=EXP.find(x=>x[0]===draft.exp);box.innerHTML=e?`<span class="pk-one">${esc(e[1])}</span>`:`<span class="pk-ph">${PK.exp.ph}</span>`;return;}
  const v=draft[PK[k].list];
  box.innerHTML=v.length?v.map(x=>`<span class="pk-chip">${esc(x)}<button type="button" data-pkdel="${k}" data-v="${esc(x)}" aria-label="Remove ${esc(x)}">×</button></span>`).join(""):`<span class="pk-ph">${PK[k].ph}</span>`;
}
function pkList(k){
  const q=(pkEl(k).querySelector(".pk-search")?.value||"").trim(),ql=q.toLowerCase(),sel=k==="exp"?[]:draft[PK[k].list];
  const opts=k==="exp"?OPTS.exp:[...sel.filter(x=>!OPTS[k].some(o=>o[0]===x)).map(x=>[x,0]),...OPTS[k]];
  const shown=opts.filter(o=>o[0].toLowerCase().includes(ql)),on=o=>k==="exp"?draft.exp===o[2]:sel.includes(o[0]);
  const add=PK[k].add&&q&&!opts.some(o=>o[0].toLowerCase()===ql)?`<button type="button" class="pk-opt add" data-pkadd="${k}" data-v="${esc(q)}"><i class="pk-check">+</i><span>Add “${esc(q)}”</span></button>`:"";
  pkEl(k).querySelector(".pk-list").innerHTML=add+shown.map(o=>`<button type="button" class="pk-opt" role="option" aria-selected="${on(o)}" data-pkval="${k}" data-v="${esc(k==="exp"?o[2]:o[0])}"><i class="pk-check"></i><span>${esc(o[0])}</span>${o[1]?`<small>${o[1]} job${o[1]===1?"":"s"}</small>`:""}</button>`).join("")+(add||shown.length?"":`<p class="pk-none">No match</p>`);
}
function pkClose(){document.querySelectorAll("#ob .pk.open").forEach(p=>{p.classList.remove("open");p.querySelector(".pk-field").setAttribute("aria-expanded","false");p.querySelector(".pk-pop").hidden=true;});}
function pkToggle(k){
  const p=pkEl(k),was=p.classList.contains("open");pkClose();if(was)return;
  const r=p.getBoundingClientRect(),below=innerHeight-r.bottom;p.classList.toggle("up",below<360&&r.top>below);
  p.classList.add("open");p.querySelector(".pk-field").setAttribute("aria-expanded","true");p.querySelector(".pk-pop").hidden=false;
  const s=p.querySelector(".pk-search");if(s){s.value="";if(matchMedia("(pointer:fine)").matches)s.focus();}pkList(k);
}
function startOnboarding(){
  draft=JSON.parse(JSON.stringify(U.prefs));
  draft.roles=[...new Set([...draft.roles,...splitList(draft.custom)])];draft.skills=[...new Set([...draft.skills,...splitList(draft.customSkills).map(x=>x.toLowerCase())])];draft.custom=draft.customSkills="";
  buildOpts();
  Object.keys(PK).forEach(k=>{pkEl(k).innerHTML=`<div class="pk-field" role="button" tabindex="0" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="q-${k}" data-pkopen="${k}"><span class="pk-chips"></span></div>
    <div class="pk-pop" hidden>${PK[k].find?`<input class="pk-search" placeholder="${PK[k].find}" aria-label="${PK[k].find}" data-pksearch="${k}">`:""}<div class="pk-list" role="listbox" aria-labelledby="q-${k}" ${k==="exp"?"":`aria-multiselectable="true"`}></div></div>`;pkField(k);});
  $("obBack").innerHTML=CLOSE;$("obBack").hidden=!U.onboarded;renderHead();
  $("auth").hidden=true;$("shell").hidden=true;$("ob").hidden=false;resumeErr="";renderObResume();obValidate();window.scrollTo(0,0);
}
function obValidate(){$("obNext").disabled=!(draft.roles.length&&draft.exp!==null&&draft.cities.length);}
function pkPick(k,v){
  if(k==="exp"){draft.exp=+v;pkField(k);pkClose();return;}
  const l=PK[k].list;let a=draft[l].includes(v)?draft[l].filter(x=>x!==v):[...draft[l],v];
  if(k==="city"&&a.includes(v))a=v==="Anywhere in India"?[v]:a.filter(x=>x!=="Anywhere in India");
  draft[l]=a;pkField(k);
  if(k==="role"){pkClose();return;}   // owner's rule: the role list closes as soon as a role is picked
  pkList(k);
}
$("ob").addEventListener("click",e=>{
  const t=e.target.closest("button,[data-pkopen]"),d=t?.dataset||{};
  if(d.pkdel){const l=PK[d.pkdel].list;draft[l]=draft[l].filter(x=>x!==d.v);pkField(d.pkdel);if(pkEl(d.pkdel).classList.contains("open"))pkList(d.pkdel);obValidate();return;}
  if(d.pkopen){pkToggle(d.pkopen);return;}
  if(d.pkval){pkPick(d.pkval,d.v);obValidate();return;}
  if(d.pkadd){const k=d.pkadd,v=k==="skill"?d.v.toLowerCase():d.v;if(!draft[PK[k].list].includes(v))draft[PK[k].list].push(v);const s=pkEl(k).querySelector(".pk-search");s.value="";s.focus();pkField(k);pkList(k);obValidate();return;}
  if(!e.target.closest(".pk"))pkClose();
  if(!t)return;
  if(t.id==="obNext"){
    U.prefs=draft;const first=!U.onboarded;U.onboarded=true;saveUser();resetFilters();openShell();
    toast(first?"Welcome! Here are jobs picked for you.":"Preferences saved");syncPrefs(true);
  }else if(t.id==="obBack")openShell();
});
$("ob").addEventListener("input",e=>{if(e.target.dataset.pksearch)pkList(e.target.dataset.pksearch);});
$("ob").addEventListener("keydown",e=>{
  if(e.target.dataset.pkopen&&(e.key==="Enter"||e.key===" ")){e.preventDefault();pkToggle(e.target.dataset.pkopen);}
  else if(e.target.dataset.pksearch&&e.key==="Enter"){e.preventDefault();pkEl(e.target.dataset.pksearch).querySelector(".pk-opt")?.click();}
});

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if("editprefs" in d){closeSheet();startOnboarding();return;}
});
