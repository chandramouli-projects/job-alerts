/* Add a job found somewhere else, to track it in My jobs */
function openAddJob(){
  openSheet("Add a job",`<p class="meta" style="margin-top:0">Found a job somewhere else? Add it here to track it with the rest.</p>
    <form id="addForm"><div class="row" style="margin-bottom:12px"><label class="lbl" for="aUrl">Job link</label><input class="inp" id="aUrl" type="url" placeholder="https://" required></div>
    <div class="grid2"><div><label class="lbl" for="aTitle">Job title</label><input class="inp" id="aTitle" required></div><div><label class="lbl" for="aCo">Company</label><input class="inp" id="aCo" required></div>
    <div><label class="lbl" for="aLoc">Location</label><input class="inp" id="aLoc"></div><div><label class="lbl" for="aSal">Salary</label><input class="inp" id="aSal" placeholder="e.g. 8 LPA"></div></div>
    <div style="margin-top:12px"><label class="lbl" for="aDesc">Job description</label><textarea class="inp" id="aDesc" placeholder="Paste the description (optional)"></textarea></div><div class="err" id="aErr"></div></form>`,
    `<button class="btn" data-addsave style="flex:1">Add job</button>`);
}

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if("addjob" in d){openAddJob();return;}
  if("addsave" in d){const url=$("aUrl").value.trim(),title=$("aTitle").value.trim(),co=$("aCo").value.trim();
    if(!/^https?:\/\//.test(url)||!title||!co){$("aErr").textContent="Add the job link, title and company.";return;}
    const j={id:"m"+Date.now().toString(36),manual:true,title,company:co,location:$("aLoc").value.trim(),salary:$("aSal").value.trim(),description:$("aDesc").value.trim(),url,source:"Added by you",found:new Date().toISOString(),posted:new Date().toISOString(),tech:[],exp_min:null,exp_max:null,remote:/remote/i.test($("aLoc").value)};
    U.manual.unshift(j);track(j.id).saved=true;track(j.id).snap=j;saveUser();closeSheet();trackStage="saved";renderNav();render();toast("Job added to My jobs");return;}
  if(d.delmanual){if(!await ask("Delete this job?","The job and your notes on it will be removed.","Delete",true))return;U.manual=U.manual.filter(j=>j.id!==d.delmanual);delete U.jobs[d.delmanual];saveUser();closeSheet();renderNav();render();toast("Job deleted");return;}
});
