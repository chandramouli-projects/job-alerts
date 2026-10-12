/* Fixed lists: roles, experience, cities, skills, application stages, icons */
const ROLES={
 "Software Engineer":["software engineer","software developer","sde","programmer","application developer"],
 "Frontend Developer":["frontend","front end","front-end","ui developer","react","angular","vue"],
 "Backend Developer":["backend","back end","back-end","node","golang","api developer"],
 "Full Stack Developer":["full stack","fullstack","full-stack","mern","mean"],
 "Java Developer":["java","spring"],
 "Python Developer":["python","django","flask"],
 "React Developer":["react"],
 ".NET Developer":[".net","dotnet","c#","asp.net"],
 "Data Analyst":["data analyst","business analyst","power bi","analytics"],
 "Data Scientist":["data scientist","machine learning","ml engineer","ai engineer"],
 "DevOps Engineer":["devops","cloud engineer","sre","site reliability"],
 "QA / Testing":["qa ","qa-","qa/","quality assurance","quality analyst","test engineer","test analyst","test lead","tester","testing","sdet","automation test","selenium"],
 "Android Developer":["android","kotlin","flutter","mobile developer"],
 "UI UX Designer":["ui/ux","ux designer","ui designer","product designer"]};
const EXP=[[0,"Fresher"],[1,"1 year"],[2,"2 years"],[3,"3 years"],[4,"4 years"],[5,"5 years"],[7,"6–8 years"],[10,"9+ years"]];
const CITIES=["Hyderabad","Bangalore","Chennai","Pune","Mumbai","Delhi","Noida","Gurgaon","Kolkata","Ahmedabad","Visakhapatnam","Vijayawada","Kochi","Coimbatore","Remote","Anywhere in India"];
const SKILLS=["java","python","javascript","typescript","react","angular","node","spring boot","sql","mongodb","aws","azure","docker","kubernetes","html","css","django",".net","c#","power bi","excel","selenium","git","rest","microservices","flutter","kotlin","machine learning"];
const STAGES=[["saved","Saved","var(--muted)"],["applied","Applied","var(--applied)"],["interview","Interview","var(--interview)"],["offer","Offer","var(--offer)"],["rejected","Closed","var(--rejected)"]];
const SENIOR=/\b(senior|sr\.?|lead|principal|staff|architect|manager|head|director)\b/i, JUNIOR=/\b(intern|internship|trainee|fresher)\b/i;
const PAGE=25;
const PREVIEW=!!window.__JOBS__;
const ICON={
 jobs:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg>',
 saved:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
 applied:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/></svg>',
 track:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
 cos:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21V7l6-4v18M9 21h12V10l-6-3M13 11h2M13 15h2M5 9h1M5 13h1M5 17h1"/></svg>',
 me:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
 set:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
 bookmark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
 filter:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 5h18M6 12h12M10 19h4"/></svg>'};
const LOGOUT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>';
const CLOSE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
