import Link from "next/link";
import { ArrowLeft, SearchX, GraduationCap } from "lucide-react";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-[#f8fafc] dark:bg-[var(--soft-sunken)] flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background elements to match platform theme */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 dark:bg-blue-600/5 blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 dark:bg-indigo-600/5 blur-[100px]" />
            </div>

            <div className="max-w-md w-full text-center space-y-8 relative z-10">
                {/* Logo Branding - Matches SkillUp Navbar */}
                <div className="flex items-center justify-center gap-2.5 mb-8">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c8ff00] to-[#7a9900] flex items-center justify-center shadow-lg shadow-[#c8ff00]/20">
                        <GraduationCap className="w-7 h-7 text-black" />
                    </div>
                    <span className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-neutral-900 via-neutral-700 to-neutral-800 dark:from-white dark:via-neutral-200 dark:to-neutral-500">
                        SkillUp
                    </span>
                </div>

                <div className="relative flex justify-center mt-4">
                    <div className="absolute inset-0 blur-2xl rounded-full bg-slate-200 dark:bg-neutral-800 max-w-[120px] mx-auto animate-pulse" />
                    <div className="w-24 h-24 bg-white dark:bg-[var(--soft-surface)] rounded-3xl shadow-xl flex items-center justify-center relative z-10 border border-slate-200 dark:border-neutral-800 rotate-6 hover:rotate-0 transition-transform duration-500">
                        <SearchX className="w-10 h-10 text-slate-400 dark:text-neutral-500" />
                    </div>
                </div>

                <div className="space-y-3">
                    <h1 className="text-5xl font-black text-slate-900 dark:text-white tracking-tight">404</h1>
                    <h2 className="text-xl font-semibold text-slate-700 dark:text-neutral-300">Destination Unknown</h2>
                    <p className="text-sm text-slate-500 dark:text-neutral-500 max-w-[280px] mx-auto leading-relaxed">
                        The page you're navigating to doesn't exist or has been moved to a new location.
                    </p>
                </div>

                <div className="pt-6">
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-600/20 transition-all hover:-translate-y-0.5"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Return to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}
