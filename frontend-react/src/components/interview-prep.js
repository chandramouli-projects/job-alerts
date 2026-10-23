/* Interview prep in the job details, once an application is Shortlisted or at Interview:
   common questions for that kind of role, links to research the company, and a short checklist.
   Ported from frontend/js/components/interview-prep.js; the card is InterviewPrep.jsx. */
export const PREP_QUESTIONS = [
  [
    /\b(qa|test|tester|testing|sdet|quality)\b/,
    [
      "Explain the difference between smoke, sanity and regression testing.",
      "How do you write a good test case? Walk through one.",
      "How do you decide what to automate and what to test by hand?",
      "Tell us about a serious bug you found and how you reported it.",
      "How does Selenium (or your tool) find elements, and how do you handle waits?",
    ],
  ],
  [
    /\b(java|spring|backend|back end)\b/,
    [
      "Explain OOP: inheritance, polymorphism, abstraction, encapsulation.",
      "What is the difference between HashMap and ConcurrentHashMap?",
      "How does Spring Boot dependency injection work?",
      "How would you design a REST API for orders?",
      "How do you find and fix a slow database query?",
    ],
  ],
  [
    /\b(frontend|front end|react|angular|javascript|ui developer|vue)\b/,
    [
      "What happens in the browser when a page loads?",
      "Explain closures and the event loop in JavaScript.",
      "How do React hooks (useState, useEffect) work?",
      "How do you make a page fast and accessible?",
      "How do you manage state in a larger app?",
    ],
  ],
  [
    /\b(python|django|flask)\b/,
    [
      "Lists vs tuples vs sets: when do you use each?",
      "What are decorators and generators?",
      "How does Django ORM avoid N+1 queries?",
      "How do you handle errors and logging in a Python service?",
      "Walk through a project you built in Python.",
    ],
  ],
  [
    /\b(data analyst|analytics|power bi|tableau|mis|business analyst)\b/,
    [
      "Write a SQL query for the top 3 products by sales per month.",
      "How do you clean messy data before analysis?",
      "Explain a dashboard you built and the decision it helped.",
      "What is the difference between a JOIN and a UNION?",
      "How do you explain numbers to people who are not technical?",
    ],
  ],
  [
    /\b(data scien|machine learning|ml|ai)\b/,
    [
      "How do you avoid overfitting?",
      "Precision vs recall: when does each matter?",
      "Walk through a model you built, from data to deployment.",
      "How do you handle missing or imbalanced data?",
      "How would you explain your model to a business team?",
    ],
  ],
  [
    /\b(devops|cloud|aws|azure|sre|kubernetes)\b/,
    [
      "Explain a CI/CD pipeline you set up.",
      "How do Docker images and containers differ?",
      "How would you roll back a bad deployment?",
      "How do you monitor a service and get alerted?",
      "Explain Kubernetes pods, deployments and services.",
    ],
  ],
  [
    /\b(hr|recruit|talent)\b/,
    [
      "How do you source candidates for a hard-to-fill role?",
      "How do you handle a candidate who declines an offer late?",
      "Which HR metrics do you track?",
      "Walk through your onboarding process.",
      "How do you keep hiring managers updated?",
    ],
  ],
  [
    /\b(sales|business development|bde|bdm|telecaller|customer)\b/,
    [
      "Sell me this pen.",
      "How do you handle a customer who says no?",
      "What target did you have last, and how did you reach it?",
      "How do you find new leads?",
      "Tell us about your best deal or happiest customer.",
    ],
  ],
];
export const PREP_COMMON = [
  "Tell me about yourself (a 2-minute answer).",
  "Why do you want to join this company?",
  "Why are you looking for a change? What is your notice period?",
  "Tell us about a difficult problem you solved.",
  "What are your salary expectations?",
];
export const PREP_BEFORE = [
  "Read the job description again and match 3 of your projects to it.",
  "Keep your resume open; they will ask about what is on it.",
  "Prepare 2 questions to ask them (team, first 3 months, growth).",
  "For an online call: test camera, mic and internet 15 minutes early.",
];
// null when there is nothing to show (not shortlisted or at interview)
export function interviewPrep(j, t) {
  if (!t || !["shortlisted", "interview"].includes(t.stage)) return null;
  const title = (j.title || "").toLowerCase(),
    role = PREP_QUESTIONS.find(([re]) => re.test(title)),
    co = j.company || "";
  const q = encodeURIComponent,
    links = [
      [
        "Interview questions people got at " + co,
        `https://www.google.com/search?q=${q(co + " " + (j.title || "") + " interview questions")}`,
      ],
      [
        "Company reviews and salaries",
        `https://www.google.com/search?q=${q(co + " reviews ambitionbox glassdoor")}`,
      ],
      [co + " on LinkedIn", `https://www.linkedin.com/search/results/companies/?keywords=${q(co)}`],
      ...(j.company_site ? [["Company website", j.company_site]] : []),
    ];
  return {
    heading: t.stage === "interview" ? "Interview prep" : "Get ready: you are shortlisted",
    questions: [...(role ? role[1] : []), ...PREP_COMMON],
    co,
    links,
  };
}
