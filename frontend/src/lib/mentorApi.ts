import api from '@/lib/api';

// ─── Shared classroom shapes ────────────────────────────────────────────────

export type WorkType = 'dsa_problems' | 'dsa_pattern' | 'lab_subject' | 'mock_interview' | 'resume' | 'quiz' | 'task';
export type WorkStatus = 'assigned' | 'in_progress' | 'done' | 'late' | 'missing' | 'returned' | 'returned_late';

export interface Classroom {
  id: string;
  name: string;
  section: string;
  subject: string;
  description: string;
  theme: number;
  archived: boolean;
  createdAt: string;
  // Mentor only
  code?: string;
  joinOpen?: boolean;
}

export interface QuizQuestion {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface Assignment {
  id: string;
  type: WorkType;
  typeLabel: string;
  auto: boolean;
  title: string;
  instructions: string;
  target: {
    slugs: string[];
    problems: { slug: string; title: string; difficulty: string | null; pattern: string }[];
    pattern: string;
    patternName: string;
    level: number;
    subject: string;
    role: string;
    minScore: number;
  };
  summary: string;
  link: string | null;
  points: number;
  dueAt: string | null;
  createdAt: string;
  questionCount: number;
  questions?: QuizQuestion[];
}

export interface MySubmission {
  status: WorkStatus;
  progress: number;
  progressLabel: string;
  grade: number | null;
  feedback: string;
  text: string;
  link: string;
  turnedInAt: string | null;
  completedAt: string | null;
  score: number | null;
  returnedAt: string | null;
}

export interface PostComment {
  id: string;
  authorType: 'mentor' | 'student';
  authorName: string;
  mine: boolean;
  text: string;
  at: string;
}

export interface ClassPost {
  id: string;
  kind: 'announcement' | 'question' | 'assignment';
  authorType: 'mentor' | 'student';
  authorName: string;
  mine: boolean;
  text: string;
  assignmentId: string | null;
  pinned: boolean;
  createdAt: string;
  comments: PostComment[];
}

export interface LeaderRow {
  candidateId: string;
  name: string;
  points: number;
  onTime: number;
  finished: number;
  rank: number;
  me?: boolean;
}

// ─── Mentor ─────────────────────────────────────────────────────────────────

export interface Mentor {
  id: string;
  name: string;
  department: string;
  email: string;
}

export interface MenteeFlag {
  code: 'inactive' | 'overdue' | 'forecast' | 'mistakes' | 'low_scores';
  label: string;
}

export interface MenteeSummary {
  candidateId: string;
  name: string;
  email: string;
  branch: string;
  semester: number;
  year: number;
  stage: string;
  goal: { type: string; targetRole: string };
  planPercent: number;
  overdue: number;
  nextMilestone: string | null;
  lastActiveAt: string;
  daysInactive: number;
  readiness: number;
  projected: number | null;
  target: { date: string; label: string; weeksLeft: number };
  dsa: { mastered: number; dueReviews: number };
  topMistake: { type: string; label: string; count: number } | null;
  flags: MenteeFlag[];
  risk: 'high' | 'medium' | 'low';
}

export interface MenteeDetail {
  summary: MenteeSummary | null;
  name?: string;
  message?: string;
  upcoming?: { id: string; title: string; dueAt: string; overdue: boolean; status: string; origin: string }[];
  changeLog?: { at: string; trigger: string; summary: string }[];
  skills?: { name: string; level: number; evidenceCount: number }[];
  mistakes?: { title: string; kind: string; type: string; explanation: string; at: string }[];
  exams?: { title: string; startAt: string; endAt: string }[];
  classwork?: { title: string; status: WorkStatus; grade: number | null; points: number; progressLabel: string }[];
}

export interface MentorClassCard extends Classroom {
  students: number;
  classwork: number;
  toReview: number;
}

export interface MentorWork extends Assignment {
  counts: { total: number; done: number; missing: number; inProgress: number; toReview: number };
}

export interface ClassStudent {
  candidateId: string;
  name: string;
  email: string;
  joinedAt: string;
  hasJourney: boolean;
  summary: MenteeSummary | null;
  classwork: { done: number; missing: number; total: number };
}

export interface MentorClassDetail {
  classroom: Classroom;
  posts: ClassPost[];
  classwork: MentorWork[];
  students: ClassStudent[];
  leaderboard: LeaderRow[];
}

export interface SubmissionRow extends MySubmission {
  candidateId: string;
  name: string;
  answers: number[];
}

export interface GradingView {
  classroom: Classroom;
  assignment: MentorWork & { lastNudgedAt: string | null };
  submissions: SubmissionRow[];
  questionStats: { index: number; prompt: string; correct: number; answered: number }[];
}

export interface AssignmentDraft {
  type: WorkType;
  title: string;
  instructions?: string;
  target?: Partial<{ slugs: string[]; pattern: string; level: number; subject: string; role: string; minScore: number }>;
  questions?: QuizQuestion[];
  points?: number;
  dueAt?: string | null;
  dueInDays?: number;
}

export interface Suggestion {
  id: string;
  kind: 'assignment' | 'announcement';
  title: string;
  reason: string;
  draft: AssignmentDraft & { text?: string };
}

export interface ClassInsights {
  overview: { students: number; withJourney: number; readiness: number; completion: number | null; atRisk: number; inactive: number; interviewedRecently: number };
  patterns: { key: string; name: string; average: number; mastered: number }[];
  weakestPatterns: { key: string; name: string; average: number; mastered: number }[];
  mistakes: { type: string; label: string; count: number; students: number }[];
  subjects: { name: string; average: number; students: number }[];
  classwork: { id: string; title: string; type: WorkType; dueAt: string | null; done: number; late: number; missing: number; total: number }[];
  atRisk: { candidateId: string; name: string; risk: 'high' | 'medium'; flags: string[] }[];
  suggestions: Suggestion[];
}

export interface Catalog {
  patterns: { key: string; name: string; problems: { slug: string; title: string; difficulty: string }[] }[];
  problemCount: number;
  subjects: string[];
}

const auth = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function getMentorMe(token: string | null) {
  return (await api.get<{ mentor: Mentor | null; accountRole: string; demoEnabled: boolean }>('/mentor/me', auth(token))).data;
}

export async function registerMentor(token: string | null, body: { name: string; department: string; convert?: boolean }) {
  return (await api.post<{ mentor: Mentor }>('/mentor/register', body, auth(token))).data.mentor;
}

export async function updateMentorMe(token: string | null, body: { name?: string; department?: string }) {
  return (await api.patch<{ mentor: Mentor }>('/mentor/me', body, auth(token))).data.mentor;
}

export async function listMentorClasses(token: string | null) {
  return (await api.get<{ mentor: Mentor; demoEnabled: boolean; classes: MentorClassCard[] }>('/mentor/classes', auth(token))).data;
}

export async function createClass(token: string | null, body: Partial<Classroom>) {
  return (await api.post<{ classroom: Classroom }>('/mentor/classes', body, auth(token))).data.classroom;
}

export async function updateClass(token: string | null, id: string, body: Partial<Classroom>) {
  return (await api.patch<{ classroom: Classroom }>(`/mentor/classes/${id}`, body, auth(token))).data.classroom;
}

export async function deleteClass(token: string | null, id: string) {
  return (await api.delete(`/mentor/classes/${id}`, auth(token))).data;
}

export async function resetClassCode(token: string | null, id: string) {
  return (await api.post<{ code: string }>(`/mentor/classes/${id}/code`, {}, auth(token))).data.code;
}

export async function getMentorClass(token: string | null, id: string) {
  return (await api.get<MentorClassDetail>(`/mentor/classes/${id}`, { ...auth(token), timeout: 60000 })).data;
}

export async function getClassInsights(token: string | null, id: string) {
  return (await api.get<{ insights: ClassInsights }>(`/mentor/classes/${id}/insights`, { ...auth(token), timeout: 60000 })).data.insights;
}

export async function removeStudent(token: string | null, id: string, candidateId: string) {
  return (await api.delete(`/mentor/classes/${id}/members/${candidateId}`, auth(token))).data;
}

export async function mentorPost(token: string | null, id: string, body: { text: string; pinned?: boolean }) {
  return (await api.post<{ post: ClassPost }>(`/mentor/classes/${id}/posts`, body, auth(token))).data.post;
}

export async function mentorPinPost(token: string | null, id: string, postId: string, pinned: boolean) {
  return (await api.patch<{ post: ClassPost }>(`/mentor/classes/${id}/posts/${postId}`, { pinned }, auth(token))).data.post;
}

export async function mentorDeletePost(token: string | null, id: string, postId: string) {
  return (await api.delete(`/mentor/classes/${id}/posts/${postId}`, auth(token))).data;
}

export async function mentorComment(token: string | null, id: string, postId: string, text: string) {
  return (await api.post<{ post: ClassPost }>(`/mentor/classes/${id}/posts/${postId}/comments`, { text }, auth(token))).data.post;
}

export async function createAssignment(token: string | null, id: string, body: AssignmentDraft) {
  return (await api.post<{ assignment: Assignment }>(`/mentor/classes/${id}/assignments`, body, { ...auth(token), timeout: 60000 })).data.assignment;
}

export async function updateAssignment(token: string | null, id: string, assignmentId: string, body: AssignmentDraft) {
  return (await api.patch<{ assignment: Assignment }>(`/mentor/classes/${id}/assignments/${assignmentId}`, body, auth(token))).data.assignment;
}

export async function deleteAssignment(token: string | null, id: string, assignmentId: string) {
  return (await api.delete(`/mentor/classes/${id}/assignments/${assignmentId}`, auth(token))).data;
}

export async function getGrading(token: string | null, id: string, assignmentId: string) {
  return (await api.get<GradingView>(`/mentor/classes/${id}/assignments/${assignmentId}`, { ...auth(token), timeout: 60000 })).data;
}

export async function gradeSubmission(token: string | null, id: string, assignmentId: string, candidateId: string, body: { grade?: number | null; feedback?: string }) {
  return (await api.put<{ submission: MySubmission }>(`/mentor/classes/${id}/assignments/${assignmentId}/submissions/${candidateId}`, body, auth(token))).data.submission;
}

export async function nudgeClass(token: string | null, id: string, assignmentId: string) {
  return (await api.post<{ reminded: number }>(`/mentor/classes/${id}/assignments/${assignmentId}/nudge`, {}, auth(token))).data.reminded;
}

export async function draftQuiz(token: string | null, id: string, body: { topic: string; count: number; level: string }) {
  return (await api.post<{ questions: QuizQuestion[] }>(`/mentor/classes/${id}/quiz-draft`, body, { ...auth(token), timeout: 90000 })).data.questions;
}

export async function getCatalog(token: string | null) {
  return (await api.get<Catalog>('/mentor/catalog', auth(token))).data;
}

export async function getStudent(token: string | null, candidateId: string) {
  return (await api.get<MenteeDetail>(`/mentor/students/${candidateId}`, auth(token))).data;
}

export async function sendMentorNote(token: string | null, candidateId: string, text: string) {
  return (await api.post(`/mentor/students/${candidateId}/note`, { text }, auth(token))).data;
}

export async function createDemoClass(token: string | null) {
  return (await api.post<{ classroom: Classroom }>('/mentor/demo-class', {}, { ...auth(token), timeout: 120000 })).data.classroom;
}

// ─── Student ────────────────────────────────────────────────────────────────

export interface StudentClassCard extends Classroom {
  mentorName: string;
  pending: number;
  missing: number;
  next: { id: string; title: string; dueAt: string | null; overdue: boolean } | null;
}

export interface StudentWork extends Assignment {
  mine: MySubmission;
}

export interface StudentClassDetail {
  classroom: Classroom;
  mentor: { name: string; department: string } | null;
  posts: ClassPost[];
  classwork: StudentWork[];
  people: { name: string; me: boolean }[];
  leaderboard: LeaderRow[];
}

export interface StudentQuestion {
  index: number;
  prompt: string;
  options: string[];
  answerIndex?: number;
  explanation?: string;
  chosen?: number | null;
}

export async function listMyClasses(token: string | null) {
  return (await api.get<{ classes: StudentClassCard[] }>('/classes', auth(token))).data.classes;
}

export async function joinClass(token: string | null, code: string) {
  return (await api.post<{ classId: string; alreadyJoined: boolean }>('/classes/join', { code }, auth(token))).data;
}

export async function getMyClass(token: string | null, id: string) {
  return (await api.get<StudentClassDetail>(`/classes/${id}`, auth(token))).data;
}

export async function leaveClass(token: string | null, id: string) {
  return (await api.delete(`/classes/${id}/membership`, auth(token))).data;
}

export async function studentPost(token: string | null, id: string, text: string) {
  return (await api.post<{ post: ClassPost }>(`/classes/${id}/posts`, { text }, auth(token))).data.post;
}

export async function studentDeletePost(token: string | null, id: string, postId: string) {
  return (await api.delete(`/classes/${id}/posts/${postId}`, auth(token))).data;
}

export async function studentComment(token: string | null, id: string, postId: string, text: string) {
  return (await api.post<{ post: ClassPost }>(`/classes/${id}/posts/${postId}/comments`, { text }, auth(token))).data.post;
}

export async function getMyWork(token: string | null, id: string, assignmentId: string) {
  return (await api.get<{ assignment: Assignment; mine: MySubmission; questions: StudentQuestion[] }>(`/classes/${id}/assignments/${assignmentId}`, auth(token))).data;
}

export async function submitWork(token: string | null, id: string, assignmentId: string, body: { text?: string; link?: string; answers?: number[] }) {
  return (await api.post<{ mine: MySubmission; questions: StudentQuestion[] }>(`/classes/${id}/assignments/${assignmentId}/submit`, body, auth(token))).data;
}

export async function unsubmitWork(token: string | null, id: string, assignmentId: string) {
  return (await api.post<{ mine: MySubmission }>(`/classes/${id}/assignments/${assignmentId}/unsubmit`, {}, auth(token))).data.mine;
}
