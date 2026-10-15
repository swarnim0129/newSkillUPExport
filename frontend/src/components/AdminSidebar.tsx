'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Users,
    BarChart3,
    Crosshair,
    MessageSquare,
    X
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
    { label: 'Dashboard', href: '/admin/dashboard', icon: <LayoutDashboard size={20} /> },
    { label: 'Students', href: '/admin/users', icon: <Users size={20} /> },
    { label: 'Placement radar', href: '/admin/radar', icon: <Crosshair size={20} /> },
    { label: 'Analytics', href: '/admin/analytics', icon: <BarChart3 size={20} /> },
    { label: 'Reviews', href: '/admin/reviews', icon: <MessageSquare size={20} /> },
];

interface AdminSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
    const pathname = usePathname();

    return (
        <aside
            className={cn(
                "fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 bg-white dark:bg-black border-r border-neutral-200 dark:border-neutral-900 text-black dark:text-white transition-transform duration-300 md:translate-x-0",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}
        >
            <div className="flex flex-col h-full py-6">
                <div className="px-6 mb-8 flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                        Admin Console
                    </p>
                    {/* Close button for mobile */}
                    <button
                        onClick={onClose}
                        className="md:hidden text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className="flex-1 space-y-2 px-3">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onClose} // Close sidebar on mobile when link clicked
                                data-active={isActive}
                                className={`group flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-300 border-l-2 ${isActive
                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-[#4a6cf7] text-[#4a6cf7] dark:text-blue-400'
                                    : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-900'
                                    }`}
                            >
                                <span className={`icon transition-colors duration-300 ${isActive ? 'text-[#4a6cf7] dark:text-blue-400' : ''}`}>
                                    {item.icon}
                                </span>
                                <span className={`label transition-colors duration-300 ${isActive ? 'text-[#4a6cf7] dark:text-blue-400' : ''}`}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="px-6 mt-auto">
                    <div className="rounded-xl p-4 border border-neutral-200 dark:border-neutral-800 bg-transparent">
                        <h4 className="font-semibold text-sm mb-1 text-black dark:text-white">System Status</h4>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                            <p className="text-xs text-neutral-500">All systems operational</p>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
}
