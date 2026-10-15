// Time helpers for the four-year journey. Everything that asks "what semester is
// it for this student?" goes through here, so the demo fast-forward stays consistent.

const DAY_MS = 24 * 60 * 60 * 1000;
const SEMESTER_MONTHS = 6;
const TOTAL_SEMESTERS = 8;

// How the platform and the companion behave in each year
const STAGES = {
  1: {
    year: 1,
    name: 'Explore',
    focus: 'Find your direction, build strong foundations and a steady study habit.',
    companionStyle:
      'Be a friendly senior. Encourage curiosity, explain options in the branch, keep pressure low, and build habits before ambition.',
  },
  2: {
    year: 2,
    name: 'Build',
    focus: 'Go deep on core subjects and ship real projects.',
    companionStyle:
      'Be a coach. Push for depth over breadth, ask what they built this week, and steer them to one direction instead of many.',
  },
  3: {
    year: 3,
    name: 'Prove',
    focus: 'Turn skills into proof: internships, a resume backed by evidence, first interviews.',
    companionStyle:
      'Be a mentor preparing them for selection. Be direct about gaps, use their scores, and tie every task to internships and interviews.',
  },
  4: {
    year: 4,
    name: 'Land',
    focus: 'Placements and next steps: mock interviews, applications and offers.',
    companionStyle:
      'Be a placement strategist. Be brisk and specific, prioritise ruthlessly, track applications and interview readiness, and calm nerves.',
  },
};

function journeyNow(profile) {
  return new Date(Date.now() + (Number(profile.clockOffsetDays) || 0) * DAY_MS);
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * DAY_MS);
}

function monthsBetween(from, to) {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return to.getDate() < from.getDate() ? months - 1 : months;
}

function currentSemester(profile, now = journeyNow(profile)) {
  const elapsed = Math.max(0, monthsBetween(new Date(profile.setupAt), now));
  return Math.min(TOTAL_SEMESTERS, profile.semesterAtSetup + Math.floor(elapsed / SEMESTER_MONTHS));
}

function yearOfSemester(semester) {
  return Math.min(4, Math.max(1, Math.ceil(semester / 2)));
}

function stageFor(year) {
  return STAGES[Math.min(4, Math.max(1, year))];
}

function semesterStart(profile, semester) {
  return addMonths(new Date(profile.setupAt), (semester - profile.semesterAtSetup) * SEMESTER_MONTHS);
}

// Month 1-6 inside a semester -> calendar date for this student
function dueDate(profile, semester, monthInSemester) {
  const month = Math.min(SEMESTER_MONTHS, Math.max(1, Number(monthInSemester) || 3));
  return addMonths(semesterStart(profile, semester), month);
}

module.exports = {
  DAY_MS,
  SEMESTER_MONTHS,
  TOTAL_SEMESTERS,
  STAGES,
  journeyNow,
  addMonths,
  addDays,
  monthsBetween,
  currentSemester,
  yearOfSemester,
  stageFor,
  semesterStart,
  dueDate,
};
