/* Right-hand panel on wide screens: free career tools for the job hunt (links to other sites, not ads) */
const RAIL_LINKS={
  resume:[["Canva Resume Builder","Free designer templates","https://www.canva.com/create/resumes/"],
    ["Overleaf CV templates","Clean, ATS-friendly resumes","https://www.overleaf.com/latex/templates/tagged/cv"],
    ["Resume Worded","Free resume score and fixes","https://resumeworded.com/"]],
  prep:[["InterviewBit","Interview questions and practice","https://www.interviewbit.com/"],
    ["GeeksforGeeks","Questions asked by companies","https://www.geeksforgeeks.org/"],
    ["LeetCode","Coding problems to practise","https://leetcode.com/"]],
  learn:[["NPTEL","Free IIT courses with certificates","https://nptel.ac.in/"],
    ["Skill India Digital","Government skill courses","https://www.skillindiadigital.gov.in/"],
    ["freeCodeCamp","Free coding certifications","https://www.freecodecamp.org/"]]};
const TIPS=[
  "Apply within 3 days of a job being posted. Early applicants are read first.",
  "Copy 3–4 skills from the job post into your resume, in the same words.",
  "Keep your resume to 1 page if you have under 5 years of experience.",
  "Follow up 7 days after applying with a short, polite message.",
  "Put numbers in your resume: \"cut test time by 30%\" beats \"improved testing\".",
  "Keep your LinkedIn headline the same as the job title you want.",
  "Save your resume as PDF named Firstname-Lastname-Role.pdf.",
  "Before an interview, read the company's last 3 news items.",
  "Prepare a 60-second answer to \"Tell me about yourself\".",
  "Ask one question at the end of every interview; it shows interest."];
function renderRail(){
  const el=$("rail");if(!el||!U)return;
  const pc=completeness(),role=(U.prefs.roles[0]||"").replace(" / "," "),tip=TIPS[Math.floor(Date.now()/864e5)%TIPS.length];
  const box=(title,sub,items)=>`<section class="rail-card"><h3>${esc(title)}</h3><p>${esc(sub)}</p><ul class="rail-list">${items.map(([n,d,u])=>
    `<li><a href="${u}" target="_blank" rel="noopener"><span class="rail-ico">${esc(n[0])}</span><span><b>${esc(n)}</b><small>${esc(d)}</small></span><i aria-hidden="true">↗</i></a></li>`).join("")}</ul></section>`;
  el.innerHTML=(pc<100?`<section class="rail-card"><h3>Your profile is ${pc}% complete</h3><div class="rail-bar"><i style="width:${pc}%"></i></div>
      <p>A full profile fills application forms in one tap.</p><button class="btn ghost sm" data-go="profile">Complete profile</button></section>`:"")+
    box("Build your resume","Free tools to make a resume recruiters read.",RAIL_LINKS.resume)+
    box(role?`Prepare for ${role} interviews`:"Prepare for interviews","Practise the questions companies ask.",RAIL_LINKS.prep)+
    box("Learn a new skill","Free courses with certificates.",RAIL_LINKS.learn)+
    `<section class="rail-card rail-tip"><h3>Tip of the day</h3><p>${esc(tip)}</p></section>
    <p class="rail-note">These links open other websites. Udyogam Vetuku is not part of them.</p>`;
}
