"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import LandingNavbar from "@/components/LandingNavbar";

export default function SignupPage() {
    const searchParams = useSearchParams();

    // Capture referral code from ?ref= and persist it
    useEffect(() => {
        const refCode = searchParams.get("ref");
        if (refCode) {
            localStorage.setItem("skillup_referral_code", refCode);
        }
        // Faculty sign-ups keep their intent through Clerk's redirect to /onboarding
        if (searchParams.get("role") === "mentor") {
            localStorage.setItem("skillup_role_intent", "mentor");
        } else {
            localStorage.removeItem("skillup_role_intent");
        }
    }, [searchParams]);
    const isFaculty = searchParams.get("role") === "mentor";

    return (
        <div className="min-h-screen bg-white dark:bg-neutral-950 transition-colors">
            <LandingNavbar />
            <div className="pt-20 flex items-center justify-center min-h-screen">
                <div className="w-full max-w-5xl overflow-hidden flex flex-col md:flex-row shadow-xl rounded-3xl mx-4">
                    {/* Left Panel - Branding */}
                    <div className="bg-neutral-900 text-white p-8 md:p-12 md:w-1/2 relative overflow-hidden flex flex-col justify-end min-h-[400px]">
                        {/* Background Image */}
                        <div className="absolute inset-0 z-0">
                            <img
                                src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop"
                                alt="Background"
                                className="w-full h-full object-cover opacity-40"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
                        </div>
                        {/* Vertical Lines Effect */}
                        <div className="absolute inset-0 flex pointer-events-none">
                            {[...Array(6)].map((_, i) => (
                                <div
                                    key={i}
                                    className="flex-1 border-r border-white/10 h-full"
                                />
                            ))}
                        </div>
                        <h1 className="text-2xl md:text-3xl font-medium leading-tight z-10 tracking-tight relative">
                            {isFaculty
                                ? "Run your classes on SkillUp: one join code, work that checks itself, insights on every student."
                                : "Your four-year plan and AI companion, from first year to placements."}
                        </h1>
                    </div>

                    {/* Right Panel - Clerk SignUp (Always Dark) */}
                    <div className="p-8 md:p-12 md:w-1/2 flex flex-col items-center justify-center bg-neutral-900">
                        <SignUp
                            forceRedirectUrl={isFaculty ? "/onboarding?role=mentor" : "/onboarding"}
                            appearance={{
                                variables: {
                                    colorBackground: "#171717",
                                    colorText: "#ffffff",
                                    colorTextSecondary: "#a3a3a3",
                                    colorInputBackground: "#262626",
                                    colorInputText: "#ffffff",
                                    colorPrimary: "#4a6cf7",
                                    colorNeutral: "#ffffff",
                                },
                                elements: {
                                    rootBox: "w-full",
                                    card: "bg-transparent shadow-none w-full",
                                    headerTitle: "text-white text-2xl font-semibold",
                                    headerSubtitle: "text-neutral-400",
                                    formButtonPrimary:
                                        "bg-[#4a6cf7] hover:bg-[#3b5ce0] text-white font-medium",
                                    formFieldLabel: "text-white",
                                    formFieldInput:
                                        "bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500",
                                    footerActionLink: "text-[#4a6cf7] hover:text-[#3b5ce0]",
                                    socialButtonsBlockButton:
                                        "bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700",
                                    socialButtonsBlockButtonText: "text-white",
                                    dividerLine: "bg-neutral-700",
                                    dividerText: "text-neutral-500",
                                    identityPreviewEditButton: "text-[#4a6cf7]",
                                    formFieldInputShowPasswordButton: "text-neutral-400",
                                    footer: "bg-neutral-900",
                                    footerAction: "text-neutral-400",
                                    footerActionText: "text-neutral-400",
                                },
                            }}
                            routing="path"
                            path="/signup"
                            signInUrl="/sign-in"
                            afterSignUpUrl="/onboarding"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
