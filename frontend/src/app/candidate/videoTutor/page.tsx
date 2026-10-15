'use client';

import React, { useState, useEffect } from 'react';
import { Play, Clock, BookOpen, Loader2, Search, User, Star } from 'lucide-react';
import { motion } from 'motion/react';
import api from '@/lib/api';

interface VideoData {
    _id: string;
    title: string;
    duration_seconds: number;
    thumbnail_url?: string;
    cloudinary_url?: string;
    order_index: number;
}

interface CreatorData {
    _id: string;
    displayName: string;
    username: string;
    avatar_url?: string;
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
    total_enrollments: number;
    level: string;
    price_type: string;
    price_per_minute: number;
    rating: { average: number; count: number };
    creator?: CreatorData;
    videos?: VideoData[];
}

const CATEGORIES = ['All', 'Programming', 'Data Science', 'Web Development', 'Mobile Development', 'DevOps', 'Design', 'Business', 'Marketing', 'Other'];

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes} min`;
}

function getYoutubeThumbnail(url: string): string | null {
    if (!url) return null;
    const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
}

function getCourseThumbnail(course: CourseData): string | null {
    // Use course thumbnail if set
    if (course.thumbnail_url) return course.thumbnail_url;
    // Try to get YouTube thumbnail from the first video
    const firstVideo = course.videos?.[0];
    if (firstVideo?.cloudinary_url) {
        return getYoutubeThumbnail(firstVideo.cloudinary_url);
    }
    return null;
}

export default function VideoTutorPage() {
    const [courses, setCourses] = useState<CourseData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchCourses();
    }, [selectedCategory]);

    const fetchCourses = async () => {
        setLoading(true);
        setError('');
        try {
            const params: Record<string, string> = {};
            if (selectedCategory !== 'All') params.category = selectedCategory;
            if (searchQuery.trim()) params.search = searchQuery.trim();

            const res = await api.get('/courses/browse', { params });
            if (res.data.success) {
                setCourses(res.data.courses);
            }
        } catch (err) {
            console.error('Failed to fetch courses', err);
            setError('Failed to load courses. Make sure the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchCourses();
    };

    return (
        <div className="w-full">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
                    <span>DASHBOARD</span>
                    <span>/</span>
                    <span className="font-semibold text-slate-800 dark:text-white">VIDEO COURSES</span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Video Courses
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                    Browse courses created by top educators and creators.
                </p>
            </div>

            {/* Search + Filters */}
            <div className="mb-6 space-y-4">
                <form onSubmit={handleSearch} className="flex gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search courses..."
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-[var(--soft-line)] bg-white dark:bg-[var(--soft-surface)] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm"
                        />
                    </div>
                    <button
                        type="submit"
                        className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-sm hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
                    >
                        Search
                    </button>
                </form>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                                selectedCategory === cat
                                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                                    : 'bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[var(--soft-line)]'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="flex items-center justify-center min-h-[40vh]">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
            )}

            {/* Error State */}
            {error && !loading && (
                <div className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                        <BookOpen className="w-8 h-8 text-red-400" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                        Something went wrong
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">{error}</p>
                    <button
                        onClick={fetchCourses}
                        className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            )}

            {/* Courses Grid */}
            {!loading && !error && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {courses.map((course, i) => (
                            <motion.div
                                key={course._id}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05, duration: 0.4 }}
                            >
                                <a
                                    href={`/candidate/videoTutor/${course._id}`}
                                    className="block group"
                                >
                                    <div className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl border border-slate-200 dark:border-[var(--soft-line)] overflow-hidden transition-all duration-300 hover:border-blue-300 dark:hover:border-blue-500/40 hover:shadow-lg">
                                        {/* Thumbnail */}
                                        <div className="relative aspect-video bg-slate-100 dark:bg-[var(--soft-raised)]">
                                            {getCourseThumbnail(course) ? (
                                                <img
                                                    src={getCourseThumbnail(course)!}
                                                    alt={course.title}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                                        <Play className="w-7 h-7 text-white ml-1" />
                                                    </div>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                <div className="w-14 h-14 rounded-full bg-white/90 dark:bg-[var(--soft-line)]/90 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100">
                                                    <Play className="w-6 h-6 text-slate-800 dark:text-white ml-1" />
                                                </div>
                                            </div>
                                            {/* Duration badge */}
                                            {course.total_duration > 0 && (
                                                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/80 rounded text-xs font-medium text-white flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDuration(course.total_duration)}
                                                </div>
                                            )}
                                            {/* Price badge */}
                                            <div className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-bold ${
                                                course.price_type === 'free'
                                                    ? 'bg-green-500 text-white'
                                                    : 'bg-amber-500 text-white'
                                            }`}>
                                                {course.price_type === 'free' ? 'FREE' : `$${course.price_per_minute}/min`}
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="p-5">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded text-[11px] font-semibold">
                                                    {course.category}
                                                </span>
                                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-[var(--soft-raised)] text-slate-500 dark:text-slate-400 rounded text-[11px] font-semibold">
                                                    {course.level}
                                                </span>
                                                {course.total_videos > 0 && (
                                                    <span className="text-[11px] text-slate-400 dark:text-slate-400">
                                                        {course.total_videos} video{course.total_videos !== 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                                                {course.title}
                                            </h3>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
                                                {course.short_description || course.description || 'No description available.'}
                                            </p>

                                            {/* Creator info */}
                                            {course.creator && (
                                                <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-[var(--soft-line)]">
                                                    {course.creator.avatar_url ? (
                                                        <img
                                                            src={course.creator.avatar_url}
                                                            alt={course.creator.displayName}
                                                            className="w-6 h-6 rounded-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                                                            <User className="w-3 h-3 text-white" />
                                                        </div>
                                                    )}
                                                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                                                        {course.creator.displayName}
                                                    </span>
                                                    {course.rating.count > 0 && (
                                                        <div className="ml-auto flex items-center gap-1">
                                                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                                {course.rating.average.toFixed(1)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </a>
                            </motion.div>
                        ))}
                    </div>

                    {/* Empty State */}
                    {courses.length === 0 && (
                        <div className="text-center py-16">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-[var(--soft-raised)] flex items-center justify-center">
                                <BookOpen className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                                No courses found
                            </h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                {selectedCategory !== 'All' || searchQuery
                                    ? 'Try a different category or search term.'
                                    : 'No published courses yet. Check back later!'}
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}