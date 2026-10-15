'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Sparkles, Loader2, ExternalLink, Youtube, BookOpen, GraduationCap,
    MessageCircle, FileText, RefreshCw, AlertCircle,
    Zap, Search, Clock, Play, ArrowRight, Upload, FileUp, X, ArrowLeft,
    ScanSearch, Target, Cloud, History, Send, Bot, Video, Newspaper,
    Mic, MicOff, PhoneOff, Volume2,
    CheckCircle2, Trophy, Brain, XCircle, ClipboardCheck,
} from 'lucide-react';
import {
    ReactFlow, Background, Controls, MiniMap,
    type Node, type Edge, Position, Handle,
    ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '@clerk/nextjs';
import api from '@/lib/api';
import axios from 'axios';
import Vapi from '@vapi-ai/web';
import { scrollIntoPanel } from '@/lib/scroll';

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */

interface Resource {
    title: string;
    url: string;
    platform: string;
    thumbnail: string | null;
    duration: string | null;
    is_free: boolean;
    rating: number | null;
    instructor: string | null;
}

interface LearningNode {
    topic: string;
    resources: Resource[];
    fetched_at: string | null;
}

interface RoadmapResponse {
    success: boolean;
    mermaid_code: string;
    nodes: LearningNode[];
    message: string;
}

interface ResumeAnalysis {
    overallScore: number;
    missingKeywords: string[];
    keywords: string[];
    feedback: { critical: string[]; suggestions: string[]; strengths: string[] };
    summary: string;
}

interface SavedRoadmapData {
    _id: string;
    userId: string;
    clerkId?: string;
    topic: string;
    mermaidCode: string;
    nodes: (LearningNode & { status?: string; completedAt?: string; xpAwarded?: number })[];
    createdAt: string;
    progressPercent?: number;
    completedNodesCount?: number;
    totalNodesCount?: number;
    completedAt?: string | null;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

type ViewState = 'landing' | 'resume-upload' | 'resume-analysis' | 'topic-input' | 'loading' | 'roadmap' | 'video-player' | 'content-reader';

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

const CATEGORY_TABS = ['Videos', 'Content', 'Courses'] as const;

const NODE_COLORS = [
    { bg: '#06b6d4', border: '#0891b2', text: '#ffffff' },
    { bg: '#22c55e', border: '#16a34a', text: '#ffffff' },
    { bg: '#f97316', border: '#ea580c', text: '#ffffff' },
    { bg: '#ec4899', border: '#db2777', text: '#ffffff' },
    { bg: '#8b5cf6', border: '#7c3aed', text: '#ffffff' },
    { bg: '#eab308', border: '#ca8a04', text: '#000000' },
    { bg: '#ef4444', border: '#dc2626', text: '#ffffff' },
    { bg: '#14b8a6', border: '#0d9488', text: '#ffffff' },
];

function getPlatformKey(platform: string): string {
    if (platform.toLowerCase().includes('youtube')) return 'YouTube';
    if (platform.toLowerCase().includes('udemy')) return 'Udemy';
    if (platform.toLowerCase().includes('coursera')) return 'Coursera';
    if (platform.toLowerCase().includes('reddit')) return 'Reddit';
    return 'Blogs';
}

function getCategory(platform: string): 'Videos' | 'Content' | 'Courses' {
    const key = getPlatformKey(platform);
    if (key === 'YouTube') return 'Videos';
    if (key === 'Udemy' || key === 'Coursera') return 'Courses';
    return 'Content'; // Reddit + Blogs
}

function extractYouTubeId(url: string): string | null {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
}

/* ═══════════════════════════════════════════
   MERMAID → REACT FLOW PARSER
   ═══════════════════════════════════════════ */

function parseMermaidToReactFlow(mermaidCode: string, nodes: LearningNode[]) {
    const lines = mermaidCode.split('\n').map(l => l.trim()).filter(Boolean);
    const nodeMap = new Map<string, string>();
    const edges: { source: string; target: string }[] = [];

    for (const line of lines) {
        if (line.startsWith('graph') || line.startsWith('%%') || line.startsWith('style') || line.startsWith('classDef') || line.startsWith('class ')) continue;
        const edgeMatch = line.match(/^(\w+)\s*-->?\s*(\w+)(?:\[([^\]]*)\])?/);
        if (edgeMatch) {
            const [, source, target, label] = edgeMatch;
            edges.push({ source, target });
            if (label) nodeMap.set(target, label.replace(/["`]/g, ''));
            continue;
        }
        const nodeMatch = line.match(/^(\w+)\s*[\[("]+([^\])"]+)[\])"]+/);
        if (nodeMatch) {
            const [, id, label] = nodeMatch;
            nodeMap.set(id, label.replace(/["`]/g, ''));
        }
    }

    const children = new Map<string, string[]>();
    const parents = new Map<string, string[]>();
    for (const e of edges) {
        if (!children.has(e.source)) children.set(e.source, []);
        children.get(e.source)!.push(e.target);
        if (!parents.has(e.target)) parents.set(e.target, []);
        parents.get(e.target)!.push(e.source);
    }

    const allNodeIds = Array.from(nodeMap.keys());
    const roots = allNodeIds.filter(id => !parents.has(id));
    if (roots.length === 0 && allNodeIds.length > 0) roots.push(allNodeIds[0]);

    const depths = new Map<string, number>();
    const queue = [...roots];
    roots.forEach(r => depths.set(r, 0));
    while (queue.length > 0) {
        const current = queue.shift()!;
        const currentDepth = depths.get(current)!;
        for (const child of (children.get(current) || [])) {
            if (!depths.has(child)) {
                depths.set(child, currentDepth + 1);
                queue.push(child);
            }
        }
    }

    const depthGroups = new Map<number, string[]>();
    for (const [id, depth] of depths) {
        if (!depthGroups.has(depth)) depthGroups.set(depth, []);
        depthGroups.get(depth)!.push(id);
    }

    const horizontalGap = 280;
    const verticalGap = 120;

    const rfNodes: Node[] = [];
    for (const [depth, ids] of depthGroups) {
        const totalWidth = ids.length * horizontalGap;
        const startX = -(totalWidth / 2) + horizontalGap / 2;
        ids.forEach((id, idx) => {
            const colorIdx = depth % NODE_COLORS.length;
            const label = nodeMap.get(id) || id;
            const learningNode = nodes.find(n =>
                n.topic.toLowerCase() === label.toLowerCase() ||
                n.topic.toLowerCase().includes(label.toLowerCase()) ||
                label.toLowerCase().includes(n.topic.toLowerCase())
            );
            rfNodes.push({
                id,
                type: 'roadmapNode',
                position: { x: startX + idx * horizontalGap, y: depth * verticalGap },
                data: { label, color: NODE_COLORS[colorIdx], resourceCount: learningNode?.resources.length || 0, learningNode },
            });
        });
    }

    const rfEdges: Edge[] = edges.map((e, i) => ({
        id: `e-${i}`, source: e.source, target: e.target, type: 'smoothstep', animated: true,
        style: { stroke: '#475569', strokeWidth: 2 },
    }));

    return { nodes: rfNodes, edges: rfEdges };
}

/* ═══════════════════════════════════════════
   CUSTOM REACT FLOW NODE
   ═══════════════════════════════════════════ */

function RoadmapNodeComponent({ data }: { data: any }) {
    return (
        <div className="group cursor-pointer">
            <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-3 !h-3" />
            <div
                className="px-5 py-3 rounded-xl font-semibold text-sm shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl border-2 min-w-[160px] text-center"
                style={{ backgroundColor: data.color.bg, borderColor: data.color.border, color: data.color.text, boxShadow: `0 4px 20px ${data.color.bg}40` }}
            >
                {data.label}
                {data.resourceCount > 0 && <div className="text-[10px] font-normal mt-0.5 opacity-80">{data.resourceCount} resources</div>}
            </div>
            <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-3 !h-3" />
        </div>
    );
}

const nodeTypes = { roadmapNode: RoadmapNodeComponent };

/* ═══════════════════════════════════════════
   TRANSCRIPT TYPES
   ═══════════════════════════════════════════ */

interface TopicSection {
    title: string;
    start_ms: number;
    end_ms: number;
    summary: string;
    keywords: string[];
}

interface TranscriptData {
    overall_title: string;
    overall_summary: string;
    topics: TopicSection[];
    audio_duration_seconds: number | null;
}

function formatMs(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/* ═══════════════════════════════════════════
   VIDEO PLAYER VIEW (with Transcript + Chat + MURPH Voice)
   ═══════════════════════════════════════════ */

interface QuizQuestion {
    question: string;
    options: string[];
    correct: number;
}

function VideoPlayerView({ resource, topic, onBack }: { resource: Resource; topic: string; onBack: () => void }) {
    const videoId = extractYouTubeId(resource.url);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const { getToken } = useAuth();

    const [transcript, setTranscript] = useState<TranscriptData | null>(null);
    const [transcriptLoading, setTranscriptLoading] = useState(false);
    const [transcriptError, setTranscriptError] = useState('');
    const [activeChapter, setActiveChapter] = useState<number | null>(null);
    const [sidebarTab, setSidebarTab] = useState<'chapters' | 'chat'>('chapters');

    // Chat state
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // ── Quiz State ──
    const [quizLoading, setQuizLoading] = useState(false);
    const [showQuiz, setShowQuiz] = useState(false);
    const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
    const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
    const [quizSubmitted, setQuizSubmitted] = useState(false);
    const [quizScore, setQuizScore] = useState(0);

    // ── Smart Nudge State (same as Tutor page) ──
    const [smartNudge, setSmartNudge] = useState<{
        show: boolean; adapting: boolean; topic: string; message: string;
    }>({ show: false, adapting: false, topic: '', message: '' });

    // VAPI Voice State
    const vapiRef = useRef<Vapi | null>(null);
    const [vapiStatus, setVapiStatus] = useState<'idle' | 'connecting' | 'active'>('idle');
    const [vapiMuted, setVapiMuted] = useState(false);
    const [vapiVolume, setVapiVolume] = useState(0);
    const [vapiSpeaking, setVapiSpeaking] = useState(false);

    useEffect(() => { scrollIntoPanel(chatEndRef.current); }, [chatMessages]);

    // Sync transcript to window for VAPI message handler access (stable useEffect can't capture transcript)
    useEffect(() => { (window as any).__murphTranscript = transcript; }, [transcript]);

    // Fetch transcript — cache first, then transcribe
    useEffect(() => {
        if (!resource.url) return;
        setTranscriptLoading(true);
        setTranscriptError('');

        const vid = extractYouTubeId(resource.url);
        // Set when another resource is opened before this request finishes
        let cancelled = false;
        setTranscript(null);

        const fetchTranscript = async () => {
            try {
                // Step 1: Check cache via lookup
                if (vid) {
                    const lookupRes = await axios.get('/api2/api/yt_transcript/lookup', {
                        params: { video_id: vid }, timeout: 10000,
                    });
                    if (cancelled) return;
                    if (lookupRes.data?.found) {
                        setTranscript({
                            overall_title: lookupRes.data.overall_title,
                            overall_summary: lookupRes.data.overall_summary,
                            topics: lookupRes.data.topics || [],
                            audio_duration_seconds: lookupRes.data.assemblyai?.audio_duration_seconds || null,
                        });
                        setTranscriptLoading(false);
                        return;
                    }
                }

                // Step 2: Not cached — generate new transcript
                const res = await axios.post<any>(
                    '/api2/api/yt_transcript/transcribe',
                    { url: resource.url },
                    { timeout: 600000 }
                );
                if (cancelled) return;
                setTranscript({
                    overall_title: res.data.overall_title,
                    overall_summary: res.data.overall_summary,
                    topics: res.data.topics || [],
                    audio_duration_seconds: res.data.audio_duration_seconds,
                });
            } catch (err: any) {
                if (cancelled) return;
                const msg = err?.response?.data?.detail || err?.message || 'Failed to generate transcript';
                setTranscriptError(typeof msg === 'string' ? msg : JSON.stringify(msg));
            } finally {
                if (!cancelled) setTranscriptLoading(false);
            }
        };

        fetchTranscript();
        return () => { cancelled = true; };
    }, [resource.url]);

    // Seek video to a timestamp
    const seekTo = useCallback((ms: number, chapterIdx: number) => {
        setActiveChapter(chapterIdx);
        if (!videoId || !iframeRef.current) return;
        const seconds = Math.floor(ms / 1000);
        iframeRef.current.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&start=${seconds}`;
    }, [videoId]);

    // Seek by seconds (for VAPI jump commands) — use ref to avoid VAPI re-init
    const seekToSecondsRef = useRef<(seconds: number) => void>(() => {});
    seekToSecondsRef.current = (seconds: number) => {
        if (!videoId || !iframeRef.current) return;
        iframeRef.current.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&start=${seconds}`;
        if (transcript) {
            const ms = seconds * 1000;
            const idx = transcript.topics.findIndex((t, i) =>
                ms >= t.start_ms && (i === transcript.topics.length - 1 || ms < transcript.topics[i + 1].start_ms)
            );
            if (idx >= 0) setActiveChapter(idx);
        }
    };

    // ── VAPI Lifecycle (stable — no deps that cause re-init) ──
    useEffect(() => {
        const publicKey = process.env.NEXT_PUBLIC_MURPH_VAPI_KEY;
        if (!publicKey) return;

        const vapi = new Vapi(publicKey);
        vapiRef.current = vapi;

        vapi.on('call-start', () => {
            setVapiStatus('active');
        });
        vapi.on('call-end', () => {
            setVapiStatus('idle'); setVapiSpeaking(false); setVapiVolume(0);
            // Resume video when call ends
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
        });
        vapi.on('speech-start', () => {
            setVapiSpeaking(true);
            // Pause video while MURPH speaks
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        });
        vapi.on('speech-end', () => {
            setVapiSpeaking(false);
            // Resume video when MURPH stops speaking
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
        });
        vapi.on('volume-level', (level: number) => setVapiVolume(level));
        vapi.on('error', (err: any) => {
            console.error('VAPI error:', JSON.stringify(err, null, 2), err?.message, err?.error);
            setVapiStatus('idle');
        });

        // Listen for transcripts, tool calls, and messages
        vapi.on('message', (msg: any) => {
            console.log('VAPI msg:', msg.type, msg);

            // Live transcripts → push to chat feed
            if (msg.type === 'transcript' && msg.transcriptType === 'final') {
                const role = msg.role === 'assistant' ? 'assistant' : 'user';
                const text = msg.transcript?.trim();
                if (text) {
                    setChatMessages(prev => [...prev, { role, content: text }]);
                }
            }

            // Intercept tool CALLS (when MURPH decides to jump) — seek immediately
            if (msg.type === 'tool-calls') {
                const toolCalls = msg.toolCalls || msg.toolCallList || [];
                for (const tc of toolCalls) {
                    if (tc.function?.name === 'jump_to_video_timestamp') {
                        const args = typeof tc.function.arguments === 'string'
                            ? JSON.parse(tc.function.arguments || '{}')
                            : (tc.function.arguments || {});
                        
                        console.log('🎯 MURPH jump request:', args);

                        // If direct timestamp provided, use it
                        if (args.timestamp_seconds) {
                            seekToSecondsRef.current(Math.floor(args.timestamp_seconds));
                            return;
                        }

                        // Otherwise search transcript topics by query
                        if (args.query) {
                            const q = args.query.toLowerCase();
                            const transcriptRef = (window as any).__murphTranscript;
                            if (transcriptRef?.topics) {
                                const match = transcriptRef.topics.find((t: any) =>
                                    t.title?.toLowerCase().includes(q) ||
                                    t.summary?.toLowerCase().includes(q) ||
                                    t.keywords?.some((kw: string) => kw.toLowerCase().includes(q))
                                );
                                if (match) {
                                    seekToSecondsRef.current(Math.floor(match.start_ms / 1000));
                                }
                            }
                        }
                    }
                }
            }

            // Fallback: check tool-calls-result for [JUMP:N]
            if (msg.type === 'tool-calls-result' || msg.type === 'function-call') {
                const resultText = msg.results?.[0]?.result || msg.functionCallResult || '';
                const jumpMatch = resultText.match(/\[JUMP:(\d+)\]/);
                if (jumpMatch) {
                    seekToSecondsRef.current(parseInt(jumpMatch[1], 10));
                }
            }
        });

        return () => { vapi.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startVapiCall = useCallback(async () => {
        const assistantId = process.env.NEXT_PUBLIC_MURPH_ASSISTANT_ID;
        if (!vapiRef.current || !assistantId) return;
        setVapiStatus('connecting');
        setSidebarTab('chat');

        // Build full transcript context for MURPH's system prompt
        const chaptersText = transcript?.topics.map((t, i) =>
            `Chapter ${i + 1}: "${t.title}" (${formatMs(t.start_ms)} - ${formatMs(t.end_ms)})\n  Summary: ${t.summary}\n  Keywords: ${t.keywords.join(', ')}`
        ).join('\n\n') || 'No chapters available yet.';

        const transcriptContext = `
VIDEO TITLE: ${resource.title}
TOPIC: ${topic}
OVERALL SUMMARY: ${transcript?.overall_summary || 'Not available'}

VIDEO CHAPTERS/TRANSCRIPT:
${chaptersText}
`;

        try {
            await vapiRef.current.start(assistantId, {
                variableValues: {
                    youtubeVideoId: videoId || '',
                },
                serverUrl: `${window.location.origin}/api/vapi/tool`,
                model: {
                    provider: 'openai' as const,
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'system' as const,
                            content: `You are MURPH, an intelligent, empathetic, and professional Learning Concierge.
You are watching a video alongside the student and have access to the full transcript below.

${transcriptContext}

INSTRUCTIONS:
1. Use the transcript above to explain what the teacher said at any point.
2. When the student asks about a specific topic, reference the exact chapter and timestamp.
3. If the student wants to see a specific part, use the jump_to_video_timestamp tool with the topic query.
4. If asked about something NOT in the video, explain using general knowledge but state: "The teacher didn't mention this specifically, but here is a general explanation..."
5. Be encouraging, supportive, and clear. Speak naturally.
6. You are fluent in English, Hindi, and Marathi. Keep technical terms in English.`,
                        },
                    ],
                },
                clientMessages: ['transcript', 'tool-calls', 'tool-calls-result', 'speech-update', 'status-update'] as any,
            } as any);
        } catch (err) {
            console.error('Failed to start MURPH:', err);
            setVapiStatus('idle');
        }
    }, [transcript, resource.title, videoId, topic]);

    const endVapiCall = useCallback(() => {
        vapiRef.current?.stop();
        setVapiStatus('idle');
    }, []);

    const toggleVapiMute = useCallback(() => {
        setVapiMuted(prev => {
            const newMuted = !prev;
            vapiRef.current?.setMuted(newMuted);
            return newMuted;
        });
    }, []);

    // Send chat message
    const sendChatMessage = async () => {
        const msg = chatInput.trim();
        if (!msg || chatLoading || !transcript) return;
        setChatInput('');
        const userMsg: ChatMessage = { role: 'user', content: msg };
        setChatMessages(prev => [...prev, userMsg]);
        setChatLoading(true);

        try {
            const res = await axios.post('/api/video-chat', {
                message: msg,
                videoTitle: resource.title,
                topic,
                overallSummary: transcript.overall_summary,
                chapters: transcript.topics,
                history: [...chatMessages, userMsg],
            });

            setChatMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);

            // Auto-seek if AI returned a chapter index
            if (res.data.seekToChapter !== null && res.data.seekToChapter !== undefined) {
                const chIdx = res.data.seekToChapter;
                if (chIdx >= 0 && chIdx < transcript.topics.length) {
                    seekTo(transcript.topics[chIdx].start_ms, chIdx);
                    setSidebarTab('chapters'); // switch to chapters to show active
                }
            }
        } catch {
            setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
        } finally {
            setChatLoading(false);
        }
    };

    // \u2500\u2500 Quiz generation from transcript \u2500\u2500
    const generateQuiz = async () => {
        if (!transcript) return;
        setQuizLoading(true);
        try {
            const res = await axios.post('/api/video-quiz', {
                videoTitle: resource.title,
                topic,
                overallSummary: transcript.overall_summary,
                chapters: transcript.topics,
            });
            setQuizQuestions(res.data.questions || []);
            setSelectedAnswers({});
            setQuizSubmitted(false);
            setQuizScore(0);
            setShowQuiz(true);
        } catch {
            // ignore error silently
        } finally {
            setQuizLoading(false);
        }
    };

    // \u2500\u2500 Quiz submit + adaptation trigger \u2500\u2500
    const handleQuizSubmit = async () => {
        if (quizQuestions.length === 0) return;
        let correct = 0;
        quizQuestions.forEach((q, i) => { if (selectedAnswers[i] === q.correct) correct++; });
        const pct = Math.round((correct / quizQuestions.length) * 100);
        setQuizScore(pct);
        setQuizSubmitted(true);

        if (pct < 60) {
            setTimeout(async () => {
                setShowQuiz(false);
                setSmartNudge({ show: true, adapting: true, topic, message: '' });
                try {
                    const token = await getToken();
                    const res = await axios.post('/api/roadmap/adapt-active', {
                        topic,
                        score: pct,
                        incorrectTopics: quizQuestions
                            .filter((q, i) => selectedAnswers[i] !== q.correct)
                            .map(q => q.question),
                    }, { headers: { Authorization: `Bearer ${token}` } });
                    setSmartNudge({
                        show: true,
                        adapting: false,
                        topic,
                        message: res.data?.message ||
                            `Your learning path has been adapted. A focused review on "${topic}" has been added to your roadmap.`,
                    });
                } catch {
                    setSmartNudge({
                        show: true,
                        adapting: false,
                        topic,
                        message: `Your learning path has been adapted. A focused review on "${topic}" has been added to your roadmap.`,
                    });
                }
            }, 1200);
        }
    };

    return (
        <>
            {/* \u2500\u2500 Main View \u2500\u2500 */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Resources
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Video Player */}
                    <div className="lg:col-span-7">
                        <div className="bg-black rounded-2xl overflow-hidden">
                            <div className="relative aspect-video">
                                {videoId ? (
                                    <iframe
                                        ref={iframeRef}
                                        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`}
                                        className="absolute inset-0 w-full h-full"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                        title={resource.title}
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-white">
                                        <p>Could not load video. <a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">Open on YouTube</a></p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded text-[11px] font-bold flex items-center gap-1">
                                    <Youtube className="w-3 h-3" /> YouTube
                                </span>
                                {resource.duration && resource.duration !== 'N/A' && (
                                    <span className="text-xs text-slate-400 dark:text-neutral-500 flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> {resource.duration}
                                    </span>
                                )}
                                {resource.is_free ? (
                                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">FREE</span>
                                ) : (
                                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">PAID</span>
                                )}
                            </div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{resource.title}</h1>
                            {resource.instructor && <p className="text-sm text-slate-500 dark:text-neutral-400">by {resource.instructor}</p>}
                            {transcript && (
                                <p className="text-sm text-slate-500 dark:text-neutral-400 mt-2 leading-relaxed">{transcript.overall_summary}</p>
                            )}

                            {/* \u2500\u2500 Take Quiz Button \u2500\u2500 */}
                            {transcript && !transcriptLoading && (
                                <div className="mt-4">
                                    <button
                                        onClick={generateQuiz}
                                        disabled={quizLoading}
                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {quizLoading
                                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating Quiz...</>
                                            : <><ClipboardCheck className="w-4 h-4" /> Take Video Quiz</>}
                                    </button>
                                    <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-1.5">Test your understanding • Adaptive AI feedback</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sidebar: Chapters + Chat */}
                    <div className="lg:col-span-5">
                        <div className="bg-white dark:bg-[var(--soft-surface)] border border-slate-200 dark:border-neutral-800 rounded-2xl overflow-hidden sticky top-6 flex flex-col" style={{ height: '620px' }}>
                            {/* Sidebar Header with Tabs */}
                            <div className="border-b border-slate-200 dark:border-neutral-800">
                                <div className="p-3 pb-0 flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                                            <FileText className="w-4 h-4 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800 dark:text-white text-[13px]">
                                                {transcriptLoading ? 'Transcribing...' : transcript ? transcript.overall_title || resource.title : resource.title}
                                            </h3>
                                            <p className="text-[10px] text-slate-500 dark:text-neutral-400">
                                                {transcriptLoading ? 'Processing audio...' : transcript ? `${transcript.topics.length} chapters` : 'From: ' + topic}
                                            </p>
                                        </div>
                                    </div>
                                    <a href={resource.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors" title="Open on YouTube">
                                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-400" />
                                    </a>
                                </div>
                                {/* Tab Buttons */}
                                <div className="flex gap-1 p-2 px-3">
                                    <button
                                        onClick={() => setSidebarTab('chapters')}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${sidebarTab === 'chapters'
                                            ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20'
                                            : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-800 border border-transparent'}`}
                                    >
                                        <FileText className="w-3 h-3" /> Chapters
                                    </button>
                                    <button
                                        onClick={() => setSidebarTab('chat')}
                                        disabled={!transcript}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${sidebarTab === 'chat'
                                            ? 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20'
                                            : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-800 border border-transparent'}`}
                                    >
                                        <Bot className="w-3 h-3" />
                                        {vapiStatus === 'active' ? '🟢 Live' : 'Ask AI'}
                                    </button>
                                </div>
                            </div>

                            {/* \u2500\u2500 CHAPTERS TAB \u2500\u2500 */}
                            {sidebarTab === 'chapters' && (
                                <div className="flex-1 overflow-y-auto">
                                    {transcriptLoading && (
                                        <div className="flex flex-col items-center justify-center py-12 px-4 space-y-4">
                                            <div className="relative w-16 h-16">
                                                <div className="absolute inset-0 border-4 border-slate-200 dark:border-neutral-800 rounded-full" />
                                                <div className="absolute inset-0 border-4 border-red-500 rounded-full border-t-transparent animate-spin" />
                                                <div className="absolute inset-0 flex items-center justify-center"><FileText className="w-6 h-6 text-red-500" /></div>
                                            </div>
                                            <div className="text-center">
                                                <h4 className="text-sm font-bold text-slate-800 dark:text-white">Generating Transcript</h4>
                                                <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1 max-w-[200px]">AI is transcribing and segmenting the video into topics...</p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        </div>
                                    )}

                                    {transcriptError && !transcriptLoading && (
                                        <div className="p-4 space-y-3">
                                            <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg">
                                                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-xs font-semibold text-red-600 dark:text-red-400">Transcript unavailable</p>
                                                    <p className="text-[11px] text-red-500/80 dark:text-red-400/60 mt-0.5">{transcriptError}</p>
                                                </div>
                                            </div>
                                            <div className="space-y-3 pt-2">
                                                <p className="text-sm text-slate-600 dark:text-neutral-300 leading-relaxed">Watch this tutorial to learn about <strong className="text-slate-900 dark:text-white">{topic}</strong>.</p>
                                                <a href={resource.url} target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors"><ExternalLink className="w-4 h-4" /> Open on YouTube</a>
                                            </div>
                                        </div>
                                    )}

                                    {transcript && !transcriptLoading && (
                                        <div className="p-2 space-y-1">
                                            {transcript.topics.map((section, idx) => (
                                                <div key={idx}>
                                                    <button
                                                        onClick={() => seekTo(section.start_ms, idx)}
                                                        className={`w-full text-left p-3 rounded-xl transition-all group ${activeChapter === idx
                                                            ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20'
                                                            : 'hover:bg-slate-50 dark:hover:bg-neutral-800/50 border border-transparent'}`}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${activeChapter === idx ? 'bg-red-500 text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 group-hover:bg-red-100 dark:group-hover:bg-red-500/10 group-hover:text-red-500'}`}>
                                                                {activeChapter === idx ? <Play className="w-3 h-3" /> : idx + 1}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <h4 className={`text-sm font-semibold truncate ${activeChapter === idx ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>{section.title}</h4>
                                                                    <span className="text-[10px] font-mono text-slate-400 dark:text-neutral-500 shrink-0 tabular-nums">{formatMs(section.start_ms)}</span>
                                                                </div>
                                                                <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-0.5 line-clamp-2 leading-relaxed">{section.summary}</p>
                                                            </div>
                                                        </div>
                                                    </button>
                                                    {activeChapter === idx && section.keywords.length > 0 && (
                                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="px-3 pb-2 pl-12">
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {section.keywords.map((kw, ki) => (
                                                                    <span key={ki} className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400">{kw}</span>
                                                                ))}
                                                            </div>
                                                            <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1">{formatMs(section.start_ms)} — {formatMs(section.end_ms)}</p>
                                                        </motion.div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* \u2500\u2500 CHAT TAB \u2500\u2500 */}
                            {sidebarTab === 'chat' && transcript && (
                                <>
                                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                                        {chatMessages.length === 0 && (
                                            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 px-4">
                                                <div className="w-14 h-14 rounded-2xl bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center">
                                                    <Bot className="w-7 h-7 text-cyan-600 dark:text-cyan-400" />
                                                </div>
                                                <h4 className="text-sm font-bold text-slate-800 dark:text-white">Video AI Tutor</h4>
                                                <p className="text-xs text-slate-400 dark:text-neutral-500 max-w-[220px]">
                                                    Ask me anything about this video. I know all <strong className="text-slate-600 dark:text-neutral-300">{transcript.topics.length} chapters</strong> and can jump to any part!
                                                </p>
                                                <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                                                    {[
                                                        'Summarize this video',
                                                        'Explain key concepts',
                                                        `Jump to ${transcript.topics.length > 1 ? transcript.topics[1]?.title : 'next topic'}`,
                                                    ].map(q => (
                                                        <button
                                                            key={q}
                                                            onClick={() => setChatInput(q)}
                                                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                                                        >
                                                            {q}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {chatMessages.map((msg, i) => (
                                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === 'user'
                                                    ? 'bg-cyan-500 text-white rounded-br-md'
                                                    : 'bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-neutral-200 rounded-bl-md'}`}
                                                >
                                                    {msg.content}
                                                </div>
                                            </div>
                                        ))}
                                        {chatLoading && (
                                            <div className="flex justify-start">
                                                <div className="bg-slate-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                        <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                        <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div ref={chatEndRef} />
                                    </div>

                                    {/* MURPH Voice Controls */}
                                    <div className="p-2.5 border-t border-slate-200 dark:border-neutral-800 space-y-2">
                                        <div className="flex items-center gap-2">
                                            {vapiStatus === 'idle' ? (
                                                <button
                                                    onClick={startVapiCall}
                                                    className="flex-1 h-10 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all flex items-center justify-center gap-2 shadow-sm"
                                                >
                                                    <Mic className="w-4 h-4" /> Talk to MURPH
                                                </button>
                                            ) : vapiStatus === 'connecting' ? (
                                                <div className="flex-1 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                                                    <Loader2 className="w-4 h-4 animate-spin" /> Connecting...
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex-1 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center px-3 gap-2">
                                                        <div className="relative w-6 h-6 shrink-0">
                                                            <motion.div
                                                                animate={{ scale: 1 + vapiVolume * 0.3, opacity: vapiVolume > 0.1 ? 0.4 : 0 }}
                                                                className="absolute inset-0 rounded-full bg-indigo-400"
                                                            />
                                                            <div className="absolute inset-0 flex items-center justify-center">
                                                                {vapiSpeaking
                                                                    ? <Volume2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                                                    : <Mic className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                                                }
                                                            </div>
                                                        </div>
                                                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 truncate">
                                                            {vapiSpeaking ? 'MURPH speaking...' : 'Listening...'}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={toggleVapiMute}
                                                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 ${vapiMuted
                                                            ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                                                            : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 border border-slate-200 dark:border-neutral-700'}`}
                                                        title={vapiMuted ? 'Unmute' : 'Mute'}
                                                    >
                                                        {vapiMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                                    </button>
                                                    <button
                                                        onClick={endVapiCall}
                                                        className="w-10 h-10 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shrink-0"
                                                        title="End call"
                                                    >
                                                        <PhoneOff className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>

                                        {/* Text Input */}
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={chatInput}
                                                onChange={e => setChatInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') sendChatMessage(); }}
                                                placeholder={vapiStatus === 'active' ? 'Or type here...' : 'Ask about this video...'}
                                                className="flex-1 h-9 px-3 rounded-lg bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                                            />
                                            <button
                                                onClick={sendChatMessage}
                                                disabled={!chatInput.trim() || chatLoading}
                                                className="w-9 h-9 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                            >
                                                <Send className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* \u2500\u2500 Quiz Modal \u2500\u2500 */}
            <AnimatePresence>
                {showQuiz && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                        onClick={() => !quizSubmitted && setShowQuiz(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: 24 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: 24 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
                            className="relative w-full max-w-lg rounded-2xl bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.18)] border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 via-indigo-400 to-cyan-400 flex-shrink-0" />
                            <div className="p-5 flex items-start justify-between flex-shrink-0">
                                <div>
                                    <h3 className="text-[17px] font-bold text-slate-900">📋 Video Quiz</h3>
                                    <p className="text-[11px] font-medium text-violet-500 mt-0.5 uppercase tracking-wide">{topic} • {quizQuestions.length} questions</p>
                                </div>
                                <button onClick={() => setShowQuiz(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                                    <XCircle className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="overflow-y-auto flex-1 px-5 pb-2 space-y-5">
                                {quizQuestions.map((q, qi) => (
                                    <div key={qi} className="space-y-2.5">
                                        <p className="text-sm font-semibold text-slate-800">{qi + 1}. {q.question}</p>
                                        <div className="space-y-1.5">
                                            {q.options.map((opt, oi) => {
                                                const isSelected = selectedAnswers[qi] === oi;
                                                const isCorrect = quizSubmitted && oi === q.correct;
                                                const isWrong = quizSubmitted && isSelected && oi !== q.correct;
                                                return (
                                                    <button
                                                        key={oi}
                                                        disabled={quizSubmitted}
                                                        onClick={() => !quizSubmitted && setSelectedAnswers(prev => ({ ...prev, [qi]: oi }))}
                                                        className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-sm transition-all ${
                                                            isCorrect ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium'
                                                            : isWrong ? 'bg-red-50 border-red-300 text-red-700'
                                                            : isSelected ? 'bg-violet-50 border-violet-400 text-violet-800 font-medium'
                                                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-violet-300 hover:bg-violet-50/50'
                                                        }`}
                                                    >
                                                        <span className="font-bold mr-2">{String.fromCharCode(65 + oi)}.</span>{opt}
                                                        {isCorrect && <span className="float-right text-emerald-500">✓</span>}
                                                        {isWrong && <span className="float-right text-red-500">✗</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="p-5 border-t border-slate-100 flex-shrink-0">
                                {quizSubmitted ? (
                                    <div className="space-y-3">
                                        <div className={`rounded-xl p-4 flex items-center gap-3 ${
                                            quizScore >= 60 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
                                        }`}>
                                            {quizScore >= 60
                                                ? <Trophy className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                                                : <Brain className="w-6 h-6 text-red-500 flex-shrink-0" />}
                                            <div>
                                                <p className={`text-sm font-bold ${ quizScore >= 60 ? 'text-emerald-700' : 'text-red-700' }`}>
                                                    {quizScore >= 60 ? `Great job! ${quizScore}% correct` : `${quizScore}% — Keep practicing!`}
                                                </p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    {quizScore >= 60
                                                        ? 'You have a solid understanding of this topic.'
                                                        : 'AI is adapting your roadmap to help you improve.'}
                                                </p>
                                            </div>
                                        </div>
                                        <button onClick={() => setShowQuiz(false)} className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors">
                                            Close
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleQuizSubmit}
                                        disabled={Object.keys(selectedAnswers).length < quizQuestions.length}
                                        className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Submit Quiz ({Object.keys(selectedAnswers).length}/{quizQuestions.length} answered)
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* \u2500\u2500 Smart Nudge Modal \u2500\u2500 */}
            <AnimatePresence>
                {smartNudge.show && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                        onClick={() => !smartNudge.adapting && setSmartNudge(prev => ({ ...prev, show: false }))}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: 24 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: 24 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
                            className="relative w-full max-w-md rounded-2xl bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border border-slate-200 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 via-orange-400 to-amber-400" />
                            <div className="p-6">
                                <div className="flex items-start gap-3.5 mb-5">
                                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-50 to-orange-50 border border-violet-100 flex-shrink-0">
                                        <Brain className="w-5 h-5 text-violet-600" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">🧠 AI Roadmap Adaptation</h3>
                                        <p className="text-[11px] font-medium text-violet-500 mt-0.5 tracking-wide uppercase">Agent-to-Agent Handoff Triggered</p>
                                    </div>
                                    {!smartNudge.adapting && (
                                        <button onClick={() => setSmartNudge(prev => ({ ...prev, show: false }))} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                                            <XCircle className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>

                                {smartNudge.adapting ? (
                                    <div className="flex flex-col items-center py-8 gap-5">
                                        <div className="relative">
                                            <div className="w-14 h-14 border-[3px] border-violet-500 border-t-transparent rounded-full animate-spin" />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Brain className="w-5 h-5 text-violet-500" />
                                            </div>
                                        </div>
                                        <div className="text-center space-y-1.5">
                                            <p className="text-sm font-medium text-slate-700">Analyzing your performance...</p>
                                            <p className="text-xs text-slate-400">Adapting roadmap for <strong className="text-violet-600 font-semibold">"{smartNudge.topic}"</strong></p>
                                        </div>
                                        <div className="flex gap-1.5">
                                            {[0,1,2].map(i => (
                                                <div key={i} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="rounded-xl bg-gradient-to-br from-slate-50 to-violet-50/50 border border-slate-100 p-4">
                                            <p className="text-[13px] text-slate-700 leading-relaxed">{smartNudge.message}</p>
                                        </div>
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
                                            <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                            <span className="text-[11px] font-medium text-amber-700">Remedial module injected with bonus XP rewards</span>
                                        </div>
                                        <div className="flex gap-2.5 pt-1">
                                            <button
                                                onClick={() => { setSmartNudge(prev => ({ ...prev, show: false })); window.open('/candidate/learning-roadmap', '_blank'); }}
                                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-all shadow-sm"
                                            >
                                                View Updated Roadmap <ArrowRight className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setSmartNudge(prev => ({ ...prev, show: false }))}
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
        </>
    );
}

/* ═══════════════════════════════════════════
   CONTENT READER + CHAT VIEW
   ═══════════════════════════════════════════ */

function ContentReaderView({ resource, topic, onBack }: { resource: Resource; topic: string; onBack: () => void }) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const platKey = getPlatformKey(resource.platform);

    useEffect(() => { scrollIntoPanel(chatEndRef.current); }, [messages]);

    const sendMessage = async () => {
        const msg = input.trim();
        if (!msg || isLoading) return;
        setInput('');
        const userMsg: ChatMessage = { role: 'user', content: msg };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        try {
            const res = await axios.post('/api/roadmap-chat', {
                message: msg,
                context: `${topic} — ${resource.title}`,
                history: [...messages, userMsg],
            });
            setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Resources
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Content Panel */}
                <div className="lg:col-span-7">
                    <div className="bg-white dark:bg-[var(--soft-surface)] border border-slate-200 dark:border-neutral-800 rounded-2xl overflow-hidden">
                        {/* Header */}
                        <div className="p-5 border-b border-slate-200 dark:border-neutral-800">
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 ${platKey === 'Reddit' ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                                    {platKey === 'Reddit' ? <MessageCircle className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                                    {platKey}
                                </span>
                                {resource.is_free ? (
                                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">FREE</span>
                                ) : (
                                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">PAID</span>
                                )}
                            </div>
                            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{resource.title}</h1>
                            {resource.instructor && (
                                <p className="text-sm text-slate-500 dark:text-neutral-400 mt-1">{resource.instructor}</p>
                            )}
                        </div>

                        {/* Embedded Page */}
                        <div className="relative" style={{ height: '500px' }}>
                            <iframe
                                src={resource.url}
                                className="w-full h-full border-0"
                                title={resource.title}
                                sandbox="allow-scripts allow-same-origin allow-popups"
                                onError={() => {}}
                            />
                            {/* Fallback overlay for sites that block iframes */}
                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white dark:from-[var(--soft-surface)] to-transparent">
                                <a
                                    href={resource.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:opacity-90 transition-opacity"
                                >
                                    <ExternalLink className="w-4 h-4" /> Open in New Tab
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Chat Panel */}
                <div className="lg:col-span-5">
                    <div className="bg-white dark:bg-[var(--soft-surface)] border border-slate-200 dark:border-neutral-800 rounded-2xl overflow-hidden flex flex-col sticky top-6" style={{ height: '620px' }}>
                        {/* Chat Header */}
                        <div className="p-4 border-b border-slate-200 dark:border-neutral-800 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                                <Bot className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 dark:text-white text-sm">AI Learning Assistant</h3>
                                <p className="text-[11px] text-slate-500 dark:text-neutral-400">Ask questions about this content</p>
                            </div>
                        </div>

                        {/* Chat Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full text-center space-y-3 px-4">
                                    <div className="w-14 h-14 rounded-2xl bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center">
                                        <Bot className="w-7 h-7 text-cyan-600 dark:text-cyan-400" />
                                    </div>
                                    <h4 className="text-sm font-bold text-slate-800 dark:text-white">Ready to Help!</h4>
                                    <p className="text-xs text-slate-400 dark:text-neutral-500 max-w-[200px]">
                                        Ask me anything about <strong className="text-slate-600 dark:text-neutral-300">{topic}</strong> or this article.
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                                        {['Summarize this', 'Explain key concepts', 'Give me examples'].map(q => (
                                            <button
                                                key={q}
                                                onClick={() => { setInput(q); }}
                                                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === 'user'
                                        ? 'bg-cyan-500 text-white rounded-br-md'
                                        : 'bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-neutral-200 rounded-bl-md'}`}
                                    >
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-slate-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Chat Input */}
                        <div className="p-3 border-t border-slate-200 dark:border-neutral-800">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
                                    placeholder="Ask a question..."
                                    className="flex-1 h-10 px-4 rounded-xl bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                                />
                                <button
                                    onClick={sendMessage}
                                    disabled={!input.trim() || isLoading}
                                    className="w-10 h-10 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════
   RESOURCE MODAL (3 Category Tabs)
   ═══════════════════════════════════════════ */

function ResourceModal({ node, onClose, onOpenVideo, onOpenContent, nodeIndex, nodeStatus, onMarkComplete, completionLoading }: {
    node: LearningNode;
    onClose: () => void;
    onOpenVideo: (resource: Resource) => void;
    onOpenContent: (resource: Resource) => void;
    nodeIndex?: number;
    nodeStatus?: string;
    onMarkComplete?: (idx: number) => void;
    completionLoading?: number | null;
}) {
    const [activeTab, setActiveTab] = useState<typeof CATEGORY_TABS[number]>('Videos');

    const categorized = useMemo(() => {
        const cats: Record<string, Resource[]> = { Videos: [], Content: [], Courses: [] };
        node.resources.forEach(r => { cats[getCategory(r.platform)].push(r); });
        return cats;
    }, [node.resources]);

    const filteredResources = categorized[activeTab] || [];

    const tabConfig = {
        Videos: { icon: <Youtube className="w-3.5 h-3.5" />, activeColor: 'bg-red-500 text-white', color: 'text-red-500' },
        Content: { icon: <Newspaper className="w-3.5 h-3.5" />, activeColor: 'bg-emerald-500 text-white', color: 'text-emerald-500' },
        Courses: { icon: <GraduationCap className="w-3.5 h-3.5" />, activeColor: 'bg-purple-500 text-white', color: 'text-purple-500' },
    };

    const getActionButton = (resource: Resource) => {
        const cat = getCategory(resource.platform);
        if (cat === 'Videos') {
            return (
                <button
                    onClick={() => onOpenVideo(resource)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-colors"
                >
                    <Play className="w-3 h-3" /> WATCH
                </button>
            );
        }
        if (cat === 'Content') {
            return (
                <button
                    onClick={() => onOpenContent(resource)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors"
                >
                    <BookOpen className="w-3 h-3" /> READ
                </button>
            );
        }
        // Courses → external link
        return (
            <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold transition-colors"
            >
                <ExternalLink className="w-3 h-3" /> ENROLL
            </a>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                onClick={e => e.stopPropagation()}
                className="relative w-full max-w-2xl max-h-[80vh] bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            >
                {/* Header */}
                <div className="p-6 pb-4 border-b border-slate-200 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wider">{node.topic}</h2>
                            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1 uppercase tracking-widest">
                                {node.resources.length} resources available
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors">
                            <X className="w-5 h-5 text-slate-400 dark:text-neutral-400" />
                        </button>
                    </div>

                    {/* Category Tabs */}
                    <div className="flex items-center gap-2 mt-4">
                        {CATEGORY_TABS.map(tab => {
                            const isActive = activeTab === tab;
                            const config = tabConfig[tab];
                            const count = categorized[tab].length;

                            return (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isActive
                                        ? config.activeColor
                                        : 'bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-neutral-700'}`}
                                >
                                    {config.icon}
                                    {tab}
                                    <span className="opacity-70">({count})</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Resource List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredResources.length === 0 ? (
                        <p className="text-center text-slate-400 dark:text-neutral-500 py-8 text-sm">No {activeTab.toLowerCase()} found for this topic.</p>
                    ) : (
                        filteredResources.map((resource, idx) => {
                            const platKey = getPlatformKey(resource.platform);
                            return (
                                <div key={idx} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-neutral-900/50 border border-slate-200 dark:border-neutral-800 hover:border-slate-300 dark:hover:border-neutral-700 transition-all group">
                                    {/* Thumbnail */}
                                    <div className="w-24 h-16 rounded-lg overflow-hidden bg-slate-100 dark:bg-neutral-800 shrink-0 relative">
                                        {resource.thumbnail ? (
                                            <img src={resource.thumbnail} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                        ) : (
                                            <div className={`w-full h-full flex items-center justify-center ${activeTab === 'Videos' ? 'bg-red-500/10' : activeTab === 'Content' ? 'bg-emerald-500/10' : 'bg-purple-500/10'}`}>
                                                {activeTab === 'Videos' ? <Youtube className="w-5 h-5 text-red-500" /> : activeTab === 'Content' ? <FileText className="w-5 h-5 text-emerald-500" /> : <GraduationCap className="w-5 h-5 text-purple-500" />}
                                            </div>
                                        )}
                                        {platKey === 'YouTube' && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                <Play className="w-4 h-4 text-white" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{resource.title}</h4>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-[10px] font-bold uppercase ${platKey === 'YouTube' ? 'text-red-500' : platKey === 'Reddit' ? 'text-orange-500' : platKey === 'Udemy' ? 'text-purple-600 dark:text-purple-400' : platKey === 'Coursera' ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                {platKey}
                                            </span>
                                            {resource.duration && resource.duration !== 'N/A' && (
                                                <span className="text-[10px] text-slate-400 dark:text-neutral-500 flex items-center gap-0.5">
                                                    <Clock className="w-2.5 h-2.5" /> {resource.duration}
                                                </span>
                                            )}
                                            {resource.is_free ? (
                                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">FREE</span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">PAID</span>
                                            )}
                                        </div>
                                        {resource.instructor && <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-0.5 truncate">{resource.instructor}</p>}
                                    </div>

                                    {getActionButton(resource)}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Gamification: Mark Complete */}
                {onMarkComplete && nodeIndex !== undefined && nodeIndex >= 0 && (
                    <div className="p-4 border-t border-slate-200 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-900/50">
                        {nodeStatus === 'completed' ? (
                            <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                                <CheckCircle2 className="w-5 h-5" />
                                <span>Node Completed — XP Awarded!</span>
                            </div>
                        ) : (
                            <button
                                onClick={() => onMarkComplete(nodeIndex)}
                                disabled={completionLoading === nodeIndex}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-sm font-bold shadow-lg shadow-emerald-500/20 hover:shadow-xl transition-all disabled:opacity-50"
                            >
                                {completionLoading === nodeIndex ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Marking Complete...</>
                                ) : (
                                    <><CheckCircle2 className="w-4 h-4" /> Mark Node as Complete (+XP)</>
                                )}
                            </button>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    );
}

/* ═══════════════════════════════════════════
   LOADING ANIMATION
   ═══════════════════════════════════════════ */

function LoadingState() {
    const steps = ['Generating learning roadmap with AI...', 'Structuring knowledge graph...', 'Fetching YouTube tutorials...', 'Finding Udemy courses...', 'Searching Coursera programs...', 'Gathering Reddit discussions...', 'Collecting blog resources...', 'Finalizing your roadmap...'];
    const [step, setStep] = useState(0);
    useEffect(() => { const interval = setInterval(() => setStep(s => (s + 1) % steps.length), 3000); return () => clearInterval(interval); }, []);

    return (
        <div className="flex flex-col items-center justify-center py-24 space-y-8">
            <div className="relative w-24 h-24">
                <div className="absolute inset-0 border-4 border-slate-200 dark:border-neutral-800 rounded-full" />
                <div className="absolute inset-0 border-4 border-cyan-500 rounded-full border-t-transparent animate-spin" />
                <div className="absolute inset-2 border-4 border-purple-400/30 rounded-full border-b-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                <div className="absolute inset-0 flex items-center justify-center"><Sparkles className="w-8 h-8 text-cyan-500" /></div>
            </div>
            <div className="text-center space-y-3 max-w-md">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Building Your Learning Path</h3>
                <AnimatePresence mode="wait">
                    <motion.p key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-sm text-slate-500 dark:text-neutral-400">{steps[step]}</motion.p>
                </AnimatePresence>
            </div>
            <div className="flex items-center gap-2">
                {steps.map((_, i) => (<div key={i} className={`w-2 h-2 rounded-full transition-all duration-500 ${i <= step ? 'bg-cyan-500 scale-100' : 'bg-slate-200 dark:bg-neutral-700 scale-75'}`} />))}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */

export default function LearningRoadmapPage() {
    const { getToken } = useAuth();
    const [view, setView] = useState<ViewState>('landing');
    const [topic, setTopic] = useState('');

    // A journey milestone can open this page with its topic already filled in
    useEffect(() => {
        const preset = new URLSearchParams(window.location.search).get('topic');
        if (preset) setTopic(preset);
    }, []);
    const [roadmap, setRoadmap] = useState<RoadmapResponse | null>(null);
    const [error, setError] = useState('');
    const [selectedNode, setSelectedNode] = useState<LearningNode | null>(null);
    const [activeVideoResource, setActiveVideoResource] = useState<Resource | null>(null);
    const [activeContentResource, setActiveContentResource] = useState<Resource | null>(null);
    const [activeNodeTopic, setActiveNodeTopic] = useState('');

    const [resumeAnalyzing, setResumeAnalyzing] = useState(false);
    const [resumeAnalysis, setResumeAnalysis] = useState<ResumeAnalysis | null>(null);
    const [fileName, setFileName] = useState('');

    const [rfNodes, setRfNodes] = useState<Node[]>([]);
    const [rfEdges, setRfEdges] = useState<Edge[]>([]);

    const [saveLoading, setSaveLoading] = useState(false);
    const [savedMessage, setSavedMessage] = useState('');
    const [roadmapHistory, setRoadmapHistory] = useState<SavedRoadmapData[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // Gamification tracking
    const [activeRoadmapId, setActiveRoadmapId] = useState<string | null>(null);
    const [nodeStatuses, setNodeStatuses] = useState<Record<number, string>>({});
    const [completionLoading, setCompletionLoading] = useState<number | null>(null);

    const inputRef = useRef<HTMLInputElement>(null);

    /* ── Handlers for Video/Content views ── */
    const handleOpenVideo = (resource: Resource, nodeTopic: string) => {
        setActiveVideoResource(resource);
        setActiveNodeTopic(nodeTopic);
        setSelectedNode(null);
        setView('video-player');
    };

    const handleOpenContent = (resource: Resource, nodeTopic: string) => {
        setActiveContentResource(resource);
        setActiveNodeTopic(nodeTopic);
        setSelectedNode(null);
        setView('content-reader');
    };

    const handleBackToRoadmap = () => {
        setActiveVideoResource(null);
        setActiveContentResource(null);
        setView('roadmap');
    };

    /* ── Resume Upload ── */
    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;
        setFileName(file.name);
        setResumeAnalyzing(true);
        setView('resume-analysis');
        setError('');
        try {
            const token = await getToken();
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post('/resume/analyze', formData, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
                timeout: 60000,
            });
            setResumeAnalysis(res.data.analysis);
        } catch (err: any) {
            if (err?.response?.status === 402) setError('Insufficient credits for resume analysis. Try entering a topic directly.');
            else setError(err?.response?.data?.message || 'Failed to analyze resume.');
            setView('landing');
        } finally { setResumeAnalyzing(false); }
    }, [getToken]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

    /* ── Generate Roadmap ── */
    const handleGenerate = async (topicOverride?: string) => {
        const t = (topicOverride || topic).trim();
        if (!t) return;
        if (topicOverride) setTopic(topicOverride);
        setView('loading'); setError(''); setRoadmap(null);
        try {
            const res = await axios.post<RoadmapResponse>('/api2/api/learning/public/generate-roadmap', { topic: t, force_refresh: false }, { timeout: 120000 });
            if (res.data.success) {
                setRoadmap(res.data);
                const { nodes: n, edges: e } = parseMermaidToReactFlow(res.data.mermaid_code, res.data.nodes);
                setRfNodes(n); setRfEdges(e); setView('roadmap');
            } else { setError(res.data.message || 'Failed to generate roadmap.'); setView('topic-input'); }
        } catch (err: any) {
            const msg = err?.response?.data?.detail || err?.message || 'Failed to generate roadmap.';
            setError(typeof msg === 'string' ? msg : JSON.stringify(msg)); setView('topic-input');
        }
    };

    const handleSaveRoadmap = async () => {
        if (!roadmap || !topic) return;
        setSaveLoading(true); setSavedMessage('');
        try {
            const token = await getToken();
            await api.post('/roadmap/save', { userId: 'clerk-local-admin', topic, mermaidCode: roadmap.mermaid_code, nodes: roadmap.nodes }, { headers: { Authorization: `Bearer ${token}` } });
            setSavedMessage('Saved to cloud!'); setTimeout(() => setSavedMessage(''), 2000);
        } catch (err: any) { setSavedMessage(err?.response?.data?.message || 'Failed to save'); }
        finally { setSaveLoading(false); }
    };

    const handleLoadHistory = async () => {
        setHistoryLoading(true);
        try {
            const token = await getToken();
            const res = await api.get('/roadmap', { params: { userId: 'clerk-local-admin' }, headers: { Authorization: `Bearer ${token}` } });
            setRoadmapHistory(res.data.roadmaps || []); setShowHistoryModal(true);
        } catch { console.error('Failed to load history'); }
        finally { setHistoryLoading(false); }
    };

    const handleRepopulate = (saved: SavedRoadmapData) => {
        setTopic(saved.topic);
        const roadmapData: RoadmapResponse = { success: true, mermaid_code: saved.mermaidCode, nodes: saved.nodes, message: '' };
        setRoadmap(roadmapData);
        const { nodes: n, edges: e } = parseMermaidToReactFlow(saved.mermaidCode, saved.nodes);
        setRfNodes(n); setRfEdges(e); setView('roadmap'); setShowHistoryModal(false);
        // Track this roadmap for gamification
        setActiveRoadmapId(saved._id);
        const statuses: Record<number, string> = {};
        saved.nodes.forEach((node, idx) => { statuses[idx] = node.status || 'not_started'; });
        setNodeStatuses(statuses);
    };

    const handleMarkNodeComplete = async (nodeIndex: number) => {
        if (!activeRoadmapId) return;
        setCompletionLoading(nodeIndex);
        try {
            const token = await getToken();
            await api.patch(`/roadmap/${activeRoadmapId}/nodes/${nodeIndex}`, { status: 'completed' }, { headers: { Authorization: `Bearer ${token}` } });
            setNodeStatuses(prev => ({ ...prev, [nodeIndex]: 'completed' }));
        } catch (err: any) {
            console.error('Failed to mark node complete:', err);
        } finally {
            setCompletionLoading(null);
        }
    };

    const onNodeClick = useCallback((_: any, node: Node) => {
        if (node.data.learningNode) setSelectedNode(node.data.learningNode as LearningNode);
    }, []);

    const totalResources = roadmap?.nodes.reduce((sum, n) => sum + n.resources.length, 0) || 0;

    const resetToLanding = () => {
        setView('landing'); setRoadmap(null); setResumeAnalysis(null); setTopic(''); setError(''); setSelectedNode(null);
        setActiveVideoResource(null); setActiveContentResource(null);
    };

    return (
        <div className="min-h-full space-y-6 animate-fade-in">
            {/* ═══ VIDEO PLAYER VIEW ═══ */}
            {view === 'video-player' && activeVideoResource && (
                <VideoPlayerView resource={activeVideoResource} topic={activeNodeTopic} onBack={handleBackToRoadmap} />
            )}

            {/* ═══ CONTENT READER VIEW ═══ */}
            {view === 'content-reader' && activeContentResource && (
                <ContentReaderView resource={activeContentResource} topic={activeNodeTopic} onBack={handleBackToRoadmap} />
            )}

            {/* ═══ LANDING VIEW ═══ */}
            {view === 'landing' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                    <div className="text-center pt-8">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center mb-5 border border-cyan-500/20">
                            <Sparkles className="w-8 h-8 text-cyan-500" />
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-cyan-600 to-purple-600 dark:from-white dark:via-cyan-400 dark:to-purple-400">
                            AI Learning Roadmap
                        </h1>
                        <p className="text-slate-500 dark:text-neutral-400 mt-2 max-w-lg mx-auto">
                            Get a personalized learning path with curated resources from YouTube, Udemy, Coursera & more.
                        </p>
                    </div>
                    {error && (
                        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium max-w-2xl mx-auto">
                            <AlertCircle className="w-5 h-5 shrink-0" /> {error}
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
                        <button onClick={() => setView('resume-upload')} className="group relative p-8 rounded-2xl bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 hover:border-cyan-400 dark:hover:border-cyan-500/50 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-lg dark:hover:shadow-none">
                            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative z-10">
                                <div className="w-14 h-14 rounded-2xl bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center mb-5 group-hover:bg-cyan-100 dark:group-hover:bg-cyan-500/20 transition-colors border border-cyan-200 dark:border-cyan-500/20">
                                    <Upload className="w-7 h-7 text-cyan-600 dark:text-cyan-400" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Upload Resume</h3>
                                <p className="text-sm text-slate-500 dark:text-neutral-400 leading-relaxed">We'll analyze your resume, identify your weak areas, and create a targeted learning roadmap.</p>
                                <div className="mt-5 flex items-center gap-2 text-cyan-600 dark:text-cyan-400 text-xs font-bold uppercase tracking-wider"><ScanSearch className="w-4 h-4" /> AI Skill Gap Analysis</div>
                            </div>
                        </button>
                        <button onClick={() => { setView('topic-input'); setTimeout(() => inputRef.current?.focus(), 100); }} className="group relative p-8 rounded-2xl bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 hover:border-purple-400 dark:hover:border-purple-500/50 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-lg dark:hover:shadow-none">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative z-10">
                                <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center mb-5 group-hover:bg-purple-100 dark:group-hover:bg-purple-500/20 transition-colors border border-purple-200 dark:border-purple-500/20">
                                    <Search className="w-7 h-7 text-purple-600 dark:text-purple-400" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Enter a Topic</h3>
                                <p className="text-sm text-slate-500 dark:text-neutral-400 leading-relaxed">Type what you want to learn and get an interactive roadmap with curated resources instantly.</p>
                                <div className="mt-5 flex items-center gap-2 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase tracking-wider"><Zap className="w-4 h-4" /> Instant Roadmap Generation</div>
                            </div>
                        </button>
                    </div>
                    <div className="flex justify-center mt-8">
                        <button onClick={handleLoadHistory} disabled={historyLoading} className="px-6 py-3 rounded-xl bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 hover:border-slate-300 dark:hover:border-neutral-700 text-slate-600 dark:text-neutral-400 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50">
                            {historyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />} View Saved Roadmaps
                        </button>
                    </div>
                </motion.div>
            )}

            {/* ═══ RESUME UPLOAD VIEW ═══ */}
            {view === 'resume-upload' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl mx-auto space-y-6 pt-8">
                    <button onClick={() => setView('landing')} className="flex items-center gap-2 text-sm text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
                    <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-8 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Upload Your Resume</h2>
                        <p className="text-sm text-slate-500 dark:text-neutral-400 mb-6">We'll analyze it and identify areas where you can improve.</p>
                        <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${isDragActive ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-500/5' : 'border-slate-300 dark:border-neutral-700 hover:border-cyan-400 dark:hover:border-cyan-500/50 hover:bg-slate-50 dark:hover:bg-neutral-900/50'}`}>
                            <input {...getInputProps()} />
                            <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center mb-4 border border-cyan-200 dark:border-cyan-500/20"><FileUp className="w-8 h-8 text-cyan-600 dark:text-cyan-400" /></div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{isDragActive ? 'Drop your resume here' : 'Drag & drop your resume'}</h3>
                            <p className="text-sm text-slate-400 dark:text-neutral-500">or click to browse • PDF format</p>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ═══ RESUME ANALYSIS VIEW ═══ */}
            {view === 'resume-analysis' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6 pt-8">
                    <button onClick={resetToLanding} className="flex items-center gap-2 text-sm text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white transition-colors"><ArrowLeft className="w-4 h-4" /> Start Over</button>
                    {resumeAnalyzing ? (
                        <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-12 shadow-sm">
                            <div className="flex flex-col items-center space-y-6">
                                <div className="relative w-20 h-20">
                                    <div className="absolute inset-0 border-4 border-slate-200 dark:border-neutral-800 rounded-full" />
                                    <div className="absolute inset-0 border-4 border-cyan-500 rounded-full border-t-transparent animate-spin" />
                                    <div className="absolute inset-0 flex items-center justify-center"><ScanSearch className="w-7 h-7 text-cyan-500" /></div>
                                </div>
                                <div className="text-center">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Analyzing {fileName}...</h3>
                                    <p className="text-sm text-slate-500 dark:text-neutral-400 mt-1">Identifying skill gaps and weak areas</p>
                                </div>
                            </div>
                        </div>
                    ) : resumeAnalysis ? (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-extrabold text-xl shadow-lg shadow-cyan-500/20">{resumeAnalysis.overallScore}</div>
                                    <div><h3 className="text-lg font-bold text-slate-900 dark:text-white">Resume Score</h3><p className="text-sm text-slate-500 dark:text-neutral-400">{resumeAnalysis.summary}</p></div>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm">
                                <div className="flex items-center gap-3 mb-4"><Target className="w-5 h-5 text-red-500" /><h3 className="text-lg font-bold text-slate-900 dark:text-white">Skills to Improve</h3></div>
                                <p className="text-sm text-slate-500 dark:text-neutral-400 mb-4">Click any skill below to generate a learning roadmap for it:</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {resumeAnalysis.missingKeywords.map((skill, i) => (
                                        <button key={i} onClick={() => { setTopic(skill); handleGenerate(skill); }} className="group p-3 rounded-xl bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 hover:border-cyan-400 dark:hover:border-cyan-500/50 hover:bg-cyan-50 dark:hover:bg-cyan-500/5 transition-all text-left">
                                            <span className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">{skill}</span>
                                            <div className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1 flex items-center gap-1"><ArrowRight className="w-3 h-3" /> Generate Roadmap</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {resumeAnalysis.keywords.length > 0 && (
                                <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-400 dark:text-neutral-400 uppercase tracking-widest mb-3">Your Current Skills</h3>
                                    <div className="flex flex-wrap gap-2">{resumeAnalysis.keywords.map((kw, i) => (<span key={i} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">{kw}</span>))}</div>
                                </div>
                            )}
                        </div>
                    ) : null}
                </motion.div>
            )}

            {/* ═══ TOPIC INPUT VIEW ═══ */}
            {view === 'topic-input' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6 pt-8">
                    <button onClick={() => setView('landing')} className="flex items-center gap-2 text-sm text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
                    <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">What do you want to learn?</h2>
                        <p className="text-sm text-slate-500 dark:text-neutral-400 mb-6">Enter any topic to generate a comprehensive learning roadmap.</p>
                        {error && (<div className="flex items-center gap-3 p-3 mb-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>)}
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-neutral-500" />
                                <input ref={inputRef} type="text" placeholder="e.g. Machine Learning, Kubernetes, React..." value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }} className="w-full h-14 pl-12 pr-4 rounded-xl bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all" />
                            </div>
                            <button onClick={() => handleGenerate()} disabled={!topic.trim()} className="h-14 px-8 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"><Sparkles className="w-5 h-5" /> Generate</button>
                        </div>
                        <div className="mt-5">
                            <p className="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest mb-3">Popular Topics</p>
                            <div className="flex flex-wrap gap-2">
                                {['React.js', 'Machine Learning', 'System Design', 'DSA', 'Python', 'AWS', 'DevOps', 'Rust'].map(t => (
                                    <button key={t} onClick={() => handleGenerate(t)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 border border-slate-200 dark:border-neutral-700 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-400 hover:border-cyan-300 dark:hover:border-cyan-500/30 transition-all">{t}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ═══ LOADING ═══ */}
            {view === 'loading' && <LoadingState />}

            {/* ═══ ROADMAP VIEW ═══ */}
            {view === 'roadmap' && roadmap && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 dark:bg-[#0d1117] rounded-2xl p-5 border border-slate-200 dark:border-neutral-800 shadow-sm">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wider">{topic} Learning Roadmap</h2>
                            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1 uppercase tracking-widest">Click on any node to view resources.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-4 text-sm">
                                <div className="text-center"><p className="text-xl font-extrabold text-slate-900 dark:text-white">{roadmap.nodes.length}</p><p className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-wider">Topics</p></div>
                                <div className="w-px h-8 bg-slate-200 dark:bg-neutral-700" />
                                <div className="text-center"><p className="text-xl font-extrabold text-slate-900 dark:text-white">{totalResources}</p><p className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-wider">Resources</p></div>
                            </div>
                            <div className="w-px h-8 bg-slate-200 dark:bg-neutral-700" />
                            <button onClick={handleSaveRoadmap} disabled={saveLoading} className="px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 disabled:opacity-50">
                                {saveLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />} {savedMessage || 'Save'}
                            </button>
                            <button onClick={resetToLanding} className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2">
                                <RefreshCw className="w-3.5 h-3.5" /> New
                            </button>
                        </div>
                    </div>

                    {/* Gamification: Progress Bar */}
                    {activeRoadmapId && Object.keys(nodeStatuses).length > 0 && (
                        <div className="flex items-center gap-4 bg-white dark:bg-[var(--soft-sunken)] rounded-xl p-4 border border-slate-200 dark:border-neutral-800 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-amber-500" />
                                <span className="text-sm font-bold text-slate-900 dark:text-white">Progress</span>
                            </div>
                            <div className="flex-1">
                                <div className="w-full h-2.5 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700 ease-out"
                                        style={{ width: `${roadmap ? Math.round((Object.values(nodeStatuses).filter(s => s === 'completed').length / roadmap.nodes.length) * 100) : 0}%` }}
                                    />
                                </div>
                            </div>
                            <span className="text-xs font-bold text-slate-500 dark:text-neutral-400 whitespace-nowrap">
                                {Object.values(nodeStatuses).filter(s => s === 'completed').length} / {roadmap?.nodes.length ?? 0} nodes
                            </span>
                        </div>
                    )}

                    <div className="bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm" style={{ height: '550px' }}>
                        <ReactFlowProvider>
                            <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} onNodeClick={onNodeClick} fitView fitViewOptions={{ padding: 0.3 }} minZoom={0.3} maxZoom={2} className="!bg-slate-50 dark:!bg-[#0d0d0d]" proOptions={{ hideAttribution: true }}>
                                <Background color="#cbd5e1" gap={20} size={1} className="dark:!bg-[#0d0d0d] [&>pattern>circle]:dark:!fill-[#1e293b]" />
                                <Controls className="!bg-white dark:!bg-neutral-800 !border-slate-200 dark:!border-neutral-700 !rounded-lg [&_button]:!bg-white dark:[&_button]:!bg-neutral-800 [&_button]:!border-slate-200 dark:[&_button]:!border-neutral-700 [&_button]:!text-slate-500 dark:[&_button]:!text-neutral-400 [&_button:hover]:!bg-slate-100 dark:[&_button:hover]:!bg-neutral-700" />
                                <MiniMap nodeColor={(n) => (n.data as any)?.color?.bg || '#4a6cf7'} maskColor="rgba(255,255,255,0.7)" className="!bg-slate-100 dark:!bg-neutral-900 !border-slate-200 dark:!border-neutral-800 !rounded-lg" />
                            </ReactFlow>
                        </ReactFlowProvider>
                    </div>

                    <div className="flex items-center justify-center gap-2 text-slate-400 dark:text-neutral-500 text-xs">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 font-mono">↕</span>
                        Click any node to view learning resources
                    </div>
                </motion.div>
            )}

            {/* ═══ RESOURCE POPUP ═══ */}
            <AnimatePresence>
                {selectedNode && (
                    <ResourceModal
                        node={selectedNode}
                        onClose={() => setSelectedNode(null)}
                        onOpenVideo={(r) => handleOpenVideo(r, selectedNode.topic)}
                        onOpenContent={(r) => handleOpenContent(r, selectedNode.topic)}
                        nodeIndex={roadmap?.nodes.findIndex(n => n.topic === selectedNode.topic)}
                        nodeStatus={nodeStatuses[roadmap?.nodes.findIndex(n => n.topic === selectedNode.topic) ?? -1]}
                        onMarkComplete={activeRoadmapId ? handleMarkNodeComplete : undefined}
                        completionLoading={completionLoading}
                    />
                )}
            </AnimatePresence>

            {/* ═══ HISTORY MODAL ═══ */}
            <AnimatePresence>
                {showHistoryModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowHistoryModal(false)}>
                        <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} onClick={e => e.stopPropagation()} className="relative w-full max-w-md max-h-[80vh] bg-white dark:bg-[var(--soft-sunken)] border border-slate-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                            <div className="p-6 pb-4 border-b border-slate-200 dark:border-neutral-800">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wider">Saved Roadmaps</h2>
                                    <button onClick={() => setShowHistoryModal(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"><X className="w-5 h-5 text-slate-400 dark:text-neutral-400" /></button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                {roadmapHistory.length === 0 ? (
                                    <p className="text-center text-slate-400 dark:text-neutral-500 py-8 text-sm">No saved roadmaps yet.</p>
                                ) : (
                                    roadmapHistory.map((saved) => (
                                        <button key={saved._id} onClick={() => handleRepopulate(saved)} className="w-full p-4 rounded-xl bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 hover:border-cyan-400 dark:hover:border-cyan-500/50 transition-all text-left group">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">{saved.topic}</h4>
                                                    <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1">{new Date(saved.createdAt).toLocaleDateString()} • {saved.nodes.length} topics</p>
                                                </div>
                                                <ArrowRight className="w-4 h-4 text-slate-300 dark:text-neutral-600 group-hover:text-cyan-500" />
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}