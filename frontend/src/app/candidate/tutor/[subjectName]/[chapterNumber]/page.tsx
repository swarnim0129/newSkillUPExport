'use client';

import React, { useState, useEffect, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  GraduationCap,
  Mic,
  MicOff,
  PhoneOff,
  CheckCircle2,
  Circle,
  Play,
  BookOpen,
  Loader2,
  Sparkles,
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
  User,
  Bot,
  Video,
  Trophy,
  XCircle,
  Award,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { TutorSubjectData, TutorChapter, QuizQuestion } from '@/lib/tutor-types';
import { scrollIntoPanel } from '@/lib/scroll';

// ─── Icon Map ───────────────────────────────────────────────────────────────
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

// ─── Transcript types ───────────────────────────────────────────────────────
interface TranscriptMessage {
  id: string;
  role: 'user' | 'persona';
  content: string;
  timestamp: Date;
}

// ─── Status Icon ────────────────────────────────────────────────────────────
function getStatusIcon(status: string) {
  const s = 'w-4 h-4';
  switch (status) {
    case 'completed':
      return <CheckCircle2 className={`${s} text-emerald-500 flex-shrink-0`} />;
    case 'in_progress':
      return (
        <div className="relative flex-shrink-0">
          <Circle className={`${s} text-violet-500`} />
          <div className="absolute inset-0 animate-ping">
            <Circle className={`${s} text-violet-500 opacity-30`} />
          </div>
        </div>
      );
    default:
      return <Circle className={`${s} text-slate-300 dark:text-[#3a3a3a] flex-shrink-0`} />;
  }
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function TutorSessionPage({
  params,
}: {
  params: Promise<{ subjectName: string; chapterNumber: string }>;
}) {
  const { subjectName, chapterNumber } = use(params);
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [subject, setSubject] = useState<TutorSubjectData | null>(null);
  const [chapter, setChapter] = useState<TutorChapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'intro' | 'connecting' | 'voice' | 'quiz'>('intro');
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [readyToStream, setReadyToStream] = useState(false);

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizCurrentIdx, setQuizCurrentIdx] = useState(0);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);

  // Smart Nudge (Agent-to-Agent Feedback Loop)
  const [smartNudge, setSmartNudge] = useState<{
    show: boolean;
    topic: string;
    message: string;
    adapting: boolean;
  }>({ show: false, topic: '', message: '', adapting: false });

  const anamClientRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const chapNum = parseInt(chapterNumber, 10);

  // Auto-scroll transcript
  useEffect(() => {
    scrollIntoPanel(transcriptEndRef.current);
  }, [transcript]);

  // Stream to video element once the voice phase renders it in the DOM
  useEffect(() => {
    if (readyToStream && phase === 'voice' && anamClientRef.current) {
      const timer = setTimeout(async () => {
        try {
          await anamClientRef.current.streamToVideoElement('anam-video-element');
          updateChapterStatus('in_progress');
        } catch (err: any) {
          console.error('Failed to stream to video:', err);
          setConnectionError(err.message || 'Failed to start video stream');
          setPhase('intro');
        } finally {
          setReadyToStream(false);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [readyToStream, phase]);

  // Fetch subject data
  const fetchSubject = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;
    try {
      const token = await getToken();
      const res = await fetch('/api/tutor/subjects', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        const found = data.subjects.find(
          (s: TutorSubjectData) => s.slug === subjectName
        );
        if (found) {
          setSubject(found);
          const chap = found.chapters.find(
            (c: TutorChapter) => c.number === chapNum
          );
          setChapter(chap || null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch subject:', err);
    } finally {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn, getToken, subjectName, chapNum]);

  useEffect(() => {
    fetchSubject();
  }, [fetchSubject]);

  // Cleanup Anam on unmount
  useEffect(() => {
    return () => {
      if (anamClientRef.current) {
        try {
          anamClientRef.current.stopStreaming();
        } catch {}
        anamClientRef.current = null;
      }
    };
  }, []);

  // ─── Helper: call flat update-chapter API ──────────────────────────────────
  const updateChapter = async (fields: Record<string, any>) => {
    if (!subject) return null;
    try {
      const token = await getToken();
      const res = await fetch('/api/tutor/update-chapter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subjectId: subject._id,
          chapterNumber: chapNum,
          ...fields,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubject(data.subject);
        const chap = data.subject.chapters.find(
          (c: TutorChapter) => c.number === chapNum
        );
        setChapter(chap || null);
        return data;
      }
      return null;
    } catch (err) {
      console.error('[update-chapter] Error:', err);
      return null;
    }
  };

  // ─── Save transcript to DB ─────────────────────────────────────────────────
  const saveTranscript = async (messages: TranscriptMessage[]) => {
    if (!subject || messages.length === 0) return;
    const transcriptData = messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
    }));
    await updateChapter({ transcript: transcriptData });
    console.log('[tutor] Transcript saved:', transcriptData.length, 'messages');
  };

  // ─── Update chapter status ─────────────────────────────────────────────────
  const updateChapterStatus = async (status: string) => {
    await updateChapter({ status });
  };

  // ─── Save quiz result to DB ────────────────────────────────────────────────
  const saveQuizResult = async (answers: number[]) => {
    if (!subject) return;
    const score = answers.reduce(
      (acc, ans, idx) => acc + (ans === quizQuestions[idx]?.correctIndex ? 1 : 0),
      0
    );
    await updateChapter({
      status: 'completed',
      quizResult: {
        questions: quizQuestions,
        answers,
        score,
        total: quizQuestions.length,
        completedAt: new Date().toISOString(),
      },
    });
  };

  // ─── Generate quiz ─────────────────────────────────────────────────────────
  const generateQuiz = async () => {
    if (!chapter || !subject) return;
    setQuizLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/tutor/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chapterTitle: chapter.title,
          chapterDescription: chapter.description,
          subjectName: subject.name,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setQuizQuestions(data.questions);
        setQuizAnswers(new Array(data.questions.length).fill(-1));
        setQuizCurrentIdx(0);
        setQuizSubmitted(false);
        setPhase('quiz');
      } else {
        console.error('Quiz generation failed:', data.message);
      }
    } catch (err) {
      console.error('Failed to generate quiz:', err);
    } finally {
      setQuizLoading(false);
    }
  };

  // ─── Start Anam lesson ─────────────────────────────────────────────────────
  const handleStartLesson = async () => {
    if (!subject || !chapter) return;

    setPhase('connecting');
    setConnectionError(null);
    setTranscript([]);

    try {
      const token = await getToken();
      const res = await fetch('/api/tutor/anam-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chapterTitle: chapter.title,
          chapterDescription: chapter.description,
          subjectName: subject.name,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to create session');
      }

      const { createClient, AnamEvent } = await import('@anam-ai/js-sdk');
      const anamClient = createClient(data.sessionToken);

      if (data.personaConfig) {
        anamClient.setPersonaConfig(data.personaConfig);
      }

      anamClientRef.current = anamClient;

      // Message stream events (real-time transcript chunks)
      anamClient.addListener(
        AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED,
        (event: { id: string; content: string; role: string; endOfSpeech: boolean }) => {
          if (!event.content || !event.content.trim()) return;

          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === event.role && !last.content.endsWith('\n')) {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...last,
                content: last.content + event.content,
              };
              return updated;
            }
            return [
              ...prev,
              {
                id: event.id || `${Date.now()}-${Math.random()}`,
                role: event.role === 'user' ? 'user' : 'persona',
                content: event.content,
                timestamp: new Date(),
              },
            ];
          });
        }
      );

      // Full message history updates
      anamClient.addListener(
        AnamEvent.MESSAGE_HISTORY_UPDATED,
        (messages: Array<{ id: string; content: string; role: string }>) => {
          if (Array.isArray(messages) && messages.length > 0) {
            setTranscript(
              messages.map((msg) => ({
                id: msg.id,
                role: msg.role === 'user' ? 'user' as const : 'persona' as const,
                content: msg.content,
                timestamp: new Date(),
              }))
            );
          }
        }
      );

      // Connection close
      anamClient.addListener(
        AnamEvent.CONNECTION_CLOSED,
        (reason: string, details?: string) => {
          console.log('[anam] Connection closed:', reason, details);
          setPhase('intro');
        }
      );

      setPhase('voice');
      setReadyToStream(true);
    } catch (err: any) {
      console.error('Failed to start Anam session:', err);
      setConnectionError(err.message || 'Failed to connect to AI tutor');
      setPhase('intro');
    }
  };

  // ─── End lesson — save transcript, then show quiz ──────────────────────────
  const handleEndLesson = async () => {
    // Save transcript before cleaning up
    if (transcript.length > 0) {
      await saveTranscript(transcript);
    }

    if (anamClientRef.current) {
      try {
        await anamClientRef.current.stopStreaming();
      } catch {}
      anamClientRef.current = null;
    }

    // Auto-trigger quiz generation after ending the lesson
    setPhase('intro');
    generateQuiz();
  };

  // Mark complete + trigger quiz
  const handleMarkComplete = async () => {
    await updateChapterStatus('completed');
    generateQuiz();
  };

  // Toggle mute
  const handleToggleMute = () => {
    if (anamClientRef.current) {
      try {
        if (!isMuted) {
          anamClientRef.current.muteInputAudio();
        } else {
          anamClientRef.current.unmuteInputAudio();
        }
      } catch (err) {
        console.error('Mute toggle error:', err);
      }
    }
    setIsMuted(!isMuted);
  };

  // Navigate between chapters
  const goToChapter = (num: number) => {
    if (anamClientRef.current) {
      try { anamClientRef.current.stopStreaming(); } catch {}
      anamClientRef.current = null;
    }
    setPhase('intro');
    setTranscript([]);
    setQuizQuestions([]);
    router.push(`/candidate/tutor/${subjectName}/${num}`);
  };

  // Quiz answer selection
  const handleSelectAnswer = (optionIdx: number) => {
    if (quizSubmitted) return;
    const updated = [...quizAnswers];
    updated[quizCurrentIdx] = optionIdx;
    setQuizAnswers(updated);
  };

  // Submit quiz — Quiz Agent evaluates and triggers Agent-to-Agent Handoff on failure
  const handleSubmitQuiz = async () => {
    setQuizSubmitted(true);
    await saveQuizResult(quizAnswers);

    // ─── Quiz Agent: Evaluate and trigger feedback loop ────────────────────
    const score = quizAnswers.reduce(
      (acc, ans, idx) => acc + (ans === quizQuestions[idx]?.correctIndex ? 1 : 0),
      0
    );
    const total = quizQuestions.length;
    const percentage = total > 0 ? score / total : 1;

    // Report the result to the journey so skill levels and the plan can react.
    // Each attempt counts, so the id includes the time of the attempt.
    if (chapter && subject && total > 0) {
      getToken()
        .then((token) =>
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5500/api'}/journey/evidence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              type: 'quiz_completed',
              topic: subject.name,
              score,
              total,
              refId: `${subject._id}:${chapter.number}:${Date.now()}`,
            }),
          })
        )
        .catch(() => { /* the quiz result itself is already saved */ });
    }

    if (percentage < 0.6 && chapter && subject) {
      // Failed quiz — trigger Agent-to-Agent Handoff
      setSmartNudge({
        show: true,
        topic: chapter.title,
        message: '',
        adapting: true,
      });

      try {
        const token = await getToken();
        const res = await fetch('/api/roadmap/adapt-active', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            subjectName: subject.name,
            chapterTitle: chapter.title,
            score,
            total,
          }),
        });
        const data = await res.json();

        if (data.success && data.adapted) {
          setSmartNudge({
            show: true,
            topic: data.remedialNode?.topic || chapter.title,
            message:
              data.message ||
              `I noticed you struggled with "${chapter.title}". I've adjusted your learning roadmap with a focused review module.`,
            adapting: false,
          });
        } else {
          setSmartNudge({
            show: true,
            topic: chapter.title,
            message: data.message || 'Consider reviewing this topic before moving forward.',
            adapting: false,
          });
        }
      } catch (err) {
        console.error('[Quiz Agent] Roadmap adaptation failed:', err);
        setSmartNudge({
          show: true,
          topic: chapter.title,
          message: `You scored ${score}/${total}. Consider revisiting "${chapter.title}" before moving on.`,
          adapting: false,
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">Loading lesson...</p>
        </div>
      </div>
    );
  }

  if (!subject || !chapter) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-4">
        <BookOpen className="w-16 h-16 text-slate-300 dark:text-[#333]" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">
          Chapter not found
        </h2>
        <button
          onClick={() => router.push('/candidate/tutor')}
          className="text-sm text-violet-600 hover:text-violet-700 font-medium"
        >
          ← Back to subjects
        </button>
      </div>
    );
  }

  const prevChapter = subject.chapters.find((c) => c.number === chapNum - 1);
  const nextChapter = subject.chapters.find((c) => c.number === chapNum + 1);

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-[var(--soft-sunken)] font-sans text-slate-900 dark:text-white w-full">
      {/* Back button */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4">
        <button
          onClick={() => router.push('/candidate/tutor')}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {subject.name}
        </button>
      </div>

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-0 lg:gap-6 p-4 sm:p-6 lg:p-8 pt-4">
        {/* Sidebar — Chapter List */}
        <div className="w-full lg:w-64 flex-shrink-0 mb-6 lg:mb-0">
          <div className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 p-4 sticky top-6">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-[var(--soft-line)]">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/10 to-indigo-500/10 dark:from-violet-500/20 dark:to-indigo-500/20 flex items-center justify-center text-violet-600 dark:text-violet-400">
                {getSubjectIcon(subject.icon)}
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {subject.name}
                </h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                  {subject.chapters.length} Chapters
                </p>
              </div>
            </div>

            <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
              {subject.chapters.map((ch) => {
                const isCurrent = ch.number === chapNum;
                return (
                  <button
                    key={ch.number}
                    onClick={() => goToChapter(ch.number)}
                    className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20'
                        : 'hover:bg-slate-50 dark:hover:bg-[var(--soft-raised)]'
                    }`}
                  >
                    {getStatusIcon(isCurrent && phase === 'voice' ? 'in_progress' : ch.status)}
                    <span
                      className={`font-medium truncate ${
                        isCurrent
                          ? 'text-violet-700 dark:text-violet-300'
                          : ch.status === 'completed'
                          ? 'text-slate-400 line-through'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {ch.number}. {ch.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {phase === 'intro' ? (
              <motion.div
                key="intro"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
              >
                <ChapterIntro
                  subject={subject}
                  chapter={chapter}
                  chapNum={chapNum}
                  prevChapter={prevChapter}
                  nextChapter={nextChapter}
                  onStart={handleStartLesson}
                  onMarkComplete={handleMarkComplete}
                  onGoToChapter={goToChapter}
                  connectionError={connectionError}
                  quizLoading={quizLoading}
                />
              </motion.div>
            ) : phase === 'connecting' ? (
              <motion.div
                key="connecting"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 p-10 flex flex-col items-center justify-center min-h-[500px]"
              >
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-violet-500/25 animate-pulse">
                    <GraduationCap className="w-10 h-10 text-white" />
                  </div>
                </div>
                <p className="mt-6 text-lg font-semibold text-slate-800 dark:text-white">
                  Connecting to AI Tutor...
                </p>
                <p className="text-sm text-slate-400 mt-2">
                  Setting up your personalized lesson for <strong>{chapter.title}</strong>
                </p>
                <Loader2 className="w-6 h-6 text-violet-500 animate-spin mt-6" />
              </motion.div>
            ) : phase === 'quiz' ? (
              <motion.div
                key="quiz"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
              >
                <QuizPanel
                  chapter={chapter}
                  questions={quizQuestions}
                  answers={quizAnswers}
                  currentIdx={quizCurrentIdx}
                  submitted={quizSubmitted}
                  onSelectAnswer={handleSelectAnswer}
                  onSetCurrentIdx={setQuizCurrentIdx}
                  onSubmit={handleSubmitQuiz}
                  onClose={() => setPhase('intro')}
                  nextChapter={nextChapter}
                  onGoToChapter={goToChapter}
                />
              </motion.div>
            ) : (
              <motion.div
                key="voice"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4 }}
              >
                <VoiceSession
                  subject={subject}
                  chapter={chapter}
                  chapNum={chapNum}
                  transcript={transcript}
                  transcriptEndRef={transcriptEndRef}
                  isMuted={isMuted}
                  prevChapter={prevChapter}
                  nextChapter={nextChapter}
                  onToggleMute={handleToggleMute}
                  onEnd={handleEndLesson}
                  onMarkComplete={handleMarkComplete}
                  onGoToChapter={goToChapter}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── Smart Nudge Modal (Agent-to-Agent Feedback Loop) ──────────────── */}
      <AnimatePresence>
        {smartNudge.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => !smartNudge.adapting && setSmartNudge((prev) => ({ ...prev, show: false }))}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              className="relative w-full max-w-md rounded-2xl bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border border-slate-200 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top accent bar */}
              <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 via-orange-400 to-amber-400" />

              <div className="p-6">
                {/* Header */}
                <div className="flex items-start gap-3.5 mb-5">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-50 to-orange-50 border border-violet-100 flex-shrink-0">
                    <Brain className="w-5 h-5 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">🧠 AI Roadmap Adaptation</h3>
                    <p className="text-[11px] font-medium text-violet-500 mt-0.5 tracking-wide uppercase">Agent-to-Agent Handoff Triggered</p>
                  </div>
                  {!smartNudge.adapting && (
                    <button
                      onClick={() => setSmartNudge((prev) => ({ ...prev, show: false }))}
                      className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {/* Content */}
                {smartNudge.adapting ? (
                  <div className="flex flex-col items-center py-8 gap-5">
                    <div className="relative">
                      <div className="w-14 h-14 border-[3px] border-violet-500 border-t-transparent rounded-full animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Brain className="w-5 h-5 text-violet-500" />
                      </div>
                    </div>
                    <div className="text-center space-y-1.5">
                      <p className="text-sm font-medium text-slate-700">
                        Analyzing your performance...
                      </p>
                      <p className="text-xs text-slate-400">
                        Adapting roadmap for <strong className="text-violet-600 font-semibold">"{smartNudge.topic}"</strong>
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Message card */}
                    <div className="rounded-xl bg-gradient-to-br from-slate-50 to-violet-50/50 border border-slate-100 p-4">
                      <p className="text-[13px] text-slate-700 leading-relaxed">
                        {smartNudge.message}
                      </p>
                    </div>

                    {/* Info badge */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      <span className="text-[11px] font-medium text-amber-700">Remedial module injected with bonus XP rewards</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2.5 pt-1">
                      <button
                        onClick={() => {
                          setSmartNudge((prev) => ({ ...prev, show: false }));
                          window.open('/candidate/learning-roadmap', '_blank');
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md"
                      >
                        View Updated Roadmap <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setSmartNudge((prev) => ({ ...prev, show: false }))}
                        className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Chapter Intro ──────────────────────────────────────────────────────────

function ChapterIntro({
  subject,
  chapter,
  chapNum,
  prevChapter,
  nextChapter,
  onStart,
  onMarkComplete,
  onGoToChapter,
  connectionError,
  quizLoading,
}: {
  subject: TutorSubjectData;
  chapter: TutorChapter;
  chapNum: number;
  prevChapter?: TutorChapter;
  nextChapter?: TutorChapter;
  onStart: () => void;
  onMarkComplete: () => void;
  onGoToChapter: (num: number) => void;
  connectionError: string | null;
  quizLoading: boolean;
}) {
  return (
    <div className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 p-6 sm:p-8 lg:p-10">
      {/* Chapter badge */}
      <div className="flex items-center gap-3 mb-6">
        <span className="px-3 py-1 rounded-lg text-xs font-bold bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 uppercase tracking-wider">
          Chapter {chapNum} of {subject.chapters.length}
        </span>
        {chapter.status === 'completed' && (
          <span className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        )}
        {chapter.quizResult && (
          <span className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
            <Trophy className="w-3 h-3" />
            Quiz: {chapter.quizResult.score}/{chapter.quizResult.total}
          </span>
        )}
      </div>

      {/* Title */}
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">
        {chapter.title}
      </h1>

      {/* Description */}
      <p className="text-slate-500 dark:text-slate-400 text-base leading-relaxed mb-8 max-w-2xl">
        {chapter.description}
      </p>

      {/* What you'll learn */}
      <div className="bg-slate-50 dark:bg-[var(--soft-sunken)] rounded-xl p-6 mb-8 border border-slate-100 dark:border-[var(--soft-line)]">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          In this lesson
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Your AI tutor avatar will guide you through <strong className="text-slate-700 dark:text-slate-200">{chapter.title}</strong> with
          interactive voice explanations and real-time conversation. You can ask questions anytime, and the tutor will adapt to your learning pace.
        </p>
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5" />
            <span>Live AI avatar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5" />
            <span>Quiz after lesson</span>
          </div>
        </div>
      </div>

      {/* Previous transcript indicator */}
      {chapter.transcript && chapter.transcript.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/15 rounded-xl px-4 py-3 mb-6 text-sm text-blue-600 dark:text-blue-400 flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Previous lesson transcript saved ({chapter.transcript.length} messages)
        </div>
      )}

      {/* Connection error */}
      {connectionError && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3 mb-6 text-sm text-red-600 dark:text-red-400">
          {connectionError}
        </div>
      )}

      {/* Quiz loading indicator */}
      {quizLoading && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-4 py-3 mb-6 text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Generating assessment quiz...
        </div>
      )}

      {/* Start Lesson Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onStart}
          className="flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-xl shadow-violet-600/25 transition-all text-base cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Play className="w-5 h-5 fill-white" />
          </div>
          Start Lesson
        </motion.button>

        {chapter.status !== 'completed' && (
          <button
            onClick={onMarkComplete}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            Mark as Complete
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-[var(--soft-line)]">
        {prevChapter ? (
          <button
            onClick={() => onGoToChapter(prevChapter.number)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{prevChapter.title}</span>
            <span className="sm:hidden">Previous</span>
          </button>
        ) : (
          <div />
        )}
        {nextChapter ? (
          <button
            onClick={() => onGoToChapter(nextChapter.number)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors cursor-pointer"
          >
            <span className="hidden sm:inline">{nextChapter.title}</span>
            <span className="sm:hidden">Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}

// ─── Voice Session (Anam Avatar + Transcript) ───────────────────────────────

function VoiceSession({
  subject,
  chapter,
  chapNum,
  transcript,
  transcriptEndRef,
  isMuted,
  prevChapter,
  nextChapter,
  onToggleMute,
  onEnd,
  onMarkComplete,
  onGoToChapter,
}: {
  subject: TutorSubjectData;
  chapter: TutorChapter;
  chapNum: number;
  transcript: TranscriptMessage[];
  transcriptEndRef: React.RefObject<HTMLDivElement | null>;
  isMuted: boolean;
  prevChapter?: TutorChapter;
  nextChapter?: TutorChapter;
  onToggleMute: () => void;
  onEnd: () => void;
  onMarkComplete: () => void;
  onGoToChapter: (num: number) => void;
}) {
  return (
    <div className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-[var(--soft-line)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-bold text-slate-800 dark:text-white">
            Chapter {chapNum}: {chapter.title}
          </span>
        </div>
        <span className="text-xs text-slate-400 font-medium">LIVE SESSION</span>
      </div>

      {/* Main content: Video + Transcript side by side */}
      <div className="flex flex-col lg:flex-row">
        {/* Left: Anam Video Avatar */}
        <div className="lg:w-1/2 bg-slate-950 relative">
          <div className="aspect-video lg:aspect-auto lg:h-[500px] relative">
            <video
              id="anam-video-element"
              autoPlay
              playsInline
              className="w-full h-full object-contain bg-black"
              style={{ imageRendering: 'auto' }}
            />
            <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
            <div className="absolute bottom-4 left-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white text-xs font-bold">{subject.name} Tutor</p>
                <p className="text-white/60 text-[10px]">AI Avatar</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Transcript */}
        <div className="lg:w-1/2 flex flex-col h-[400px] lg:h-[500px]">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-[var(--soft-line)] flex-shrink-0">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Live Transcript
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {transcript.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-[var(--soft-raised)] flex items-center justify-center mb-3">
                  <Mic className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-sm text-slate-400">
                  Conversation will appear here...
                </p>
                <p className="text-xs text-slate-300 dark:text-[#3a3a3a] mt-1">
                  Start speaking to your AI tutor
                </p>
              </div>
            )}

            {transcript.map((msg, idx) => (
              <div
                key={`${msg.id}-${idx}`}
                className={`flex gap-3 ${
                  msg.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-blue-100 dark:bg-blue-500/15'
                      : 'bg-violet-100 dark:bg-violet-500/15'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Bot className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  )}
                </div>

                <div
                  className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white rounded-br-md'
                      : 'bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-800 dark:text-slate-200 rounded-bl-md'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            <div ref={transcriptEndRef} />
          </div>
        </div>
      </div>

      {/* Controls bar */}
      <div className="px-6 py-4 border-t border-slate-100 dark:border-[var(--soft-line)]">
        <div className="flex items-center justify-between">
          <div>
            {prevChapter && (
              <button
                onClick={() => onGoToChapter(prevChapter.number)}
                className="flex items-center gap-1 text-sm text-slate-400 hover:text-violet-500 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onToggleMute}
              className={`p-3 rounded-full transition-all cursor-pointer ${
                isMuted
                  ? 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400'
                  : 'bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#222]'
              }`}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <button
              onClick={onEnd}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm shadow-lg shadow-red-500/20 transition-all cursor-pointer"
            >
              <PhoneOff className="w-4 h-4" />
              End Lesson
            </button>

            <button
              onClick={onMarkComplete}
              className={`p-3 rounded-full transition-all cursor-pointer ${
                chapter.status === 'completed'
                  ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-600'
              }`}
              title={chapter.status === 'completed' ? 'Completed' : 'Mark Complete'}
            >
              <CheckCircle2 className="w-5 h-5" />
            </button>
          </div>

          <div>
            {nextChapter && (
              <button
                onClick={() => onGoToChapter(nextChapter.number)}
                className="flex items-center gap-1 text-sm text-slate-400 hover:text-violet-500 transition-colors cursor-pointer"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Quiz Panel ─────────────────────────────────────────────────────────────

function QuizPanel({
  chapter,
  questions,
  answers,
  currentIdx,
  submitted,
  onSelectAnswer,
  onSetCurrentIdx,
  onSubmit,
  onClose,
  nextChapter,
  onGoToChapter,
}: {
  chapter: TutorChapter;
  questions: QuizQuestion[];
  answers: number[];
  currentIdx: number;
  submitted: boolean;
  onSelectAnswer: (idx: number) => void;
  onSetCurrentIdx: (idx: number) => void;
  onSubmit: () => void;
  onClose: () => void;
  nextChapter?: TutorChapter;
  onGoToChapter: (num: number) => void;
}) {
  if (questions.length === 0) return null;

  const currentQ = questions[currentIdx];
  const score = answers.reduce(
    (acc, ans, idx) => acc + (ans === questions[idx]?.correctIndex ? 1 : 0),
    0
  );
  const allAnswered = answers.every((a) => a !== -1);

  return (
    <div className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl shadow-sm dark:shadow-black/20 overflow-hidden">
      {/* Quiz Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-[var(--soft-line)]">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Award className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Chapter Assessment
              </h2>
              <p className="text-xs text-slate-400">
                {chapter.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[var(--soft-raised)] text-slate-400 transition-colors cursor-pointer"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Question dots */}
        <div className="flex items-center gap-2 mt-4">
          {questions.map((_, idx) => (
            <button
              key={idx}
              onClick={() => onSetCurrentIdx(idx)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                idx === currentIdx
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
                  : submitted && answers[idx] === questions[idx].correctIndex
                  ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : submitted && answers[idx] !== -1 && answers[idx] !== questions[idx].correctIndex
                  ? 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400'
                  : answers[idx] !== -1
                  ? 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400'
                  : 'bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-500'
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Question */}
      <div className="p-6 sm:p-8">
        <p className="text-xs font-bold text-violet-500 uppercase tracking-wider mb-3">
          Question {currentIdx + 1} of {questions.length}
        </p>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6 leading-relaxed">
          {currentQ.question}
        </h3>

        {/* Options */}
        <div className="space-y-3">
          {currentQ.options.map((option, optIdx) => {
            const isSelected = answers[currentIdx] === optIdx;
            const isCorrect = submitted && optIdx === currentQ.correctIndex;
            const isWrong = submitted && isSelected && optIdx !== currentQ.correctIndex;

            return (
              <button
                key={optIdx}
                onClick={() => onSelectAnswer(optIdx)}
                disabled={submitted}
                className={`w-full text-left flex items-center gap-4 px-5 py-4 rounded-xl border-2 transition-all cursor-pointer ${
                  isCorrect
                    ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/40'
                    : isWrong
                    ? 'border-red-400 bg-red-50 dark:bg-red-500/10 dark:border-red-500/40'
                    : isSelected
                    ? 'border-violet-400 bg-violet-50 dark:bg-violet-500/10 dark:border-violet-500/40'
                    : 'border-slate-200 dark:border-[var(--soft-line)] hover:border-violet-300 dark:hover:border-violet-500/30 hover:bg-violet-50/50 dark:hover:bg-violet-500/5'
                } ${submitted ? 'cursor-default' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    isCorrect
                      ? 'bg-emerald-500 text-white'
                      : isWrong
                      ? 'bg-red-500 text-white'
                      : isSelected
                      ? 'bg-violet-500 text-white'
                      : 'bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {String.fromCharCode(65 + optIdx)}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isCorrect
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : isWrong
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {option}
                </span>
                {isCorrect && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 ml-auto flex-shrink-0" />
                )}
                {isWrong && (
                  <XCircle className="w-5 h-5 text-red-500 ml-auto flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 sm:px-8 pb-6 sm:pb-8">
        {/* Navigation between questions */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => onSetCurrentIdx(Math.max(0, currentIdx - 1))}
            disabled={currentIdx === 0}
            className="flex items-center gap-1 text-sm text-slate-400 hover:text-violet-500 transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-default"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          {currentIdx < questions.length - 1 ? (
            <button
              onClick={() => onSetCurrentIdx(currentIdx + 1)}
              className="flex items-center gap-1 text-sm text-slate-400 hover:text-violet-500 transition-colors cursor-pointer"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <div />
          )}
        </div>

        {/* Submit / Results */}
        {!submitted ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSubmit}
            disabled={!allAnswered}
            className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-xl shadow-violet-600/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-sm"
          >
            {allAnswered ? 'Submit Answers' : `Answer all questions (${answers.filter(a => a !== -1).length}/${questions.length})`}
          </motion.button>
        ) : (
          <div className="space-y-4">
            {/* Score */}
            <div className={`text-center p-6 rounded-xl ${
              score === questions.length
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20'
                : score >= questions.length / 2
                ? 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20'
                : 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20'
            }`}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Trophy className={`w-6 h-6 ${
                  score === questions.length
                    ? 'text-emerald-500'
                    : score >= questions.length / 2
                    ? 'text-amber-500'
                    : 'text-red-500'
                }`} />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {score}/{questions.length}
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {score === questions.length
                  ? 'Perfect! You nailed this chapter! 🎉'
                  : score >= questions.length / 2
                  ? 'Good job! Keep practicing to improve.'
                  : 'Consider reviewing this chapter again.'}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[var(--soft-raised)] hover:bg-slate-200 dark:hover:bg-[#222] transition-colors cursor-pointer"
              >
                Back to Chapter
              </button>
              {nextChapter && (
                <button
                  onClick={() => onGoToChapter(nextChapter.number)}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-600/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  Next Chapter
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
