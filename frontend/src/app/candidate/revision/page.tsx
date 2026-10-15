'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import axios from 'axios';
import api from '@/lib/api';
import {
  BookOpen,
  Loader2,
  Upload,
  Link as LinkIcon,
  FileText,
  CheckCircle2,
  Sparkles,
  History,
  Save,
  RefreshCw,
  Brain,
  Layers3,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';

type SourceType = 'text' | 'url' | 'pdf';

interface LearningResource {
  title?: string;
  url?: string;
}

interface LearningNode {
  topic: string;
  status?: 'not_started' | 'in_progress' | 'completed';
  resources?: LearningResource[];
}

interface SavedRoadmap {
  _id: string;
  topic: string;
  nodes: LearningNode[];
  progressPercent?: number;
  completedAt?: string | null;
  createdAt: string;
}

interface ExplainerHistoryItem {
  _id: string;
  explainer_id: number;
  title: string;
  content_source: string;
  complexity: string;
  created_at: string;
}

interface ExplainerSection {
  heading?: string;
  content?: string;
  key_points?: string[] | string;
}

interface ExplainerConcept {
  term?: string;
  definition?: string;
}

interface ExplainerData {
  title?: string;
  summary?: string;
  sections?: ExplainerSection[];
  concepts?: ExplainerConcept[];
  original_content?: string;
  content_source?: string;
  [key: string]: unknown;
}

interface Flashcard {
  id: number;
  front: string;
  back: string;
  difficulty?: 'easy' | 'medium' | 'hard' | string;
}

interface FlashcardHistoryItem {
  _id: string;
  flashcard_id: number;
  total_cards: number;
  content_source: string;
  num_cards_requested: number;
  words_per_card: number;
  created_at: string;
}

function toBulletList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, '_').slice(0, 80) || 'revision_explanation';
}

function getFlashcardTone(difficulty?: string) {
  const level = String(difficulty || 'medium').toLowerCase();

  if (level === 'easy') {
    return {
      chip: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/20',
      frontGlow: 'border-emerald-300/70 dark:border-emerald-500/30 shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_0_28px_rgba(16,185,129,0.18)]',
      backGlow: 'border-cyan-300/70 dark:border-cyan-500/30 shadow-[0_0_0_1px_rgba(6,182,212,0.35),0_0_28px_rgba(6,182,212,0.2)]',
    };
  }

  if (level === 'hard') {
    return {
      chip: 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-500/10 dark:border-rose-500/20',
      frontGlow: 'border-rose-300/70 dark:border-rose-500/30 shadow-[0_0_0_1px_rgba(244,63,94,0.35),0_0_28px_rgba(244,63,94,0.2)]',
      backGlow: 'border-violet-300/70 dark:border-violet-500/30 shadow-[0_0_0_1px_rgba(139,92,246,0.35),0_0_28px_rgba(139,92,246,0.22)]',
    };
  }

  return {
    chip: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/20',
    frontGlow: 'border-amber-300/70 dark:border-amber-500/30 shadow-[0_0_0_1px_rgba(245,158,11,0.35),0_0_28px_rgba(245,158,11,0.2)]',
    backGlow: 'border-sky-300/70 dark:border-sky-500/30 shadow-[0_0_0_1px_rgba(14,165,233,0.35),0_0_28px_rgba(14,165,233,0.22)]',
  };
}

async function exportExplanationAsPdf(explainer: ExplainerData, complexity: string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (required = 20) => {
    if (y + required > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeLine = (text: string, size = 11, weight: 'normal' | 'bold' = 'normal', gap = 7) => {
    if (!text) return;
    doc.setFont('helvetica', weight);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxWidth);
    lines.forEach((line: string) => {
      ensureSpace(size + 4);
      doc.text(line, margin, y);
      y += size + 4;
    });
    y += gap;
  };

  const title = String(explainer.title || 'Revision Explanation');
  const summary = String(explainer.summary || '');
  const sections = Array.isArray(explainer.sections) ? explainer.sections : [];
  const concepts = Array.isArray(explainer.concepts) ? explainer.concepts : [];

  writeLine(title, 18, 'bold', 10);
  writeLine(`Complexity: ${complexity}`, 10, 'normal', 10);
  if (summary) {
    writeLine('Summary', 13, 'bold', 4);
    writeLine(summary, 11, 'normal', 10);
  }

  if (sections.length > 0) {
    writeLine('Sections', 13, 'bold', 6);
    sections.forEach((section, idx) => {
      const heading = String(section?.heading || `Section ${idx + 1}`);
      const content = String(section?.content || '');
      const points = toBulletList(section?.key_points);

      writeLine(`${idx + 1}. ${heading}`, 12, 'bold', 3);
      if (content) writeLine(content, 11, 'normal', 5);

      if (points.length > 0) {
        points.slice(0, 8).forEach((point) => writeLine(`- ${point}`, 10, 'normal', 2));
        y += 4;
      }
    });
  }

  if (concepts.length > 0) {
    writeLine('Key Concepts', 13, 'bold', 6);
    concepts.slice(0, 20).forEach((concept) => {
      const term = String((concept as ExplainerConcept)?.term || 'Concept');
      const definition = String((concept as ExplainerConcept)?.definition || '');
      writeLine(term, 11, 'bold', 2);
      if (definition) writeLine(definition, 10, 'normal', 5);
    });
  }

  const fileName = `${sanitizeFileName(title)}.pdf`;
  doc.save(fileName);
}

const BACKEND2_TOKEN_KEY = 'backend2_token';

export default function CandidateRevisionPage() {
  const { getToken } = useAuth();
  const { user, isLoaded } = useUser();

  const [backend2Token, setBackend2Token] = useState<string | null>(null);

  const [roadmapsLoading, setRoadmapsLoading] = useState(false);
  const [completedRoadmaps, setCompletedRoadmaps] = useState<SavedRoadmap[]>([]);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<ExplainerHistoryItem[]>([]);

  // Flashcard state
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [flashcardsLoading, setFlashcardsLoading] = useState(false);
  const [flashcardsSaving, setFlashcardsSaving] = useState(false);
  const [flashcardHistoryLoading, setFlashcardHistoryLoading] = useState(false);
  const [flashcardHistory, setFlashcardHistory] = useState<FlashcardHistoryItem[]>([]);
  const [flashcardStudyIndex, setFlashcardStudyIndex] = useState(0);
  const [showFlashcardBack, setShowFlashcardBack] = useState(false);
  const [flashcardNumCards, setFlashcardNumCards] = useState(12);
  const [flashcardWordsPerCard, setFlashcardWordsPerCard] = useState(30);
  const [flashcardOriginalContent, setFlashcardOriginalContent] = useState('');
  const [flashcardContentSource, setFlashcardContentSource] = useState('');

  const [sourceType, setSourceType] = useState<SourceType>('text');
  const [complexity, setComplexity] = useState('medium');
  const [textInput, setTextInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [explainer, setExplainer] = useState<ExplainerData | null>(null);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Active tab
  const [activeTab, setActiveTab] = useState<'explainer' | 'flashcards'>('explainer');

  const ensureBackend2Token = useCallback(async (): Promise<string> => {
    const email = user?.primaryEmailAddress?.emailAddress;
    if (!email) {
      throw new Error('User email not available');
    }

    const validateToken = async (token: string) => {
      await axios.get('/api2/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return token;
    };

    const stored = typeof window !== 'undefined' ? localStorage.getItem(BACKEND2_TOKEN_KEY) : null;
    if (stored) {
      try {
        return await validateToken(stored);
      } catch {
        if (typeof window !== 'undefined') localStorage.removeItem(BACKEND2_TOKEN_KEY);
      }
    }

    const callbackRes = await axios.post('/api2/auth/google/callback', {
      email,
      full_name: user?.fullName || email.split('@')[0],
      provider: 'google',
      provider_user_id: user?.id || email,
    });

    const token = callbackRes.data?.access_token as string | undefined;
    if (!token) {
      throw new Error('Failed to obtain backend2 token');
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(BACKEND2_TOKEN_KEY, token);
    }

    return token;
  }, [user]);

  const loadCompletedRoadmaps = useCallback(async () => {
    setRoadmapsLoading(true);
    try {
      const token = await getToken();
      const res = await api.get('/roadmap', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const all: SavedRoadmap[] = res.data?.roadmaps || [];
      const completed = all.filter((roadmap) => {
        const percent = Number(roadmap.progressPercent || 0);
        const hasCompletedNode = Array.isArray(roadmap.nodes)
          && roadmap.nodes.some((node) => node.status === 'completed');
        return !!roadmap.completedAt || percent >= 100 || hasCompletedNode;
      });
      setCompletedRoadmaps(completed);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to load completed courses');
    } finally {
      setRoadmapsLoading(false);
    }
  }, [getToken]);

  const loadHistory = useCallback(async (token: string) => {
    setHistoryLoading(true);
    try {
      const res = await axios.get('/api2/api/explainer/history', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHistoryItems(res.data?.explanations || []);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadFlashcardHistory = useCallback(async (token: string) => {
    setFlashcardHistoryLoading(true);
    try {
      const res = await axios.get('/api2/api/flashcards/history', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFlashcardHistory(res.data?.flashcard_sets || []);
    } catch {
      setFlashcardHistory([]);
    } finally {
      setFlashcardHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !user) return;

    const init = async () => {
      try {
        setError('');
        const token = await ensureBackend2Token();
        setBackend2Token(token);
        await Promise.all([loadCompletedRoadmaps(), loadHistory(token), loadFlashcardHistory(token)]);
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to initialize revision page');
      }
    };

    init();
  }, [isLoaded, user, ensureBackend2Token, loadCompletedRoadmaps, loadHistory, loadFlashcardHistory]);

  const completedSummary = useMemo(() => {
    return completedRoadmaps.map((roadmap) => {
      const completedNodes = (roadmap.nodes || []).filter((node) => node.status === 'completed');
      return {
        roadmap,
        completedNodes,
      };
    });
  }, [completedRoadmaps]);

  // ─── Explainer handlers ──────────────────────────────────
  const handleGenerate = async () => {
    if (!backend2Token) {
      setError('Revision engine is not authenticated yet. Please refresh and try again.');
      return;
    }

    setError('');
    setNotice('');

    if (sourceType === 'text' && textInput.trim().length < 50) {
      setError('Please provide at least 50 characters of text.');
      return;
    }
    if (sourceType === 'url' && !urlInput.trim()) {
      setError('Please provide a URL.');
      return;
    }
    if (sourceType === 'url') {
      const normalizedUrl = /^https?:\/\//i.test(urlInput.trim())
        ? urlInput.trim()
        : `https://${urlInput.trim()}`;
      try {
        // eslint-disable-next-line no-new
        new URL(normalizedUrl);
      } catch {
        setError('Please provide a valid URL (for example: https://example.com/article).');
        return;
      }
    }
    if (sourceType === 'pdf' && !pdfFile) {
      setError('Please upload a PDF file.');
      return;
    }

    setGenerating(true);
    try {
      let res;

      if (sourceType === 'pdf' && pdfFile) {
        const form = new FormData();
        form.append('complexity', complexity);
        form.append('pdf', pdfFile);

        res = await axios.post('/api2/api/explainer/generate', form, {
          headers: { Authorization: `Bearer ${backend2Token}` },
        });
      } else {
        const payload = new URLSearchParams();
        payload.append('complexity', complexity);

        if (sourceType === 'text') {
          payload.append('text', textInput.trim());
        }

        if (sourceType === 'url') {
          const normalizedUrl = /^https?:\/\//i.test(urlInput.trim())
            ? urlInput.trim()
            : `https://${urlInput.trim()}`;
          payload.append('url', normalizedUrl);
        }

        res = await axios.post('/api2/api/explainer/generate', payload, {
          headers: {
            Authorization: `Bearer ${backend2Token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
      }

      setExplainer(res.data || null);
      setNotice('Explanation generated successfully.');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || (err as { message?: string })?.message || 'Failed to generate explanation');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!backend2Token || !explainer) return;

    setSaving(true);
    setError('');
    try {
      const originalContent =
        (typeof explainer.original_content === 'string' && explainer.original_content)
          || (sourceType === 'text' ? textInput.trim() : sourceType === 'url' ? urlInput.trim() : (pdfFile?.name || 'pdf upload'));

      await axios.post(
        '/api2/api/explainer/save',
        {
          explanation: explainer,
          original_content: originalContent,
          content_source: (explainer.content_source as string) || sourceType,
          complexity,
        },
        {
          headers: { Authorization: `Bearer ${backend2Token}` },
        }
      );

      try {
        await exportExplanationAsPdf(explainer, complexity);
      } catch (pdfErr) {
        console.error('PDF export failed:', pdfErr);
      }

      setNotice('Explanation saved to your revision history and exported as PDF.');
      await loadHistory(backend2Token);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || (err as { message?: string })?.message || 'Failed to save explanation');
    } finally {
      setSaving(false);
    }
  };

  const loadHistoryItem = async (explainerId: number) => {
    if (!backend2Token) return;
    setError('');
    try {
      const res = await axios.get(`/api2/api/explainer/history/${explainerId}`, {
        headers: { Authorization: `Bearer ${backend2Token}` },
      });
      const item = res.data?.explanation;
      if (!item) return;

      const explanationData = (item.explanation || {}) as ExplainerData;
      explanationData.original_content = item.original_content;
      explanationData.content_source = item.content_source;
      setExplainer(explanationData);
      setComplexity(item.complexity || 'medium');
      setNotice(`Loaded saved explanation #${explainerId}.`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || (err as { message?: string })?.message || 'Failed to load saved explanation');
    }
  };

  const seedFromRoadmap = (roadmap: SavedRoadmap, completedNodes: LearningNode[]) => {
    const nodesForRevision = completedNodes.length > 0 ? completedNodes : (roadmap.nodes || []);
    const summary = [
      `Roadmap Topic: ${roadmap.topic}`,
      'Completed course topics:',
      ...nodesForRevision.map((node, index) => `${index + 1}. ${node.topic}`),
      'Please explain these topics in revision-friendly style.',
    ].join('\n');

    setSourceType('text');
    setTextInput(summary);
    setNotice(`Loaded revision seed from "${roadmap.topic}".`);
  };

  // ─── Flashcard handlers ──────────────────────────────────
  const handleGenerateFlashcards = async () => {
    if (!backend2Token) {
      setError('Not authenticated. Please refresh.');
      return;
    }

    setError('');
    setNotice('');

    if (sourceType === 'text' && textInput.trim().length < 50) {
      setError('Please provide at least 50 characters of text.');
      return;
    }
    if (sourceType === 'url' && !urlInput.trim()) {
      setError('Please provide a URL.');
      return;
    }
    if (sourceType === 'pdf' && !pdfFile) {
      setError('Please upload a PDF file.');
      return;
    }

    setFlashcardsLoading(true);
    try {
      const form = new FormData();
      form.append('num_cards', String(flashcardNumCards));
      form.append('words_per_card', String(flashcardWordsPerCard));

      if (sourceType === 'pdf' && pdfFile) {
        form.append('pdf', pdfFile);
      } else if (sourceType === 'url') {
        const normalizedUrl = /^https?:\/\//i.test(urlInput.trim()) ? urlInput.trim() : `https://${urlInput.trim()}`;
        form.append('url', normalizedUrl);
      } else {
        form.append('text', textInput.trim());
      }

      const res = await axios.post('/api2/api/flashcards/generate', form, {
        headers: { Authorization: `Bearer ${backend2Token}` },
      });

      const cards: Flashcard[] = res.data?.flashcards || [];
      setFlashcards(cards);
      setFlashcardOriginalContent(res.data?.original_content || '');
      setFlashcardContentSource(res.data?.content_source || sourceType);
      setFlashcardStudyIndex(0);
      setShowFlashcardBack(false);
      setNotice(`Generated ${cards.length} flashcards!`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || (err as { message?: string })?.message || 'Failed to generate flashcards');
    } finally {
      setFlashcardsLoading(false);
    }
  };

  const handleSaveFlashcards = async () => {
    if (!backend2Token || flashcards.length === 0) return;
    setFlashcardsSaving(true);
    setError('');
    try {
      await axios.post(
        '/api2/api/flashcards/save',
        {
          flashcards,
          original_content: flashcardOriginalContent || textInput.trim() || urlInput.trim() || 'pdf upload',
          content_source: flashcardContentSource || sourceType,
          num_cards: flashcardNumCards,
          words_per_card: flashcardWordsPerCard,
        },
        { headers: { Authorization: `Bearer ${backend2Token}` } }
      );
      setNotice('Flashcards saved successfully!');
      await loadFlashcardHistory(backend2Token);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Failed to save flashcards');
    } finally {
      setFlashcardsSaving(false);
    }
  };

  const loadFlashcardSet = async (flashcardId: number) => {
    if (!backend2Token) return;
    setError('');
    try {
      const res = await axios.get(`/api2/api/flashcards/history/${flashcardId}`, {
        headers: { Authorization: `Bearer ${backend2Token}` },
      });
      const set = res.data?.flashcard_set;
      if (set?.flashcards) {
        setFlashcards(set.flashcards);
        setFlashcardStudyIndex(0);
        setShowFlashcardBack(false);
        setNotice(`Loaded flashcard set #${flashcardId} (${set.flashcards.length} cards).`);
      }
    } catch (err: unknown) {
      setError('Failed to load flashcard set');
    }
  };

  const currentCard = flashcards[flashcardStudyIndex] || null;
  const tone = currentCard ? getFlashcardTone(currentCard.difficulty) : null;

  return (
    <div className="min-h-full space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-50/50 dark:bg-[var(--soft-sunken)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Revision Hub</h1>
          <p className="text-sm text-slate-500 dark:text-neutral-400 mt-1">
            Revise completed courses, generate explainers, and study with AI flashcards.
          </p>
        </div>
        <button
          onClick={async () => {
            if (!backend2Token) return;
            setNotice('');
            setError('');
            await Promise.all([loadCompletedRoadmaps(), loadHistory(backend2Token), loadFlashcardHistory(backend2Token)]);
            setNotice('Revision data refreshed.');
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-neutral-100 dark:text-black dark:hover:bg-white"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
          {notice}
        </div>
      )}

      {/* Tab Toggle */}
      <div className="flex items-center gap-2 bg-white dark:bg-[#111] border border-slate-200 dark:border-neutral-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('explainer')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'explainer'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-900'
          }`}
        >
          <Sparkles className="w-4 h-4" /> Explainer
        </button>
        <button
          onClick={() => setActiveTab('flashcards')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'flashcards'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-900'
          }`}
        >
          <Layers3 className="w-4 h-4" /> Flashcards
        </button>
      </div>

      {/* ═══════════ COMPLETED COURSES ═══════════ */}
      <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-cyan-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Completed Courses</h2>
        </div>

        {roadmapsLoading ? (
          <div className="py-8 text-sm text-slate-500 dark:text-neutral-400 inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading completed courses...
          </div>
        ) : completedSummary.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-neutral-400">No completed courses yet. Complete roadmap nodes to build revision sets.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {completedSummary.map(({ roadmap, completedNodes }) => (
              <div key={roadmap._id} className="rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{roadmap.topic}</h3>
                    <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
                      {completedNodes.length} completed nodes • {new Date(roadmap.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => seedFromRoadmap(roadmap, completedNodes)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white"
                  >
                    Revise This Course
                  </button>
                </div>
                {completedNodes.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {completedNodes.slice(0, 8).map((node, idx) => (
                      <span key={`${roadmap._id}-node-${idx}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> {node.topic}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════ EXPLAINER TAB ═══════════ */}
      {activeTab === 'explainer' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Input Panel */}
          <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Explainer Input</h2>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {(['text', 'url', 'pdf'] as SourceType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setSourceType(type)}
                    className={`px-2 py-2 rounded-lg text-xs font-semibold border ${sourceType === type
                      ? 'bg-cyan-600 border-cyan-600 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-200'
                      }`}
                  >
                    {type === 'text' ? 'Text' : type === 'url' ? 'URL' : 'PDF'}
                  </button>
                ))}
              </div>

              <select
                value={complexity}
                onChange={(e) => setComplexity(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>

              {sourceType === 'text' && (
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  rows={8}
                  placeholder="Paste course notes, concepts, or any text for explanation..."
                  className="w-full rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                />
              )}

              {sourceType === 'url' && (
                <div className="relative">
                  <LinkIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/learn/topic"
                    className="w-full rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 pl-9 pr-3 py-2 text-sm"
                  />
                </div>
              )}

              {sourceType === 'pdf' && (
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 dark:border-neutral-700 rounded-lg px-3 py-6 text-sm text-slate-500 dark:text-neutral-400 cursor-pointer hover:border-cyan-400 dark:hover:border-cyan-500/50">
                  <Upload className="w-4 h-4" />
                  <span>{pdfFile ? pdfFile.name : 'Upload PDF for explanation'}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-neutral-100 dark:text-black dark:hover:bg-white"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate Explanation
              </button>

              <button
                onClick={handleSave}
                disabled={!explainer || saving}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save to Revision History
              </button>
            </div>
          </div>

          {/* Explanation Display */}
          <div className="xl:col-span-2 space-y-6">
            <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-emerald-500" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Generated Explanation</h2>
              </div>

              {!explainer ? (
                <p className="text-sm text-slate-500 dark:text-neutral-400">Generate an explanation to see revision content here.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">{String(explainer.title || 'Untitled Explanation')}</h3>
                    <p className="text-sm text-slate-600 dark:text-neutral-300 mt-1">{String(explainer.summary || '')}</p>
                  </div>

                  {Array.isArray(explainer.sections) && explainer.sections.length > 0 && (
                    <div className="space-y-3">
                      {explainer.sections.map((section, idx) => (
                        <div key={`section-${idx}`} className="rounded-lg border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900 p-3">
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{section.heading || `Section ${idx + 1}`}</h4>
                          <p className="text-sm text-slate-600 dark:text-neutral-300 mt-1">{section.content || ''}</p>
                          {Array.isArray(section.key_points) && section.key_points.length > 0 && (
                            <ul className="mt-2 text-xs text-slate-500 dark:text-neutral-400 list-disc pl-5 space-y-1">
                              {section.key_points.slice(0, 5).map((kp, i) => (
                                <li key={`kp-${idx}-${i}`}>{kp}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {Array.isArray(explainer.concepts) && explainer.concepts.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Key Concepts</h4>
                      <div className="space-y-2">
                        {explainer.concepts.slice(0, 8).map((concept, idx) => (
                          <div key={`concept-${idx}`} className="rounded-lg border border-slate-200 dark:border-neutral-800 px-3 py-2">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{concept.term || `Concept ${idx + 1}`}</p>
                            <p className="text-xs text-slate-600 dark:text-neutral-300 mt-1">{concept.definition || ''}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* History */}
            <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Saved Explanations</h2>
              </div>

              {historyLoading ? (
                <div className="text-sm text-slate-500 dark:text-neutral-400 inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading history...
                </div>
              ) : historyItems.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-neutral-400">No saved revision explainers yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
                  {historyItems.map((item) => (
                    <button
                      key={item._id}
                      onClick={() => loadHistoryItem(item.explainer_id)}
                      className="w-full text-left rounded-lg border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900 px-3 py-2 hover:border-cyan-300 dark:hover:border-cyan-500/40"
                    >
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{item.title || `Explainer #${item.explainer_id}`}</p>
                      <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
                        #{item.explainer_id} • {item.content_source} • {item.complexity}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ FLASHCARDS TAB ═══════════ */}
      {activeTab === 'flashcards' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Input Panel */}
          <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5 text-violet-500" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Flashcard Generator</h2>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {(['text', 'url', 'pdf'] as SourceType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setSourceType(type)}
                    className={`px-2 py-2 rounded-lg text-xs font-semibold border ${sourceType === type
                      ? 'bg-violet-600 border-violet-600 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-200'
                      }`}
                  >
                    {type === 'text' ? 'Text' : type === 'url' ? 'URL' : 'PDF'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cards</label>
                  <input
                    type="number"
                    min={5}
                    max={50}
                    value={flashcardNumCards}
                    onChange={(e) => setFlashcardNumCards(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Words/Card</label>
                  <input
                    type="number"
                    min={20}
                    max={50}
                    value={flashcardWordsPerCard}
                    onChange={(e) => setFlashcardWordsPerCard(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {sourceType === 'text' && (
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  rows={6}
                  placeholder="Paste content to generate flashcards from..."
                  className="w-full rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                />
              )}

              {sourceType === 'url' && (
                <div className="relative">
                  <LinkIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/article"
                    className="w-full rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 pl-9 pr-3 py-2 text-sm"
                  />
                </div>
              )}

              {sourceType === 'pdf' && (
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 dark:border-neutral-700 rounded-lg px-3 py-6 text-sm text-slate-500 dark:text-neutral-400 cursor-pointer hover:border-violet-400 dark:hover:border-violet-500/50">
                  <Upload className="w-4 h-4" />
                  <span>{pdfFile ? pdfFile.name : 'Upload PDF'}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}

              <button
                onClick={handleGenerateFlashcards}
                disabled={flashcardsLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-60"
              >
                {flashcardsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                Generate Flashcards
              </button>

              {flashcards.length > 0 && (
                <button
                  onClick={handleSaveFlashcards}
                  disabled={flashcardsSaving}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {flashcardsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Flashcard Set
                </button>
              )}
            </div>

            {/* Flashcard History */}
            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-neutral-800">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-orange-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Saved Sets</h3>
              </div>
              {flashcardHistoryLoading ? (
                <div className="text-xs text-slate-400 inline-flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                </div>
              ) : flashcardHistory.length === 0 ? (
                <p className="text-xs text-slate-400">No saved flashcard sets yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {flashcardHistory.map((item) => (
                    <button
                      key={item._id}
                      onClick={() => loadFlashcardSet(item.flashcard_id)}
                      className="w-full text-left rounded-lg border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900 px-3 py-2 hover:border-violet-300 dark:hover:border-violet-500/40"
                    >
                      <p className="text-xs font-semibold text-slate-800 dark:text-white">
                        Set #{item.flashcard_id} • {item.total_cards} cards
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {item.content_source} • {new Date(item.created_at).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Flashcard Study Area */}
          <div className="xl:col-span-2">
            {flashcards.length === 0 ? (
              <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-10 text-center">
                <Layers3 className="w-12 h-12 mx-auto text-slate-300 dark:text-neutral-700 mb-4" />
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">No Flashcards Yet</h3>
                <p className="text-sm text-slate-500 dark:text-neutral-400">Generate flashcards from text, URL, or PDF to start studying.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Progress Bar */}
                <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Card {flashcardStudyIndex + 1} of {flashcards.length}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      {Math.round(((flashcardStudyIndex + 1) / flashcards.length) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-neutral-800 rounded-full h-2">
                    <div
                      className="bg-violet-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${((flashcardStudyIndex + 1) / flashcards.length) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Card */}
                {currentCard && tone && (
                  <div
                    onClick={() => setShowFlashcardBack(!showFlashcardBack)}
                    className={`cursor-pointer bg-white dark:bg-[var(--soft-sunken)] rounded-2xl p-8 sm:p-10 min-h-[280px] flex flex-col items-center justify-center text-center transition-all duration-500 ${
                      showFlashcardBack ? tone.backGlow : tone.frontGlow
                    }`}
                  >
                    <div className="mb-4 flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${tone.chip}`}>
                        {currentCard.difficulty || 'medium'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                        {showFlashcardBack ? 'ANSWER' : 'QUESTION'}
                      </span>
                    </div>
                    <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-relaxed max-w-lg">
                      {showFlashcardBack ? currentCard.back : currentCard.front}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-6 uppercase tracking-widest">
                      Click to {showFlashcardBack ? 'see question' : 'reveal answer'}
                    </p>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => { setFlashcardStudyIndex(Math.max(0, flashcardStudyIndex - 1)); setShowFlashcardBack(false); }}
                    disabled={flashcardStudyIndex === 0}
                    className="p-3 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-neutral-900 disabled:opacity-30 transition-all"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => { setFlashcardStudyIndex(0); setShowFlashcardBack(false); }}
                    className="px-4 py-2 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-neutral-800 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-neutral-900 inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset
                  </button>
                  <button
                    onClick={() => { setFlashcardStudyIndex(Math.min(flashcards.length - 1, flashcardStudyIndex + 1)); setShowFlashcardBack(false); }}
                    disabled={flashcardStudyIndex === flashcards.length - 1}
                    className="p-3 rounded-xl bg-white dark:bg-[#111] border border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-neutral-900 disabled:opacity-30 transition-all"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {/* All Cards Grid */}
                <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3">All Cards</h3>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {flashcards.map((card, idx) => {
                      const t = getFlashcardTone(card.difficulty);
                      return (
                        <button
                          key={card.id}
                          onClick={() => { setFlashcardStudyIndex(idx); setShowFlashcardBack(false); }}
                          className={`w-full aspect-square rounded-lg border text-xs font-bold transition-all ${
                            idx === flashcardStudyIndex
                              ? 'bg-violet-600 border-violet-600 text-white scale-110 shadow-md'
                              : `bg-slate-50 dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-slate-400 hover:border-violet-300`
                          }`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
