import api from '@/lib/api';
import type { CompanionWidget, GoalType, PlanChange } from '@/lib/journeyApi';

const auth = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

// ─── What-if ────────────────────────────────────────────────────────────────

export interface WhatIfResult {
  readyLevel: number;
  current: { hoursPerWeek: number; goal: GoalType; readiness: number; pointsPerWeek: number };
  scenario: { hoursPerWeek: number; goal: GoalType; dsaPerWeek: number; readiness: number; pointsPerWeek: number };
  target: { date: string; label: string; week: number };
  readyWeek: { baseline: number | null; scenario: number | null };
  readyDate: { baseline: string | null; scenario: string | null };
  atTarget: { baseline: number; scenario: number };
  verdict: string;
  parts: { name: string; weight: number; value: number }[];
  points: { week: number; date: string; baseline: number; scenario: number }[];
  assumptions: string[];
}

export async function runWhatIf(token: string | null, body: { hoursPerWeek: number; goal: GoalType; dsaPerWeek: number }) {
  return (await api.post<{ result: WhatIfResult }>('/grow/what-if', body, auth(token))).data.result;
}

export async function applyWhatIf(token: string | null, hoursPerWeek: number) {
  return (await api.post('/grow/what-if/apply', { hoursPerWeek }, auth(token))).data;
}

// ─── Rival ──────────────────────────────────────────────────────────────────

export interface RivalResult {
  semester: number;
  goal: GoalType;
  source: 'peers' | 'benchmark';
  peers: number;
  ghostName: string;
  explanation: string;
  series: { semester: number; ghost: number; you: number | null }[];
  compare: { label: string; you: number; ghost: number; unit: string }[];
  ahead: number;
  message: string;
}

export async function getRival(token: string | null) {
  return (await api.get<{ result: RivalResult }>('/grow/rival', auth(token))).data.result;
}

// ─── Wellbeing ──────────────────────────────────────────────────────────────

export interface WellbeingResult {
  settings: { optIn: boolean; shareWithMentor: boolean; lastEasedAt: string | null };
  load: number;
  level: 'steady' | 'stretched' | 'overloaded';
  signals: { code: string; label: string }[];
  daily: { day: string; sessions: number; late: number }[];
  restDays: number;
  canEase: number;
  advice: string;
}

export async function getWellbeing(token: string | null) {
  return (await api.get<{ result: WellbeingResult }>('/grow/wellbeing', auth(token))).data.result;
}

export async function saveWellbeing(token: string | null, body: { optIn?: boolean; shareWithMentor?: boolean }) {
  return (await api.put<{ result: WellbeingResult }>('/grow/wellbeing', { ...body, tzOffsetMinutes: -new Date().getTimezoneOffset() }, auth(token))).data.result;
}

export async function easePlan(token: string | null) {
  return (await api.post<{ moved: number; result: WellbeingResult }>('/grow/wellbeing/ease', {}, auth(token))).data;
}

// ─── Mistake DNA ────────────────────────────────────────────────────────────

export interface DnaResult {
  total: number;
  recentTotal: number;
  axes: { type: string; label: string; recent: number; before: number; allTime: number; count: number }[];
  months: Record<string, string | number>[];
  types: { type: string; label: string }[];
  dominant: { type: string; label: string; share: number } | null;
  shifts: { tone: 'good' | 'warn'; text: string }[];
}

export async function getDna(token: string | null) {
  return (await api.get<{ result: DnaResult }>('/grow/dna', auth(token))).data.result;
}

// ─── Passport ───────────────────────────────────────────────────────────────

export interface PassportSettings {
  handle: string;
  enabled: boolean;
  headline: string;
  show: Record<'dsa' | 'subjects' | 'interviews' | 'resume' | 'classes' | 'journey', boolean>;
  views: number;
}

export interface PassportView {
  handle: string;
  name: string;
  headline: string;
  sections: {
    journey?: { branch: string; degree: string; college: string; semester: number; year: number; goal: GoalType; targetRole: string };
    dsa?: {
      solved: number;
      firstTryRate: number | null;
      averageHints: number | null;
      patterns: { key: string; name: string; level: number; status: string; solved: number; total: number }[];
      mastered: string[];
      recent: { title: string; pattern: string; difficulty: string | null; hints: number; at: string }[];
    };
    subjects?: { name: string; level: number; results: number; updatedAt: string }[];
    interviews?: { count: number; best: number | null; latest: number | null; trend: { at: string; score: number; role: string }[] };
    resume?: { best: number; at: string };
    classes?: { list: { name: string; mentor: string; department: string }[]; completed: number; onTime: number; averageGrade: number | null };
  };
  verification: { results: number; since: string; updatedAt: string; note: string };
}

export async function getMyPassport(token: string | null) {
  return (await api.get<{ settings: PassportSettings; preview: PassportView }>('/grow/passport', auth(token))).data;
}

export async function savePassport(token: string | null, body: Partial<Omit<PassportSettings, 'views'>>) {
  return (await api.put<{ settings: PassportSettings; preview: PassportView }>('/grow/passport', body, auth(token))).data;
}

export async function getPublicPassport(handle: string) {
  return (await api.get<{ passport: PassportView }>(`/public/passport/${encodeURIComponent(handle)}`)).data.passport;
}

// ─── Future Self ────────────────────────────────────────────────────────────

export interface FutureSelfReply {
  speech: string;
  widgets: CompanionWidget[];
  path: 'current' | 'improved';
  projection: { baseline: number; scenario: number; target: string };
  improved: { hoursPerWeek: number; dsaPerWeek: number };
}

export async function askFutureSelf(token: string | null, body: { message: string; path: 'current' | 'improved'; history: { role: 'user' | 'future'; text: string }[] }) {
  return (await api.post<FutureSelfReply>('/grow/future-self', body, { ...auth(token), timeout: 60000 })).data;
}

// ─── Voice calls ────────────────────────────────────────────────────────────

export async function getCompanionVoice(token: string | null) {
  return (await api.get<{ systemPrompt: string; firstMessage: string }>('/grow/voice/companion', auth(token))).data;
}

export async function saveCompanionVoice(token: string | null, transcript: { role: 'user' | 'assistant'; text: string }[], durationSec: number) {
  return (await api.post<{ message: import('@/lib/journeyApi').CompanionMessage | null; memory?: import('@/lib/journeyApi').MemoryFact[] }>('/grow/voice/companion/session', { transcript, durationSec }, { ...auth(token), timeout: 60000 })).data;
}

export async function getFutureVoice(token: string | null, path: 'current' | 'improved') {
  return (await api.get<{ systemPrompt: string; firstMessage: string; projection: FutureSelfReply['projection']; improved: FutureSelfReply['improved'] }>(`/grow/voice/future?path=${path}`, auth(token))).data;
}

// ─── Panic mode ─────────────────────────────────────────────────────────────

export interface SprintBlock {
  id: string;
  startAt: string;
  minutes: number;
  kind: 'learn' | 'practice' | 'review' | 'break' | 'sleep';
  title: string;
  topic: string;
  tip: string;
  done: boolean;
}

export interface Sprint {
  id: string;
  subject: string;
  examAt: string;
  hoursPerDay: number;
  topics: { name: string; confidence: number }[];
  generatedBy: 'ai' | 'template';
  active: boolean;
  createdAt: string;
  progress: { done: number; total: number };
  blocks: SprintBlock[];
}

export async function listSprints(token: string | null) {
  return (await api.get<{ sprints: Sprint[] }>('/grow/sprints', auth(token))).data.sprints;
}

export async function createSprint(token: string | null, body: { subject: string; examAt: string; hoursPerDay: number; topics: { name: string; confidence: number }[] }) {
  return (await api.post<{ sprint: Sprint; skipped: string[] }>('/grow/sprints', { ...body, tzOffsetMinutes: -new Date().getTimezoneOffset() }, { ...auth(token), timeout: 45000 })).data;
}

export async function toggleSprintBlock(token: string | null, id: string, blockId: string, done: boolean) {
  return (await api.patch<{ sprint: Sprint }>(`/grow/sprints/${id}/blocks/${blockId}`, { done }, auth(token))).data.sprint;
}

export async function deleteSprint(token: string | null, id: string) {
  return (await api.delete(`/grow/sprints/${id}`, auth(token))).data;
}

// ─── Snap & study ───────────────────────────────────────────────────────────

export interface SnapNote {
  id: string;
  title: string;
  subject: string;
  topics: string[];
  summary: string[];
  formulas: string[];
  questions: { prompt: string; options: string[]; answerIndex: number; explanation: string }[];
  flashcards: { front: string; back: string }[];
  fileName: string;
  addedToPlan: boolean;
  createdAt: string;
}

export async function listSnaps(token: string | null) {
  return (await api.get<{ snaps: SnapNote[] }>('/grow/snaps', auth(token))).data.snaps;
}

export async function createSnap(token: string | null, file: File) {
  const form = new FormData();
  form.append('file', file);
  return (await api.post<{ snap: SnapNote }>('/grow/snaps', form, { ...auth(token), timeout: 90000 })).data.snap;
}

export async function snapToPlan(token: string | null, id: string) {
  return (await api.post<{ added: boolean }>(`/grow/snaps/${id}/plan`, {}, auth(token))).data;
}

export async function deleteSnap(token: string | null, id: string) {
  return (await api.delete(`/grow/snaps/${id}`, auth(token))).data;
}

// ─── Squads ─────────────────────────────────────────────────────────────────

export interface SquadView {
  id: string;
  name: string;
  code: string;
  focus: string;
  fromClass: boolean;
  streak: number;
  flameToday: boolean;
  last14: { day: string; all: boolean; active: number }[];
  members: { candidateId: string; name: string; me: boolean; activeToday: boolean; streak: number; sessions14: number; weeklyXp: number }[];
}

export async function listSquads(token: string | null) {
  return (await api.get<{ squads: SquadView[] }>('/grow/squads', auth(token))).data.squads;
}

export async function createSquad(token: string | null, body: { name: string; focus?: string }) {
  return (await api.post<{ squad: SquadView }>('/grow/squads', body, auth(token))).data.squad;
}

export async function joinSquad(token: string | null, code: string) {
  return (await api.post<{ squad: SquadView }>('/grow/squads/join', { code }, auth(token))).data.squad;
}

export async function leaveSquad(token: string | null, id: string) {
  return (await api.delete(`/grow/squads/${id}/membership`, auth(token))).data;
}

export async function nudgeSquadmate(token: string | null, id: string, to: string) {
  return (await api.post(`/grow/squads/${id}/nudge`, { to }, auth(token))).data;
}

// ─── Interview replay ───────────────────────────────────────────────────────

export interface ReplayTurn {
  index: number;
  question: string;
  answer: string;
  at: string;
  score: number;
  tone: 'confident' | 'okay' | 'hesitant' | 'filler' | 'short';
  words: number;
  fillers: number;
  hedges: number;
  reasons: string[];
}

export interface ReplayView {
  interview: { id: string; role: string; seniority: string; category: string; topic: string; createdAt: string; feedback: { strengths?: string[]; weaknesses?: string[]; communication_score?: number; technical_score?: number } | null };
  turns: ReplayTurn[];
  summary: { answers: number; average: number | null; confident: number; fillers: number; weakest: ReplayTurn | null };
}

export async function listReplayInterviews(token: string | null) {
  return (await api.get<{ interviews: { id: string; role: string; seniority: string; category: string; topic: string; createdAt: string; score: number | null }[] }>('/grow/interviews', auth(token))).data.interviews;
}

export async function getReplay(token: string | null, id: string) {
  return (await api.get<ReplayView>(`/grow/interviews/${id}/replay`, auth(token))).data;
}

export async function getBetterAnswer(token: string | null, id: string, turn: number) {
  return (await api.post<{ better: { answer: string; changes: string[] } }>(`/grow/interviews/${id}/replay/${turn}/better`, {}, { ...auth(token), timeout: 60000 })).data.better;
}

export async function replayToPlan(token: string | null, id: string) {
  return (await api.post<{ added: boolean }>(`/grow/interviews/${id}/replay/practice`, {}, auth(token))).data;
}

// ─── Live battle (student) ──────────────────────────────────────────────────

export interface BattleState {
  id: string;
  title: string;
  status: 'lobby' | 'question' | 'reveal' | 'ended';
  current: number;
  total: number;
  secondsPerQuestion: number;
  timeLeft: number;
  players: number;
  joined?: boolean;
  question: { prompt: string; options: string[]; answerIndex?: number; explanation?: string } | null;
  answered: number;
  distribution: number[] | null;
  mine: { choice: number; correct?: boolean; points?: number } | null;
  me: { candidateId: string; name: string; points: number; correct: number; rank: number } | null;
  leaderboard: { candidateId: string; name: string; points: number; correct: number; rank: number }[];
}

export async function getStudentBattle(token: string | null, classId: string) {
  return (await api.get<{ battle: BattleState | null }>(`/classes/${classId}/battle`, auth(token))).data.battle;
}

export async function joinStudentBattle(token: string | null, classId: string) {
  return (await api.post<{ battle: BattleState }>(`/classes/${classId}/battle/join`, {}, auth(token))).data.battle;
}

export async function answerStudentBattle(token: string | null, classId: string, index: number, choice: number) {
  return (await api.post<{ battle: BattleState }>(`/classes/${classId}/battle/answer`, { index, choice }, auth(token))).data.battle;
}

// ─── Mentor extras ──────────────────────────────────────────────────────────

export async function getMentorBattle(token: string | null, classId: string) {
  return (await api.get<{ battle: BattleState | null }>(`/mentor/classes/${classId}/battle`, auth(token))).data.battle;
}

export async function createMentorBattle(token: string | null, classId: string, body: { title?: string; assignmentId?: string; questions?: { prompt: string; options: string[]; answerIndex: number; explanation?: string }[]; secondsPerQuestion: number }) {
  return (await api.post<{ battle: BattleState }>(`/mentor/classes/${classId}/battle`, body, auth(token))).data.battle;
}

export async function controlMentorBattle(token: string | null, classId: string, battleId: string, action: 'start' | 'reveal' | 'next' | 'end') {
  return (await api.post<{ battle: BattleState }>(`/mentor/classes/${classId}/battle/${battleId}/${action}`, {}, auth(token))).data.battle;
}

export async function getClassSquads(token: string | null, classId: string) {
  return (await api.get<{ squads: SquadView[] }>(`/mentor/classes/${classId}/squads`, auth(token))).data.squads;
}

export async function formClassSquads(token: string | null, classId: string, size: number) {
  return (await api.post<{ squads: SquadView[] }>(`/mentor/classes/${classId}/squads`, { size }, { ...auth(token), timeout: 60000 })).data.squads;
}

export interface SyllabusProposal {
  course: string;
  weeks: { week: number; title: string; subject: string; topics: string[] }[];
}

export async function readSyllabus(token: string | null, classId: string, file: File, weeks: number) {
  const form = new FormData();
  form.append('file', file);
  form.append('weeks', String(weeks));
  return (await api.post<{ proposal: SyllabusProposal }>(`/mentor/classes/${classId}/syllabus`, form, { ...auth(token), timeout: 90000 })).data.proposal;
}

export async function applySyllabus(token: string | null, classId: string, body: { startDate: string; minScore: number; weeks: SyllabusProposal['weeks'] }) {
  return (await api.post<{ created: number }>(`/mentor/classes/${classId}/syllabus/apply`, body, { ...auth(token), timeout: 60000 })).data;
}

export async function getClassDna(token: string | null, classId: string) {
  return (await api.get<{ result: DnaResult }>(`/mentor/classes/${classId}/dna`, auth(token))).data.result;
}

export type { PlanChange };
