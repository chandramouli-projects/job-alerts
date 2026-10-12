/* One job in a list: title, company, fit, Save and View job buttons (View job opens the job's own page) */
function jobCard(j,opt={}){
  const t=U.jobs[j.id],e=j._e||evaluate(j,U.prefs),st=t?.stage?STAGES.find(s=>s[0]===t.stage):null,fl=fitLabel(e);
  return `<article class="job" data-open="${esc(j.id)}" style="--s:${st?st[2]:"var(--line)"}" tabindex="0">
    <div class="top">${logo(j)}<div><h3>${esc(j.title)}</h3><div class="co">${esc(j.company)}</div><div class="meta">${esc(j.location||"India")}${j.remote?" · Remote":""}</div></div>
    <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">${isNew(j)&&!opt.noNew?`<span class="match newb">New</span>`:""}${j._rel?`<span class="match">Related</span>`:""}${fl?`<span class="match ${fl==="Great fit"?"hi":""}">${fl}</span>`:""}</div></div>
    <div class="facts"><span class="${e.ok&&j.exp_min!=null?"good":""}">${esc(expRange(j))}</span>${j.salary?`<span>${esc(j.salary)}</span>`:""}${j.type?`<span>${esc(j.type)}</span>`:""}${(e.hits||[]).slice(0,4).map(h=>`<span class="good">${esc(h)}</span>`).join("")}</div>
    <div class="foot"><span class="when">${j.manual?"Added by you":`${j.direct?`<b style="color:var(--accent)">Company site</b>`:esc(j.source)} · ${ago(when(j))}`}</span>
      ${st&&opt.showStage!==false?`<span class="status-pill" style="color:${st[2]}">${st[1]}</span>`:""}
      <button class="icon-btn" data-save="${esc(j.id)}" aria-pressed="${!!t?.saved}" aria-label="Save job">${ICON.bookmark}</button>
      <a class="apply" href="${esc(safeUrl(j.url))}" target="_blank" rel="noopener" data-apply="${esc(j.id)}">View job</a></div>
  </article>`;
}

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if(d.apply){noteApply(d.apply);return;}
  if(d.save){e.stopPropagation();const s=toggleSave(d.save);t.setAttribute("aria-pressed",s);toast(s?"Saved to Saved jobs":"Removed from Saved jobs");renderNav();if(view==="saved")renderSaved();return;}
  if(d.open){openJob(d.open);return;}
});
