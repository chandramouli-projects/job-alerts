/* "Your resume vs this job" in the job details (only when a resume is uploaded on the Profile page):
   the skills this job asks for that the resume doesn't mention. Company screening software (ATS)
   looks for these words, so the person can add the ones they really have before applying.
   The resume is read once per visit (services/resume-reader.js), in this browser only. */
let resumeWords=null,resumeWordsKey="";
async function resumeSkillSet(){
  const f=U.profile.resumeFile;if(!f)return null;
  const key=f.name+"|"+f.at;
  if(key!==resumeWordsKey){
    const blob=await loadResume();
    resumeWords=new Set(findSkills(await resumeText(new File([blob],f.name,{type:blob.type}))));
    resumeWordsKey=key;
  }
  return resumeWords;
}
// a place in the job details, filled once the resume is read
const resumeMatchSlot=(j,done)=>!done&&U.profile.resumeFile?`<div id="resumeMatch" data-job="${esc(j.id)}"></div>`:"";
async function fillResumeMatch(j){
  const box=$("resumeMatch");if(!box)return;
  const want=findSkills(`${j.title||""} ${j.description||""}`);
  if(!want.length){box.remove();return;}
  box.innerHTML=`<div class="card"><h3>Your resume vs this job</h3><p class="meta" style="margin:0">Reading your resume…</p></div>`;
  let have;
  try{have=await resumeSkillSet();}catch(e){box.innerHTML=`<div class="card"><h3>Your resume vs this job</h3><p class="meta" style="margin:0">${esc(e.message)}</p></div>`;return;}
  if($("resumeMatch")?.dataset.job!==j.id)return;   // another job was opened meanwhile
  const missing=want.filter(s=>!have.has(s)),pct=Math.round(100*(want.length-missing.length)/want.length);
  box.innerHTML=`<div class="card resume-match"><h3>Your resume vs this job <span class="match ${pct>=70?"hi":""}">${pct}% match</span></h3>
    ${missing.length?`<p>This job asks for <b>${esc(missing.join(", "))}</b>, but your resume doesn't mention ${missing.length>1?"them":"it"}.
      If you have this experience, add these words to your resume before applying: screening software looks for them.</p>`
      :`<p>Your resume mentions every skill this job asks for.</p>`}
    <div class="facts" style="margin:0">${want.map(s=>`<span class="${have.has(s)?"good":"t"}" title="${have.has(s)?"In your resume":"Not in your resume"}">${have.has(s)?"✓ ":""}${esc(s)}</span>`).join("")}</div></div>`;
}
