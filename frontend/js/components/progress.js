/* "This week" on My jobs: how many applications were sent, and what came back (Viewed, Shortlisted,
   Interview, Not selected, from the application history, which includes Gmail statuses).
   Read-only numbers; nothing here changes a status. */
const WEEK=7*864e5;
function progressCard(jobs){
  const since=Date.now()-WEEK,heard=["viewed","shortlisted","interview","offer","rejected"];
  const thisWeek=k=>jobs.filter(j=>(j._t.history||[]).some(h=>h.stage===k&&h.at>=since)).length;
  const sent=jobs.filter(j=>(j._t.appliedAt||0)>=since).length;
  const answered=jobs.filter(j=>(j._t.history||[]).some(h=>heard.includes(h.stage))).length;
  const rate=jobs.length?Math.round(100*answered/jobs.length):0;
  const tiles=[["Applied",sent],["Viewed",thisWeek("viewed")],["Shortlisted",thisWeek("shortlisted")],["Interviews",thisWeek("interview")],["Not selected",thisWeek("rejected")]];
  return `<div class="card progress-card"><div class="progress-head"><h3>This week</h3>
      <span title="Applications that got any answer (viewed, shortlisted, interview, offer or not selected)">Response rate <b>${rate}%</b> · ${answered} of ${jobs.length}</span></div>
    <div class="progress-tiles">${tiles.map(([l,n])=>`<div><b>${n}</b><small>${l}</small></div>`).join("")}</div>
    ${sent===0&&jobs.length?`<p class="progress-tip">No applications this week yet.</p>`:""}</div>`;
}
