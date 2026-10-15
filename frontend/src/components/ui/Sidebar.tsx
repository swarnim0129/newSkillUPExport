"use client";

import { cn } from "@/lib/utils";
import Link, { LinkProps } from "next/link";
import React, { useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";

interface Links {
    label: string;
    href: string;
    icon: React.JSX.Element | React.ReactNode;
}

interface SidebarContextProps {
    open: boolean;
    setOpen: React.Dispatch<React.SetStateAction<boolean>>;
    animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
    undefined
);

export const useSidebar = () => {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error("useSidebar must be used within a SidebarProvider");
    }
    return context;
};

export const SidebarProvider = ({
    children,
    open: openProp,
    setOpen: setOpenProp,
    animate = true,
}: {
    children: React.ReactNode;
    open?: boolean;
    setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
    animate?: boolean;
}) => {
    const [openState, setOpenState] = useState(false);

    const open = openProp !== undefined ? openProp : openState;
    const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

    return (
        <SidebarContext.Provider value={{ open, setOpen, animate }}>
            {children}
        </SidebarContext.Provider>
    );
};

export const Sidebar = ({
    children,
    open,
    setOpen,
    animate,
}: {
    children: React.ReactNode;
    open?: boolean;
    setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
    animate?: boolean;
}) => {
    return (
        <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
            {children}
        </SidebarProvider>
    );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
    return (
        <>
            <DesktopSidebar {...props} />
            <MobileSidebar {...(props as React.ComponentProps<"div">)} />
        </>
    );
};

export const DesktopSidebar = ({
    className,
    children,
    ...props
}: React.ComponentProps<typeof motion.div>) => {
    const { open, setOpen, animate } = useSidebar();
    return (
        <motion.div
            className={cn(
                "h-full px-4 py-4 hidden md:flex md:flex-col bg-white/55 dark:bg-[rgb(18_24_38/0.55)] backdrop-blur-xl border-r border-white/70 dark:border-white/5 shadow-[6px_0_24px_-12px_rgb(146_162_190/0.45)] dark:shadow-[6px_0_24px_-12px_rgb(0_0_0/0.6)] w-[300px] flex-shrink-0 sticky top-0",
                className
            )}
            animate={{
                width: animate ? (open ? "300px" : "60px") : "300px",
            }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            {...props}
        >
            {children}
        </motion.div>
    );
};

export const MobileSidebar = ({
    className,
    children,
    ...props
}: React.ComponentProps<"div">) => {
    const { open, setOpen } = useSidebar();
    return (
        <>
            <div
                className={cn(
                    "h-10 px-4 py-4 flex flex-row md:hidden items-center justify-between bg-white dark:bg-black w-full"
                )}
                {...props}
            >
                <div className="flex justify-start z-20 w-full">
                    <Menu
                        className="text-neutral-800 dark:text-neutral-200 cursor-pointer"
                        onClick={() => setOpen(!open)}
                    />
                </div>
                <AnimatePresence>
                    {open && (
                        <>
                            {/* Backdrop */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setOpen(false)}
                                className="fixed inset-0 bg-black/40 z-[90] md:hidden"
                            />
                            {/* Sidebar Panel */}
                            <motion.div
                                initial={{ x: "-100%", opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ x: "-100%", opacity: 0 }}
                                transition={{
                                    duration: 0.3,
                                    ease: "easeInOut",
                                }}
                                className={cn(
                                    "fixed top-0 left-0 bottom-0 h-full w-[80vw] sm:w-[320px] bg-white/80 dark:bg-[rgb(18_24_38/0.85)] backdrop-blur-xl p-6 z-[100] flex flex-col justify-between rounded-r-2xl shadow-2xl",
                                    className
                                )}
                            >
                                <div
                                    className="absolute right-4 top-4 z-50 text-neutral-800 dark:text-neutral-200 cursor-pointer p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
                                    onClick={() => setOpen(false)}
                                >
                                    <X size={20} />
                                </div>
                                {children}
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
};

export const SidebarLink = ({
    link,
    className,
    active = false,
    ...props
}: {
    link: Links;
    className?: string;
    active?: boolean;
    props?: LinkProps;
}) => {
    const { open, setOpen, animate } = useSidebar();
    return (
        <Link
            href={link.href}
            // The label is hidden while the sidebar is collapsed; keep a name for screen readers and a tooltip
            aria-label={link.label}
            title={open ? undefined : link.label}
            aria-current={active ? "page" : undefined}
            className={cn(
                "flex items-center justify-start gap-2 group/sidebar min-h-9 py-1.5 px-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                active && "bg-blue-50 dark:bg-blue-500/10 [&>svg]:!text-blue-600 dark:[&>svg]:!text-blue-400",
                className
            )}
            onClick={() => {
                // Auto-close sidebar on mobile when a link is clicked
                if (window.innerWidth < 768) {
                    setOpen(false);
                }
            }}
            {...props}
        >
            {link.icon}
            <motion.span
                animate={{
                    display: animate ? (open ? "inline-block" : "none") : "inline-block",
                    opacity: animate ? (open ? 1 : 0) : 1,
                }}
                className="text-neutral-700 dark:text-neutral-200 text-sm group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre inline-block !p-0 !m-0"
            >
                {link.label}
            </motion.span>
        </Link>
    );
};
