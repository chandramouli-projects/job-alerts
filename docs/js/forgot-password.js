/* Forgot password: email -> PIN shown on screen -> verify PIN -> new password */
let fpLocal=null;
const isEmail=v=>/^\S+@\S+\.\S+$/.test(v.trim());
let fpEmail="",fpPin="";
function fpStep(n){document.querySelectorAll("[data-fp]").forEach(x=>x.hidden=+x.dataset.fp!==n);document.querySelectorAll(".fp-list li").forEach((x,i)=>{x.classList.toggle("done",i<n-1);x.classList.toggle("on",i===n-1);});$("fpErr1").textContent=$("fpErr2").textContent=$("fpErr3").textContent="";fpCheck();syncEyes();}
function fpCheck(){$("fpGen").disabled=!isEmail($("fpEmail").value);$("fpVerify").disabled=!/^\d{6}$/.test($("fpPin").value.trim());$("fpSave").disabled=!($("fpNew").value.length>=6&&$("fpNew2").value);}
// Checks the PIN; the server counts wrong tries (5 max) for both verify and reset
async function fpCheckPin(pin,errId){
  if(SERVER){try{await api("verify",{email:fpEmail,pin});return true;}catch(err){$(errId).textContent=err.message;return false;}}
  const f=fpLocal;
  if(!f||f.email!==fpEmail||Date.now()>f.until){$(errId).textContent="This PIN has expired. Get a new PIN.";return false;}
  if(f.pin!==pin){if(++f.tries>=5){fpLocal=null;$(errId).textContent="Too many wrong PINs. Get a new PIN.";}else $(errId).textContent=`Wrong PIN. ${5-f.tries} tries left.`;return false;}
  return true;
}
function openForgot(){$("fpEmail").value=$("lEmail").value.trim();["fpPin","fpNew","fpNew2"].forEach(id=>$(id).value="");fpStep(1);$("fpModal").hidden=false;document.body.style.overflow="hidden";setTimeout(()=>$("fpEmail").focus(),60);}
function closeForgot(){$("fpModal").hidden=true;document.body.style.overflow="";$("toForgot").focus();}
async function fpGenerate(){
  const email=$("fpEmail").value.trim().toLowerCase();let pin;
  if(SERVER){try{pin=(await api("forgot",{email})).pin;}catch(err){$("fpErr1").textContent=err.message;return false;}}
  else{
    if(!accounts[email]){$("fpErr1").textContent="No account with this email on this device.";return false;}
    pin=String(crypto.getRandomValues(new Uint32Array(1))[0]%1e6).padStart(6,"0");
    fpLocal={email,pin,until:Date.now()+600e3,tries:0};
  }
  fpEmail=email;fpPin="";
  $("fpPinShow").textContent=pin;document.querySelectorAll(".fp-for").forEach(x=>x.textContent=email);$("fpPin").value="";
  return true;
}
$("toForgot").onclick=openForgot;
$("fpX").onclick=closeForgot;
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("fpModal").hidden)closeForgot();});
$("fpForm1").onsubmit=async e=>{e.preventDefault();$("fpErr1").textContent="";const b=$("fpGen");b.disabled=true;if(await fpGenerate()){fpStep(2);$("fpPin").focus();}else fpCheck();};
$("fpAgain").onclick=async()=>{if(await fpGenerate()){$("fpErr2").textContent="";toast("New PIN generated");}else{$("fpErr2").textContent=$("fpErr1").textContent;}};
$("fpCopy").onclick=()=>copy($("fpPinShow").textContent);
// Step 2: PIN must be right before the new-password step opens
$("fpForm2").onsubmit=async e=>{
  e.preventDefault();
  const pin=$("fpPin").value.trim(),b=$("fpVerify");
  $("fpErr2").textContent="";b.disabled=true;
  if(!await fpCheckPin(pin,"fpErr2"))return fpCheck();
  fpPin=pin;$("fpNew").value=$("fpNew2").value="";fpStep(3);$("fpNew").focus();
};
$("fpForm3").onsubmit=async e=>{
  e.preventDefault();
  const pw=$("fpNew").value;
  $("fpErr3").textContent="";
  if(pw!==$("fpNew2").value)return $("fpErr3").textContent="The two passwords don't match.";
  if(SERVER){try{await api("reset",{email:fpEmail,pin:fpPin,password:pw});}catch(err){return $("fpErr3").textContent=err.message;}}
  else{
    if(!await fpCheckPin(fpPin,"fpErr3"))return;
    const a=accounts[fpEmail];a.hash=await hashPw(pw,a.salt);LS.set("uv.accounts",accounts);fpLocal=null;
  }
  fpStep(4);$("fpDone").focus();
};
$("fpDone").onclick=()=>{const email=fpEmail;closeForgot();$("loginView").hidden=false;$("signupView").hidden=true;$("lEmail").value=email;$("lPass").value="";$("lErr").textContent="";syncEyes();$("lPass").focus();};
