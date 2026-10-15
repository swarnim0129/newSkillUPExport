"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Play, TrendingUp, Compass, Search, FileText, Send, MessageSquare, Route, CheckCircle2, Newspaper, ArrowRight, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import api from "@/lib/api";

const mockVideoData = {
    recommended: [
        { id: "bMknfKXIFA8", title: "React Course - Beginner's Tutorial", channel: "freeCodeCamp", views: "4.2M", duration: "7:05:00", thumb: "https://i.ytimg.com/vi/bMknfKXIFA8/hqdefault.jpg" },
        { id: "SqcY0GlETPk", title: "React Tutorial for Beginners", channel: "Programming with Mosh", views: "6.8M", duration: "2:25:26", thumb: "https://i.ytimg.com/vi/SqcY0GlETPk/hqdefault.jpg" },
        { id: "Tn6-PIqc4UM", title: "React in 100 Seconds", channel: "Fireship", views: "1.5M", duration: "2:10", thumb: "https://i.ytimg.com/vi/Tn6-PIqc4UM/hqdefault.jpg" },
        { id: "w7ejDZ8SWv8", title: "React JS Crash Course", channel: "Traversy Media", views: "3.1M", duration: "1:48:47", thumb: "https://i.ytimg.com/vi/w7ejDZ8SWv8/hqdefault.jpg" },
    ],
    trending: [
        { id: "xk4_1vDrzzo", title: "100+ Web Development Things you Should Know", channel: "Fireship", views: "2.1M", duration: "13:42", thumb: "https://i.ytimg.com/vi/xk4_1vDrzzo/hqdefault.jpg" },
        { id: "mU6anWqZJcc", title: "Learn Data Structures and Algorithms", channel: "freeCodeCamp", views: "6.9M", duration: "5:22:42", thumb: "https://i.ytimg.com/vi/mU6anWqZJcc/hqdefault.jpg" },
        { id: "pTFZFxd4hOI", title: "Software Engineering Resume Tips", channel: "NeetCode", views: "850K", duration: "11:24", thumb: "https://i.ytimg.com/vi/pTFZFxd4hOI/hqdefault.jpg" },
        { id: "VwVg9jCtqaU", title: "How to learn Full Stack Web Development", channel: "Stefan Mischook", views: "320K", duration: "9:15", thumb: "https://i.ytimg.com/vi/VwVg9jCtqaU/hqdefault.jpg" },
    ],
    forYou: [
        { id: "zJSY8tbf_ys", title: "Frontend Web Development Bootcamp", channel: "freeCodeCamp", views: "3.5M", duration: "21:12:00", thumb: "https://i.ytimg.com/vi/zJSY8tbf_ys/hqdefault.jpg" },
        { id: "vQqwMAhXjEw", title: "Docker in 100 Seconds", channel: "Fireship", views: "1.8M", duration: "2:30", thumb: "https://i.ytimg.com/vi/vQqwMAhXjEw/hqdefault.jpg" },
        { id: "30YW3ztAMZA", title: "Next.js for Beginners", channel: "Academind", views: "550K", duration: "4:32:10", thumb: "https://i.ytimg.com/vi/30YW3ztAMZA/hqdefault.jpg" },
        { id: "pkYVOmU3MgA", title: "Git Tutorial for Beginners", channel: "Programming with Mosh", views: "2.9M", duration: "1:08:44", thumb: "https://i.ytimg.com/vi/pkYVOmU3MgA/hqdefault.jpg" },
    ],
    explore: [
        { id: "I5zJ91B70V0", title: "How I Learned to Code in 4 Months", channel: "Tim Kim", views: "4.1M", duration: "12:35", thumb: "https://i.ytimg.com/vi/I5zJ91B70V0/hqdefault.jpg" },
        { id: "k7O6LC1_I5E", title: "A Day in the Life of a Software Engineer", channel: "Joma Tech", views: "9.2M", duration: "8:41", thumb: "https://i.ytimg.com/vi/k7O6LC1_I5E/hqdefault.jpg" },
        { id: "RBSGKlAvoiM", title: "Machine Learning Full Course", channel: "Edureka", views: "5.5M", duration: "9:51:24", thumb: "https://i.ytimg.com/vi/RBSGKlAvoiM/hqdefault.jpg" },
        { id: "rfscVS0vtbw", title: "Python Tutorial - For Beginners", channel: "Programming with Mosh", views: "34M", duration: "6:14:07", thumb: "https://i.ytimg.com/vi/rfscVS0vtbw/hqdefault.jpg" },
    ]
};

const articles = [
    { title: 'How to Build a Portfolio That Gets You Hired', source: 'freeCodeCamp', url: 'https://www.freecodecamp.org/news/how-to-build-a-developer-portfolio/', readTime: '8 min', category: 'Career' },
    { title: '10 JavaScript Concepts Every Node Developer Must Master', source: 'Medium', url: 'https://medium.com/javascript-in-plain-english/10-javascript-concepts-every-nodejs-developer-must-master', readTime: '12 min', category: 'JavaScript' },
    { title: 'The Complete Guide to CSS Grid', source: 'CSS-Tricks', url: 'https://css-tricks.com/snippets/css/complete-guide-grid/', readTime: '15 min', category: 'CSS' },
    { title: 'Understanding React Server Components', source: 'Vercel Blog', url: 'https://vercel.com/blog/understanding-react-server-components', readTime: '10 min', category: 'React' },
    { title: 'System Design Interview: A Step-By-Step Guide', source: 'ByteByteGo', url: 'https://bytebytego.com/courses/system-design-interview', readTime: '20 min', category: 'System Design' },
    { title: 'How to Write a Standout Tech Resume in 2025', source: 'Dev.to', url: 'https://dev.to/resume-tips-2025', readTime: '6 min', category: 'Career' },
    { title: 'Docker for Beginners: Everything You Need to Know', source: 'DigitalOcean', url: 'https://www.digitalocean.com/community/tutorials/docker-explained', readTime: '14 min', category: 'DevOps' },
    { title: 'Mastering TypeScript: Advanced Patterns', source: 'Total TypeScript', url: 'https://www.totaltypescript.com/tutorials', readTime: '18 min', category: 'TypeScript' },
];

const quotes = [
    { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
    { text: "There are no secrets to success. It is the result of preparation, hard work, and learning from failure.", author: "Colin Powell" },
];

export default function DashboardPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [quoteIndex, setQuoteIndex] = useState(0);

    useEffect(() => {
        setQuoteIndex(Math.floor(Math.random() * quotes.length));
    }, []);

    useEffect(() => {
        const fetchDashboardData = async () => {
            if (!isLoaded || !isSignedIn) return;
            try {
                const token = await getToken();
                const res = await api.get('/candidate/stats', { headers: { Authorization: `Bearer ${token}` } });
                if (res.data.success) {
                    setStats({
                        ...res.data.stats,
                        roadmapsGenerated: 3, // Mocked for demonstration
                        currentRoadmapProgress: 64, // Mocked for demonstration
                    });
                }
            } catch (error) {
                console.error("Error fetching stats:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, [isLoaded, isSignedIn, getToken]);

    // Derived states
    const resumeScore = stats?.resumeScore || 0;
    const roadmapsGenerated = stats?.roadmapsGenerated || 0;
    const interviewCount = stats?.interviewCount || 0;
    const hasAnalyzedResume = resumeScore > 0;

    const VideoRibbon = ({ title, videos, icon }: { title: string, videos: any[], icon: React.ReactNode }) => (
        <div className="mb-10 last:mb-0">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                    {icon} {title}
                </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {videos.map((vid) => (
                    <a href={`https://www.youtube.com/watch?v=${vid.id}`} target="_blank" rel="noopener noreferrer" key={vid.id} className="group relative bg-white dark:bg-[#111] rounded-xl overflow-hidden shadow-sm dark:shadow-black/20 border border-slate-100 dark:border-[#222] transition-colors hover:border-blue-400 dark:hover:border-blue-500">
                        <div className="aspect-video relative overflow-hidden bg-slate-100 dark:bg-[var(--soft-raised)]">
                            <img src={vid.thumb} alt={vid.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                            <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[10px] font-bold text-white tracking-wide">
                                {vid.duration}
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="w-12 h-12 bg-white/90 dark:bg-black/80 rounded-full flex items-center justify-center backdrop-blur-sm">
                                    <Play className="w-6 h-6 text-blue-600 dark:text-blue-400 ml-1" />
                                </div>
                            </div>
                        </div>
                        <div className="p-3">
                            <h4 className="font-semibold text-sm line-clamp-2 text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-tight mb-1">
                                {vid.title}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{vid.channel}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{vid.views} views</p>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50/50 dark:bg-[var(--soft-sunken)] p-4 sm:p-6 lg:p-8 space-y-8 font-sans text-slate-900 dark:text-white w-full">
            
            {/* Header & Motivation Banner */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 md:p-8 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-900/40 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none" />
                
                <div className="relative z-10">
                    <p className="text-xs md:text-sm font-bold text-blue-100 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" /> Daily Motivation
                    </p>
                    <p className="text-2xl md:text-3xl lg:text-4xl font-serif italic mb-4 max-w-3xl leading-tight">
                        &ldquo;{quotes[quoteIndex].text}&rdquo;
                    </p>
                    <p className="text-sm md:text-base font-medium text-indigo-100">
                        — {quotes[quoteIndex].author}
                    </p>
                </div>
            </div>

            {/* Active Roadmap Progress */}
            <Card className="border-none shadow-sm dark:shadow-black/20 bg-white dark:bg-[var(--soft-surface)] rounded-2xl overflow-hidden">
                <CardContent className="p-6 md:p-8">
                    <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Route className="w-5 h-5 text-blue-500" />
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Active Roadmap Progress</h2>
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Full-Stack Web Development Mastery</p>
                        </div>
                        <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">
                            {stats?.currentRoadmapProgress || 0}%
                        </div>
                    </div>
                    
                    <div className="w-full h-3 sm:h-4 bg-slate-100 dark:bg-[var(--soft-raised)] rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-1000 ease-out relative"
                            style={{ width: `${stats?.currentRoadmapProgress || 0}%` }}
                        >
                            <div className="absolute inset-0 bg-white/20 w-1/2 -skew-x-12 translate-x-[-150%] animate-[shimmer_2s_infinite]" />
                        </div>
                    </div>
                    
                    <div className="mt-4 flex justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        <span>Started</span>
                        <span>Frontend Module (In Progress)</span>
                        <span>Completion</span>
                    </div>
                </CardContent>
            </Card>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-none shadow-sm dark:shadow-black/20 bg-white dark:bg-[var(--soft-surface)] rounded-2xl p-6 flex flex-col justify-between group hover:ring-2 ring-slate-200 dark:ring-[var(--soft-line)] transition-all">
                    <div>
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[var(--soft-raised)] flex items-center justify-center mb-4">
                            <FileText className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Resume Score</h3>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{resumeScore}</span>
                            <span className="text-lg text-slate-500">/100</span>
                        </div>
                    </div>
                    <Link href="/candidate/resume-analyzer" className="mt-6 flex items-center justify-between text-sm font-semibold text-blue-600 dark:text-blue-400">
                        <span>Analyze Resume</span> <TrendingUp className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                    </Link>
                </Card>

                <Card className="border-none shadow-sm dark:shadow-black/20 bg-white dark:bg-[var(--soft-surface)] rounded-2xl p-6 flex flex-col justify-between group hover:ring-2 ring-slate-200 dark:ring-[var(--soft-line)] transition-all">
                    <div>
                        <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center mb-4">
                            <Route className="w-5 h-5 text-orange-500" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Roadmaps Generated</h3>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{roadmapsGenerated}</span>
                        </div>
                    </div>
                    <Link href="/candidate/learning-roadmap" className="mt-6 flex items-center justify-between text-sm font-semibold text-orange-600 dark:text-orange-400">
                        <span>View Roadmaps</span> <TrendingUp className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                    </Link>
                </Card>

                <Card className="border-none shadow-sm dark:shadow-black/20 bg-white dark:bg-[var(--soft-surface)] rounded-2xl p-6 flex flex-col justify-between group hover:ring-2 ring-slate-200 dark:ring-[var(--soft-line)] transition-all">
                    <div>
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-4">
                            <MessageSquare className="w-5 h-5 text-emerald-500" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Interviews Taken</h3>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{interviewCount}</span>
                        </div>
                    </div>
                    <Link href="/candidate/ai-interview" className="mt-6 flex items-center justify-between text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        <span>Practice Interview</span> <TrendingUp className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                    </Link>
                </Card>
            </div>

            {/* Articles Section */}
            <div className="mt-12">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                        <Newspaper className="w-5 h-5 text-indigo-500" /> Recommended Articles
                    </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {articles.map((article, i) => (
                        <a
                            key={i}
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group bg-white dark:bg-[#111] rounded-xl p-5 border border-slate-100 dark:border-[#222] hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-lg transition-all flex flex-col justify-between"
                        >
                            <div>
                                <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 rounded text-[10px] font-bold uppercase tracking-wider">
                                    {article.category}
                                </span>
                                <h4 className="mt-3 text-sm font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                    {article.title}
                                </h4>
                            </div>
                            <div className="mt-4 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <BookOpen className="w-3 h-3" />
                                    <span>{article.readTime}</span>
                                    <span>·</span>
                                    <span>{article.source}</span>
                                </div>
                                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                            </div>
                        </a>
                    ))}
                </div>
            </div>

            {/* Video Ribbons */}
            <div className="mt-12 space-y-12">
                {hasAnalyzedResume && (
                    <VideoRibbon title="Recommended based on Resume" icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} videos={mockVideoData.recommended} />
                )}
                
                <VideoRibbon title="Trending in Tech" icon={<TrendingUp className="w-5 h-5 text-orange-500" />} videos={mockVideoData.trending} />
                <VideoRibbon title="For You" icon={<Compass className="w-5 h-5 text-blue-500" />} videos={mockVideoData.forYou} />
                <VideoRibbon title="Explore More" icon={<Search className="w-5 h-5 text-purple-500" />} videos={mockVideoData.explore} />
            </div>

            {/* Empty spaced footer */}
            <div className="h-10"></div>
        </div>
    );
}
