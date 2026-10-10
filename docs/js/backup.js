/* Download / restore a backup of the person's data */
function exportData(){
  const blob=new Blob([JSON.stringify({version:1,account:{email:session.email,name:U.profile.name},user:{...U,settings:{...U.settings,ghToken:""}}},null,1)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="udyogam-vetuku-backup.json";document.body.appendChild(a);a.click();a.remove();toast("Backup downloaded");
}
function importData(e){
  const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.user?.profile)throw 0;const tok=U.settings.ghToken;U={...d.user,settings:{...d.user.settings,ghToken:tok}};U.profile.email=session.email;saveUser();applyTheme();toast("Backup restored");go("jobs");}catch(_){toast("That file isn't a valid backup.");}};
  r.readAsText(f);
}

/* buttons on this screen */
onAppClick(async(d,t,e)=>{
  if("export" in d){exportData();return;}
});
