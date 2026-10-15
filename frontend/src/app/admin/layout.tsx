'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import LandingNavbar from '@/components/LandingNavbar';
import AdminSidebar from '@/components/AdminSidebar';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [checking, setChecking] = useState(true);

    const isLoginPage = pathname === '/admin/login';

    useEffect(() => {
        if (isLoginPage) {
            setChecking(false);
            return;
        }

        const checkAdminAuth = async () => {
            const token = localStorage.getItem('adminToken');

            if (!token) {
                router.push('/admin/login');
                setChecking(false);
                return;
            }

            try {
                // Verify token with backend
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5500/api'}/admin/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    setIsAuthorized(true);
                } else {
                    localStorage.removeItem('adminToken');
                    router.push('/admin/login');
                }
            } catch (error) {
                console.error("Admin Auth check failed", error);
                router.push('/admin/login');
            } finally {
                setChecking(false);
            }
        };

        checkAdminAuth();
    }, [router, isLoginPage]);

    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Close sidebar when pathname changes
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    // Render logic
    if (isLoginPage) {
        return <>{children}</>;
    }

    if (checking) {
        return (
            <div className="flex h-screen items-center justify-center bg-[var(--soft-canvas)]">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            </div>
        );
    }

    if (!isAuthorized) {
        return null;
    }

    return (
        <div className="min-h-screen bg-[var(--soft-canvas)] transition-colors duration-300">
            <LandingNavbar />

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Mobile Hamburger Button (Fixed to top-left in navbar area) */}
            <div className="md:hidden fixed top-3 left-4 z-[60]">
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 6h16M4 12h16M4 18h16"
                        />
                    </svg>
                </button>
            </div>

            <main className="md:pl-64 pt-16 min-h-screen">
                <div className="p-4 md:p-6 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
