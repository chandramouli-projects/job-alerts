/* Smart search on the Jobs page: understands short forms and other names ("QA" = tester / SDET,
   "SDE" = software engineer, "Bengaluru" = Bangalore) and fixes small spelling mistakes
   ("devloper" -> developer), using the words of the jobs we have. */

let searchFixes={};   // spelling fixes in the last search ({devloper:"developer"}), shown on the Jobs page

// each group: any of these words or phrases means the same in a search
const SEARCH_SAME=[
  ["qa","tester","testing","sdet","quality assurance","quality analyst","test engineer"],
  ["sde","software engineer","software developer","programmer"],
  ["dev","developer"],["fe","frontend","front end","front-end"],["be","backend","back end","back-end"],
  ["fullstack","full stack","full-stack"],["js","javascript"],["ts","typescript"],["py","python"],
  ["react","reactjs","react.js"],["node","nodejs","node.js"],["vue","vuejs","vue.js"],["angular","angularjs"],
  [".net","dotnet","asp.net"],["k8s","kubernetes"],["ml","machine learning"],["ai","artificial intelligence"],
  ["ui","user interface"],["ux","user experience"],["ba","business analyst"],["hr","human resources","recruiter"],
  ["bde","business development"],["sr","senior"],["jr","junior"],["mgr","manager"],["wfh","work from home","remote"],
  ["bangalore","bengaluru","blr"],["gurgaon","gurugram","ggn"],["hyderabad","hyd","secunderabad"],["mumbai","bombay"],
  ["chennai","madras"],["kolkata","calcutta"],["delhi","new delhi","ncr"],["vizag","visakhapatnam"],["trivandrum","thiruvananthapuram"],
];
const SAME_OF=new Map();
for(const g of SEARCH_SAME)for(const w of g)SAME_OF.set(w,g);

// all single words in the jobs' titles and skills, for spelling fixes (rebuilt when the job list grows)
let vocab=null,vocabSize=-1;
function searchVocab(){
  const jobs=allJobs();
  if(jobs.length!==vocabSize){
    vocab=new Set();vocabSize=jobs.length;
    for(const j of jobs)for(const w of normQuery(`${j.title} ${(j.tech||[]).join(" ")} ${j.city_norm||""}`).split(" "))if(w.length>2)vocab.add(w);
    for(const g of SEARCH_SAME)for(const w of g)if(!w.includes(" "))vocab.add(w);
  }
  return vocab;
}
// edits needed to turn a into b (stops early once it is more than max)
function editDistance(a,b,max){
  if(Math.abs(a.length-b.length)>max)return max+1;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];let best=i;
    for(let k=1;k<=b.length;k++){cur[k]=Math.min(prev[k]+1,cur[k-1]+1,prev[k-1]+(a[i-1]===b[k-1]?0:1));best=Math.min(best,cur[k]);}
    if(best>max)return max+1;
    prev=cur;
  }
  return prev[b.length];
}
// a word nobody's jobs use -> the closest word they do use (1 mistake allowed, 2 for long words)
function fixSpelling(w){
  const v=searchVocab();
  if(w.length<3||v.has(w)||SAME_OF.has(w))return w;
  const max=w.length>=8?2:1;let best=w,bestD=max+1;
  for(const x of v){const d=editDistance(w,x,max);if(d<bestD){best=x;bestD=d;}}
  return best;
}
/* "qa devloper hyd" -> {groups:[["qa","tester",...],["developer","dev"],["hyderabad","hyd","secunderabad"]], fixed:{devloper:"developer"}}
   A job matches when it has one word of every group. Two-word groups ("full stack") are matched as phrases. */
function searchGroups(q){
  const fixed={},raw=normQuery(q),groups=[];
  // two-word names first ("full stack", "machine learning"), then single words
  let rest=" "+raw+" ";
  for(const g of SEARCH_SAME)for(const w of g)if(w.includes(" ")&&rest.includes(" "+w+" ")){groups.push(g);rest=rest.replace(" "+w+" "," ");}
  for(const word of rest.trim().split(" ").filter(Boolean)){
    const w=fixSpelling(word);
    if(w!==word)fixed[word]=w;
    groups.push(SAME_OF.get(w)||[w]);
  }
  return {groups,fixed};
}
// does this job's text have one word of every group?
function matchesSearch(text,groups){
  const t=" "+normQuery(text)+" ";
  return groups.every(g=>g.some(w=>t.includes(" "+normQuery(w)+" ")||(w.length>4&&t.includes(" "+normQuery(w)))));
}
