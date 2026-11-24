// Seed data for the Oversee demo. Generated deterministically so
// every fresh load (or "Reset demo data") produces the same dataset.

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const rand = seeded(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

const now = new Date('2026-11-24T10:00:00');
const minutesAgo = (m) => new Date(now.getTime() - m * 60000).toISOString();
const daysFromNow = (d, h = 10) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() + d);
  dt.setHours(h, 0, 0, 0);
  return dt.toISOString();
};

export const DEPARTMENTS = ['Engineering', 'QA', 'Data Science', 'Product', 'DevOps', 'HR'];

const NAMES = [
  'Aarav Sharma', 'Priya Nair', 'Rahul Verma', 'Sneha Reddy', 'Vikram Singh', 'Ananya Iyer',
  'Karthik Rao', 'Meera Pillai', 'Arjun Mehta', 'Divya Menon', 'Rohan Gupta', 'Kavya Joshi',
  'Siddharth Das', 'Ishita Bose', 'Aditya Kulkarni', 'Pooja Patel', 'Nikhil Jain', 'Riya Kapoor',
  'Manish Yadav', 'Neha Saxena', 'Harsh Vardhan', 'Tanvi Shah', 'Varun Chopra', 'Lakshmi Krishnan',
];

// ---------------------------------------------------------------------------
// Question banks
// ---------------------------------------------------------------------------
const q = (text, options, answer, difficulty = 'Medium') => ({ text, options, answer, difficulty });

const BANK_DEFS = [
  {
    name: 'React JS Fundamentals',
    topic: 'React JS',
    description: 'Components, hooks, state management and rendering.',
    questions: [
      q('Which hook is used to manage local state in a function component?', ['useEffect', 'useState', 'useMemo', 'useRef'], 1, 'Easy'),
      q('What does the dependency array in useEffect control?', ['Render order', 'When the effect re-runs', 'Component props', 'CSS updates'], 1),
      q('What is the purpose of a "key" prop in lists?', ['Styling', 'Identify elements between renders', 'Event handling', 'Accessibility'], 1, 'Easy'),
      q('Which hook memoizes a callback function?', ['useMemo', 'useCallback', 'useReducer', 'useContext'], 1),
      q('What is the Virtual DOM?', ['A browser API', 'An in-memory representation of the UI', 'A CSS engine', 'A testing tool'], 1, 'Easy'),
      q('Which method lifts shared state in React?', ['Prop drilling to a common parent', 'Global variables', 'localStorage only', 'Refs'], 0, 'Hard'),
    ],
  },
  {
    name: 'Selenium WebDriver',
    topic: 'Selenium',
    description: 'Locators, waits, WebDriver API and test frameworks.',
    questions: [
      q('Which locator is generally the fastest in Selenium?', ['XPath', 'ID', 'CSS Selector', 'Link Text'], 1, 'Easy'),
      q('What does an explicit wait do?', ['Waits a fixed time', 'Waits for a specific condition', 'Disables timeouts', 'Retries the test'], 1),
      q('Which method switches to an iframe?', ['driver.switchTo().frame()', 'driver.frame()', 'driver.goTo()', 'driver.window()'], 0),
      q('Which interface is used to perform mouse hover?', ['Robot', 'Actions', 'Select', 'Alert'], 1),
      q('What is the Page Object Model?', ['A reporting tool', 'A design pattern for maintainable tests', 'A browser driver', 'A CI pipeline'], 1, 'Easy'),
      q('Which exception occurs when an element is no longer attached to the DOM?', ['NoSuchElementException', 'StaleElementReferenceException', 'TimeoutException', 'WebDriverException'], 1, 'Hard'),
    ],
  },
  {
    name: 'Python Programming',
    topic: 'Python',
    description: 'Core syntax, data structures, functions and modules.',
    questions: [
      q('Which data type is immutable?', ['list', 'dict', 'tuple', 'set'], 2, 'Easy'),
      q('What does the "yield" keyword create?', ['A class', 'A generator', 'A decorator', 'A thread'], 1),
      q('What is the output of len({1, 2, 2, 3})?', ['4', '3', '2', 'Error'], 1, 'Easy'),
      q('Which keyword is used to handle exceptions?', ['catch', 'except', 'rescue', 'handle'], 1, 'Easy'),
      q('What does a decorator do?', ['Formats strings', 'Wraps a function to extend its behaviour', 'Imports modules', 'Defines a class'], 1),
      q('What is the GIL?', ['A package manager', 'A lock allowing one thread to execute Python bytecode at a time', 'A GUI library', 'A testing framework'], 1, 'Hard'),
    ],
  },
  {
    name: 'Java OOPs Concepts',
    topic: 'Java OOPs',
    description: 'Encapsulation, inheritance, polymorphism and abstraction.',
    questions: [
      q('Which OOP principle hides internal state behind methods?', ['Inheritance', 'Encapsulation', 'Polymorphism', 'Abstraction'], 1, 'Easy'),
      q('Method overloading is an example of?', ['Runtime polymorphism', 'Compile-time polymorphism', 'Encapsulation', 'Inheritance'], 1),
      q('Which keyword prevents a class from being inherited?', ['static', 'final', 'abstract', 'private'], 1, 'Easy'),
      q('Can an interface have default methods (Java 8+)?', ['Yes', 'No', 'Only static', 'Only private'], 0),
      q('Which keyword calls the parent class constructor?', ['this', 'super', 'parent', 'base'], 1, 'Easy'),
      q('Java supports multiple inheritance of classes?', ['Yes', 'No, only through interfaces', 'Only abstract classes', 'Only with generics'], 1, 'Hard'),
    ],
  },
  {
    name: 'JavaScript Essentials',
    topic: 'JavaScript',
    description: 'Closures, promises, the event loop and ES6+.',
    questions: [
      q('What is a closure?', ['A loop construct', 'A function with access to its outer scope', 'A class method', 'An error type'], 1),
      q('Which is NOT a primitive type?', ['string', 'number', 'object', 'boolean'], 2, 'Easy'),
      q('What does Promise.all do?', ['Runs promises sequentially', 'Resolves when all promises resolve', 'Cancels promises', 'Returns the first result'], 1),
      q('Difference between == and ===?', ['None', '=== also checks type', '== is faster', '=== is deprecated'], 1, 'Easy'),
    ],
  },
  {
    name: 'SQL & Databases',
    topic: 'SQL',
    description: 'Queries, joins, indexing and normalization.',
    questions: [
      q('Which JOIN returns only matching rows from both tables?', ['LEFT JOIN', 'INNER JOIN', 'FULL JOIN', 'CROSS JOIN'], 1, 'Easy'),
      q('Which clause filters grouped rows?', ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'], 1),
      q('What does an index improve?', ['Write speed', 'Read/query speed', 'Storage size', 'Security'], 1),
      q('Which normal form removes transitive dependencies?', ['1NF', '2NF', '3NF', 'BCNF'], 2, 'Hard'),
    ],
  },
  {
    name: 'Cloud & DevOps Basics',
    topic: 'DevOps',
    description: 'Docker, CI/CD, Kubernetes and cloud fundamentals.',
    questions: [
      q('What is a Docker image?', ['A running container', 'A read-only template for containers', 'A VM snapshot', 'A log file'], 1, 'Easy'),
      q('What does CI stand for?', ['Code Inspection', 'Continuous Integration', 'Cloud Infrastructure', 'Container Instance'], 1, 'Easy'),
      q('Smallest deployable unit in Kubernetes?', ['Node', 'Pod', 'Service', 'Cluster'], 1),
      q('Which tool is used for infrastructure as code?', ['Terraform', 'Jira', 'Figma', 'Postman'], 0),
    ],
  },
];

export const seedQuestionBanks = BANK_DEFS.map((b, i) => ({
  id: `QB-${101 + i}`,
  name: b.name,
  topic: b.topic,
  description: b.description,
  createdAt: daysFromNow(-30 + i * 2),
  questions: b.questions.map((qq, j) => ({ id: `Q-${101 + i}-${j + 1}`, ...qq })),
}));

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------
const EXAM_DEFS = [
  { title: 'React Developer Assessment', bank: 0, status: 'Completed', day: -12, duration: 60 },
  { title: 'Automation Testing (Selenium)', bank: 1, status: 'Completed', day: -9, duration: 45 },
  { title: 'Python Screening Test', bank: 2, status: 'Completed', day: -6, duration: 45 },
  { title: 'Java OOPs Evaluation', bank: 3, status: 'Completed', day: -3, duration: 60 },
  { title: 'Frontend Live Assessment', bank: 4, status: 'Live', day: 0, duration: 90 },
  { title: 'Selenium Advanced Live Test', bank: 1, status: 'Live', day: 0, duration: 60 },
  { title: 'SQL Proficiency Test', bank: 5, status: 'Scheduled', day: 2, duration: 40 },
  { title: 'DevOps Fundamentals', bank: 6, status: 'Scheduled', day: 4, duration: 50 },
  { title: 'Python Advanced Round', bank: 2, status: 'Scheduled', day: 7, duration: 60 },
];

export const seedCandidates = NAMES.map((name, i) => {
  const status = rand() < 0.75 ? 'Active' : 'Inactive';
  const warnings = rand() < 0.4 ? 0 : between(1, 5);
  return {
    id: `CND-${1001 + i}`,
    name,
    email: name.toLowerCase().replace(/\s+/g, '.') + '@example.com',
    department: DEPARTMENTS[i % DEPARTMENTS.length],
    status,
    online: status === 'Active' && rand() < 0.55,
    warnings,
    cheatingFlags: warnings >= 4 ? between(1, 2) : warnings === 3 && rand() < 0.3 ? 1 : 0,
    assignedExams: [],
    lastActive: minutesAgo(between(1, 60 * 48)),
  };
});

export const seedExams = EXAM_DEFS.map((e, i) => {
  const assigned = seedCandidates
    .filter(() => rand() < 0.4)
    .map((c) => c.id);
  assigned.forEach((cid) => {
    const c = seedCandidates.find((x) => x.id === cid);
    c.assignedExams.push(`EX-${201 + i}`);
  });
  return {
    id: `EX-${201 + i}`,
    title: e.title,
    bankId: seedQuestionBanks[e.bank].id,
    status: e.status,
    // Live exams start relative to the real clock so they are mid-session on load.
    startTime:
      e.status === 'Live'
        ? new Date(Date.now() - (18 + i * 6) * 60000).toISOString()
        : daysFromNow(e.day, 10 + (i % 4)),
    duration: e.duration,
    passMark: 60,
    candidates: assigned,
  };
});

// ---------------------------------------------------------------------------
// Results (one per candidate per completed exam)
// ---------------------------------------------------------------------------
export const seedResults = [];
seedExams
  .filter((e) => e.status === 'Completed')
  .forEach((exam) => {
    const bank = seedQuestionBanks.find((b) => b.id === exam.bankId);
    exam.candidates.forEach((cid) => {
      const score = between(28, 99);
      const total = bank.questions.length;
      seedResults.push({
        id: `RS-${3001 + seedResults.length}`,
        candidateId: cid,
        examId: exam.id,
        score,
        correct: Math.round((score / 100) * total),
        total,
        timeTaken: between(Math.round(exam.duration * 0.4), exam.duration),
        submittedAt: new Date(new Date(exam.startTime).getTime() + exam.duration * 60000).toISOString(),
        result: score >= exam.passMark ? 'Pass' : 'Fail',
      });
    });
  });

// ---------------------------------------------------------------------------
// Feedback (organization -> candidate)
// ---------------------------------------------------------------------------
const FEEDBACK_TEXT = {
  Pass: [
    'Great performance! Strong understanding of core concepts. Keep it up.',
    'Well done. Your answers showed clear practical knowledge.',
    'Excellent result. You have been shortlisted for the next round.',
  ],
  Fail: [
    'Please revisit the fundamentals and attempt the re-test next week.',
    'Good effort, but several core topics need more practice.',
    'Time management needs improvement. We recommend practising mock tests.',
  ],
};
export const seedFeedback = seedResults
  .filter(() => rand() < 0.45)
  .map((r, i) => ({
    id: `FB-${4001 + i}`,
    candidateId: r.candidateId,
    examId: r.examId,
    rating: r.result === 'Pass' ? between(4, 5) : between(2, 3),
    message: pick(FEEDBACK_TEXT[r.result]),
    sentBy: 'Exam Administrator',
    sentAt: r.submittedAt,
  }));

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------
const EVENTS = {
  Normal: [
    'Logged in', 'Started exam', 'Submitted exam', 'Answered question', 'Navigated to next question',
    'Webcam connected', 'Microphone check passed', 'Logged out',
  ],
  Warning: [
    'Tab switch detected', 'Face not visible', 'Multiple faces detected', 'Window lost focus',
    'Background voice detected', 'Copy/paste attempt blocked', 'Exited full screen',
  ],
  Validation: [
    'ID verification passed', 'Face match verified', 'Room scan completed',
    'System compatibility check passed', 'ID verification failed', 'Browser lockdown verified',
  ],
};
export const seedAuditLogs = [];
seedCandidates.forEach((c) => {
  const count = between(4, 9);
  for (let k = 0; k < count; k++) {
    const roll = rand();
    const type = roll < 0.55 ? 'Normal' : roll < 0.8 ? 'Validation' : 'Warning';
    seedAuditLogs.push({
      id: `LOG-${5001 + seedAuditLogs.length}`,
      candidateId: c.id,
      type,
      event: pick(EVENTS[type]),
      examId: c.assignedExams.length ? pick(c.assignedExams) : null,
      timestamp: minutesAgo(between(1, 60 * 72)),
      ip: `10.0.${between(0, 20)}.${between(2, 250)}`,
    });
  }
});
seedAuditLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

// ---------------------------------------------------------------------------
// Organization settings
// ---------------------------------------------------------------------------
export const seedSettings = {
  organization: {
    name: 'Acme Talent Assessments',
    companyUrl: 'https://www.acme-assessments.example',
    logoUrl:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%232563eb'/%3E%3Cpath d='M32 14l16 6v12c0 10-7 16-16 19-9-3-16-9-16-19V20z' fill='white'/%3E%3Cpath d='M26 32l5 5 9-10' stroke='%232563eb' stroke-width='4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E",
    supportEmail: 'support@acme-assessments.example',
    timezone: 'Asia/Kolkata',
  },
  exam: {
    defaultDuration: 60,
    passMark: 60,
    maxAttempts: 1,
    shuffleQuestions: true,
    shuffleOptions: true,
    showResultsToCandidate: false,
    negativeMarking: false,
  },
  security: {
    webcamRequired: true,
    microphoneRequired: true,
    screenRecording: true,
    browserLockdown: true,
    idVerification: true,
    maxWarningsBeforeFlag: 3,
    autoSubmitOnFlag: false,
  },
  notifications: {
    emailOnExamScheduled: true,
    emailOnResultPublished: true,
    alertOnCheatingFlag: true,
    dailySummary: false,
    reminderHoursBefore: 24,
  },
};
