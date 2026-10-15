"use client";

import { useState, useEffect } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

import { GraduationCap, Presentation, ArrowRight, Loader2, X, Plus, XCircle, Upload, Link2, FileUp, CheckCircle2 } from "lucide-react";
import { Alert, AlertTitle, AlertDescription, AlertIcon } from "@/components/ui/alert";

type UserType = "candidate" | "mentor" | null;

interface CandidateFormData {
    firstName: string;
    lastName: string;
    phone: string;
    location: string;
    skills: string[];
    experience: string;

    resumeUrl: string;
    linkedIn: string;
    portfolio: string;
    desiredRole: string;
    expectedSalary: string;
    jobType: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5500";

export default function OnboardingPage() {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [userType, setUserType] = useState<UserType>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const [skillInput, setSkillInput] = useState("");
    const [mentorData, setMentorData] = useState({ name: "", department: "" });
    const [resumeUploadMode, setResumeUploadMode] = useState<'link' | 'file'>('link');
    const [isUploadingResume, setIsUploadingResume] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [candidateData, setCandidateData] = useState<CandidateFormData>({
        firstName: "",
        lastName: "",
        phone: "",
        location: "",
        skills: [],
        experience: "fresher",

        resumeUrl: "",
        linkedIn: "",
        portfolio: "",
        desiredRole: "",
        expectedSalary: "",
        jobType: "full-time",
    });

    // Check if user already exists on mount
    useEffect(() => {
        const checkExistingUser = async () => {
            if (!isLoaded || !user) return;

            try {
                const token = await getToken();
                const response = await fetch(`${API_BASE_URL}/onboarding/check`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const data = await response.json();

                const facultyIntent = new URLSearchParams(window.location.search).get("role") === "mentor"
                    || localStorage.getItem("skillup_role_intent") === "mentor";
                if (data.exists && data.redirectUrl) {
                    // A student account that came here to register as faculty gets the switch option there
                    router.push(facultyIntent && data.role === "candidate" ? "/mentor" : data.redirectUrl);
                    return;
                }

                // Pre-fill name from Clerk
                const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
                if (fullName) setMentorData(prev => ({ ...prev, name: fullName }));
                // "For faculty" links open the faculty form directly
                if (facultyIntent) {
                    setUserType("mentor");
                    setStep(2);
                }
                if (user.firstName) {
                    setCandidateData(prev => ({ ...prev, firstName: user.firstName || "" }));
                }
                if (user.lastName) {
                    setCandidateData(prev => ({ ...prev, lastName: user.lastName || "" }));
                }
            } catch (error) {
                console.error("Error checking user:", error);
            } finally {
                setIsChecking(false);
            }
        };

        checkExistingUser();
    }, [isLoaded, user, getToken, router]);

    const handleTypeSelect = (type: UserType) => {
        setUserType(type);
        setStep(2);
    };

    const handleCandidateChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
        const { name, value } = e.target;
        setCandidateData((prev) => ({ ...prev, [name]: value }));
    };

    const addSkill = () => {
        if (skillInput.trim() && !candidateData.skills.includes(skillInput.trim())) {
            setCandidateData(prev => ({
                ...prev,
                skills: [...prev.skills, skillInput.trim()]
            }));
            setSkillInput("");
        }
    };

    const removeSkill = (skillToRemove: string) => {
        setCandidateData(prev => ({
            ...prev,
            skills: prev.skills.filter(skill => skill !== skillToRemove)
        }));
    };

    const handleCandidateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const token = await getToken();

            // Read referral code from localStorage (captured on signup page)
            const storedRefCode = typeof window !== "undefined"
                ? localStorage.getItem("skillup_referral_code")
                : null;

            const response = await fetch(`${API_BASE_URL}/onboarding/candidate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    ...candidateData,
                    email: user?.primaryEmailAddress?.emailAddress,
                    jobPreferences: {
                        desiredRole: candidateData.desiredRole,
                        expectedSalary: candidateData.expectedSalary,
                        jobType: candidateData.jobType,
                    },
                    // Include referral code if present
                    ...(storedRefCode && { referralCode: storedRefCode }),
                }),
            });

            const data = await response.json();

            if (response.ok) {
                // Clear referral code after successful onboarding
                if (typeof window !== "undefined") {
                    localStorage.removeItem("skillup_referral_code");
                }
                router.push(data.redirectUrl || "/candidate/learning-roadmap");
            } else {
                console.error("Error:", data.message);
                alert(data.message || "Failed to create profile");
            }
        } catch (error) {
            console.error("Submit error:", error);
            alert("Failed to create profile. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };



    const handleMentorSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            const token = await getToken();
            const response = await fetch(`${API_BASE_URL}/mentor/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(mentorData),
            });
            const data = await response.json();
            if (response.ok) {
                localStorage.removeItem("skillup_role_intent");
                router.push(data.redirectUrl || "/mentor");
            } else {
                setError(data.message || "Failed to register as faculty");
            }
        } catch (err) {
            console.error("Mentor register error:", err);
            setError("Failed to register. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isLoaded || isChecking) {
        return (
            <div className="min-h-screen bg-[var(--soft-canvas)] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    const inputStyles = "w-full px-4 py-3 bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 rounded-lg text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent";
    const labelStyles = "block text-sm font-medium text-neutral-900 dark:text-white mb-2";

    return (
        <div className="min-h-screen bg-[var(--soft-canvas)]">
            <div className="pt-12 pb-12 px-4">
                <div className="max-w-2xl mx-auto">
                    {/* Header */}
                    <div className="text-center mb-10">
                        <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white mb-3">
                            {step === 1
                                ? "Welcome to SkillUp!"
                                : userType === "mentor"
                                    ? "Set up your faculty account"
                                    : "Complete your profile"}
                        </h1>
                        <p className="text-neutral-500 dark:text-neutral-400">
                            {step === 1
                                ? "Let's get you set up. Who are you joining as?"
                                : userType === "mentor"
                                    ? "You will create classes, share a join code with students, and set work that is checked from their practice."
                                    : "Your companion uses this to plan your years until placements."}
                        </p>
                    </div>

                    {/* Step 1: User Type Selection */}
                    {step === 1 && (
                        <div className="grid md:grid-cols-2 gap-6 max-w-lg mx-auto">
                            {/* Job Seeker Card */}
                            <button
                                onClick={() => handleTypeSelect("candidate")}
                                className="group p-6 rounded-2xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 hover:border-orange-500/50 transition-all duration-300 text-left"
                            >
                                <div className="w-14 h-14 rounded-xl bg-orange-100 dark:bg-orange-500/10 flex items-center justify-center mb-6 group-hover:bg-orange-200 dark:group-hover:bg-orange-500/20 transition-colors">
                                    <GraduationCap className="w-7 h-7 text-orange-500" aria-hidden="true" />
                                </div>
                                <h3 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
                                    I&apos;m a student
                                </h3>
                                <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                                    Get a year-by-year plan and an AI companion from first year to placements.
                                </p>
                            </button>

                            {/* Faculty mentor card */}
                            <button
                                onClick={() => handleTypeSelect("mentor")}
                                className="group p-6 rounded-2xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 hover:border-orange-500/50 transition-all duration-300 text-left"
                            >
                                <div className="w-14 h-14 rounded-xl bg-orange-100 dark:bg-orange-500/10 flex items-center justify-center mb-6 group-hover:bg-orange-200 dark:group-hover:bg-orange-500/20 transition-colors">
                                    <Presentation className="w-7 h-7 text-orange-500" aria-hidden="true" />
                                </div>
                                <h3 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
                                    I&apos;m faculty
                                </h3>
                                <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                                    Run classes, set work, and see where your students need help.
                                </p>
                            </button>
                        </div>
                    )}


                    {/* Step 2: Candidate Form */}
                    {step === 2 && userType === "candidate" && (
                        <form
                            onSubmit={handleCandidateSubmit}
                            className="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 space-y-6"
                        >
                            {/* Name Fields */}
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="firstName" className={labelStyles}>
                                        First Name *
                                    </label>
                                    <input
                                        type="text"
                                        id="firstName"
                                        name="firstName"
                                        required
                                        value={candidateData.firstName}
                                        onChange={handleCandidateChange}
                                        className={inputStyles}
                                        placeholder="John"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="lastName" className={labelStyles}>
                                        Last Name *
                                    </label>
                                    <input
                                        type="text"
                                        id="lastName"
                                        name="lastName"
                                        required
                                        value={candidateData.lastName}
                                        onChange={handleCandidateChange}
                                        className={inputStyles}
                                        placeholder="Doe"
                                    />
                                </div>
                            </div>

                            {/* Contact Fields */}
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="phone" className={labelStyles}>
                                        Phone Number *
                                    </label>
                                    <input
                                        type="tel"
                                        id="phone"
                                        name="phone"
                                        required
                                        value={candidateData.phone}
                                        onChange={handleCandidateChange}
                                        className={inputStyles}
                                        placeholder="+91 98765 43210"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="location" className={labelStyles}>
                                        Location *
                                    </label>
                                    <input
                                        type="text"
                                        id="location"
                                        name="location"
                                        required
                                        value={candidateData.location}
                                        onChange={handleCandidateChange}
                                        className={inputStyles}
                                        placeholder="Mumbai, India"
                                    />
                                </div>
                            </div>

                            {/* Experience */}
                            <div>
                                <label htmlFor="experience" className={labelStyles}>
                                    Experience Level *
                                </label>
                                <select
                                    id="experience"
                                    name="experience"
                                    required
                                    value={candidateData.experience}
                                    onChange={handleCandidateChange}
                                    className={inputStyles}
                                >
                                    <option value="fresher">Fresher</option>
                                    <option value="0-1">0-1 years</option>
                                    <option value="1-3">1-3 years</option>
                                    <option value="3-5">3-5 years</option>
                                    <option value="5-10">5-10 years</option>
                                    <option value="10+">10+ years</option>
                                </select>
                            </div>                            {/* Skills */}
                            <div>
                                <label className={labelStyles}>Skills *</label>
                                <div className="flex gap-2 mb-2">
                                    <input
                                        type="text"
                                        value={skillInput}
                                        onChange={(e) => setSkillInput(e.target.value)}
                                        onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
                                        className={inputStyles}
                                        placeholder="Type a skill and press Enter"
                                    />
                                    <button
                                        type="button"
                                        onClick={addSkill}
                                        className="px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors flex items-center gap-1.5 font-medium text-sm whitespace-nowrap"
                                    >
                                        Add <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-xs text-neutral-400 dark:text-neutral-500 mb-2">Press Enter or click Add + to add a skill</p>
                                <div className="flex flex-wrap gap-2">
                                    {candidateData.skills.map((skill) => (
                                        <span
                                            key={skill}
                                            className="px-3 py-1 bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-full text-sm flex items-center gap-2"
                                        >
                                            {skill}
                                            <button
                                                type="button"
                                                onClick={() => removeSkill(skill)}
                                                className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Resume Upload */}
                            <div>
                                <label className={labelStyles}>Resume</label>
                                {/* Tab Switcher */}
                                <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-lg mb-3 w-fit">
                                    <button
                                        type="button"
                                        onClick={() => setResumeUploadMode('link')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${resumeUploadMode === 'link'
                                            ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                                            : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                                            }`}
                                    >
                                        <Link2 className="w-3.5 h-3.5" />
                                        Paste Link
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setResumeUploadMode('file')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${resumeUploadMode === 'file'
                                            ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                                            : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                                            }`}
                                    >
                                        <FileUp className="w-3.5 h-3.5" />
                                        Upload File
                                    </button>
                                </div>

                                {resumeUploadMode === 'link' ? (
                                    <div>
                                        <input
                                            type="url"
                                            id="resumeUrl"
                                            name="resumeUrl"
                                            value={candidateData.resumeUrl}
                                            onChange={handleCandidateChange}
                                            className={inputStyles}
                                            placeholder="https://drive.google.com/your-resume"
                                        />
                                        <p className="text-neutral-400 dark:text-neutral-500 text-xs mt-1">
                                            Link to your resume on Google Drive, Dropbox, etc.
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        {candidateData.resumeUrl && resumeUploadMode === 'file' ? (
                                            <div className="flex flex-col items-center gap-3 p-6 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg">
                                                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center animate-[scale-in_0.3s_ease-out]">
                                                    <CheckCircle2 className="w-7 h-7 text-green-500" />
                                                </div>
                                                <p className="text-sm font-medium text-green-700 dark:text-green-400">Resume uploaded successfully!</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setCandidateData(prev => ({ ...prev, resumeUrl: '' }))}
                                                    className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 underline"
                                                >
                                                    Remove & re-upload
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <input
                                                    type="file"
                                                    id="resume-file-upload"
                                                    className="hidden"
                                                    accept=".pdf"
                                                    disabled={isUploadingResume}
                                                    onChange={async (e) => {
                                                        const selectedFile = e.target.files?.[0];
                                                        if (!selectedFile) return;
                                                        setIsUploadingResume(true);
                                                        try {
                                                            const token = await getToken();
                                                            const formData = new FormData();
                                                            formData.append('resume', selectedFile);
                                                            const response = await fetch(`${API_BASE_URL}/onboarding/upload/resume`, {
                                                                method: 'POST',
                                                                headers: { Authorization: `Bearer ${token}` },
                                                                body: formData,
                                                            });
                                                            const data = await response.json();
                                                            if (data.success && data.url) {
                                                                setCandidateData(prev => ({ ...prev, resumeUrl: data.url }));
                                                            } else {
                                                                alert(data.message || 'Upload failed');
                                                            }
                                                        } catch (err) {
                                                            console.error('Resume upload error:', err);
                                                            alert('Failed to upload resume. Please try again.');
                                                        } finally {
                                                            setIsUploadingResume(false);
                                                        }
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    disabled={isUploadingResume}
                                                    onClick={() => document.getElementById('resume-file-upload')?.click()}
                                                    className="w-full flex flex-col items-center gap-2 p-6 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg hover:border-orange-500 dark:hover:border-orange-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isUploadingResume ? (
                                                        <>
                                                            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                                                            <span className="text-sm text-neutral-500 dark:text-neutral-400">Uploading...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Upload className="w-6 h-6 text-neutral-400 dark:text-neutral-500" />
                                                            <span className="text-sm text-neutral-600 dark:text-neutral-400">Click to upload your resume</span>
                                                            <span className="text-xs text-neutral-400 dark:text-neutral-500">PDF format — Max 5MB</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Social Links */}
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="linkedIn" className={labelStyles}>
                                        LinkedIn Profile
                                    </label>
                                    <input
                                        type="url"
                                        id="linkedIn"
                                        name="linkedIn"
                                        value={candidateData.linkedIn}
                                        onChange={handleCandidateChange}
                                        className={inputStyles}
                                        placeholder="https://linkedin.com/in/yourprofile"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="portfolio" className={labelStyles}>
                                        Portfolio/GitHub
                                    </label>
                                    <input
                                        type="url"
                                        id="portfolio"
                                        name="portfolio"
                                        value={candidateData.portfolio}
                                        onChange={handleCandidateChange}
                                        className={inputStyles}
                                        placeholder="https://github.com/yourusername"
                                    />
                                </div>
                            </div>

                            {/* Job Preferences */}
                            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-6">
                                <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-4">Job Preferences</h3>
                                <div className="grid md:grid-cols-3 gap-4">
                                    <div>
                                        <label htmlFor="desiredRole" className={labelStyles}>
                                            Desired Role
                                        </label>
                                        <input
                                            type="text"
                                            id="desiredRole"
                                            name="desiredRole"
                                            value={candidateData.desiredRole}
                                            onChange={handleCandidateChange}
                                            className={inputStyles}
                                            placeholder="Software Engineer"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="expectedSalary" className={labelStyles}>
                                            Expected Salary
                                        </label>
                                        <input
                                            type="text"
                                            id="expectedSalary"
                                            name="expectedSalary"
                                            value={candidateData.expectedSalary}
                                            onChange={handleCandidateChange}
                                            className={inputStyles}
                                            placeholder="10-15 LPA"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="jobType" className={labelStyles}>
                                            Job Type
                                        </label>
                                        <select
                                            id="jobType"
                                            name="jobType"
                                            value={candidateData.jobType}
                                            onChange={handleCandidateChange}
                                            className={inputStyles}
                                        >
                                            <option value="full-time">Full-time</option>
                                            <option value="part-time">Part-time</option>
                                            <option value="contract">Contract</option>
                                            <option value="internship">Internship</option>
                                            <option value="remote">Remote</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={isSubmitting || candidateData.skills.length === 0}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-medium rounded-lg transition-colors cursor-pointer"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Creating Profile...
                                    </>
                                ) : (
                                    <>
                                        Complete Profile
                                        <ArrowRight className="w-5 h-5" />
                                    </>
                                )}
                            </button>

                            {/* Back Button */}
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="w-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white text-sm transition-colors"
                            >
                                ← Go back
                            </button>
                        </form>
                    )}

                    {/* Step 2: Faculty mentor form */}
                    {step === 2 && userType === "mentor" && (
                        <form
                            onSubmit={handleMentorSubmit}
                            className="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 space-y-6"
                        >
                            {error && (
                                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                                    {error}
                                </p>
                            )}
                            <div>
                                <label htmlFor="mentorName" className={labelStyles}>Your name *</label>
                                <input
                                    id="mentorName"
                                    value={mentorData.name}
                                    onChange={(e) => setMentorData((prev) => ({ ...prev, name: e.target.value }))}
                                    className={inputStyles}
                                    placeholder="Dr. Priya Rao"
                                    maxLength={100}
                                    required
                                    autoComplete="name"
                                />
                                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">Students see this name in your classes.</p>
                            </div>
                            <div>
                                <label htmlFor="mentorDepartment" className={labelStyles}>Department</label>
                                <input
                                    id="mentorDepartment"
                                    value={mentorData.department}
                                    onChange={(e) => setMentorData((prev) => ({ ...prev, department: e.target.value }))}
                                    className={inputStyles}
                                    placeholder="Computer Engineering"
                                    maxLength={100}
                                    autoComplete="organization-title"
                                />
                            </div>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                This account becomes a faculty account. Students use their own accounts and join your classes with a code.
                            </p>
                            <button
                                type="submit"
                                disabled={isSubmitting || !mentorData.name.trim()}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-medium rounded-lg transition-colors cursor-pointer"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                                        Setting up...
                                    </>
                                ) : (
                                    <>
                                        Continue to my classes
                                        <ArrowRight className="w-5 h-5" aria-hidden="true" />
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setStep(1); setError(null); }}
                                className="w-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white text-sm transition-colors"
                            >
                                ← Go back
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
