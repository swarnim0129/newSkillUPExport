'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { MobileNav } from '@/components/ui/mobile-nav';
import { buttonVariants } from '@/components/ui/shadcn-button';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import { useTheme } from 'next-themes';
import { usePathname } from 'next/navigation';
import { Home, GraduationCap } from 'lucide-react';
import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
} from '@/components/ui/navigation-menu';

const navigationLinks = [
    {
        name: 'Menu',
        items: [
            { href: '/', label: 'Home' },
            { href: '#features', label: 'Features' },
            { href: '#reviews', label: 'Reviews' },
            { href: '#contact', label: 'Contact Us' },
        ],
    },
];

export default function LandingNavbar() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isBottom, setIsBottom] = useState(false);
    const { theme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const pathname = usePathname();
    const isDashboardPage = pathname?.startsWith('/candidate') || pathname?.startsWith('/mentor');

    useEffect(() => {
        setMounted(true);
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 100);
            // Check if user is near the bottom (within 100px)
            const isAtBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 100;
            setIsBottom(isAtBottom);
        };
        window.addEventListener('scroll', handleScroll);
        // Initial check
        handleScroll();
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const isLightModeAtBottom = mounted && theme === 'light' && isBottom;

    const isAdminPage = pathname?.startsWith('/admin');

    return (
        <motion.header
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.5 }}
            className={cn(
                'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
                isDashboardPage
                    ? 'bg-white/55 dark:bg-[rgb(18_24_38/0.55)] backdrop-blur-xl border-b border-white/70 dark:border-white/5 shadow-[0_6px_24px_-14px_rgb(146_162_190/0.5)] dark:shadow-[0_6px_24px_-14px_rgb(0_0_0/0.6)]'
                    : isScrolled
                        ? 'bg-background/70 backdrop-blur-xl border-b border-border/50 shadow-sm '
                        : 'bg-transparent',
            )}
        >
            <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Left - Desktop Navigation */}
                    <div className="hidden md:flex items-center gap-1 flex-1">
                        <NavigationMenu>
                            <NavigationMenuList>
                                {navigationLinks[0].items.map((link, index) => (
                                    <NavigationMenuItem key={index}>
                                        <NavigationMenuLink
                                            asChild
                                            className={cn(
                                                "rounded-md px-3 py-1.5 font-medium transition-colors",
                                                isLightModeAtBottom
                                                    ? "text-black hover:bg-black/10"
                                                    : "text-foreground/80 hover:text-foreground hover:bg-muted/50"
                                            )}
                                        >
                                            <Link href={link.href}>{link.label}</Link>
                                        </NavigationMenuLink>
                                    </NavigationMenuItem>
                                ))}
                            </NavigationMenuList>
                        </NavigationMenu>
                    </div>

                    {/* Mobile: Show only Home on candidate pages, full nav otherwise. HIDE on Admin pages. */}
                    {!isAdminPage && (
                        <div className="md:hidden z-20">
                            {isDashboardPage ? (
                                <Link
                                    href="/"
                                    className={cn(
                                        "flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors",
                                        isLightModeAtBottom
                                            ? "text-black hover:bg-black/10"
                                            : "text-foreground/80 hover:text-foreground hover:bg-muted/50"
                                    )}
                                >
                                    <Home className="w-4 h-4" />
                                    Home
                                </Link>
                            ) : (
                                <MobileNav nav={navigationLinks} />
                            )}
                        </div>
                    )}

                    {/* Center - Logo */}
                    <Link href="/" className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#c8ff00] to-[#7a9900] flex items-center justify-center">
                            <GraduationCap className="w-5 h-5 text-black" />
                        </div>
                        <span className={cn(
                            "text-xl font-bold tracking-tight bg-clip-text",
                            isLightModeAtBottom
                                ? "text-black"
                                : "text-transparent bg-gradient-to-b from-neutral-900 via-neutral-700 to-neutral-800 dark:from-white dark:via-neutral-200 dark:to-neutral-500"
                        )}>
                            SkillUp
                        </span>
                    </Link>

                    {/* Right side */}
                    <div className="flex items-center gap-2 flex-1 justify-end">
                        {/* Theme Toggle */}
                        <AnimatedThemeToggler
                            className={cn(
                                "p-2 rounded-lg transition-colors",
                                isLightModeAtBottom
                                    ? "text-black hover:bg-black/10"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                        />

                        {/* Auth Buttons */}
                        <div className="flex items-center gap-3">
                            <SignedOut>
                                <Link
                                    href="/signup"
                                    className={cn(
                                        buttonVariants({ variant: 'ghost', size: 'sm' }),
                                        isLightModeAtBottom
                                            ? "text-black hover:bg-black/10"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Sign In
                                </Link>
                            </SignedOut>
                            <SignedIn>
                                <UserButton
                                    afterSignOutUrl="/"
                                    appearance={{
                                        elements: {
                                            avatarBox: "w-9 h-9",
                                        },
                                    }}
                                />
                            </SignedIn>
                        </div>
                    </div>
                </div>
            </nav>
        </motion.header>
    );
}

