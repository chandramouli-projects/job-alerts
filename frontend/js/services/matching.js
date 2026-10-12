/* How well a job fits the person's roles, experience, cities and skills */
function roleKeywords(p){const k=[];p.roles.forEach(r=>k.push(...(ROLES[r]||[r.toLowerCase()])));splitList(p.custom).forEach(r=>k.push(r.toLowerCase()));return k;}
function mySkills(p){return [...p.skills,...splitList(p.customSkills).map(s=>s.toLowerCase())];}
function evaluate(j,p){
  const title=(j.title||"").toLowerCase(),text=(title+" "+(j.tech||[]).join(" ")+" "+(j.description||"")).toLowerCase();
  const why=[];let score=0,ok=true;
  const kw=roleKeywords(p),roleHit=kw.find(k=>hasWord(title,k));
  if(roleHit){score+=40;why.push([true,`Title matches your role (“${roleHit}”)`]);}else{ok=false;why.push([false,"Not one of your roles"]);}
  const my=p.exp;
  if(my!=null){
    if(my<5&&SENIOR.test(j.title)){ok=false;why.push([false,"Senior level role"]);}
    else if(my>=2&&JUNIOR.test(j.title)){ok=false;why.push([false,"Junior / internship role"]);}
    else if(j.exp_min!=null){
      if(j.exp_min>my+1||(j.exp_max!=null&&j.exp_max<my-2)){ok=false;why.push([false,`Needs ${expRange(j)}, you have ${expLabel(my)}`]);}
      else{score+=25;why.push([true,`Needs ${expRange(j)}, fits your ${expLabel(my)}`]);}
    }else{score+=12;why.push([null,"Experience not mentioned"]);}
  }
  const any=p.cities.includes("Anywhere in India"),wantRemote=p.cities.includes("Remote"),remote=isRemote(j);
  const loc=((j.location||"")+" "+(j.city_norm||"")).toLowerCase();
  const cityHit=p.cities.find(c=>c!=="Remote"&&c!=="Anywhere in India"&&(loc.includes(c.toLowerCase())||(c==="Bangalore"&&loc.includes("bengaluru"))||(c==="Gurgaon"&&loc.includes("gurugram"))));
  if(cityHit){score+=20;why.push([true,`In ${cityHit}`]);}
  else if(wantRemote&&remote){score+=20;why.push([true,"Remote job"]);}
  else if(any){score+=15;why.push([true,"In India"]);}
  else{ok=false;why.push([false,"Not in your cities"]);}
  const sk=mySkills(p),hits=sk.filter(s=>hasWord(text,s));
  if(sk.length){score+=Math.round(15*Math.min(1,hits.length/Math.min(sk.length,4)));if(hits.length)why.push([true,`Mentions your skills: ${hits.join(", ")}`]);}else score+=10;
  return {ok,score:Math.min(100,score),why,hits};
}
const isRemote=j=>j.remote||/\b(remote|work from home|wfh)\b/i.test([j.title,j.location,j.type].join(" "));
const expLabel=v=>v===0?"fresher level":v===7?"6–8 years":v===10?"9+ years":v+" year"+(v===1?"":"s");
const expRange=j=>j.exp_min==null?"Not stated":`${j.exp_min}${j.exp_max?"–"+j.exp_max:"+"} yrs`;
/* Learning from what the person does: words, companies and skills of jobs they saved or applied to
   count +1, those of jobs they hid count -1. Words in both (like "qa") cancel out. Only the
   "Best fit" order uses this; the match % stays the same. */
const TASTE_SKIP=new Set(["and","for","the","with","senior","junior","lead","engineer","developer","india","remote","job","jobs","ii","iii"]);
const tasteBits=j=>[...new Set([...normQuery(j.title).split(" ").filter(w=>w.length>1&&!TASTE_SKIP.has(w)),"@"+(j.company||"").toLowerCase(),...(j.tech||[]).map(s=>"#"+s)])];
function taste(){
  const w=new Map(),add=(j,n)=>{if(j)tasteBits(j).forEach(b=>w.set(b,(w.get(b)||0)+n));};
  for(const [id,t] of Object.entries(U.jobs))if(t.saved||t.stage)add(findJob(id)||t.snap,1);
  for(const id of Object.keys(U.hidden))add(findJob(id),-1);
  return w;
}
// -10 (like the hidden ones) .. +10 (like the saved / applied ones)
function tasteScore(j,w){let s=0;for(const b of tasteBits(j)){const n=w.get(b)||0;s+=Math.sign(n)*Math.min(2,Math.abs(n));}return Math.max(-10,Math.min(10,s*2));}
