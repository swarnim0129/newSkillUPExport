import axios from 'axios';
import api from '@/lib/api';

export type GoalType = 'placement' | 'higher_studies' | 'govt_exam' | 'startup' | 'undecided';
export type MilestoneStatus = 'pending' | 'in_progress' | 'done' | 'skipped';
export type MilestoneTool =
  | 'roadmap'
  | 'tutor'
  | 'flashcards'
  | 'resume_analyzer'
  | 'resume_builder'
  | 'mock_interview'
  | 'dsa'
  | 'practice'
  | 'classwork'
  | 'companion'
  | 'none';

export interface Milestone {
  _id: string;
  title: string;
  description: string;
  semester: number;
  category: string;
  tool: MilestoneTool;
  toolTopic: string;
  priority: 'core' | 'stretch';
  dueAt: string;
  status: MilestoneStatus;
  completedAt: string | null;
  origin: 'plan' | 'remedial' | 'companion' | 'replan' | 'mentor';
  reason: string;
}

export interface PlanChange {
  action: 'add' | 'remove' | 'move' | 'update' | 'complete' | 'skip' | 'mode';
  title: string;
  detail: string;
}

export interface ChangeLogEntry {
  at: string;
  trigger: 'setup' | 'evidence' | 'overdue' | 'goal_change' | 'new_year' | 'companion' | 'manual' | 'exam' | 'mistake' | 'mentor';
  summary: string;
  changes: PlanChange[];
}

export interface Skill {
  key: string;
  name: string;
  level: number;
  evidenceCount: number;
  lastScore: number | null;
}

export interface Stage {
  year: number;
  name: string;
  focus: string;
}

export interface MemoryFact {
  text: string;
  source: 'setup' | 'chat' | 'system';
  createdAt: string;
}

export interface Goal {
  type: GoalType;
  targetRole: string;
  note: string;
}

export interface Exam {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
}

export interface Journey {
  exams: Exam[];
  readiness: number | null;
  profile: {
    college: string;
    degree: string;
    branch: string;
    goal: Goal;
    hoursPerWeek: number;
    interests: string[];
    memory: MemoryFact[];
    clockOffsetDays: number;
  };
  now: string;
  semester: number;
  year: number;
  totalSemesters: number;
  stage: Stage;
  stages: Stage[];
  skills: Skill[];
  milestones: Milestone[];
  changeLog: ChangeLogEntry[];
  generatedBy: 'ai' | 'template';
  stats: { total: number; done: number; open: number; overdue: number; percent: number };
}

export interface DemoPersona {
  key: string;
  label: string;
}

export interface JourneyResponse {
  success: boolean;
  exists: boolean;
  demoEnabled: boolean;
  personas: DemoPersona[];
  journey?: Journey;
}

export interface SetupInput {
  branch: string;
  college: string;
  semester: number;
  goal: { type: GoalType; targetRole: string };
  hoursPerWeek: number;
  interests: string[];
}

export interface CompanionAction {
  type: 'plan_changed' | 'remembered' | 'goal_changed';
  summary: string;
}

export interface CompanionMessage {
  _id: string;
  role: 'user' | 'companion';
  kind: 'chat' | 'checkin' | 'welcome' | 'mentor' | 'voice';
  content: string;
  widgets?: CompanionWidget[];
  actions: CompanionAction[];
  createdAt: string;
}

export interface WidgetMilestone {
  id: string;
  title: string;
  dueAt: string;
  overdue: boolean;
  tool: MilestoneTool;
  toolTopic: string;
  origin: Milestone['origin'];
}

// Cards the companion chat renders (built on the server from real data or the AI's short JSON)
export type CompanionWidget =
  | { type: 'headline'; title: string; text: string }
  | { type: 'points'; title: string; style: 'bullets' | 'steps'; items: string[] }
  | { type: 'stats'; items: { label: string; value: string; hint: string }[] }
  | { type: 'milestones'; title: string; items: WidgetMilestone[] }
  | { type: 'alert'; tone: 'warn' | 'info' | 'good'; text: string }
  | { type: 'next'; title: string; text: string; tool: MilestoneTool; toolTopic: string }
  | { type: 'plan_changes'; items: PlanChange[] }
  | { type: 'transcript'; items: { role: 'user' | 'companion'; text: string }[] };

export interface ThreadResponse {
  success: boolean;
  messages: CompanionMessage[];
  stage: Stage;
  memory: MemoryFact[];
}

const auth = (token: string | null) => ({ headers: { Authorization: `Bearer ${token}` } });

/** Message to show the student when a request fails. */
export function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return fallback;
}

export function isNotSetUp(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

export async function getJourney(token: string | null) {
  return (await api.get<JourneyResponse>('/journey', auth(token))).data;
}

export async function setupJourney(token: string | null, input: SetupInput) {
  // Building the plan calls the AI planner, which can take a while
  return (await api.post<{ journey: Journey }>('/journey/setup', input, { ...auth(token), timeout: 90000 })).data.journey;
}

export async function setMilestoneStatus(token: string | null, id: string, status: MilestoneStatus) {
  return (await api.patch<{ journey: Journey }>(`/journey/milestones/${id}`, { status }, auth(token))).data.journey;
}

export async function rebuildPlan(token: string | null) {
  return (await api.post<{ journey: Journey }>('/journey/replan', {}, { ...auth(token), timeout: 90000 })).data.journey;
}

export async function demoAdvance(token: string | null, days: number) {
  return (await api.post<{ journey: Journey }>('/journey/demo/advance', { days }, auth(token))).data.journey;
}

export async function demoLoadPersona(token: string | null, key: string) {
  return (await api.post<{ journey: Journey }>('/journey/demo/persona', { key }, auth(token))).data.journey;
}

export async function getThread(token: string | null) {
  return (await api.get<ThreadResponse>('/journey/companion', auth(token))).data;
}

export async function sendMessage(token: string | null, message: string) {
  return (
    await api.post<{ messages: CompanionMessage[]; planChanged: boolean; memory: MemoryFact[] }>(
      '/journey/companion',
      { message },
      { ...auth(token), timeout: 90000 }
    )
  ).data;
}

export interface ForecastPart {
  name: string;
  weight: number;
  value: number;
}

export interface Forecast {
  readyLevel: number;
  now: number;
  parts: ForecastPart[];
  target: { date: string; label: string; weeksLeft: number };
  projectedAt: string;
  pace: number | null;
  projected: number | null;
  extraHoursPerWeek: number | null;
  verdict: string;
  history: { at: string; value: number }[];
}

export async function getForecast(token: string | null) {
  return (await api.get<{ forecast: Forecast }>('/journey/forecast', auth(token))).data.forecast;
}

export async function addExam(token: string | null, exam: { title: string; startAt: string; endAt: string }) {
  return (await api.post<{ journey: Journey; changes: PlanChange[] }>('/journey/exams', exam, auth(token))).data;
}

export async function removeExam(token: string | null, id: string) {
  return (await api.delete<{ journey: Journey }>(`/journey/exams/${id}`, auth(token))).data.journey;
}
