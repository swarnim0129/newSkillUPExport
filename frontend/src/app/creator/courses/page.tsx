'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useAuth } from '@clerk/nextjs';
import {
    Search,
    Play,
    Plus,
    Loader2,
    BookOpen,
    Edit,
    Trash2,
    MoreVertical,
    UserPlus,
    AlertCircle,
} from 'lucide-react';
import api from '@/lib/api';

interface Video {
    _id: string;
    title: string;
    duration_seconds: number;
    order_index: number;
    thumbnail_url?: string;
}

interface Course {
    _id: string;
    title: string;
    description: string;
    category: string;
    price_per_minute: number;
    videos: Video[];
    totalDuration: number;
    createdAt: string;
    status: string;
}

interface CreatorProfile {
    _id: string;
    username: string;
    displayName: string;
    avatar_url: string;
    total_courses: number;
    total_followers: number;
}

const formatDurationLong = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
};

export default function CreatorCoursesPage() {
    const { getToken } = useAuth();
    const router = useRouter();
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreator, setIsCreator] = useState(false);
    const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
    const [error, setError] = useState('');
    
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [registering, setRegistering] = useState(false);
    const [registerForm, setRegisterForm] = useState({
        username: '',
        displayName: '',
        gender: 'prefer_not_to_say',
        bio: '',
    });
    const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

    useEffect(() => {
        checkCreatorStatus();
    }, []);

    const checkCreatorStatus = async () => {
        setLoading(true);
        try {
            const token = await getToken();
            const res = await api.get('/creator/check-creator', {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (res.data.isCreator) {
                setIsCreator(true);
                setCreatorProfile(res.data.profile);
                fetchCourses();
            } else {
                setIsCreator(false);
                setLoading(false);
            }
        } catch (err: any) {
            console.error('Failed to check creator status', err);
            setLoading(false);
        }
    };

    const fetchCourses = async () => {
        try {
            const token = await getToken();
            const res = await api.get('/creator/courses', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data.success) {
                const coursesWithDuration = res.data.courses.map((course: Course) => ({
                    ...course,
                    totalDuration: course.videos?.reduce((acc: number, v: Video) => acc + (v.duration_seconds || 0), 0) || 0,
                }));
                setCourses(coursesWithDuration);
            }
        } catch (err: any) {
            if (err.response?.data?.error) {
                setError(err.response.data.error);
            } else {
                console.error('Failed to load courses', err);
            }
        } finally {
            setLoading(false);
        }
    };

    const checkUsernameAvailability = async (username: string) => {
        if (username.length < 3) {
            setUsernameAvailable(null);
            return;
        }
        try {
            const res = await api.get(`/creator-profile/verify-username/${username}`);
            setUsernameAvailable(res.data.available);
        } catch {
            setUsernameAvailable(null);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!registerForm.username || !registerForm.displayName) {
            setError('Username and display name are required');
            return;
        }
        if (!usernameAvailable) {
            setError('Please choose a valid username');
            return;
        }

        setRegistering(true);
        setError('');

        try {
            const token = await getToken();
            const res = await api.post('/creator-profile/register', registerForm, {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (res.data.success) {
                setShowRegisterModal(false);
                setIsCreator(true);
                setCreatorProfile(res.data.profile);
                fetchCourses();
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to register as creator');
        } finally {
            setRegistering(false);
        }
    };

    const handleDeleteCourse = async (courseId: string) => {
        if (!confirm('Are you sure you want to delete this course?')) return;
        
        try {
            const token = await getToken();
            await api.delete(`/creator/courses/${courseId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setCourses((prev) => prev.filter((c) => c._id !== courseId));
        } catch (error) {
            console.error('Failed to delete course', error);
        }
    };

    const filteredCourses = searchTerm
        ? courses.filter(
              (c) =>
                  c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (c.category && c.category.toLowerCase().includes(searchTerm.toLowerCase()))
          )
        : courses;

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!isCreator) {
        return (
            <div className="w-full">
                <div className="mb-8">
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
                        <span>CREATOR</span>
                        <span>/</span>
                        <span className="font-semibold text-slate-800 dark:text-white">COURSES</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Become a Creator
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Share your knowledge and earn by creating courses
                    </p>
                </div>

                <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center mb-6">
                        <UserPlus className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                        Start Your Creator Journey
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-center max-w-md mb-8">
                        Create courses, build your audience, and earn money by sharing your expertise with the community.
                    </p>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowRegisterModal(true)}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 transition-all"
                    >
                        <UserPlus className="w-5 h-5" />
                        Register as Creator
                    </motion.button>
                </div>

                {showRegisterModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl border border-slate-200 dark:border-[var(--soft-line)] p-6 w-full max-w-md"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                                    Create Your Creator Profile
                                </h2>
                                <button
                                    onClick={() => setShowRegisterModal(false)}
                                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[var(--soft-raised)] transition-colors"
                                >
                                    <AlertCircle className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm">
                                    <AlertCircle className="w-4 h-4" />
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleRegister} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Username *
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">@</span>
                                        <input
                                            type="text"
                                            value={registerForm.username}
                                            onChange={(e) => {
                                                setRegisterForm({ ...registerForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') });
                                                checkUsernameAvailability(e.target.value);
                                            }}
                                            placeholder="johndoe"
                                            className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[var(--soft-raised)] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                        />
                                    </div>
                                    {usernameAvailable !== null && (
                                        <p className={`text-xs mt-1 ${usernameAvailable ? 'text-green-500' : 'text-red-500'}`}>
                                            {usernameAvailable ? 'Username is available' : 'Username is already taken'}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Display Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={registerForm.displayName}
                                        onChange={(e) => setRegisterForm({ ...registerForm, displayName: e.target.value })}
                                        placeholder="John Doe"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[var(--soft-raised)] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Gender *
                                    </label>
                                    <select
                                        value={registerForm.gender}
                                        onChange={(e) => setRegisterForm({ ...registerForm, gender: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[var(--soft-raised)] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                    >
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                        <option value="prefer_not_to_say">Prefer not to say</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Bio
                                    </label>
                                    <textarea
                                        value={registerForm.bio}
                                        onChange={(e) => setRegisterForm({ ...registerForm, bio: e.target.value })}
                                        placeholder="Tell us about yourself..."
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[var(--soft-raised)] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={registering}
                                    className="w-full py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {registering ? 'Creating...' : 'Create Profile'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="mb-8">
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
                    <span>CREATOR</span>
                    <span>/</span>
                    <span className="font-semibold text-slate-800 dark:text-white">COURSES</span>
                </div>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                            My Courses
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">
                            Create and manage your video courses
                        </p>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => router.push('/creator/courses/new')}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 transition-all text-sm"
                    >
                        <Plus className="w-4 h-4" />
                        New Course
                    </motion.button>
                </div>
            </div>

            <div className="mb-8">
                <div className="relative max-w-xl">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                    <input
                        type="text"
                        placeholder="Search your courses..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-white dark:bg-[var(--soft-surface)]"
                    />
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-4 mb-6 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                </div>
            ) : filteredCourses.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-[var(--soft-raised)] flex items-center justify-center">
                        <BookOpen className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                        No courses yet
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                        Create your first course to start earning.
                    </p>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => router.push('/creator/courses/new')}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-slate-900 dark:bg-white hover:bg-slate-800 transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        Create Course
                    </motion.button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredCourses.map((course, idx) => {
                        const firstVideo = course.videos?.[0];
                        const videoCount = course.videos?.length || 0;

                        return (
                            <motion.div
                                key={course._id}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="bg-white dark:bg-[var(--soft-surface)] rounded-2xl overflow-hidden border border-slate-200 dark:border-[var(--soft-line)] transition-all hover:border-blue-300 dark:hover:border-blue-500/40 hover:shadow-lg"
                            >
                                <div className="relative aspect-video bg-slate-900 dark:bg-[var(--soft-sunken)] group overflow-hidden">
                                    {firstVideo?.thumbnail_url ? (
                                        <img
                                            src={firstVideo.thumbnail_url}
                                            alt={course.title}
                                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                                            <Play className="w-10 h-10 text-slate-600" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
                                            <Play className="w-7 h-7 text-slate-900 ml-1" />
                                        </div>
                                    </div>
                                    {course.category && (
                                        <div className="absolute top-3 left-3 px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded">
                                            {course.category}
                                        </div>
                                    )}
                                    <div className="absolute top-3 right-3 px-2 py-1 bg-black/70 text-white text-xs font-medium rounded flex items-center gap-1">
                                        <BookOpen className="w-3 h-3" />
                                        {videoCount}
                                    </div>
                                    <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/80 text-white text-xs font-medium rounded">
                                        {formatDurationLong(course.totalDuration)}
                                    </div>
                                    {course.status === 'published' && (
                                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-green-500" />
                                    )}
                                </div>
                                <div className="p-5">
                                    <div className="flex items-start justify-between mb-2">
                                        <h3 className="font-bold text-slate-800 dark:text-white line-clamp-2">
                                            {course.title}
                                        </h3>
                                        <button
                                            onClick={(e) => e.stopPropagation()}
                                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[var(--soft-raised)] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                        >
                                            <MoreVertical className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {course.description && (
                                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
                                            {course.description}
                                        </p>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">
                                            ${course.price_per_minute?.toFixed(2)}/min
                                        </span>
                                        <span className={`text-xs px-2 py-1 rounded ${course.status === 'published' ? 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400' : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400'}`}>
                                            {course.status === 'published' ? 'Published' : 'Draft'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-3">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/creator/courses/${course._id}`);
                                            }}
                                            className="flex-1 py-2 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                                        >
                                            <Edit className="w-4 h-4 inline mr-1" />
                                            Edit
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteCourse(course._id);
                                            }}
                                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}