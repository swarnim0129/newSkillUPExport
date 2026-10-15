'use client';

import React from 'react';
import { Bell, Search } from 'lucide-react';
import { useUser } from '@clerk/nextjs';

interface HeaderProps {
    title: string;
    onSearch?: (query: string) => void;
    searchValue?: string;
}

export default function Header({ title, onSearch, searchValue }: HeaderProps) {
    const { user } = useUser();

    return (
        <header className="flex h-16 items-center justify-between mb-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
                <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">
                    Manage the platform
                </p>
            </div>

            <div className="flex items-center gap-4">
                {/* Search */}
                {onSearch && (
                    <div className="relative hidden md:block">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-neutral-500" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchValue || ''}
                            onChange={(e) => onSearch(e.target.value)}
                            className="h-10 w-64 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 pl-10 pr-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                        />
                    </div>
                )}

                {/* Notifications */}
                <button className="relative rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2.5 text-slate-500 dark:text-neutral-400 transition-colors hover:bg-slate-50 dark:hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-white">
                    <Bell size={18} />
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-orange-500"></span>
                </button>
            </div>
        </header>
    );
}
