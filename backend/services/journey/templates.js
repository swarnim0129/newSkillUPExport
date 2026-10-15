// Built-in four-year plan. Used when the AI planner is unavailable, and as the
// shape the AI planner is asked to follow. Branch-neutral: subject names come
// from a small per-branch table, everything else is shared.

const { TOTAL_SEMESTERS } = require('./clock');

const FAMILIES = {
  software: {
    foundation: ['Programming fundamentals', 'Data structures and algorithms'],
    core: ['Database management systems', 'Operating systems', 'Computer networks'],
    tool: 'Git and GitHub',
    project: 'a full-stack web application',
    advanced: 'System design basics',
    role: 'Software Engineer',
  },
  electronics: {
    foundation: ['Circuit analysis', 'Digital electronics'],
    core: ['Signals and systems', 'Microcontrollers and embedded C', 'Communication systems'],
    tool: 'MATLAB and circuit simulation',
    project: 'an embedded or IoT prototype',
    advanced: 'VLSI design basics',
    role: 'Embedded Systems Engineer',
  },
  electrical: {
    foundation: ['Circuit theory', 'Electrical machines'],
    core: ['Power systems', 'Control systems', 'Power electronics'],
    tool: 'MATLAB and Simulink',
    project: 'a power or control system model',
    advanced: 'Renewable energy systems',
    role: 'Electrical Engineer',
  },
  mechanical: {
    foundation: ['Engineering mechanics', 'Engineering drawing'],
    core: ['Thermodynamics', 'Strength of materials', 'Machine design'],
    tool: 'CAD with SolidWorks or AutoCAD',
    project: 'a designed and simulated mechanical component',
    advanced: 'Finite element analysis basics',
    role: 'Design Engineer',
  },
  civil: {
    foundation: ['Engineering mechanics', 'Surveying'],
    core: ['Structural analysis', 'Geotechnical engineering', 'Concrete technology'],
    tool: 'AutoCAD and STAAD Pro',
    project: 'a structural design for a small building',
    advanced: 'Construction project management',
    role: 'Site Engineer',
  },
  chemical: {
    foundation: ['Material and energy balances', 'Fluid mechanics'],
    core: ['Heat transfer', 'Mass transfer', 'Chemical reaction engineering'],
    tool: 'Process simulation with DWSIM or Aspen',
    project: 'a simulated process plant unit',
    advanced: 'Process control',
    role: 'Process Engineer',
  },
};

function branchFamily(branch) {
  const b = String(branch || '').toLowerCase();
  if (/(computer|cse|\bcs\b|information tech|\bit\b|software|data science|artificial|\bai\b|machine learning)/.test(b)) return 'software';
  if (/(electronic|ece|entc|e&tc|telecom|instrument)/.test(b)) return 'electronics';
  if (/(electrical|eee)/.test(b)) return 'electrical';
  if (/(mech|automobile|production|aero)/.test(b)) return 'mechanical';
  if (/(civil|structur)/.test(b)) return 'civil';
  if (/(chem|biotech|bio)/.test(b)) return 'chemical';
  return 'general';
}

function subjectsFor(branch) {
  const family = branchFamily(branch);
  if (FAMILIES[family]) return FAMILIES[family];
  const name = String(branch || 'your branch').trim();
  return {
    foundation: [`Fundamentals of ${name}`, `Core first-year subjects of ${name}`],
    core: [`Core subject 1 of ${name}`, `Core subject 2 of ${name}`, `Core subject 3 of ${name}`],
    tool: `The main software tool used in ${name}`,
    project: `a small ${name} project`,
    advanced: `An advanced topic in ${name}`,
    role: `${name} Engineer`,
  };
}

// What changes with the goal, from third year onward
function goalTrack(goalType, role) {
  switch (goalType) {
    case 'higher_studies':
      return {
        sem5: { title: 'Choose your exam and map its syllabus', description: 'Decide between GATE, GRE or another entrance exam and lay the syllabus against your remaining semesters.', tool: 'companion', toolTopic: '' },
        sem6: { title: 'Finish the first full pass of the exam syllabus', description: 'Cover every subject once before final year begins.', tool: 'roadmap', toolTopic: 'GATE exam preparation' },
        sem7: [
          { title: 'Weekly full-length mock tests', description: 'Sit one timed mock each week and review every wrong answer.', tool: 'flashcards', toolTopic: 'Exam revision', category: 'academics' },
          { title: 'Shortlist colleges and prepare your statement of purpose', description: 'Pick target, match and safe options and draft your statement.', tool: 'companion', toolTopic: '', category: 'career' },
        ],
        sem8: { title: 'Submit applications and prepare for interviews', description: 'Send applications on time and practise admission interviews.', tool: 'mock_interview', toolTopic: 'Admission interview' },
      };
    case 'govt_exam':
      return {
        sem5: { title: 'Pick your exam and map its syllabus', description: 'Choose the government or public sector exam you are aiming for and plan the syllabus.', tool: 'companion', toolTopic: '' },
        sem6: { title: 'Build aptitude and general studies basics', description: 'Start quantitative aptitude, reasoning and general awareness alongside technical subjects.', tool: 'roadmap', toolTopic: 'Quantitative aptitude and reasoning' },
        sem7: [
          { title: 'Weekly timed mock tests', description: 'Sit one timed paper each week and track your score.', tool: 'flashcards', toolTopic: 'Exam revision', category: 'academics' },
          { title: 'Revise technical subjects for the exam', description: 'Second pass of the technical syllabus with short notes.', tool: 'flashcards', toolTopic: 'Technical revision', category: 'academics' },
        ],
        sem8: { title: 'Final revision and interview preparation', description: 'Finish revision and practise the personal interview round.', tool: 'mock_interview', toolTopic: 'Public sector interview' },
      };
    case 'startup':
      return {
        sem5: { title: 'Find a problem worth solving', description: 'Talk to ten people who have the problem and write down what you learn.', tool: 'companion', toolTopic: '' },
        sem6: { title: 'Build and ship a first version', description: 'Get a working first version in front of real users.', tool: 'roadmap', toolTopic: 'Building a minimum viable product' },
        sem7: [
          { title: 'Get your first ten users', description: 'Find ten people who use your product without being asked twice.', tool: 'companion', toolTopic: '', category: 'projects' },
          { title: 'Keep a job option open', description: 'Maintain a resume and interview readiness as a fallback.', tool: 'resume_builder', toolTopic: '', category: 'career', priority: 'stretch' },
        ],
        sem8: { title: 'Decide: continue full time or take a role', description: 'Review traction honestly with your companion and choose.', tool: 'companion', toolTopic: '' },
      };
    default:
      return {
        sem5: { title: 'Aptitude and reasoning practice', description: 'Most placement drives start with an aptitude round. Build speed early.', tool: 'practice', toolTopic: 'Quantitative aptitude' },
        sem6: { title: 'Apply for summer internships', description: 'Shortlist companies, tailor your resume and apply to at least fifteen.', tool: 'companion', toolTopic: '' },
        sem7: [
          { title: `Technical interview practice for ${role}`, description: 'Take a technical mock interview and fix what the feedback flags.', tool: 'mock_interview', toolTopic: role, category: 'placement' },
          { title: 'Apply to your target companies', description: 'Track every application and follow up.', tool: 'none', toolTopic: '', category: 'placement' },
        ],
        sem8: { title: 'Compare offers and plan your first ninety days', description: 'Weigh offers with your companion and prepare for joining.', tool: 'companion', toolTopic: '' },
      };
  }
}

// Which DSA pattern to master when: [semester, month, pattern key, pattern name]
const DSA_SCHEDULE = [
  [1, 5, 'arrays_hashing', 'Arrays and Hashing'],
  [2, 2, 'two_pointers', 'Two Pointers'],
  [2, 4, 'stack', 'Stack'],
  [2, 6, 'binary_search', 'Binary Search'],
  [3, 3, 'sliding_window', 'Sliding Window'],
  [3, 5, 'linked_list', 'Linked List'],
  [3, 6, 'recursion_backtracking', 'Recursion and Backtracking'],
  [4, 3, 'trees', 'Trees'],
  [4, 5, 'greedy', 'Greedy'],
  [4, 6, 'dp_1d', '1-D Dynamic Programming'],
  [5, 3, 'graphs', 'Graphs'],
  [5, 4, 'heaps', 'Heaps'],
  [5, 6, 'intervals', 'Intervals'],
  [6, 2, 'dp_2d', '2-D Dynamic Programming'],
  [6, 4, 'bit_manipulation', 'Bit Manipulation'],
];

function draft(semester, month, title, description, category, tool, toolTopic, priority = 'core') {
  return { semester, month, title, description, category, tool, toolTopic: toolTopic || '', priority };
}

/**
 * Build milestone drafts from `fromSemester` to the final semester.
 */
function buildTemplatePlan(profile, fromSemester = 1) {
  const branch = profile.branch;
  const s = subjectsFor(branch);
  const goalType = (profile.goal && profile.goal.type) || 'undecided';
  const role = (profile.goal && profile.goal.targetRole) || s.role;
  const track = goalTrack(goalType, role);
  const isSoftware = branchFamily(branch) === 'software';

  const all = [
    // Year 1 — Explore
    draft(1, 1, `Explore what ${branch} can lead to`, 'Talk through the career paths open to your branch and note which ones interest you.', 'career', 'companion', ''),
    draft(1, 2, 'Set a weekly study routine', `Block ${profile.hoursPerWeek || 8} hours a week and keep it for one month.`, 'habits', 'none', ''),
    draft(1, 4, `Learn ${s.foundation[0]}`, 'Follow a guided roadmap and finish every topic in it.', 'academics', 'roadmap', s.foundation[0]),
    isSoftware
      ? draft(1, 5, 'Master Arrays and Hashing', 'Your first DSA pattern: solve its problems and keep them fresh with reviews.', 'skills', 'dsa', 'arrays_hashing')
      : draft(1, 5, 'Learn Python basics', 'Basic programming helps in every branch for analysis and automation.', 'skills', 'tutor', 'Python basics', 'stretch'),

    draft(2, 2, `Learn ${s.foundation[1]}`, 'Follow a guided roadmap and finish every topic in it.', 'academics', 'roadmap', s.foundation[1]),
    draft(2, 4, 'Revise this semester with flashcards', 'Turn your notes into flashcards and revise before exams.', 'academics', 'flashcards', 'Semester revision', 'stretch'),
    draft(2, 5, 'Build your first small project', 'Something small and finished beats something big and abandoned.', 'projects', 'none', ''),
    draft(2, 6, 'Pick a direction for second year', 'Review your first year with your companion and choose what to go deep on.', 'career', 'companion', ''),

    // Year 2 — Build
    draft(3, 2, `Learn ${s.core[0]}`, 'Go deep: finish the roadmap and test yourself.', 'academics', 'roadmap', s.core[0]),
    draft(3, 4, `Get comfortable with ${s.tool}`, 'Learn the tool your field uses every day.', 'skills', 'tutor', s.tool),
    draft(3, 6, 'Write your first resume', 'Even a thin resume shows you what is missing.', 'career', 'resume_builder', '', 'stretch'),

    draft(4, 2, `Learn ${s.core[1]}`, 'Go deep: finish the roadmap and test yourself.', 'academics', 'roadmap', s.core[1]),
    draft(4, 4, `Build ${s.project}`, 'A project you can explain end to end in an interview.', 'projects', 'none', ''),
    draft(4, 6, 'Get a baseline resume score', 'Analyse your resume to see where you stand before third year.', 'career', 'resume_analyzer', ''),

    // Year 3 — Prove
    draft(5, 2, `Learn ${s.core[2]}`, 'Finish the last core subject before interview season.', 'academics', 'roadmap', s.core[2]),
    draft(5, 3, track.sem5.title, track.sem5.description, 'career', track.sem5.tool, track.sem5.toolTopic),
    draft(5, 5, 'Take your first mock interview', 'Find out how you sound under pressure while there is time to improve.', 'career', 'mock_interview', role),
    draft(5, 6, 'Raise your resume score above 70', 'Fix what the analyzer flags and analyse again.', 'career', 'resume_analyzer', ''),

    draft(6, 2, `Learn ${s.advanced}`, 'One advanced topic that sets you apart.', 'skills', 'roadmap', s.advanced, 'stretch'),
    draft(6, 3, track.sem6.title, track.sem6.description, 'career', track.sem6.tool, track.sem6.toolTopic),
    draft(6, 5, 'Second project or internship work', 'Add proof of applied work to your resume.', 'projects', 'none', ''),

    // Year 4 — Land
    draft(7, 1, 'Finalise your resume', 'One page, evidence for every claim.', 'placement', 'resume_builder', ''),
    ...track.sem7.map((item, i) =>
      draft(7, 2 + i * 2, item.title, item.description, item.category || 'placement', item.tool, item.toolTopic, item.priority || 'core')
    ),
    draft(7, 5, 'Revise all core subjects', 'Quick-recall revision of everything interviewers ask.', 'academics', 'flashcards', 'Core subject revision'),

    draft(8, 2, 'Showcase your final-year project', 'Write it up so someone outside your college understands it.', 'projects', 'none', ''),
    draft(8, 4, track.sem8.title, track.sem8.description, 'placement', track.sem8.tool, track.sem8.toolTopic),
  ];

  // Software careers practise DSA pattern by pattern; other branches practise
  // their core subjects in the Practice Lab
  const softwareCareer = isSoftware || /software|developer|sde|programmer|data scien/i.test(role);
  if (softwareCareer) {
    DSA_SCHEDULE.forEach(([semester, month, key, name]) => {
      if (!(isSoftware && key === 'arrays_hashing')) {
        all.push(draft(semester, month, `Master ${name}`, 'Solve the pattern\'s problems; it completes when your level reaches 70.', 'skills', 'dsa', key));
      }
    });
  }
  if (!isSoftware) {
    [[3, 5, s.core[0]], [4, 5, s.core[1]], [5, 4, s.core[2]]].forEach(([semester, month, subject]) => {
      all.push(draft(semester, month, `Practise ${subject} problems`, 'Numerical and concept questions in the Practice Lab; completes at a score of 70.', 'academics', 'practice', subject));
    });
  }

  const start = Math.min(TOTAL_SEMESTERS, Math.max(1, fromSemester));
  return all
    .filter((m) => m.semester >= start)
    .sort((a, b) => a.semester - b.semester || a.month - b.month);
}

module.exports = { buildTemplatePlan, branchFamily, subjectsFor };
