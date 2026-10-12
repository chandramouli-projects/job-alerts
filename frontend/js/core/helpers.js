/* Small helpers used everywhere */
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ago=iso=>{const t=new Date(iso);if(isNaN(t))return"";const h=Math.round((Date.now()-t)/36e5);return h<1?"just now":h<24?h+"h ago":Math.round(h/24)===1?"1 day ago":Math.round(h/24)+" days ago"};
const fmtDate=t=>t?new Date(t).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}):"";
const when=j=>j.posted||j.found;
const initials=n=>esc((n||"?").trim().split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase());
const logo=j=>j.logo&&!PREVIEW?`<span class="logo"><img src="${esc(j.logo)}" alt="" loading="lazy" onerror="this.parentNode.textContent='${esc((j.company||'?')[0].toUpperCase())}'"></span>`:`<span class="logo">${esc((j.company||"?")[0].toUpperCase())}</span>`;
const CP1252={"€":128,"‚":130,"ƒ":131,"„":132,"…":133,"†":134,"‡":135,"ˆ":136,"‰":137,"Š":138,"‹":139,"Œ":140,"Ž":142,"‘":145,"’":146,"“":147,"”":148,"•":149,"–":150,"—":151,"˜":152,"™":153,"š":154,"›":155,"œ":156,"ž":158,"Ÿ":159};
function fixText(v){
  if(typeof v!=="string"||!/[ÂÃâ][\u0080-\u00bf€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/.test(v))return v;
  try{return new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from([...v],c=>{const n=c.charCodeAt(0);if(n<256)return n;if(CP1252[c])return CP1252[c];throw 0;}));}catch(e){return v;}
}
const cleanJob=j=>{if(j)["title","company","location","description","type"].forEach(k=>{j[k]=fixText(j[k]);});return j;};
const normQuery=s=>String(s||"").toLowerCase().replace(/[^a-z0-9+#.]+/g," ").trim();   // "QA  Engineer!" -> "qa engineer"
const splitList=s=>String(s||"").split(",").map(x=>x.trim()).filter(Boolean);
const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
let tt;function toast(t,kind){const el=$("toast");el.innerHTML=(kind==="ok"?'<i class="tk">✓</i>':"")+esc(t);el.classList.add("show");clearTimeout(tt);tt=setTimeout(()=>el.classList.remove("show"),2000)}
async function hashPw(pw,salt){
  const enc=new TextEncoder();
  try{
    const key=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveBits"]);
    const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:120000,hash:"SHA-256"},key,256);
    return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }catch(e){let h=0;for(const c of salt+pw)h=(h*31+c.charCodeAt(0))|0;return "x"+h}
}
async function copy(text,msg="Copied"){try{await navigator.clipboard.writeText(text);toast(msg,"ok");}catch(e){const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();try{document.execCommand("copy");toast(msg,"ok");}catch(_){toast("Couldn't copy. Long-press to copy instead.");}ta.remove();}}
/* Clicks on buttons and links after login. Each screen adds its own: onAppClick((data, button, event) => …) */
function onAppClick(fn){document.addEventListener("click",e=>{const t=e.target.closest("button,a,[data-open]");if(!t||$("shell").hidden)return;fn(t.dataset,t,e);});}
