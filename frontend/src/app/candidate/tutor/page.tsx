'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Trash2,
  Loader2,
  GraduationCap,
  Search,
  CheckCircle2,
  Circle,
  Code2,
  Terminal,
  Database,
  Network,
  Blocks,
  Brain,
  FlaskConical,
  Calculator,
  Globe,
  Cpu,
  Palette,
  PenTool,
  Layers,
  Lock,
  BarChart3,
  Zap,
} from 'lucide-react';
import { TutorSubjectData } from '@/lib/tutor-types';

// ─── Icon Map ───────────────────────────────────────────────────────────────
// Maps icon keys (from Gemini / DB) to lucide-react components
const ICON_MAP: Record<string, React.ReactNode> = {
  code: <Code2 className="w-5 h-5" />,
  terminal: <Terminal className="w-5 h-5" />,
  database: <Database className="w-5 h-5" />,
  network: <Network className="w-5 h-5" />,
  blocks: <Blocks className="w-5 h-5" />,
  brain: <Brain className="w-5 h-5" />,
  flask: <FlaskConical className="w-5 h-5" />,
  calculator: <Calculator className="w-5 h-5" />,
  globe: <Globe className="w-5 h-5" />,
  cpu: <Cpu className="w-5 h-5" />,
  palette: <Palette className="w-5 h-5" />,
  pen: <PenTool className="w-5 h-5" />,
  book: <BookOpen className="w-5 h-5" />,
  layers: <Layers className="w-5 h-5" />,
  lock: <Lock className="w-5 h-5" />,
  'bar-chart': <BarChart3 className="w-5 h-5" />,
  zap: <Zap className="w-5 h-5" />,
};

function getSubjectIcon(iconKey: string) {
  return ICON_MAP[iconKey] || <BookOpen className="w-5 h-5" />;
}

// ─── Quick Pick Topics ──────────────────────────────────────────────────────
const QUICK_PICKS = [
  { label: 'React', icon: <Code2 className="w-3.5 h-3.5" /> },
  { label: 'Python', icon: <Terminal className="w-3.5 h-3.5" /> },
  { label: 'Data Structures', icon: <Network className="w-3.5 h-3.5" /> },
  { label: 'SQL', icon: <Database className="w-3.5 h-3.5" /> },
  { label: 'System Design', icon: <Blocks className="w-3.5 h-3.5" /> },
  { label: 'JavaScript', icon: <Zap className="w-3.5 h-3.5" /> },
];

// ─── Status helpers ─────────────────────────────────────────────────────────
function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
    case 'in_progress':
      return (
        <div className="relative flex-shrink-0">
          <Circle className="w-4 h-4 text-blue-500" />
          <div className="absolute inset-0 animate-ping">
            <Circle className="w-4 h-4 text-blue-500 opacity-30" />
          </div>
        </div>
      );
    default:
      return <Circle className="w-4 h-4 text-slate-300 dark:text-[#3a3a3a] flex-shrink-0" />;
  }
}

function getProgress(chapters: TutorSubjectData['chapters']) {
  if (!chapters.length) return 0;
  const completed = chapters.filter((c) => c.status === 'completed').length;
  return Math.round((completed / chapters.length) * 100);
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function TutorHubPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<TutorSubjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [topic, setTopic] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch subjects
  const fetchSubjects = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;
    try {
      const token = await getToken();
      const res = await fetch('/api/tutor/subjects', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setSubjects(data.subjects);
    } catch (err) {
      console.error('Failed to fetch subjects:', err);
    } finally {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn, getToken]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  // Generate syllabus
  const handleGenerate = async (selectedTopic?: string) => {
    const t = selectedTopic || topic;
    if (!t.trim() || generating) return;

    setGenerating(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/tutor/generate-syllabus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ topic: t.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setTopic('');
        await fetchSubjects();
        if (data.subject?._id) {
          setExpandedId(data.subject._id);
        }
      }
    } catch (err) {
      console.error('Failed to generate syllabus:', err);
    } finally {
      setGenerating(false);
    }
  };

  // Delete subject
  const handleDelete = async (subjectId: string) => {
    setDeletingId(subjectId);
    try {
      const token = await getToken();
      await fetch(`/api/tutor/${subjectId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setSubjects((prev) => prev.filter((s) => s._id !== subjectId));
      if (expandedId === subjectId) setExpandedId(null);
    } catch (err) {
      console.error('Failed to delete subject:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Navigate to chapter
  const goToChapter = (slug: string, chapterNumber: number) => {
    router.push(`/candidate/tutor/${slug}/${chapterNumber}`);
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">Loading your subjects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-[var(--soft-sunken)] p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 font-sans text-slate-900 dark:text-white w-full">
      {/* Header */}
      <header>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
          <span>DASHBOARD</span>
          <span>/</span>
          <span className="font-semibold text-slate-800 dark:text-white">AI TUTOR</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          AI Tutor
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Learn any topic with a voice-powered AI tutor that adapts to your pace.
        </p>
      </header>

      {/* Subject Input Card */}
      <div className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 border-none p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              What do you want to learn?
            </h2>
            <p className="text-xs text-slate-400">
              Enter any topic and AI will generate a structured syllabus for you.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              placeholder="e.g. React, Machine Learning, Data Structures..."
              disabled={generating}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-[var(--soft-raised)] border border-slate-200 dark:border-[var(--soft-line)] rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all disabled:opacity-50"
            />
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleGenerate()}
            disabled={!topic.trim() || generating}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-600/20 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate
              </>
            )}
          </motion.button>
        </div>

        {/* Quick Picks */}
        <div className="flex flex-wrap gap-2 mt-4">
          <span className="text-xs text-slate-400 font-medium self-center mr-1">Quick picks:</span>
          {QUICK_PICKS.map((pick) => (
            <button
              key={pick.label}
              onClick={() => {
                setTopic(pick.label);
                handleGenerate(pick.label);
              }}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[var(--soft-raised)] border border-slate-200 dark:border-[var(--soft-line)] text-slate-600 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:border-violet-300 dark:hover:border-violet-500/30 hover:text-violet-700 dark:hover:text-violet-400 transition-all disabled:opacity-50 cursor-pointer"
            >
              {pick.icon}
              {pick.label}
            </button>
          ))}
        </div>
      </div>

      {/* Generating Skeleton */}
      <AnimatePresence>
        {generating && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center animate-pulse">
                <Sparkles className="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <div className="h-4 w-32 bg-slate-200 dark:bg-[var(--soft-line)] rounded animate-pulse" />
                <div className="h-3 w-48 bg-slate-100 dark:bg-[var(--soft-raised)] rounded animate-pulse mt-2" />
              </div>
            </div>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-[var(--soft-line)] animate-pulse" />
                  <div className="flex-1">
                    <div
                      className="h-3 bg-slate-200 dark:bg-[var(--soft-line)] rounded animate-pulse"
                      style={{ width: `${60 + Math.random() * 30}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subjects List */}
      {subjects.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            YOUR SUBJECTS
          </h2>

          <div className="grid grid-cols-1 gap-4">
            {subjects.map((subject, i) => (
              <motion.div
                key={subject._id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <SubjectCard
                  subject={subject}
                  isExpanded={expandedId === subject._id}
                  onToggle={() =>
                    setExpandedId(expandedId === subject._id ? null : subject._id)
                  }
                  onDelete={() => handleDelete(subject._id)}
                  onChapterClick={goToChapter}
                  isDeleting={deletingId === subject._id}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && subjects.length === 0 && !generating && (
        <div className="max-w-xl mx-auto text-center py-16">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 animate-pulse" />
            <div className="absolute inset-3 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
            No subjects yet
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm max-w-sm mx-auto">
            Enter a topic above and generate your first AI-powered syllabus. The tutor will guide
            you through each chapter with voice lessons.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Subject Card ─────────────────────────────────────────────────────────────

function SubjectCard({
  subject,
  isExpanded,
  onToggle,
  onDelete,
  onChapterClick,
  isDeleting,
}: {
  subject: TutorSubjectData;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onChapterClick: (slug: string, chapterNumber: number) => void;
  isDeleting: boolean;
}) {
  const progress = getProgress(subject.chapters);
  const completedCount = subject.chapters.filter((c) => c.status === 'completed').length;

  return (
    <div className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 border-none overflow-hidden transition-all">
      {/* Card Header */}
      <button
        onClick={onToggle}
        className="w-full text-left p-5 sm:p-6 flex items-center justify-between group hover:bg-slate-50/50 dark:hover:bg-[#161616] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 dark:from-violet-500/20 dark:to-indigo-500/20 flex items-center justify-center text-violet-600 dark:text-violet-400 flex-shrink-0">
            {getSubjectIcon(subject.icon)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-white text-lg truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
              {subject.name}
            </h3>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-slate-400 font-medium">
                {subject.chapters.length} chapters
              </span>
              <span className="text-slate-300 dark:text-[#333]">&bull;</span>
              <span className="text-xs text-slate-400 font-medium">
                {completedCount}/{subject.chapters.length} completed
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-1.5 bg-slate-100 dark:bg-[var(--soft-line)] rounded-full overflow-hidden max-w-xs">
              <motion.div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          {/* Delete button */}
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                onDelete();
              }
            }}
            className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </div>

          {/* Expand chevron */}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-slate-400" />
          </motion.div>
        </div>
      </button>

      {/* Expanded Chapter List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 dark:border-[var(--soft-line)] px-5 sm:px-6 pb-5 sm:pb-6">
              <div className="space-y-1 pt-4">
                {subject.chapters.map((chapter) => (
                  <button
                    key={chapter.number}
                    onClick={() => onChapterClick(subject.slug, chapter.number)}
                    className="w-full text-left group/ch flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-[var(--soft-raised)] transition-all cursor-pointer"
                  >
                    <div className="mt-0.5">{getStatusIcon(chapter.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 tabular-nums">
                          {String(chapter.number).padStart(2, '0')}
                        </span>
                        <h4
                          className={`text-sm font-semibold truncate ${
                            chapter.status === 'completed'
                              ? 'text-slate-500 dark:text-slate-400 line-through'
                              : 'text-slate-800 dark:text-white group-hover/ch:text-violet-600 dark:group-hover/ch:text-violet-400'
                          } transition-colors`}
                        >
                          {chapter.title}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                        {chapter.description}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-[#3a3a3a] group-hover/ch:text-violet-500 transition-colors mt-1 flex-shrink-0 opacity-0 group-hover/ch:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
