'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@clerk/nextjs';
import {
    ArrowLeft,
    Save,
    Plus,
    Trash2,
    Loader2,
    Video,
    X,
    AlertCircle,
    CheckCircle2,
    FileText,
    Globe,
    Eye,
} from 'lucide-react';
import api from '@/lib/api';

// Helper: extract YouTube video ID from URL
function extractYoutubeId(url: string): string | null {
    if (!url) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}

// Fire-and-forget transcript generation via backend2
async function triggerTranscriptGeneration(youtubeUrl: string): Promise<boolean> {
    try {
        const res = await fetch('/api2/api/yt_transcript/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: youtubeUrl }),
        });
        return res.ok;
    } catch {
        console.warn('Transcript generation failed (non-blocking):', youtubeUrl);
        return false;
    }
}

interface Video {
    _id: string;
    title: string;
    description?: string;
    duration_seconds: number;
    order_index: number;
    thumbnail_url?: string;
    cloudinary_url?: string;
}

interface Course {
    _id: string;
    title: string;
    description: string;
    category: string;
    price_per_minute: number;
    videos: Video[];
}

const CATEGORIES = [
    'Programming',
    'Data Science',
    'Web Development',
    'Mobile Development',
    'DevOps',
    'Design',
    'Business',
    'Marketing',
    'Other',
];

export default function CourseEditorPage() {
    const params = useParams();
    const router = useRouter();
    const { getToken } = useAuth();
    
    const courseId = params.courseId as string;
    const isNew = courseId === 'new';
    
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState('');
    const [courseStatus, setCourseStatus] = useState<'draft' | 'published'>('draft');
    
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [pricePerMinute, setPricePerMinute] = useState(0.5);
    const [videos, setVideos] = useState<Video[]>([]);
    
    const [showAddVideo, setShowAddVideo] = useState(false);
    const [newVideoTitle, setNewVideoTitle] = useState('');
    const [newVideoUrl, setNewVideoUrl] = useState('');
    const [newVideoThumbnail, setNewVideoThumbnail] = useState('');

    // Transcript generation status
    const [transcriptStatus, setTranscriptStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
    const [transcriptProgress, setTranscriptProgress] = useState({ done: 0, total: 0 });

    useEffect(() => {
        if (!isNew && courseId) {
            setLoading(true);
            const fetchCourse = async () => {
                try {
                    const token = await getToken();
                    const res = await api.get(`/creator/courses/${courseId}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (res.data.success) {
                        const course = res.data.course;
                        setTitle(course.title);
                        setDescription(course.description || '');
                        setCategory(course.category || '');
                        setPricePerMinute(course.price_per_minute || 0.5);
                        setVideos(course.videos || []);
                        setCourseStatus(course.status === 'published' ? 'published' : 'draft');
                    }
                } catch (err) {
                    console.error('Failed to load course', err);
                    setError('Failed to load course');
                } finally {
                    setLoading(false);
                }
            };
            fetchCourse();
        }
    }, [courseId, isNew, getToken]);

    // Pre-generate transcripts for all YouTube videos (fire-and-forget)
    const generateTranscriptsForVideos = async (videoList: Video[]) => {
        const ytVideos = videoList.filter(v => extractYoutubeId(v.cloudinary_url || ''));
        if (ytVideos.length === 0) return;

        setTranscriptStatus('generating');
        setTranscriptProgress({ done: 0, total: ytVideos.length });

        let completed = 0;
        for (const video of ytVideos) {
            const ytUrl = video.cloudinary_url || '';
            await triggerTranscriptGeneration(ytUrl);
            completed++;
            setTranscriptProgress({ done: completed, total: ytVideos.length });
        }

        setTranscriptStatus('done');
        // Auto-hide after 5s
        setTimeout(() => setTranscriptStatus('idle'), 5000);
    };

    const handleSave = async () => {
        if (!title.trim()) {
            setError('Title is required');
            return;
        }
        
        setSaving(true);
        setError('');
        
        try {
            const token = await getToken();
            const courseData = {
                title: title.trim(),
                description: description.trim(),
                category,
                price_per_minute: pricePerMinute,
                videos,
            };
            
            if (isNew) {
                const res = await api.post('/creator/courses', courseData, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.data.success) {
                    // Fire-and-forget: pre-generate transcripts
                    generateTranscriptsForVideos(videos);
                    router.push(`/creator/courses/${res.data.courseId}`);
                } else {
                    setError(res.data.error || 'Failed to create course');
                }
            } else {
                const res = await api.put(`/creator/courses/${courseId}`, courseData, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.data.success) {
                    // Fire-and-forget: pre-generate transcripts
                    generateTranscriptsForVideos(videos);
                } else {
                    setError(res.data.error || 'Failed to update course');
                }
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to save course');
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        if (isNew) return;
        setPublishing(true);
        setError('');
        try {
            const token = await getToken();
            const newStatus = courseStatus === 'published' ? 'draft' : 'published';
            const res = await api.put(`/creator/courses/${courseId}`, { status: newStatus }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data.success) {
                setCourseStatus(newStatus);
            } else {
                setError(res.data.error || 'Failed to update status');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to update status');
        } finally {
            setPublishing(false);
        }
    };

    const handleAddVideo = () => {
        if (!newVideoTitle.trim()) {
            setError('Video title is required');
            return;
        }

        // Validate YouTube URL
        if (newVideoUrl.trim()) {
            const ytPatterns = [
                /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
                /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
                /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
                /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
            ];
            const isYoutube = ytPatterns.some(p => p.test(newVideoUrl.trim()));
            if (!isYoutube) {
                setError('Please enter a valid YouTube URL (e.g. https://youtube.com/watch?v=...)');
                return;
            }
            // Auto-generate YouTube thumbnail if none provided
            if (!newVideoThumbnail.trim()) {
                const match = newVideoUrl.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
                if (match) {
                    setNewVideoThumbnail(`https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`);
                }
            }
        }
        
        const newVideo: Video = {
            _id: `temp-${Date.now()}`,
            title: newVideoTitle.trim(),
            duration_seconds: 300,
            order_index: videos.length,
            thumbnail_url: newVideoThumbnail || '',
            cloudinary_url: newVideoUrl || '',
        };
        
        setVideos([...videos, newVideo]);
        setNewVideoTitle('');
        setNewVideoUrl('');
        setNewVideoThumbnail('');
        setShowAddVideo(false);
        setError('');

        // Start transcript pre-generation immediately when a YouTube video is added
        if (newVideoUrl.trim() && extractYoutubeId(newVideoUrl.trim())) {
            setTranscriptStatus('generating');
            setTranscriptProgress({ done: 0, total: 1 });
            triggerTranscriptGeneration(newVideoUrl.trim()).then((ok) => {
                setTranscriptStatus(ok ? 'done' : 'error');
                setTranscriptProgress({ done: 1, total: 1 });
                setTimeout(() => setTranscriptStatus('idle'), 5000);
            });
        }
    };

    const handleDeleteVideo = (videoId: string) => {
        setVideos(videos.filter((v) => v._id !== videoId));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl">
            <button
                onClick={() => router.push('/creator/courses')}
                className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-6"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Courses
            </button>

            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                        {isNew ? 'Create New Course' : 'Edit Course'}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                        {isNew ? 'Add your course details and videos' : 'Update your course details'}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Status badge */}
                    {!isNew && (
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            courseStatus === 'published'
                                ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400'
                                : 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        }`}>
                            {courseStatus === 'published' ? '● Live' : '● Draft'}
                        </span>
                    )}

                    {/* Save as Draft */}
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleSave}
                        disabled={saving || publishing}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-[var(--soft-raised)] hover:bg-slate-200 dark:hover:bg-[var(--soft-line)] border border-slate-200 dark:border-[var(--soft-line)] transition-all text-sm disabled:opacity-50"
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        {saving ? 'Saving...' : 'Save Draft'}
                    </motion.button>

                    {/* Publish / Unpublish */}
                    {!isNew && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handlePublish}
                            disabled={publishing || saving}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 ${
                                courseStatus === 'published'
                                    ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 border border-amber-200 dark:border-amber-500/20'
                                    : 'text-white bg-green-600 hover:bg-green-700'
                            }`}
                        >
                            {publishing ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : courseStatus === 'published' ? (
                                <Eye className="w-4 h-4" />
                            ) : (
                                <Globe className="w-4 h-4" />
                            )}
                            {publishing ? 'Updating...' : courseStatus === 'published' ? 'Unpublish' : 'Publish'}
                        </motion.button>
                    )}
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-4 mb-6 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {/* Transcript generation status toast */}
            <AnimatePresence>
                {transcriptStatus !== 'idle' && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`flex items-center gap-3 p-4 mb-6 rounded-xl border ${
                            transcriptStatus === 'generating'
                                ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20'
                                : transcriptStatus === 'done'
                                ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20'
                                : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'
                        }`}
                    >
                        {transcriptStatus === 'generating' ? (
                            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                        ) : transcriptStatus === 'done' ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-amber-500" />
                        )}
                        <div className="flex-1">
                            <p className={`text-sm font-medium ${
                                transcriptStatus === 'generating' ? 'text-blue-700 dark:text-blue-300'
                                : transcriptStatus === 'done' ? 'text-green-700 dark:text-green-300'
                                : 'text-amber-700 dark:text-amber-300'
                            }`}>
                                {transcriptStatus === 'generating'
                                    ? `Generating AI transcript chapters... (${transcriptProgress.done}/${transcriptProgress.total})`
                                    : transcriptStatus === 'done'
                                    ? 'Transcripts generated & cached! Candidates will see chapters instantly.'
                                    : 'Transcript generation failed — candidates can still generate on-demand.'}
                            </p>
                        </div>
                        <FileText className={`w-4 h-4 ${
                            transcriptStatus === 'generating' ? 'text-blue-400'
                            : transcriptStatus === 'done' ? 'text-green-400'
                            : 'text-amber-400'
                        }`} />
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="space-y-6">
                <div className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl border border-slate-200 dark:border-[var(--soft-line)] p-6">
                    <h2 className="font-bold text-slate-800 dark:text-white mb-4">Course Details</h2>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Title *
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Complete Python Masterclass"
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[var(--soft-raised)] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Description
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe what students will learn..."
                                rows={4}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[var(--soft-raised)] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                            />
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Category
                                </label>
                                <select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[var(--soft-raised)] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                >
                                    <option value="">Select category</option>
                                    {CATEGORIES.map((cat) => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Price per minute ($)
                                </label>
                                <input
                                    type="number"
                                    value={pricePerMinute}
                                    onChange={(e) => setPricePerMinute(parseFloat(e.target.value) || 0)}
                                    min="0"
                                    step="0.01"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[var(--soft-raised)] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl border border-slate-200 dark:border-[var(--soft-line)] p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-slate-800 dark:text-white">Videos ({videos.length})</h2>
                        <button
                            onClick={() => setShowAddVideo(true)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add Video
                        </button>
                    </div>

                    {videos.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                            <Video className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                No videos added yet. Add your first video to start building the course.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {videos.map((video, index) => (
                                <div
                                    key={video._id}
                                    className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-[var(--soft-raised)] border border-slate-200 dark:border-slate-700"
                                >
                                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-sm">
                                        {index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-medium text-slate-800 dark:text-white truncate">
                                            {video.title}
                                        </h3>
                                        {video.thumbnail_url && (
                                            <p className="text-xs text-slate-500 truncate">{video.thumbnail_url}</p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleDeleteVideo(video._id)}
                                        className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {showAddVideo && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                        onClick={(e) => e.target === e.currentTarget && setShowAddVideo(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl border border-slate-200 dark:border-[var(--soft-line)] p-6 w-full max-w-md"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                                    Add Video
                                </h2>
                                <button
                                    onClick={() => setShowAddVideo(false)}
                                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[var(--soft-raised)] transition-colors"
                                >
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Video Title *
                                    </label>
                                    <input
                                        type="text"
                                        value={newVideoTitle}
                                        onChange={(e) => setNewVideoTitle(e.target.value)}
                                        placeholder="e.g. Introduction to Variables"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[var(--soft-raised)] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        YouTube Video URL *
                                    </label>
                                    <input
                                        type="url"
                                        value={newVideoUrl}
                                        onChange={(e) => setNewVideoUrl(e.target.value)}
                                        placeholder="https://www.youtube.com/watch?v=..."
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[var(--soft-raised)] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                    />
                                    <p className="text-[11px] text-slate-400 mt-1">Supports youtube.com/watch, youtu.be, and shorts links</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Thumbnail URL
                                    </label>
                                    <input
                                        type="url"
                                        value={newVideoThumbnail}
                                        onChange={(e) => setNewVideoThumbnail(e.target.value)}
                                        placeholder="https://..."
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[var(--soft-raised)] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowAddVideo(false)}
                                    className="flex-1 py-3 rounded-xl font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[var(--soft-raised)] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddVideo}
                                    className="flex-1 py-3 rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                                >
                                    Add Video
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}