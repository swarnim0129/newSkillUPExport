'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LandingNavbar from '@/components/LandingNavbar';
import { useAuth, UserButton, useUser } from '@clerk/nextjs';
import { Loader2, BookOpen } from 'lucide-react';
import { Sidebar, SidebarBody, SidebarLink } from '@/components/ui/Sidebar';

export default function CreatorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { isLoaded, isSignedIn, getToken } = useAuth();
    const { user } = useUser();
    const router = useRouter();
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [checkingRole, setCheckingRole] = useState(true);

    useEffect(() => {
        if (!isLoaded || !isSignedIn) {
            setCheckingRole(false);
            return;
        }

        const checkRole = async () => {
            try {
                const token = await getToken();
                const response = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5500/api'}/onboarding/check`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                
                const data = await response.json();
                if (data.exists && (data.role === 'mentor' || data.role === 'candidate')) {
                    setIsAuthorized(true);
                } else {
                    router.push('/onboarding');
                }
            } catch (error) {
                console.error("Auth check failed", error);
            } finally {
                setCheckingRole(false);
            }
        };

        checkRole();
    }, [isLoaded, isSignedIn, getToken, router]);

    const links = [
        { label: 'Courses', href: '/creator/courses', icon: <BookOpen className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" /> },
    ];

    if (!isLoaded || checkingRole) {
        return (
            <div className="flex h-screen items-center justify-center bg-[var(--soft-canvas)]">
                <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!isAuthorized) return null;

    return (
        <div className="h-screen overflow-hidden bg-[var(--soft-canvas)] text-black dark:text-white flex flex-col">
            <LandingNavbar />
            <div className="flex flex-col md:flex-row flex-1 mt-16 h-[calc(100vh-4rem)] overflow-hidden">
                <Sidebar open={false} setOpen={() => {}}>
                    <SidebarBody className="justify-between gap-10 bg-[var(--soft-surface)] border-r border-[var(--soft-line)] shadow-sm">
                        <div className="flex flex-col items-center border-b border-neutral-200 dark:border-neutral-800 pb-4 mb-2 mt-2 px-1">
                            <SidebarLink
                                link={{
                                    label: user?.fullName || 'Creator',
                                    href: '/creator/courses',
                                    icon: (
                                        <div className="flex items-center justify-center flex-shrink-0 h-9 w-9 rounded-full bg-neutral-200 dark:bg-neutral-700">
                                            <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonAvatarBox: { width: "36px", height: "36px" } } }} />
                                        </div>
                                    ),
                                }}
                                className="[&>span]:!text-base [&>span]:!font-medium py-1"
                            />
                        </div>
                        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
                            <div className="flex flex-col gap-2">
                                {links.map((link, idx) => (
                                    <SidebarLink key={idx} link={link} />
                                ))}
                            </div>
                        </div>
                    </SidebarBody>
                </Sidebar>
                <main className="flex-1 min-h-0 overflow-y-auto p-6 bg-[var(--soft-canvas)]">
                    <div className="max-w-7xl mx-auto h-full">{children}</div>
                </main>
            </div>
        </div>
    );
}