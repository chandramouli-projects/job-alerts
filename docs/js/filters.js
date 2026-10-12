/* Jobs page filters: what is picked (F), which jobs pass, and the filter panel */
function resetFilters(){F={q:"",forYou:true,days:7,role:"",exp:"",city:"",type:"",source:"",company:"",minSal:"",remote:false,sort:"match"};shown=PAGE;}
function salaryLpa(j){const m=String(j.salary||"").match(/([\d.]+)(?:\s*[–-]\s*([\d.]+))?\s*LPA/i);return m?parseFloat(m[2]||m[1]):null;}
const isNew=j=>prevSeen>0&&new Date(j.found)>prevSeen;
function feed(){
  const S=searchParts(F.q.toLowerCase()),q=S.what,qTag=normQuery(q),where=S.where.replace("bengaluru","bangalore"),out=[],applied=appliedKeys();
  // A Role / City / Remote filter picked here wins over the saved answers for "Jobs for me"
  const p={...U.prefs,...(F.role?{roles:[F.role],custom:""}:{}),...(F.remote||F.city==="Remote"?{cities:["Remote"]}:F.city?{cities:[F.city==="India"?"Anywhere in India":F.city]}:{})};
  for(const j of allJobs()){
    if(U.hidden[j.id])continue;
    if(U.jobs[j.id]?.stage||wasApplied(j,applied))continue;
    if(!j.manual&&(Date.now()-new Date(when(j)))/864e5>F.days)continue;
    if(F.company&&j.company!==F.company)continue;
    // A search shows jobs that have every word, plus related jobs the live search found for it
    const exact=!q||q.split(/[,\s]+/).filter(Boolean).every(w=>[j.title,j.company,j.location,(j.tech||[]).join(" "),j.description].join(" ").toLowerCase().includes(w));
    if(!exact&&!(j.searches||[]).includes(qTag))continue;
    if(where&&!(j.location+" "+(j.city_norm||"")).toLowerCase().replace("bengaluru","bangalore").includes(where))continue;
    if(F.remote&&!isRemote(j))continue;
    if(F.type&&(j.type||"Not stated")!==F.type)continue;
    if(F.source&&(j.direct?"Company site":j.source)!==F.source)continue;
    if(F.city&&(j.city_norm||"India")!==F.city)continue;
    if(F.role&&!(ROLES[F.role]||[F.role.toLowerCase()]).some(k=>j.title.toLowerCase().includes(k)))continue;
    if(F.exp!==""){const x=+F.exp;if(j.exp_min!=null&&(j.exp_min>x+1||(j.exp_max!=null&&j.exp_max<x-2)))continue;if(x<5&&SENIOR.test(j.title))continue;}
    if(F.minSal!==""){const s=salaryLpa(j);if(s==null||s<+F.minSal)continue;}
    const ev=evaluate(j,p);
    if(F.forYou&&!q&&!ev.ok)continue;   // a search shows every match, not only my roles
    out.push({...j,_e:ev,_rel:!exact});
  }
  // exact matches first, then related ones
  out.sort((a,b)=>(a._rel-b._rel)||(F.sort==="new"?new Date(when(b))-new Date(when(a)):(isNew(b)-isNew(a))||(b._e.score-a._e.score)||(new Date(when(b))-new Date(when(a)))));
  return out;
}
// What the person picked, as removable chips next to the job count: [key, label]
function activeFilters(){
  const days={1:"Last 24 hours",3:"Last 3 days",21:"Last 3 weeks"};
  return [!F.forYou&&["forYou","All jobs"],F.role&&["role",F.role],F.exp!==""&&["exp",EXP.find(x=>String(x[0])===String(F.exp))?.[1]],
    F.city&&["city",F.city],F.days!==7&&["days",days[F.days]],F.minSal&&["minSal",`${F.minSal} LPA and above`],F.company&&["company",F.company],
    F.source&&["source",F.source],F.type&&["type",F.type],F.remote&&["remote","Remote only"],F.sort!=="match"&&["sort","Newest first"]].filter(Boolean);
}
function clearFilter(k){const d={forYou:true,days:7,remote:false,sort:"match"};F[k]=k in d?d[k]:"";shown=PAGE;renderJobs();}
const fitLabel=e=>!e.ok?"":e.score>=80?"Great fit":"Good fit";

/* The filter panel on the Jobs page */
function filterPanel(n){
  const uniq=f=>[...new Set(allJobs().map(f).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const sel=(id,label,val,opts,def=opts[0][0])=>`<div><label for="${id}">${label}</label><select id="${id}" data-fsel="${id.slice(2)}" class="${String(val)!==String(def)?"on":""}">${opts.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(val)?"selected":""}>${esc(l)}</option>`).join("")}</select></div>`;
  return `<div class="fpanel ${filtersOpen?"":"collapsed"}" id="fpanel">
    ${sel("f_forYou","Show",F.forYou?"1":"0",[["1","Jobs for me"],["0","All jobs"]])}
    ${sel("f_role","Job role",F.role,[["","All roles"],...Object.keys(ROLES).map(r=>[r,r])])}
    ${sel("f_exp","Experience",F.exp,[["","Any experience"],...EXP.map(([v,l])=>[v,l])])}
    ${sel("f_city","City",F.city,[["","All India"],...uniq(j=>j.city_norm||"India").map(c=>[c,c])])}
    ${sel("f_days","Posted",F.days,[[1,"Last 24 hours"],[3,"Last 3 days"],[7,"Last 7 days"],[21,"Last 3 weeks"]],7)}
    ${sel("f_minSal","Salary",F.minSal,[["","Any salary"],["3","3 LPA and above"],["5","5 LPA and above"],["8","8 LPA and above"],["12","12 LPA and above"],["20","20 LPA and above"]])}
    ${sel("f_company","Company",F.company,[["","All companies"],...uniq(j=>j.company).map(c=>[c,c])])}
    ${sel("f_source","Posted on",F.source,[["","Any website"],...uniq(j=>j.direct?"Company site":j.source).map(t=>[t,t])])}
    ${sel("f_type","Job type",F.type,[["","Any type"],...uniq(j=>j.type||"Not stated").map(t=>[t,t])])}
    ${sel("f_sort","Sort by",F.sort,[["match","Best fit"],["new","Newest first"]])}
    <div class="fend"><label><input type="checkbox" data-fchk="remote" ${F.remote?"checked":""}>Remote only</label>${n?`<button class="clear" data-fclear>Clear filters</button>`:""}</div>
  </div>
`;
}
function bindFilters(){
  document.querySelectorAll("[data-fsel]").forEach(el=>el.onchange=()=>{const k=el.dataset.fsel,v=el.value;
    if(k==="forYou")F.forYou=v==="1";else if(k==="days")F.days=+v;else F[k]=v;shown=PAGE;renderJobs();if(k==="role"||k==="city")liveForFilters();});
  document.querySelectorAll("[data-fchk]").forEach(el=>el.onchange=()=>{F[el.dataset.fchk]=el.checked;shown=PAGE;renderJobs();if(el.checked)liveForFilters();});
}

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if("fclear" in d){const q=F.q;resetFilters();F.q=q;renderJobs();return;}
  if("ftoggle" in d){filtersOpen=!filtersOpen;renderJobs();return;}
  if(d.fdel){clearFilter(d.fdel);return;}
});
