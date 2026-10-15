import api from '@/lib/api';

export type PatternStatus = 'mastered' | 'learning' | 'ready' | 'locked';
export type ProblemStatus = 'new' | 'tried' | 'solved' | 'due';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface PatternProblem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  status: ProblemStatus;
  nextReviewAt: string | null;
  score: number;
}

export interface Pattern {
  key: string;
  name: string;
  summary: string;
  needs: string[];
  needsNames: string[];
  level: number;
  solved: number;
  due: number;
  status: PatternStatus;
  tier: number;
  problems: PatternProblem[];
}

export interface Review {
  slug: string;
  title: string;
  pattern: string;
  patternName: string;
  dueSince: string;
  stage: number;
}

export interface JournalEntry {
  id: string;
  kind: 'dsa' | 'lab';
  ref: string;
  title: string;
  topic: string;
  type: string;
  label: string;
  explanation: string;
  fixHint: string;
  drillAdded: boolean;
  at: string;
}

export interface Journal {
  counts: { type: string; label: string; count: number }[];
  entries: JournalEntry[];
}

export interface DsaOverview {
  now: string;
  patterns: Pattern[];
  reviews: Review[];
  recommendation: { slug: string; title: string; reason: string } | null;
  stats: { solved: number; total: number; mastered: number; average: number };
  journal: Journal;
  thresholds: { mastered: number; unlock: number };
}

export type ArgKind = 'plain' | 'list_node' | 'tree';

export interface TestCase {
  args: unknown[];
  expected: unknown;
  kind?: 'hidden' | 'large';
}

export interface Problem {
  slug: string;
  title: string;
  pattern: string;
  patternName: string;
  difficulty: Difficulty;
  statement: string;
  constraints: string[];
  functionName: string;
  params: { name: string; type: string }[];
  spec: { functionName: string; argKinds: ArgKind[]; returnKind: ArgKind; compare: string };
  examples: TestCase[];
  hiddenCases: TestCase[];
  starterCode: string;
  complexity: string | null;
}

export interface ProblemProgress {
  solved: boolean;
  attempts: number;
  credit: number;
  due: boolean;
  nextReviewAt: string | null;
  reviewStage: number;
  hintLevel: number;
  hints: string[];
}

export interface ProblemResponse {
  problem: Problem;
  harness: string;
  progress: ProblemProgress;
  lastCode: string | null;
}

export interface SubmissionFailure {
  args: unknown[];
  expected: unknown;
  actual?: unknown;
  error?: string | null;
  kind: 'example' | 'hidden' | 'large';
}

export interface SubmissionResults {
  total: number;
  passedCount: number;
  failures: SubmissionFailure[];
  error?: string | null;
  timedOut?: boolean;
  timedOutKind?: 'example' | 'hidden' | 'large' | null;
}

export interface AttemptResponse {
  passed: boolean;
  credit: number;
  firstSolve: boolean;
  isReview: boolean;
  reviewChange: 'none' | 'scheduled' | 'advanced' | 'reset';
  nextReviewAt: string | null;
  reviewStage: number;
  pattern: { key: string; name: string; level: number };
  mistake: { type: string; label: string; explanation: string; fixHint: string; source: 'rule' | 'ai' } | null;
  drill: { title: string; reason: string } | null;
  complexity: string | null;
}

export interface LabSubject {
  subject: string;
  level: number | null;
  sets: number;
  lastScore: number | null;
  due: boolean;
  nextReviewAt: string | null;
  missedConcepts: string[];
  difficulty: Difficulty;
}

export interface LabQuestion {
  index: number;
  type: 'mcq' | 'numeric';
  question: string;
  options: string[];
  unit: string;
}

export interface LabSet {
  id: string;
  subject: string;
  difficulty: Difficulty;
  isReview: boolean;
  questions: LabQuestion[];
}

export interface LabResult {
  index: number;
  correct: boolean;
  given: number | string | null;
  correctAnswer: number;
  unit: string;
  explanation: string;
  concept: string;
}

const auth = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function getDsaOverview(token: string | null) {
  return (await api.get<DsaOverview>('/practice/dsa', auth(token))).data;
}

export async function getProblem(token: string | null, slug: string) {
  return (await api.get<ProblemResponse>(`/practice/dsa/problems/${slug}`, auth(token))).data;
}

export async function getHint(token: string | null, slug: string, code: string) {
  return (
    await api.post<{ level: number; hint: string | null; hints: string[]; exhausted?: boolean; creditIfSolvedNow?: number }>(
      `/practice/dsa/problems/${slug}/hint`,
      { code },
      { ...auth(token), timeout: 60000 }
    )
  ).data;
}

export async function submitAttempt(
  token: string | null,
  slug: string,
  body: { code: string; results: SubmissionResults; timeSpentSec: number }
) {
  return (await api.post<AttemptResponse>(`/practice/dsa/problems/${slug}/attempts`, body, { ...auth(token), timeout: 60000 })).data;
}

export async function getLab(token: string | null) {
  return (await api.get<{ branch: string; subjects: LabSubject[]; journal: Journal }>('/practice/lab', auth(token))).data;
}

export async function createLabSet(token: string | null, subject: string) {
  return (await api.post<{ set: LabSet }>('/practice/lab/sets', { subject }, { ...auth(token), timeout: 90000 })).data.set;
}

export async function submitLabSet(token: string | null, id: string, answers: (number | string | null)[]) {
  return (
    await api.post<{ score: number; passed: boolean; results: LabResult[]; nextReviewAt: string }>(
      `/practice/lab/sets/${id}/submit`,
      { answers },
      auth(token)
    )
  ).data;
}

export async function getJournal(token: string | null) {
  return (await api.get<Journal>('/practice/journal', auth(token))).data;
}
