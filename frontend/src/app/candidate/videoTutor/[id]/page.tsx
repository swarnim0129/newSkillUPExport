'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, useUser } from '@clerk/nextjs';
import Vapi from '@vapi-ai/web';
import {
    Play,
    Pause,
    ArrowLeft,
    Loader2,
    User,
    Clock,
    ChevronRight,
    ChevronDown,
    BookOpen,
    Heart,
    Bookmark,
    MessageCircle,
    Send,
    Trash2,
    UserPlus,
    UserCheck,
    Mic,
    MicOff,
    PhoneOff,
    Volume2,
    Bot,
    ListVideo,
    FileText,
} from 'lucide-react';
import api from '@/lib/api';
import { scrollIntoPanel } from '@/lib/scroll';

// ============ TYPES ============

declare global {
    interface Window {
        YT: {
            Player: new (elementId: string, config: any) => YTPlayer;
            PlayerState: { PLAYING: number; PAUSED: number };
        };
        onYouTubeIframeAPIReady: (() => void) | undefined;
    }
}

interface YTPlayer {
    playVideo: () => void;
    pauseVideo: () => void;
    seekTo: (seconds: number, allowSeekAhead: boolean) => void;
    destroy: () => void;
}

interface VideoData {
    _id: string;
    title: string;
    description?: string;
    duration_seconds: number;
    order_index: number;
    thumbnail_url?: string;
    cloudinary_url?: string;
}

interface CreatorData {
    _id: string;
    displayName: string;
    username: string;
    avatar_url?: string;
    clerkId?: string;
}

interface CourseData {
    _id: string;
    title: string;
    description?: string;
    short_description?: string;
    category: string;
    thumbnail_url?: string;
    total_duration: number;
    total_videos: number;
    level: string;
    price_type: string;
    creator?: CreatorData;
    creator_clerk_id?: string;
    videos?: VideoData[];
}

interface CommentData {
    _id: string;
    clerkId: string;
    userName: string;
    userAvatar: string;
    text: string;
    createdAt: string;
}

interface TranscriptChapter {
    title: string;
    start_ms: number;
    end_ms: number;
    summary: string;
    keywords: string[];
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

// ============ HELPERS ============

function extractYoutubeId(url: string): string | null {
    if (!url) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function isYoutubeUrl(url: string): boolean {
    return extractYoutubeId(url) !== null;
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatDurationShort(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes} min`;
}

function formatMs(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

// ============ COMPONENT ============

type RightPanelTab = 'playlist' | 'chapters' | 'ai';

export default function CoursePlayerPage() {
    const params = useParams();
    const router = useRouter();
    const { getToken, userId } = useAuth();
    const { user } = useUser();

    const courseId = params.id as string;

    // Course data
    const [course, setCourse] = useState<CourseData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeVideoIndex, setActiveVideoIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Likes
    const [likeCount, setLikeCount] = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [likingInProgress, setLikingInProgress] = useState(false);

    // Bookmarks
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [bookmarkInProgress, setBookmarkInProgress] = useState(false);

    // Comments
    const [comments, setComments] = useState<CommentData[]>([]);
    const [newComment, setNewComment] = useState('');
    const [postingComment, setPostingComment] = useState(false);
    const [showComments, setShowComments] = useState(true);

    // Follow
    const [isFollowing, setIsFollowing] = useState(false);
    const [followerCount, setFollowerCount] = useState(0);
    const [followInProgress, setFollowInProgress] = useState(false);

    // Right panel
    const [rightTab, setRightTab] = useState<RightPanelTab>('playlist');

    // Transcript chapters (from YT_transcript backend)
    const [chapters, setChapters] = useState<TranscriptChapter[]>([]);
    const [chaptersLoading, setChaptersLoading] = useState(false);
    const [overallSummary, setOverallSummary] = useState('');
    const [overallTitle, setOverallTitle] = useState('');

    // VAPI voice AI
    const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'active'>('idle');
    const [volumeLevel, setVolumeLevel] = useState(0);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [vapiMuted, setVapiMuted] = useState(false);
    const vapiRef = useRef<Vapi | null>(null);

    // Sync chapters to window for stable VAPI message handler access
    useEffect(() => { (window as any).__videoTutorChapters = chapters; }, [chapters]);

    // Seek by seconds ref (stable for VAPI — avoids re-init)
    const seekToSecondsRef = useRef<(seconds: number) => void>(() => {});
    seekToSecondsRef.current = (seconds: number) => {
        if (ytPlayerRef.current) {
            ytPlayerRef.current.seekTo(seconds, true);
            // Find and highlight the matching chapter
            const ms = seconds * 1000;
            const idx = chapters.findIndex((t: any, i: number) =>
                ms >= t.start_ms && (i === chapters.length - 1 || ms < chapters[i + 1].start_ms)
            );
            if (idx >= 0) setActiveVideoIndex(idx);
        }
    };

    // Gemini text chat
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // YouTube IFrame API player ref (for seek control)
    const ytPlayerRef = useRef<YTPlayer | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    // ============ FETCH COURSE ============

    useEffect(() => {
        if (!courseId) return;
        const fetchCourse = async () => {
            setLoading(true);
            try {
                const res = await api.get('/courses/browse');
                if (res.data.success) {
                    const found = res.data.courses.find((c: CourseData) => c._id === courseId);
                    if (found) setCourse(found);
                    else setError('Course not found');
                }
            } catch (err) {
                console.error('Failed to fetch course:', err);
                setError('Failed to load course');
            } finally {
                setLoading(false);
            }
        };
        fetchCourse();
    }, [courseId]);

    // ============ FETCH INTERACTIONS ============

    useEffect(() => {
        if (!courseId) return;
        const fetchInteractions = async () => {
            try {
                const token = await getToken();
                const headers = token ? { Authorization: `Bearer ${token}` } : {};

                const likesRes = await api.get(`/courses/${courseId}/likes`, { headers });
                if (likesRes.data.success) {
                    setLikeCount(likesRes.data.count);
                    setIsLiked(likesRes.data.isLiked);
                }

                const commentsRes = await api.get(`/courses/${courseId}/comments`);
                if (commentsRes.data.success) setComments(commentsRes.data.comments);

                if (token) {
                    const bookmarkRes = await api.get(`/courses/${courseId}/bookmark`, { headers });
                    if (bookmarkRes.data.success) setIsBookmarked(bookmarkRes.data.isBookmarked);
                }
            } catch (err) {
                console.error('Failed to fetch interactions:', err);
            }
        };
        fetchInteractions();
    }, [courseId, getToken]);

    // ============ FETCH FOLLOW STATUS ============

    useEffect(() => {
        if (!course?.creator_clerk_id) return;
        const fetchFollow = async () => {
            try {
                const token = await getToken();
                const headers = token ? { Authorization: `Bearer ${token}` } : {};
                const res = await api.get(`/courses/creator/${course.creator_clerk_id}/follow`, { headers });
                if (res.data.success) {
                    setIsFollowing(res.data.isFollowing);
                    setFollowerCount(res.data.followerCount);
                }
            } catch (err) {
                console.error('Failed to fetch follow status:', err);
            }
        };
        fetchFollow();
    }, [course?.creator_clerk_id, getToken]);

    // ============ FETCH TRANSCRIPT CHAPTERS ============

    const activeVideo = course?.videos?.[activeVideoIndex] || null;
    const activeYoutubeId = activeVideo?.cloudinary_url ? extractYoutubeId(activeVideo.cloudinary_url) : null;

    useEffect(() => {
        // Chapters belong to one video. Clear the previous video's before loading,
        // so chat and quiz never run on the wrong video's content.
        setChapters([]);
        setOverallSummary('');
        setOverallTitle('');
        if (!activeYoutubeId) { setChaptersLoading(false); return; }

        // Set when the student switches video before this request finishes
        let cancelled = false;

        const fetchChapters = async () => {
            setChaptersLoading(true);
            try {
                // Try cache first via lookup endpoint
                const cacheRes = await fetch(`/api2/api/yt_transcript/lookup?video_id=${activeYoutubeId}`);
                if (cancelled) return;
                if (cacheRes.ok) {
                    const data = await cacheRes.json();
                    if (cancelled) return;
                    if (data.found && data.topics && data.topics.length > 0) {
                        setChapters(data.topics);
                        setOverallSummary(data.overall_summary || '');
                        setOverallTitle(data.overall_title || '');
                        setChaptersLoading(false);
                        return;
                    }
                }
            } catch {
                // Cache miss, generate
            }
            if (cancelled) return;

            try {
                const genRes = await fetch('/api2/api/yt_transcript/transcribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${activeYoutubeId}` }),
                });
                if (cancelled) return;
                if (genRes.ok) {
                    const data = await genRes.json();
                    if (cancelled) return;
                    setChapters(data.topics || []);
                    setOverallSummary(data.overall_summary || '');
                    setOverallTitle(data.overall_title || '');
                }
            } catch (err) {
                console.error('Transcript generation failed:', err);
            } finally {
                if (!cancelled) setChaptersLoading(false);
            }
        };
        fetchChapters();
        return () => { cancelled = true; };
    }, [activeYoutubeId]);

    // ============ YOUTUBE IFRAME API ============

    useEffect(() => {
        if (!activeYoutubeId) return;

        // Destroy previous player
        if (ytPlayerRef.current) {
            try { ytPlayerRef.current.destroy(); } catch { }
            ytPlayerRef.current = null;
        }

        const loadYoutubeAPI = (): Promise<void> => {
            return new Promise((resolve) => {
                if (window.YT?.Player) { resolve(); return; }
                const tag = document.createElement('script');
                tag.src = 'https://www.youtube.com/iframe_api';
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
                window.onYouTubeIframeAPIReady = () => resolve();
            });
        };

        loadYoutubeAPI().then(() => {
            // small delay to ensure DOM element exists
            setTimeout(() => {
                const el = document.getElementById('youtube-player');
                if (!el) return;
                const player = new window.YT.Player('youtube-player', {
                    height: '100%',
                    width: '100%',
                    videoId: activeYoutubeId,
                    playerVars: { autoplay: 1, controls: 1, rel: 0, modestbranding: 1 },
                    events: {
                        onStateChange: (event: any) => {
                            setIsPlaying(event.data === 1);
                        },
                    },
                });
                ytPlayerRef.current = player;
            }, 100);
        });

        return () => {
            if (ytPlayerRef.current) {
                try { ytPlayerRef.current.destroy(); } catch { }
                ytPlayerRef.current = null;
            }
        };
    }, [activeYoutubeId, activeVideoIndex]);

    // ============ VAPI VOICE AI (MURPH-style) ============

    useEffect(() => {
        const publicKey = process.env.NEXT_PUBLIC_MURPH_VAPI_KEY;
        if (!publicKey) return;

        const vapi = new Vapi(publicKey);
        vapiRef.current = vapi;

        vapi.on('call-start', () => setCallStatus('active'));
        vapi.on('call-end', () => {
            setCallStatus('idle'); setIsSpeaking(false); setVolumeLevel(0);
            // Resume video when call ends
            if (ytPlayerRef.current) try { ytPlayerRef.current.playVideo(); } catch {}
        });
        vapi.on('speech-start', () => {
            setIsSpeaking(true);
            // Pause video while AI speaks
            if (ytPlayerRef.current) try { ytPlayerRef.current.pauseVideo(); } catch {}
        });
        vapi.on('speech-end', () => {
            setIsSpeaking(false);
            // Resume video when AI stops speaking
            if (ytPlayerRef.current) try { ytPlayerRef.current.playVideo(); } catch {}
        });
        vapi.on('volume-level', (level: number) => setVolumeLevel(level));
        vapi.on('error', (err: any) => {
            console.error('VAPI error:', JSON.stringify(err, null, 2), err?.message, err?.error);
            setCallStatus('idle');
        });

        // Listen for transcripts, tool calls, and messages
        vapi.on('message', (msg: any) => {
            console.log('VAPI msg:', msg.type, msg);

            // Live transcripts → push to chat feed
            if (msg.type === 'transcript' && msg.transcriptType === 'final') {
                const role = msg.role === 'assistant' ? 'assistant' : 'user';
                const text = msg.transcript?.trim();
                if (text) {
                    setChatMessages((prev: ChatMessage[]) => [...prev, { role, content: text } as ChatMessage]);
                }
            }

            // Intercept tool CALLS (jump to timestamp)
            if (msg.type === 'tool-calls') {
                const toolCalls = msg.toolCalls || msg.toolCallList || [];
                for (const tc of toolCalls) {
                    if (tc.function?.name === 'jump_to_video_timestamp') {
                        const args = typeof tc.function.arguments === 'string'
                            ? JSON.parse(tc.function.arguments || '{}')
                            : (tc.function.arguments || {});
                        
                        console.log('🎯 MURPH jump request:', args);

                        if (args.timestamp_seconds) {
                            seekToSecondsRef.current(Math.floor(args.timestamp_seconds));
                            return;
                        }

                        if (args.query) {
                            const q = args.query.toLowerCase();
                            const chaptersRef = (window as any).__videoTutorChapters;
                            if (chaptersRef) {
                                const match = chaptersRef.find((t: any) =>
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

    const startCall = useCallback(async () => {
        const assistantId = process.env.NEXT_PUBLIC_MURPH_ASSISTANT_ID;
        if (!vapiRef.current || !assistantId) return;
        setCallStatus('connecting');
        setRightTab('ai');

        // Build full transcript context for the AI tutor's system prompt
        const formatMs = (ms: number) => {
            const totalSec = Math.floor(ms / 1000);
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            return `${m}:${String(s).padStart(2, '0')}`;
        };

        const chaptersText = chapters.map((t: any, i: number) =>
            `Chapter ${i + 1}: "${t.title}" (${formatMs(t.start_ms)} - ${formatMs(t.end_ms)})\n  Summary: ${t.summary}\n  Keywords: ${(t.keywords || []).join(', ')}`
        ).join('\n\n') || 'No chapters available yet.';

        const transcriptContext = `
VIDEO TITLE: ${activeVideo?.title || course?.title || 'Video Tutorial'}
OVERALL SUMMARY: ${overallSummary || 'Not available'}

VIDEO CHAPTERS/TRANSCRIPT:
${chaptersText}
`;

        try {
            await vapiRef.current.start(assistantId, {
                variableValues: {
                    youtubeVideoId: activeYoutubeId || '',
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
            setCallStatus('idle');
        }
    }, [chapters, activeVideo, course, activeYoutubeId, overallSummary]);

    const endCall = useCallback(() => {
        vapiRef.current?.stop();
        setCallStatus('idle');
    }, []);

    const toggleMute = useCallback(() => {
        setVapiMuted(prev => {
            const newMuted = !prev;
            vapiRef.current?.setMuted(newMuted);
            return newMuted;
        });
    }, []);

    // ============ GEMINI TEXT CHAT ============

    const handleChatSend = async () => {
        if (!chatInput.trim() || chatLoading) return;
        const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() };
        setChatMessages(prev => [...prev, userMsg]);
        setChatInput('');
        setChatLoading(true);
        try {
            const res = await fetch('/api/video-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMsg.content,
                    videoTitle: activeVideo?.title || course?.title || '',
                    topic: course?.category || '',
                    overallSummary,
                    chapters,
                    history: chatMessages,
                }),
            });
            const data = await res.json();
            if (data.reply) {
                setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
            }
            // If AI says to seek to a chapter
            if (data.seekToChapter !== null && data.seekToChapter !== undefined && chapters[data.seekToChapter]) {
                const seekMs = chapters[data.seekToChapter].start_ms;
                if (ytPlayerRef.current) {
                    ytPlayerRef.current.seekTo(seekMs / 1000, true);
                }
            }
        } catch (err) {
            console.error('Chat failed:', err);
            setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.' }]);
        } finally {
            setChatLoading(false);
        }
    };

    useEffect(() => {
        scrollIntoPanel(chatEndRef.current);
    }, [chatMessages]);

    // ============ SOCIAL INTERACTION HANDLERS ============

    const handleLike = async () => {
        if (likingInProgress) return;
        setLikingInProgress(true);
        try {
            const token = await getToken();
            const res = await api.post(`/courses/${courseId}/likes`, {}, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data.success) { setIsLiked(res.data.isLiked); setLikeCount(res.data.count); }
        } catch (err) { console.error('Like failed:', err); }
        finally { setLikingInProgress(false); }
    };

    const handleBookmark = async () => {
        if (bookmarkInProgress) return;
        setBookmarkInProgress(true);
        try {
            const token = await getToken();
            const res = await api.post(`/courses/${courseId}/bookmark`, {}, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data.success) setIsBookmarked(res.data.isBookmarked);
        } catch (err) { console.error('Bookmark failed:', err); }
        finally { setBookmarkInProgress(false); }
    };

    const handlePostComment = async () => {
        if (!newComment.trim() || postingComment) return;
        setPostingComment(true);
        try {
            const token = await getToken();
            const res = await api.post(
                `/courses/${courseId}/comments`,
                {
                    text: newComment.trim(),
                    userName: user?.fullName || user?.firstName || 'Anonymous',
                    userAvatar: user?.imageUrl || '',
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data.success) { setComments([res.data.comment, ...comments]); setNewComment(''); }
        } catch (err) { console.error('Post comment failed:', err); }
        finally { setPostingComment(false); }
    };

    const handleDeleteComment = async (commentId: string) => {
        try {
            const token = await getToken();
            const res = await api.delete(`/courses/comments/${commentId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data.success) setComments(comments.filter(c => c._id !== commentId));
        } catch (err) { console.error('Delete comment failed:', err); }
    };

    const handleFollow = async () => {
        if (followInProgress || !course?.creator_clerk_id) return;
        setFollowInProgress(true);
        try {
            const token = await getToken();
            const res = await api.post(
                `/courses/creator/${course.creator_clerk_id}/follow`, {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data.success) { setIsFollowing(res.data.isFollowing); setFollowerCount(res.data.followerCount); }
        } catch (err) { console.error('Follow toggle failed:', err); }
        finally { setFollowInProgress(false); }
    };

    const handleVideoSelect = (index: number) => {
        setActiveVideoIndex(index);
        setIsPlaying(false);
        setChatMessages([]); // Reset chat for new video
    };

    const handleChapterSeek = (chapter: TranscriptChapter) => {
        if (ytPlayerRef.current) {
            ytPlayerRef.current.seekTo(chapter.start_ms / 1000, true);
        }
    };

    // ============ RENDER ============

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error || !course) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-[var(--soft-raised)] flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-slate-400" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{error || 'Course not found'}</h2>
                <button onClick={() => router.push('/candidate/videoTutor')} className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2">
                    <ArrowLeft className="w-4 h-4" /> Back to courses
                </button>
            </div>
        );
    }

    const videos = course.videos || [];

    return (
        <div className="w-full">
            <button onClick={() => router.push('/candidate/videoTutor')} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-6">
                <ArrowLeft className="w-4 h-4" /> Back to Courses
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* ============ LEFT PANEL — Video Player + Info ============ */}
                <div className="lg:col-span-8">
                    {/* Video Area */}
                    <div className="bg-black rounded-2xl overflow-hidden">
                        <div className="relative aspect-video">
                            {activeYoutubeId ? (
                                <div id="youtube-player" key={`yt-${activeVideoIndex}`} className="absolute inset-0 w-full h-full" />
                            ) : activeVideo?.cloudinary_url ? (
                                <video
                                    ref={videoRef}
                                    key={activeVideo._id}
                                    src={activeVideo.cloudinary_url}
                                    className="w-full h-full object-contain"
                                    controls
                                    onPlay={() => setIsPlaying(true)}
                                    onPause={() => setIsPlaying(false)}
                                    onEnded={() => {
                                        setIsPlaying(false);
                                        if (activeVideoIndex < videos.length - 1) setActiveVideoIndex(activeVideoIndex + 1);
                                    }}
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
                                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-4">
                                        <Play className="w-7 h-7 text-white ml-1" />
                                    </div>
                                    <p className="text-white/60 text-sm">
                                        {videos.length > 0 ? 'No video URL available' : 'No videos yet'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Course Info + Actions */}
                    <div className="mt-5">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded text-[11px] font-semibold">{course.category}</span>
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-500 dark:text-slate-400 rounded text-[11px] font-semibold">{course.level}</span>
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{course.title}</h1>
                        {activeVideo && (
                            <p className="text-base font-semibold text-blue-600 dark:text-blue-400 mb-2">
                                Now Playing: {activeVideo.title}
                            </p>
                        )}

                        {/* Like + Bookmark + Comment bar */}
                        <div className="flex items-center gap-1 py-3 border-y border-slate-100 dark:border-[var(--soft-line)] my-3">
                            <motion.button whileTap={{ scale: 0.9 }} onClick={handleLike} disabled={likingInProgress}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${isLiked ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[var(--soft-line)]'}`}>
                                <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                                {likeCount > 0 ? likeCount : 'Like'}
                            </motion.button>

                            <motion.button whileTap={{ scale: 0.9 }} onClick={handleBookmark} disabled={bookmarkInProgress}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${isBookmarked ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[var(--soft-line)]'}`}>
                                <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
                                {isBookmarked ? 'Saved' : 'Save'}
                            </motion.button>

                            <button onClick={() => setShowComments(!showComments)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${showComments ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[var(--soft-line)]'}`}>
                                <MessageCircle className="w-4 h-4" />
                                {comments.length > 0 ? comments.length : 'Comments'}
                            </button>
                        </div>

                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                            {course.description || course.short_description || 'No description available.'}
                        </p>

                        {/* Creator + Follow */}
                        {course.creator && (
                            <div className="flex items-center gap-3 pt-4 border-t border-slate-100 dark:border-[var(--soft-line)]">
                                {course.creator.avatar_url ? (
                                    <img src={course.creator.avatar_url} alt={course.creator.displayName} className="w-10 h-10 rounded-full object-cover" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                                        <User className="w-5 h-5 text-white" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{course.creator.displayName}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        @{course.creator.username}
                                        {followerCount > 0 && <span className="ml-2">· {followerCount} follower{followerCount !== 1 ? 's' : ''}</span>}
                                    </p>
                                </div>
                                {course.creator_clerk_id && course.creator_clerk_id !== userId && (
                                    <motion.button whileTap={{ scale: 0.95 }} onClick={handleFollow} disabled={followInProgress}
                                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-shrink-0 ${isFollowing ? 'bg-slate-100 dark:bg-[var(--soft-line)] text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                        {isFollowing ? <><UserCheck className="w-4 h-4" /> Following</> : <><UserPlus className="w-4 h-4" /> Follow</>}
                                    </motion.button>
                                )}
                            </div>
                        )}

                        {/* Comments Section */}
                        <AnimatePresence>
                            {showComments && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-6 overflow-hidden">
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Comments ({comments.length})</h3>

                                    {userId && (
                                        <div className="flex gap-3 mb-6">
                                            <div className="w-9 h-9 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center overflow-hidden">
                                                {user?.imageUrl ? <img src={user.imageUrl} alt="" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-white" />}
                                            </div>
                                            <div className="flex-1 flex gap-2">
                                                <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                                                    placeholder="Add a comment..." className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[var(--soft-line)] bg-white dark:bg-[var(--soft-surface)] text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                                                <motion.button whileTap={{ scale: 0.9 }} onClick={handlePostComment} disabled={!newComment.trim() || postingComment}
                                                    className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-sm disabled:opacity-40 transition-colors hover:bg-slate-800 dark:hover:bg-slate-100">
                                                    {postingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                </motion.button>
                                            </div>
                                        </div>
                                    )}

                                    {comments.length === 0 ? (
                                        <div className="text-center py-8">
                                            <MessageCircle className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                                            <p className="text-sm text-slate-400 dark:text-slate-400">No comments yet. Be the first!</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {comments.map((comment) => (
                                                <motion.div key={comment._id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 group">
                                                    <div className="w-8 h-8 flex-shrink-0 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center overflow-hidden">
                                                        {comment.userAvatar ? <img src={comment.userAvatar} alt="" className="w-full h-full object-cover" /> : <User className="w-3 h-3 text-white" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-semibold text-slate-800 dark:text-white">{comment.userName}</span>
                                                            <span className="text-[11px] text-slate-400 dark:text-slate-400">{timeAgo(comment.createdAt)}</span>
                                                            {comment.clerkId === userId && (
                                                                <button onClick={() => handleDeleteComment(comment._id)} className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10">
                                                                    <Trash2 className="w-3 h-3 text-red-400" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{comment.text}</p>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* ============ RIGHT PANEL — Tabs ============ */}
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl border border-slate-200 dark:border-[var(--soft-line)] overflow-hidden sticky top-6">
                        {/* Tab Header */}
                        <div className="flex border-b border-slate-100 dark:border-[var(--soft-line)]">
                            {([
                                { key: 'playlist' as const, icon: ListVideo, label: 'Playlist' },
                                { key: 'chapters' as const, icon: FileText, label: 'Chapters' },
                                { key: 'ai' as const, icon: Bot, label: 'AI Tutor' },
                            ]).map(tab => (
                                <button key={tab.key} onClick={() => setRightTab(tab.key)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-all ${rightTab === tab.key ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-500/5' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                                    <tab.icon className="w-3.5 h-3.5" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* ---- TAB: Playlist ---- */}
                        {rightTab === 'playlist' && (
                            <div>
                                <div className="p-4 border-b border-slate-100 dark:border-[var(--soft-line)]">
                                    <h3 className="font-bold text-slate-800 dark:text-white">Course Content</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {videos.length} video{videos.length !== 1 ? 's' : ''}
                                        {course.total_duration > 0 && ` · ${formatDurationShort(course.total_duration)} total`}
                                    </p>
                                </div>
                                <div className="max-h-[60vh] overflow-y-auto">
                                    {videos.length === 0 ? (
                                        <div className="p-8 text-center">
                                            <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                                            <p className="text-sm text-slate-500 dark:text-slate-400">No videos yet.</p>
                                        </div>
                                    ) : (
                                        videos.map((video, index) => (
                                            <button key={video._id} onClick={() => handleVideoSelect(index)}
                                                className={`w-full flex items-start gap-3 p-3 text-left transition-colors border-b border-slate-50 dark:border-[var(--soft-raised)] last:border-0 ${activeVideoIndex === index ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-[var(--soft-raised)]'}`}>
                                                <div className={`w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center text-xs font-bold mt-0.5 ${activeVideoIndex === index ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-[var(--soft-line)] text-slate-500 dark:text-slate-400'}`}>
                                                    {activeVideoIndex === index && isPlaying ? <Pause className="w-3 h-3" /> : index + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-medium truncate ${activeVideoIndex === index ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-white'}`}>{video.title}</p>
                                                    {video.duration_seconds > 0 && (
                                                        <div className="flex items-center gap-1 mt-0.5">
                                                            <Clock className="w-3 h-3 text-slate-400" />
                                                            <span className="text-[11px] text-slate-400 dark:text-slate-400">{formatDuration(video.duration_seconds)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {activeVideoIndex === index && <ChevronRight className="w-4 h-4 text-blue-500 flex-shrink-0 mt-1" />}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ---- TAB: Chapters (Transcript) ---- */}
                        {rightTab === 'chapters' && (
                            <div>
                                <div className="p-4 border-b border-slate-100 dark:border-[var(--soft-line)]">
                                    <h3 className="font-bold text-slate-800 dark:text-white">Video Chapters</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {chaptersLoading ? 'Generating transcript...' : chapters.length > 0 ? `${chapters.length} chapters detected` : 'Click to generate transcript'}
                                    </p>
                                </div>
                                <div className="max-h-[60vh] overflow-y-auto">
                                    {chaptersLoading ? (
                                        <div className="p-8 flex flex-col items-center">
                                            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
                                            <p className="text-sm text-slate-500 dark:text-slate-400 text-center">Transcribing & analyzing video topics…</p>
                                            <p className="text-xs text-slate-400 dark:text-slate-400 mt-1">This may take a minute on first load</p>
                                        </div>
                                    ) : chapters.length === 0 ? (
                                        <div className="p-8 text-center">
                                            <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                {activeYoutubeId ? 'No chapters available yet.' : 'Chapters are only available for YouTube videos.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            {overallSummary && (
                                                <div className="p-3 border-b border-slate-100 dark:border-[var(--soft-raised)] bg-blue-50/50 dark:bg-blue-500/5">
                                                    <p className="text-xs text-slate-600 dark:text-slate-300">{overallSummary}</p>
                                                </div>
                                            )}
                                            {chapters.map((ch, i) => (
                                                <button key={i} onClick={() => handleChapterSeek(ch)}
                                                    className="w-full flex items-start gap-3 p-3 text-left transition-colors border-b border-slate-50 dark:border-[var(--soft-raised)] last:border-0 hover:bg-slate-50 dark:hover:bg-[var(--soft-raised)] group">
                                                    <div className="w-12 flex-shrink-0 text-[10px] font-mono text-blue-600 dark:text-blue-400 pt-0.5 text-center">
                                                        {formatMs(ch.start_ms)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{ch.title}</p>
                                                        <p className="text-xs text-slate-400 dark:text-slate-400 mt-0.5 line-clamp-2">{ch.summary}</p>
                                                        {ch.keywords.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                                {ch.keywords.slice(0, 3).map((kw, ki) => (
                                                                    <span key={ki} className="px-1.5 py-0.5 bg-slate-100 dark:bg-[var(--soft-line)] text-[10px] text-slate-500 dark:text-slate-400 rounded">{kw}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ---- TAB: AI Tutor (VAPI Voice + Gemini Chat) ---- */}
                        {rightTab === 'ai' && (
                            <div className="flex flex-col" style={{ height: '65vh' }}>
                                {/* Voice AI Section */}
                                <div className="p-4 border-b border-slate-100 dark:border-[var(--soft-line)]">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                            <Mic className="w-4 h-4 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Voice AI Tutor</h3>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Ask questions by speaking</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {/* Voice orb */}
                                        <div className="relative w-14 h-14 flex-shrink-0">
                                            {callStatus === 'active' && (
                                                <>
                                                    <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }} className="absolute inset-0 rounded-full bg-blue-500/20" />
                                                    <motion.div animate={{ scale: [1, 1.6, 1], opacity: [0.2, 0, 0.2] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.3 }} className="absolute inset-0 rounded-full bg-indigo-500/15" />
                                                </>
                                            )}
                                            {callStatus === 'connecting' && (
                                                <motion.div animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }} className="absolute inset-0 rounded-full bg-blue-500/20" />
                                            )}
                                            <motion.div animate={callStatus === 'active' ? { scale: 1 + volumeLevel * 0.1 } : {}} transition={{ duration: 0.1 }}
                                                className="absolute inset-1 rounded-full bg-slate-900 dark:bg-slate-800 flex items-center justify-center">
                                                {isSpeaking ? <Volume2 className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
                                            </motion.div>
                                        </div>

                                        <div className="flex-1">
                                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                                {callStatus === 'connecting' ? 'Connecting to MURPH...' : callStatus === 'active' ? (isSpeaking ? 'MURPH speaking...' : 'Listening...') : 'Ready to Talk'}
                                            </p>
                                            <AnimatePresence mode="wait">
                                                {callStatus === 'idle' ? (
                                                    <motion.button key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                                        whileTap={{ scale: 0.95 }} onClick={startCall}
                                                        className="w-full py-2 px-4 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all flex items-center justify-center gap-1.5 shadow-sm">
                                                        <Mic className="w-3 h-3" /> Talk to MURPH
                                                    </motion.button>
                                                ) : callStatus === 'connecting' ? (
                                                    <motion.div key="connecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                                        className="w-full py-2 px-4 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-2">
                                                        <Loader2 className="w-3 h-3 animate-spin" /> Connecting...
                                                    </motion.div>
                                                ) : (
                                                    <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                                        className="flex items-center gap-2">
                                                        <button onClick={toggleMute}
                                                            className={`flex-1 py-2 px-3 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 ${vapiMuted
                                                                ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                                                                : 'bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[var(--soft-line)]'}`}
                                                            title={vapiMuted ? 'Unmute' : 'Mute'}>
                                                            {vapiMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                                                            {vapiMuted ? 'Muted' : 'Mute'}
                                                        </button>
                                                        <button onClick={endCall}
                                                            className="py-2 px-4 rounded-xl font-semibold text-xs text-white bg-red-600 hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5">
                                                            <PhoneOff className="w-3 h-3" /> End
                                                        </button>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                </div>

                                {/* Text Chat Section */}
                                <div className="flex-1 flex flex-col min-h-0">
                                    <div className="px-4 py-2 border-b border-slate-100 dark:border-[var(--soft-line)]">
                                        <div className="flex items-center gap-2">
                                            <Bot className="w-4 h-4 text-blue-500" />
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Video AI Chat</span>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                                        {chatMessages.length === 0 && (
                                            <div className="text-center py-6">
                                                <Bot className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                                                <p className="text-xs text-slate-400 dark:text-slate-400">Ask about the video content,<br />or say &quot;jump to&quot; a topic.</p>
                                            </div>
                                        )}
                                        {chatMessages.map((msg, i) => (
                                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-700 dark:text-slate-300'}`}>
                                                    {msg.content}
                                                </div>
                                            </div>
                                        ))}
                                        {chatLoading && (
                                            <div className="flex justify-start">
                                                <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-[var(--soft-raised)]">
                                                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                                </div>
                                            </div>
                                        )}
                                        <div ref={chatEndRef} />
                                    </div>

                                    <div className="p-3 border-t border-slate-100 dark:border-[var(--soft-line)]">
                                        <div className="flex gap-2">
                                            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                                                placeholder="Ask about the video..." className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[var(--soft-line)] bg-white dark:bg-[var(--soft-sunken)] text-slate-900 dark:text-white placeholder:text-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                                            <button onClick={handleChatSend} disabled={!chatInput.trim() || chatLoading}
                                                className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 disabled:opacity-40 transition-colors">
                                                <Send className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}