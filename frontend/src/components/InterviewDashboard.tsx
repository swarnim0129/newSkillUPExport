"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from 'next/link';
import Vapi from "@vapi-ai/web";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "@clerk/nextjs";
import api from "@/lib/api";
import {
    Mic,
    MicOff,
    PhoneOff,
    Sparkles,
    ChevronRight,
    RotateCcw,
    Briefcase,
    GraduationCap,
    Target,
    Layers,
    Volume2,
    Loader2,
    Clock,
    ArrowLeft,
    Trophy,
    MessageCircle,
    User,
    Bot,
    Calendar,
    Zap,
    Plus,
    Trash2,
    Coins,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface FeedbackData {
    communication_score: number;
    technical_score: number;
    strengths: string[];
    weaknesses: string[];
    improvement_plan: string;
    hiring_recommendation: string;
}

interface TranscriptEntry {
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    isPartial?: boolean;
}

interface PastInterview {
    _id: string;
    role: string;
    seniority: string;
    topic: string;
    category: string;
    status: "pending" | "completed";
    feedback?: FeedbackData;
    createdAt: string;
}

type ViewState = "history" | "setup" | "active" | "generating" | "feedback";

// ─── Constants ──────────────────────────────────────────────────────────────────

const ROLES = [
    "Software Engineer",
    "Product Manager",
    "Sales Executive",
    "Data Scientist",
    "UX Designer",
    "DevOps Engineer",
    "Marketing Manager",
];

const SENIORITY_LEVELS = ["Junior", "Mid-level", "Senior", "Lead", "Principal"];

const CATEGORIES = [
    "Technical",
    "Non Technical",
    "Behavioral",
    "System Design",
    "Case Study",
    "Culture Fit",
];

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function InterviewDashboard() {
    const { getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;

    const [role, setRole] = useState("");
    const [seniority, setSeniority] = useState("Mid-level");
    const [topic, setTopic] = useState("");
    const [category, setCategory] = useState("Technical");
    const [viewState, setViewState] = useState<ViewState>("history");
    const [callStatus, setCallStatus] = useState<"idle" | "connecting" | "active">("idle");
    const [feedback, setFeedback] = useState<FeedbackData | null>(null);
    const [volumeLevel, setVolumeLevel] = useState(0);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
    const [pastInterviews, setPastInterviews] = useState<PastInterview[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [currentInterviewId, setCurrentInterviewId] = useState<string | null>(null);
    const [creditInfo, setCreditInfo] = useState<{ credits: number; freeInterviewUsed: boolean } | null>(null);

    const vapiRef = useRef<Vapi | null>(null);
    const feedbackReceivedRef = useRef(false);
    const currentInterviewIdRef = useRef<string | null>(null);
    const transcriptRef = useRef<TranscriptEntry[]>([]);
    const pollForFeedbackRef = useRef<() => void>(() => { });

    // Fetch past interviews
    const fetchInterviews = useCallback(async () => {
        try {
            setLoadingHistory(true);
            const token = await getTokenRef.current();
            const res = await api.get("/interview", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data.success) {
                setPastInterviews(res.data.interviews);
            }
        } catch (err) {
            console.error("Failed to fetch interviews:", err);
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    // Fetch credit info
    const fetchCredits = useCallback(async () => {
        try {
            const token = await getTokenRef.current();
            const res = await api.get("/candidate/credits", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data.success) {
                setCreditInfo({ credits: res.data.credits, freeInterviewUsed: res.data.freeInterviewUsed });
            }
        } catch (err) {
            console.error("Failed to fetch credits:", err);
        }
    }, []);

    useEffect(() => {
        fetchInterviews();
        fetchCredits();
    }, [fetchInterviews, fetchCredits]);

    // Initialize Vapi
    useEffect(() => {
        const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
        if (!publicKey) {
            console.error("NEXT_PUBLIC_VAPI_PUBLIC_KEY is not set");
            return;
        }
        vapiRef.current = new Vapi(publicKey);
        const vapi = vapiRef.current;

        vapi.on("call-start", () => {
            setCallStatus("active");
        });
        vapi.on("call-end", () => {
            setCallStatus("idle");
            // Only go to history if feedback hasn't been received
            // If feedback was received, the generating → feedback flow is already running
            if (!feedbackReceivedRef.current) {
                // Wait a bit for late-arriving feedback, then poll DB
                setTimeout(() => {
                    if (!feedbackReceivedRef.current) {
                        setViewState("generating");
                        // Poll for feedback from webhook
                        pollForFeedbackRef.current();
                    }
                }, 1000);
            }
        });
        vapi.on("speech-start", () => setIsSpeaking(true));
        vapi.on("speech-end", () => setIsSpeaking(false));
        vapi.on("volume-level", (level: number) => setVolumeLevel(level));
        vapi.on("error", (error: any) => {
            console.error("Vapi error (full):", JSON.stringify(error, null, 2));
            console.error("Vapi error message:", error?.message || error?.msg || "No message");
            console.error("Vapi error code:", error?.code || error?.statusCode || "No code");
            console.error("Vapi error type:", error?.type || error?.errorType || "No type");
            alert(`Vapi Error: ${error?.message || error?.msg || JSON.stringify(error)}`);
            setCallStatus("idle");
        });

        vapi.on("message", (message: any) => {

            // Live transcript — partial + final
            if (message.type === "transcript" && message.transcript) {
                if (message.transcriptType === "partial") {
                    setTranscript((prev) => {
                        const last = prev[prev.length - 1];
                        const role: "user" | "assistant" = message.role === "assistant" ? "assistant" : "user";
                        let next;
                        if (last && last.role === role && last.isPartial) {
                            next = [
                                ...prev.slice(0, -1),
                                { ...last, content: message.transcript },
                            ];
                        } else {
                            next = [
                                ...prev,
                                {
                                    role,
                                    content: message.transcript,
                                    timestamp: new Date(),
                                    isPartial: true,
                                },
                            ];
                        }
                        transcriptRef.current = next;
                        return next;
                    });
                } else if (message.transcriptType === "final") {
                    setTranscript((prev) => {
                        const last = prev[prev.length - 1];
                        const role: "user" | "assistant" = message.role === "assistant" ? "assistant" : "user";
                        let next;
                        if (last && last.role === role && last.isPartial) {
                            next = [
                                ...prev.slice(0, -1),
                                {
                                    role,
                                    content: message.transcript,
                                    timestamp: new Date(),
                                    isPartial: false,
                                },
                            ];
                        } else {
                            next = [
                                ...prev,
                                {
                                    role,
                                    content: message.transcript,
                                    timestamp: new Date(),
                                    isPartial: false,
                                },
                            ];
                        }
                        transcriptRef.current = next;
                        return next;
                    });
                }
            }

            // Helper to extract feedback from various message shapes
            const tryExtractFeedback = (): FeedbackData | null => {
                try {
                    // Shape 1: function-call (Vapi's actual event type)
                    if (message.type === "function-call" && message.functionCall?.name === "submit_interview_feedback") {
                        const params = message.functionCall.parameters;
                        return params as FeedbackData;
                    }

                    // Shape 2: tool-calls (alternate format)
                    if (message.type === "tool-calls") {
                        const tc = message.toolCalls?.find?.(
                            (t: any) => t.function?.name === "submit_interview_feedback"
                        );
                        if (tc) {
                            const args = typeof tc.function.arguments === "string"
                                ? JSON.parse(tc.function.arguments)
                                : tc.function.arguments;
                            return args as FeedbackData;
                        }
                    }

                    // Shape 3: tool-calls-result / function-call-result
                    if (message.type === "tool-calls-result" || message.type === "function-call-result") {
                        const tc = (message.toolCallList || message.toolCalls)?.find?.(
                            (t: any) => t.function?.name === "submit_interview_feedback"
                        );
                        if (tc) {
                            const args = typeof tc.function.arguments === "string"
                                ? JSON.parse(tc.function.arguments)
                                : tc.function.arguments;
                            return args as FeedbackData;
                        }
                    }

                    // Shape 4: conversation-update — check the full conversation for tool call data
                    if (message.type === "conversation-update" && message.conversation) {
                        for (const item of message.conversation) {
                            if (item.role === "tool_calls" || item.role === "assistant") {
                                const toolCalls = item.tool_calls || item.toolCalls || [];
                                const tc = toolCalls.find?.(
                                    (t: any) => t.function?.name === "submit_interview_feedback"
                                );
                                if (tc) {
                                    const args = typeof tc.function.arguments === "string"
                                        ? JSON.parse(tc.function.arguments)
                                        : tc.function.arguments;
                                    return args as FeedbackData;
                                }
                            }
                        }
                    }

                    // Shape 5: Deep search fallback — any message containing the function name
                    const msgStr = JSON.stringify(message);
                    if (msgStr.includes("submit_interview_feedback")) {
                        // Try common nested structures
                        const toolWithToolCall = message.toolWithToolCall || message.toolCall;
                        if (toolWithToolCall?.function?.arguments) {
                            const args = typeof toolWithToolCall.function.arguments === "string"
                                ? JSON.parse(toolWithToolCall.function.arguments)
                                : toolWithToolCall.function.arguments;
                            return args as FeedbackData;
                        }
                        // Try functionCall.parameters
                        if (message.functionCall?.parameters) {
                            return message.functionCall.parameters as FeedbackData;
                        }
                    }
                } catch (e) {
                    console.error("Error extracting feedback:", e);
                }
                return null;
            };

            const feedbackData = tryExtractFeedback();
            if (feedbackData && !feedbackReceivedRef.current) {
                feedbackReceivedRef.current = true;
                vapiRef.current?.stop();
                setFeedback(feedbackData);
                setViewState("generating");
                setTimeout(() => {
                    setViewState("feedback");
                }, 3500);
            }
        });

        return () => {
            vapi.stop();
        };
    }, [fetchInterviews]);

    // Generate or poll for feedback after call ends
    const pollForFeedback = useCallback(async () => {
        const interviewId = currentInterviewIdRef.current;
        if (!interviewId) {
            fetchInterviews();
            setViewState("history");
            return;
        }

        // Step 1: Try to generate feedback from the transcript we captured
        const currentTranscript = transcriptRef.current;
        if (currentTranscript.length > 0) {
            try {
                const token = await getTokenRef.current();
                const res = await api.post(
                    `/interview/${interviewId}/generate-feedback`,
                    { transcript: currentTranscript },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (res.data.success && res.data.feedback) {
                    feedbackReceivedRef.current = true;
                    vapiRef.current?.stop();
                    setFeedback(res.data.feedback);
                    setTimeout(() => setViewState("feedback"), 500);
                    return;
                }
            } catch (err) {
                console.warn("[Feedback] Generate failed, falling back to poll:", err);
            }
        }

        // Step 2: Fallback — poll in case Vapi webhook delivers feedback
        let attempts = 0;
        const maxAttempts = 10;
        const poll = async () => {
            attempts++;
            try {
                const token = await getTokenRef.current();
                const res = await api.get(`/interview/${interviewId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.data.success && res.data.interview.feedback && res.data.interview.status === "completed") {
                    feedbackReceivedRef.current = true;
                    vapiRef.current?.stop();
                    setFeedback(res.data.interview.feedback);
                    setTimeout(() => setViewState("feedback"), 500);
                    return;
                }
            } catch (err) {
                console.error("Poll error:", err);
            }
            if (attempts < maxAttempts) {
                setTimeout(poll, 3000);
            } else {
                fetchInterviews();
                setViewState("history");
            }
        };
        poll();
    }, [fetchInterviews]);

    // Keep ref synced
    pollForFeedbackRef.current = pollForFeedback;

    const startInterview = useCallback(async () => {
        const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
        if (!vapiRef.current || !assistantId) return;

        feedbackReceivedRef.current = false;
        setCallStatus("connecting");
        setViewState("active");
        setTranscript([]);
        transcriptRef.current = [];
        setFeedback(null);

        // Save interview session to DB (also enforces credits)
        let savedInterviewId: string | null = null;
        try {
            const token = await getTokenRef.current();
            const res = await api.post("/interview", {
                role,
                seniority,
                topic: topic || "General Industry Standards",
                category,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data.success) {
                savedInterviewId = res.data.interviewId;
                setCurrentInterviewId(res.data.interviewId);
                currentInterviewIdRef.current = res.data.interviewId;
                // Update local credit info
                if (res.data.creditsRemaining !== undefined) {
                    setCreditInfo(prev => prev ? { ...prev, credits: res.data.creditsRemaining, freeInterviewUsed: true } : prev);
                }
            }
        } catch (err: any) {
            if (err?.response?.status === 402) {
                // Insufficient credits — abort
                setCallStatus("idle");
                setViewState("setup");
                alert(`Insufficient credits. You need ${err.response.data.creditsRequired} credits but have ${err.response.data.creditsAvailable}.`);
                return;
            }
            console.error("Failed to save interview:", err);
        }

        vapiRef.current.start(assistantId, {
            variableValues: {
                role,
                seniority,
                topic: topic || "General Industry Standards",
                category,
            },
            clientMessages: [
                "transcript",
                "tool-calls",
                "tool-calls-result",
                "conversation-update",
                "function-call",
                "function-call-result",
                "speech-update",
                "hang",
                "model-output",
                "status-update",
            ] as any,
        }).then((call: any) => {
            // Link vapiCallId to the stored interview
            if (call?.id && savedInterviewId) {
                getTokenRef.current().then((token) =>
                    api.patch(`/interview/${savedInterviewId}`, { vapiCallId: call.id }, {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                ).catch((err: unknown) => console.error("Failed to link vapiCallId:", err));
            }
        }).catch((err: unknown) => {
            console.error("Failed to start Vapi call:", err);
            setCallStatus("idle");
        });
    }, [role, seniority, topic, category]);

    const endInterview = useCallback(() => {
        vapiRef.current?.stop();
        setCallStatus("idle");
        // Don't navigate away — let call-end handler manage the transition
        // It will either show generating→feedback or poll DB for webhook feedback
    }, []);

    const resetInterview = useCallback(() => {
        feedbackReceivedRef.current = false;
        setFeedback(null);
        setCallStatus("idle");
        setTopic("");
        setVolumeLevel(0);
        setIsSpeaking(false);
        setTranscript([]);
        transcriptRef.current = [];
        setCurrentInterviewId(null);
        currentInterviewIdRef.current = null;
        fetchInterviews();
        fetchCredits();
        setViewState("history");
    }, [fetchInterviews, fetchCredits]);

    const viewPastInterview = useCallback(async (interview: PastInterview) => {
        if (interview.feedback) {
            setFeedback(interview.feedback);
            setViewState("feedback");
        } else {
            // Re-fetch to check if feedback arrived via webhook
            try {
                const token = await getTokenRef.current();
                const res = await api.get(`/interview/${interview._id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.data.success && res.data.interview.feedback) {
                    setFeedback(res.data.interview.feedback);
                    setViewState("feedback");
                }
                // If still pending, do nothing — user can delete via the card's delete button
            } catch (err) {
                console.error("Failed to fetch interview details:", err);
            }
        }
    }, []);

    const deleteInterview = useCallback(async (interviewId: string) => {
        try {
            const token = await getTokenRef.current();
            const res = await api.delete(`/interview/${interviewId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data.success) {
                fetchInterviews();
            }
        } catch (err) {
            console.error("Failed to delete interview:", err);
        }
    }, [fetchInterviews]);

    const startNewSetup = useCallback(() => {
        setFeedback(null);
        setTranscript([]);
        transcriptRef.current = [];
        setViewState("setup");
    }, []);

    // ─── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className={`min-h-screen bg-slate-50/50 dark:bg-[var(--soft-sunken)] w-full font-sans text-slate-900 dark:text-white ${viewState === "active" || viewState === "generating" ? "p-4 lg:p-6" : "p-6 lg:p-8"
            }`}>
            {/* Header — hidden during active call */}
            {viewState !== "active" && viewState !== "generating" && (
                <header className="mb-8">
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
                        <span>DASHBOARD</span>
                        <span>/</span>
                        <span className="font-semibold text-slate-800 dark:text-white">AI INTERVIEW</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                                AI Interview Prep
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 mt-1">
                                Practice with an AI interviewer that adapts to your role and experience level.
                            </p>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={startNewSetup}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/20 transition-all text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            New Interview
                        </motion.button>
                    </div>
                </header>
            )}

            <AnimatePresence mode="wait">
                {viewState === "generating" ? (
                    <motion.div
                        key="generating"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.05 }}
                        transition={{ duration: 0.5 }}
                    >
                        <GeneratingUI />
                    </motion.div>
                ) : viewState === "feedback" && feedback ? (
                    <motion.div
                        key="feedback"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.5 }}
                    >
                        <FeedbackDisplay data={feedback} onReset={resetInterview} />
                    </motion.div>
                ) : viewState === "active" ? (
                    <motion.div
                        key="active"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.4 }}
                    >
                        <ActiveCallUI
                            callStatus={callStatus}
                            volumeLevel={volumeLevel}
                            isSpeaking={isSpeaking}
                            role={role}
                            seniority={seniority}
                            category={category}
                            transcript={transcript}
                            onEnd={endInterview}
                        />
                    </motion.div>
                ) : viewState === "setup" ? (
                    <motion.div
                        key="setup"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.4 }}
                    >
                        <button
                            onClick={() => setViewState("history")}
                            className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 mb-4 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to History
                        </button>
                        <SetupForm
                            role={role}
                            setRole={setRole}
                            seniority={seniority}
                            setSeniority={setSeniority}
                            topic={topic}
                            setTopic={setTopic}
                            category={category}
                            setCategory={setCategory}
                            creditInfo={creditInfo}
                            onStart={startInterview}
                        />
                    </motion.div>
                ) : (
                    <motion.div
                        key="history"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.4 }}
                    >
                        <InterviewHistory
                            interviews={pastInterviews}
                            loading={loadingHistory}
                            onView={viewPastInterview}
                            onDelete={deleteInterview}
                            onNewInterview={startNewSetup}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Interview History ──────────────────────────────────────────────────────────

function InterviewHistory({
    interviews,
    loading,
    onView,
    onDelete,
    onNewInterview,
}: {
    interviews: PastInterview[];
    loading: boolean;
    onView: (interview: PastInterview) => void;
    onDelete: (interviewId: string) => void;
    onNewInterview: () => void;
}) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    if (interviews.length === 0) {
        return (
            <div className="max-w-xl mx-auto text-center py-16">
                <div className="relative w-24 h-24 mx-auto mb-6">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 animate-pulse" />
                    <div className="absolute inset-3 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <Mic className="w-8 h-8 text-white" />
                    </div>
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                    No interviews yet
                </h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm max-w-sm mx-auto">
                    Start your first AI-powered mock interview. Choose a role, seniority, and topic — the AI
                    adapts instantly.
                </p>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onNewInterview}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/25 transition-all"
                >
                    <Sparkles className="w-4 h-4" />
                    Start Your First Interview
                </motion.button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <Clock className="w-5 h-5 text-slate-400" />
                    Past Interviews
                </h2>
                <Link
                    href="/candidate/ai-interview/replay"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-[0_8px_18px_-8px_rgb(37_99_235/0.7)] hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    <Sparkles className="w-4 h-4" /> Replay with heatmap
                </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {interviews.map((interview, i) => (
                    <motion.div
                        key={interview._id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                    >
                        <InterviewHistoryCard interview={interview} onClick={() => onView(interview)} onDelete={() => onDelete(interview._id)} />
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

function InterviewHistoryCard({
    interview,
    onClick,
    onDelete,
}: {
    interview: PastInterview;
    onClick: () => void;
    onDelete: () => void;
}) {
    const isCompleted = interview.status === "completed" && interview.feedback;
    const avgScore = isCompleted
        ? Math.round(
            ((interview.feedback!.communication_score + interview.feedback!.technical_score) / 2)
        )
        : null;

    const getScoreBadgeColor = (score: number) => {
        if (score >= 8) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
        if (score >= 6) return "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400";
        if (score >= 4) return "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400";
        return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400";
    };

    const date = new Date(interview.createdAt);
    const formattedDate = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
    const formattedTime = date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
            className="w-full text-left group cursor-pointer bg-white/80 dark:bg-[var(--soft-surface)]/90 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-[var(--soft-line)] shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-500/30 p-5 transition-all duration-200"
        >
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-50 dark:bg-blue-500/10 rounded-lg">
                        <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <span className="text-sm font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {interview.role}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {avgScore !== null ? (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${getScoreBadgeColor(avgScore)}`}>
                            {avgScore}/10
                        </span>
                    ) : (
                        <>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                                Pending
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/15 text-slate-400 hover:text-red-500 transition-colors"
                                title="Delete this interview"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="px-2 py-0.5 bg-slate-100 dark:bg-[var(--soft-raised)] rounded-md text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    {interview.seniority}
                </span>
                <span className="px-2 py-0.5 bg-slate-100 dark:bg-[var(--soft-raised)] rounded-md text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    {interview.category}
                </span>
            </div>

            {interview.topic && interview.topic !== "General Industry Standards" && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 truncate">
                    Topic: {interview.topic}
                </p>
            )}

            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-400">
                <Calendar className="w-3 h-3" />
                {formattedDate} · {formattedTime}
            </div>

            {isCompleted && interview.feedback?.hiring_recommendation && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[var(--soft-line)]">
                    <div className="flex items-center gap-1.5">
                        <Trophy className="w-3 h-3 text-amber-500" />
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {interview.feedback.hiring_recommendation}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Setup Form ─────────────────────────────────────────────────────────────────

function SetupForm({
    role,
    setRole,
    seniority,
    setSeniority,
    topic,
    setTopic,
    category,
    setCategory,
    onStart,
    creditInfo,
}: {
    role: string;
    setRole: (v: string) => void;
    seniority: string;
    setSeniority: (v: string) => void;
    topic: string;
    setTopic: (v: string) => void;
    category: string;
    setCategory: (v: string) => void;
    onStart: () => void;
    creditInfo: { credits: number; freeInterviewUsed: boolean } | null;
}) {
    const isFree = creditInfo ? !creditInfo.freeInterviewUsed : false;
    const hasEnoughCredits = creditInfo ? (isFree || creditInfo.credits >= 10) : true;
    return (
        <div className="max-w-3xl mx-auto">
            <div className="relative rounded-2xl overflow-hidden">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/20 via-purple-500/10 to-emerald-500/20 dark:from-blue-500/10 dark:via-purple-500/5 dark:to-emerald-500/10" />
                <div className="relative bg-white/80 dark:bg-[var(--soft-surface)]/90 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-[var(--soft-line)] shadow-xl shadow-slate-200/50 dark:shadow-black/30 p-8">
                    {/* Title */}
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/25">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                Configure Your Interview
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Customize your practice session
                            </p>
                        </div>
                        {creditInfo && (
                            <div className={`ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold ${isFree
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400'
                                }`}>
                                <Coins className="w-3.5 h-3.5" />
                                {isFree ? 'FREE — First Interview' : `Cost: 10 credits (Balance: ${creditInfo.credits})`}
                            </div>
                        )}
                    </div>

                    {/* Form */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                <Briefcase className="w-4 h-4 text-blue-500" />
                                Target Role
                            </label>
                            <input
                                type="text"
                                value={role}
                                placeholder="e.g. Software Engineer, Product Manager, Data Scientist"
                                className="w-full p-3 bg-slate-50 dark:bg-[var(--soft-raised)] border border-slate-200 dark:border-[var(--soft-line)] rounded-xl text-slate-900 dark:text-white text-sm font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none transition-all"
                                onChange={(e) => setRole(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                <GraduationCap className="w-4 h-4 text-purple-500" />
                                Seniority Level
                            </label>
                            <select
                                value={seniority}
                                onChange={(e) => setSeniority(e.target.value)}
                                className="w-full p-3 bg-slate-50 dark:bg-[var(--soft-raised)] border border-slate-200 dark:border-[var(--soft-line)] rounded-xl text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 outline-none transition-all"
                            >
                                {SENIORITY_LEVELS.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                <Layers className="w-4 h-4 text-emerald-500" />
                                Interview Category
                            </label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full p-3 bg-slate-50 dark:bg-[var(--soft-raised)] border border-slate-200 dark:border-[var(--soft-line)] rounded-xl text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition-all"
                            >
                                {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                <Target className="w-4 h-4 text-orange-500" />
                                Core Topic
                            </label>
                            <input
                                type="text"
                                value={topic}
                                placeholder="e.g. React Hooks, System Design, STAR Method"
                                className="w-full p-3 bg-slate-50 dark:bg-[var(--soft-raised)] border border-slate-200 dark:border-[var(--soft-line)] rounded-xl text-slate-900 dark:text-white text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 outline-none transition-all"
                                onChange={(e) => setTopic(e.target.value)}
                            />
                        </div>
                    </div>

                    <motion.button
                        whileHover={hasEnoughCredits ? { scale: 1.01 } : {}}
                        whileTap={hasEnoughCredits ? { scale: 0.98 } : {}}
                        onClick={hasEnoughCredits ? onStart : undefined}
                        disabled={!hasEnoughCredits}
                        className={`mt-8 w-full py-4 rounded-xl font-bold text-white text-base shadow-lg transition-all duration-300 flex items-center justify-center gap-3 ${hasEnoughCredits
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-600/25 hover:shadow-blue-600/40 cursor-pointer'
                            : 'bg-slate-400 dark:bg-slate-600 shadow-none cursor-not-allowed'
                            }`}
                    >
                        <Mic className="w-5 h-5" />
                        {hasEnoughCredits
                            ? (isFree ? 'Start Free Interview' : 'Start AI Interview (10 Credits)')
                            : 'Insufficient Credits'
                        }
                        {hasEnoughCredits && <ChevronRight className="w-4 h-4" />}
                    </motion.button>
                    {!hasEnoughCredits && (
                        <p className="mt-3 text-center text-sm text-red-500 dark:text-red-400">
                            You need 10 credits to start an interview. Earn credits by referring friends!
                        </p>
                    )}

                    <div className="mt-6 flex items-start gap-3 text-xs text-slate-400 dark:text-slate-400">
                        <Volume2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p>
                            Make sure your microphone is enabled. The AI will ask you questions and provide
                            real-time feedback when the interview ends.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Active Call UI ─────────────────────────────────────────────────────────────

function ActiveCallUI({
    callStatus,
    volumeLevel,
    isSpeaking,
    role,
    seniority,
    category,
    transcript,
    onEnd,
}: {
    callStatus: "idle" | "connecting" | "active";
    volumeLevel: number;
    isSpeaking: boolean;
    role: string;
    seniority: string;
    category: string;
    transcript: TranscriptEntry[];
    onEnd: () => void;
}) {
    const isConnecting = callStatus === "connecting";
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [transcript]);

    // Timer: starts when call is active
    useEffect(() => {
        if (callStatus !== "active") {
            setElapsed(0);
            return;
        }
        const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
        return () => clearInterval(interval);
    }, [callStatus]);

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    };

    return (
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Call Status */}
            <div className="lg:col-span-2">
                <div className="relative bg-white/80 dark:bg-[var(--soft-surface)]/90 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-[var(--soft-line)] shadow-xl shadow-slate-200/50 dark:shadow-black/30 p-8 text-center sticky top-8">
                    {/* Timer */}
                    {callStatus === "active" && (
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                            </span>
                            <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200 tracking-wider">
                                {formatTime(elapsed)}
                            </span>
                        </div>
                    )}
                    {/* Animated Orb */}
                    <div className="relative w-36 h-36 mx-auto mb-6">
                        {!isConnecting && (
                            <>
                                <motion.div
                                    animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                                    className="absolute inset-0 rounded-full bg-blue-500/20"
                                />
                                <motion.div
                                    animate={{ scale: [1, 1.6, 1], opacity: [0.2, 0, 0.2] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
                                    className="absolute inset-0 rounded-full bg-indigo-500/15"
                                />
                            </>
                        )}
                        <motion.div
                            animate={{
                                scale: isConnecting ? [1, 1.05, 1] : 1 + volumeLevel * 0.15,
                            }}
                            transition={
                                isConnecting
                                    ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                                    : { duration: 0.1 }
                            }
                            className="absolute inset-4 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-2xl shadow-blue-500/30 flex items-center justify-center"
                        >
                            {isConnecting ? (
                                <Loader2 className="w-10 h-10 text-white animate-spin" />
                            ) : isSpeaking ? (
                                <Volume2 className="w-10 h-10 text-white" />
                            ) : (
                                <Mic className="w-10 h-10 text-white" />
                            )}
                        </motion.div>
                    </div>

                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                        {isConnecting ? "Connecting..." : "Interview in Progress"}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                        {isConnecting
                            ? "Setting up your AI interviewer"
                            : isSpeaking
                                ? "AI is speaking — listen carefully..."
                                : "Listening — speak clearly"}
                    </p>

                    <div className="flex flex-wrap justify-center gap-1.5 mb-6">
                        <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-full text-[11px] font-semibold">
                            {role}
                        </span>
                        <span className="px-2.5 py-1 bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 rounded-full text-[11px] font-semibold">
                            {seniority}
                        </span>
                        <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded-full text-[11px] font-semibold">
                            {category}
                        </span>
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onEnd}
                        disabled={isConnecting}
                        className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-lg shadow-red-500/25 hover:shadow-red-500/40 transition-all duration-300 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <PhoneOff className="w-5 h-5" />
                        End Interview
                    </motion.button>
                </div>
            </div>

            {/* Right: Live Transcript */}
            <div className="lg:col-span-3">
                <div className="bg-white/80 dark:bg-[var(--soft-surface)]/90 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-[var(--soft-line)] shadow-xl shadow-slate-200/50 dark:shadow-black/30 p-6 h-[calc(100vh-220px)] flex flex-col">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-[var(--soft-line)]">
                        <MessageCircle className="w-4 h-4 text-blue-500" />
                        <h3 className="text-sm font-bold text-slate-800 dark:text-white">Live Transcript</h3>
                        <div className="ml-auto flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                            <span className="text-[11px] text-green-600 dark:text-green-400 font-semibold">
                                Live
                            </span>
                        </div>
                    </div>

                    <div ref={chatContainerRef} className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                        {transcript.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-400">
                                <Mic className="w-8 h-8 mb-2 opacity-40" />
                                <p className="text-sm">Conversation will appear here...</p>
                            </div>
                        ) : (
                            transcript.map((entry, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className={`flex gap-3 ${entry.role === "user" ? "flex-row-reverse" : ""}`}
                                >
                                    <div
                                        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${entry.role === "assistant"
                                            ? "bg-gradient-to-br from-blue-500 to-indigo-600"
                                            : "bg-gradient-to-br from-emerald-500 to-teal-600"
                                            }`}
                                    >
                                        {entry.role === "assistant" ? (
                                            <Bot className="w-3.5 h-3.5 text-white" />
                                        ) : (
                                            <User className="w-3.5 h-3.5 text-white" />
                                        )}
                                    </div>
                                    <div
                                        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed transition-opacity duration-200 ${entry.role === "assistant"
                                            ? "bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-800 dark:text-slate-200 rounded-bl-md"
                                            : "bg-blue-600 text-white rounded-br-md"
                                            } ${entry.isPartial ? "opacity-60 italic" : ""}`}
                                    >
                                        {entry.content}
                                        {entry.isPartial && (
                                            <span className="inline-block ml-1 animate-pulse">▍</span>
                                        )}
                                    </div>
                                </motion.div>
                            ))
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Generating / Analyzing UI ──────────────────────────────────────────────────

function GeneratingUI() {
    const steps = [
        "Analyzing communication skills...",
        "Evaluating technical knowledge...",
        "Identifying key strengths...",
        "Preparing your assessment report...",
    ];
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
        }, 800);
        return () => clearInterval(interval);
    }, [steps.length]);

    return (
        <div className="max-w-lg mx-auto py-20">
            <div className="text-center">
                {/* Animated analyzing orb */}
                <div className="relative w-32 h-32 mx-auto mb-10">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 border-r-indigo-500"
                    />
                    <motion.div
                        animate={{ rotate: -360 }}
                        transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-2 rounded-full border-2 border-transparent border-b-purple-500 border-l-blue-400"
                    />
                    <div className="absolute inset-5 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-2xl shadow-blue-500/30 flex items-center justify-center">
                        <motion.div
                            animate={{ scale: [1, 1.15, 1] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        >
                            <Sparkles className="w-8 h-8 text-white" />
                        </motion.div>
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                    Generating Your Assessment
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">
                    Our AI is reviewing your interview performance...
                </p>

                {/* Progress steps */}
                <div className="space-y-3 text-left max-w-xs mx-auto">
                    {steps.map((step, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{
                                opacity: i <= currentStep ? 1 : 0.3,
                                x: 0,
                            }}
                            transition={{ delay: i * 0.1, duration: 0.3 }}
                            className="flex items-center gap-3"
                        >
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300 ${i < currentStep
                                ? "bg-emerald-500"
                                : i === currentStep
                                    ? "bg-blue-500"
                                    : "bg-slate-200 dark:bg-[var(--soft-line)]"
                                }`}>
                                {i < currentStep ? (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : i === currentStep ? (
                                    <Loader2 className="w-3 h-3 text-white animate-spin" />
                                ) : null}
                            </div>
                            <span className={`text-sm font-medium transition-colors duration-300 ${i <= currentStep
                                ? "text-slate-800 dark:text-slate-200"
                                : "text-slate-400 dark:text-slate-600"
                                }`}>
                                {step}
                            </span>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Feedback Display — Professional Assessment Report ──────────────────────────

function FeedbackDisplay({
    data,
    onReset,
}: {
    data: FeedbackData;
    onReset: () => void;
}) {
    const overallScore = Math.round((data.communication_score + data.technical_score) / 2);
    const circumference = 2 * Math.PI * 52;

    const getGrade = (score: number) => {
        if (score >= 9) return "A+";
        if (score >= 8) return "A";
        if (score >= 7) return "B+";
        if (score >= 6) return "B";
        if (score >= 5) return "C";
        if (score >= 4) return "D";
        return "F";
    };

    const getGradeColor = (score: number) => {
        if (score >= 8) return { text: "text-emerald-500", stroke: "stroke-emerald-500", bg: "bg-emerald-500", bgLight: "bg-emerald-50 dark:bg-emerald-500/10" };
        if (score >= 6) return { text: "text-blue-500", stroke: "stroke-blue-500", bg: "bg-blue-500", bgLight: "bg-blue-50 dark:bg-blue-500/10" };
        if (score >= 4) return { text: "text-amber-500", stroke: "stroke-amber-500", bg: "bg-amber-500", bgLight: "bg-amber-50 dark:bg-amber-500/10" };
        return { text: "text-red-500", stroke: "stroke-red-500", bg: "bg-red-500", bgLight: "bg-red-50 dark:bg-red-500/10" };
    };

    const overallColors = getGradeColor(overallScore);
    const commColors = getGradeColor(data.communication_score);
    const techColors = getGradeColor(data.technical_score);

    const getVerdictStyle = (rec: string) => {
        const lower = rec.toLowerCase();
        if (lower.includes("strong hire")) return { bg: "bg-emerald-500", border: "border-emerald-200 dark:border-emerald-500/30", text: "text-white" };
        if (lower.includes("hire")) return { bg: "bg-blue-500", border: "border-blue-200 dark:border-blue-500/30", text: "text-white" };
        if (lower.includes("no")) return { bg: "bg-red-500", border: "border-red-200 dark:border-red-500/30", text: "text-white" };
        return { bg: "bg-slate-500", border: "border-slate-200 dark:border-slate-500/30", text: "text-white" };
    };

    const verdictStyle = getVerdictStyle(data.hiring_recommendation);

    return (
        <div className="max-w-4xl mx-auto">
            {/* Back */}
            <button
                onClick={onReset}
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-6"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Interviews
            </button>

            {/* ═══ Report Container ═══ */}
            <div className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl border border-slate-200 dark:border-[#222] shadow-xl shadow-slate-200/60 dark:shadow-black/40 overflow-hidden">

                {/* ── Report Header ── */}
                <div className="relative px-8 pt-8 pb-6 border-b border-slate-100 dark:border-[var(--soft-line)]">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-400 mb-1">Interview Assessment Report</p>
                            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Performance Evaluation</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">AI-graded assessment based on your interview responses</p>
                        </div>
                        <div className={`px-4 py-2 rounded-lg ${verdictStyle.bg} ${verdictStyle.text} font-bold text-sm shadow-lg`}>
                            {data.hiring_recommendation || "Assessment Complete"}
                        </div>
                    </div>
                </div>

                {/* ── Score Section ── */}
                <div className="px-8 py-8 border-b border-slate-100 dark:border-[var(--soft-line)]">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">

                        {/* Overall Score — Large Gauge */}
                        <div className="flex flex-col items-center">
                            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-400 mb-3">Overall Score</p>
                            <div className="relative w-36 h-36">
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle cx="50%" cy="50%" r="52" className="stroke-slate-100 dark:stroke-[#1f1f1f] fill-none" strokeWidth="10" />
                                    <motion.circle
                                        initial={{ strokeDashoffset: circumference }}
                                        animate={{ strokeDashoffset: circumference - (overallScore / 10) * circumference }}
                                        transition={{ duration: 1.8, ease: "easeOut", delay: 0.2 }}
                                        cx="50%" cy="50%" r="52"
                                        className={`${overallColors.stroke} fill-none`}
                                        strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className={`text-4xl font-black ${overallColors.text}`}>{getGrade(overallScore)}</span>
                                    <span className="text-xs font-bold text-slate-400 mt-0.5">{overallScore}/10</span>
                                </div>
                            </div>
                        </div>

                        {/* Individual Scores */}
                        <div className="md:col-span-2 grid grid-cols-2 gap-4">
                            {/* Communication */}
                            <div className="bg-slate-50/80 dark:bg-[var(--soft-sunken)] rounded-xl p-5 border border-slate-100 dark:border-[var(--soft-line)]">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className={`p-1.5 rounded-lg ${commColors.bgLight}`}>
                                        <Volume2 className={`w-4 h-4 ${commColors.text}`} />
                                    </div>
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Communication</span>
                                </div>
                                <div className="flex items-end justify-between mb-2">
                                    <span className={`text-3xl font-black ${commColors.text}`}>{data.communication_score}</span>
                                    <span className={`text-lg font-bold ${commColors.text} opacity-60`}>{getGrade(data.communication_score)}</span>
                                </div>
                                <div className="h-2 bg-slate-200/60 dark:bg-[var(--soft-raised)] rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${data.communication_score * 10}%` }}
                                        transition={{ duration: 1.2, ease: "easeOut", delay: 0.4 }}
                                        className={`h-full ${commColors.bg} rounded-full`}
                                    />
                                </div>
                            </div>

                            {/* Technical */}
                            <div className="bg-slate-50/80 dark:bg-[var(--soft-sunken)] rounded-xl p-5 border border-slate-100 dark:border-[var(--soft-line)]">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className={`p-1.5 rounded-lg ${techColors.bgLight}`}>
                                        <Target className={`w-4 h-4 ${techColors.text}`} />
                                    </div>
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Technical</span>
                                </div>
                                <div className="flex items-end justify-between mb-2">
                                    <span className={`text-3xl font-black ${techColors.text}`}>{data.technical_score}</span>
                                    <span className={`text-lg font-bold ${techColors.text} opacity-60`}>{getGrade(data.technical_score)}</span>
                                </div>
                                <div className="h-2 bg-slate-200/60 dark:bg-[var(--soft-raised)] rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${data.technical_score * 10}%` }}
                                        transition={{ duration: 1.2, ease: "easeOut", delay: 0.6 }}
                                        className={`h-full ${techColors.bg} rounded-full`}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Detailed Evaluation ── */}
                <div className="px-8 py-8 border-b border-slate-100 dark:border-[var(--soft-line)]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                        {/* Strengths */}
                        <div>
                            <div className="flex items-center gap-2 mb-5">
                                <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Strengths</h3>
                            </div>
                            {data.strengths && data.strengths.length > 0 ? (
                                <div className="space-y-3">
                                    {data.strengths.map((s, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.15 * i }}
                                            className="flex gap-3 items-start"
                                        >
                                            <span className="text-xs font-black text-emerald-500 mt-0.5 w-5 text-right flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
                                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{s}</p>
                                        </motion.div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400 dark:text-slate-400 italic">No specific strengths identified.</p>
                            )}
                        </div>

                        {/* Areas for Improvement */}
                        <div>
                            <div className="flex items-center gap-2 mb-5">
                                <div className="w-6 h-6 rounded-md bg-amber-500 flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                    </svg>
                                </div>
                                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Areas for Improvement</h3>
                            </div>
                            {data.weaknesses && data.weaknesses.length > 0 ? (
                                <div className="space-y-3">
                                    {data.weaknesses.map((w, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.15 * i }}
                                            className="flex gap-3 items-start"
                                        >
                                            <span className="text-xs font-black text-amber-500 mt-0.5 w-5 text-right flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
                                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{w}</p>
                                        </motion.div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400 dark:text-slate-400 italic">No specific weaknesses identified.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Recommended Action Plan ── */}
                {data.improvement_plan && (
                    <div className="px-8 py-8 border-b border-slate-100 dark:border-[var(--soft-line)]">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center">
                                <Zap className="w-3.5 h-3.5 text-white" />
                            </div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Recommended Action Plan</h3>
                        </div>
                        <div className="bg-slate-50/80 dark:bg-[var(--soft-sunken)] rounded-xl p-5 border border-slate-100 dark:border-[var(--soft-line)]">
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                {data.improvement_plan}
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Footer ── */}
                <div className="px-8 py-5 bg-slate-50/50 dark:bg-[var(--soft-sunken)] flex items-center justify-between">
                    <p className="text-[11px] text-slate-400 dark:text-slate-400 font-medium">
                        Assessment generated by SkillUp AI · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onReset}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-200/60 dark:border-blue-500/20 transition-all"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        New Interview
                    </motion.button>
                </div>
            </div>
        </div>
    );
}
